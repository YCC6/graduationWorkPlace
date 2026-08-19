import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AiConfigError,
  AiUpstreamError,
  TRANSLATE_SYSTEM_PROMPT,
  chatStream,
  chunkText,
  getAiConfig,
  requireAiConfig,
  type ChatMessage,
} from "@/lib/ai";

export const maxDuration = 600;

// 读取已缓存的译文
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
      select: {
        aiTranslation: true,
        aiTranslationAt: true,
        aiTranslationScope: true,
        aiTranslationModel: true,
        content: true,
        abstract: true,
      },
    });
    if (!paper) {
      return NextResponse.json({ error: "文献不存在" }, { status: 404 });
    }
    // 比对缓存所用模型与当前配置模型，不一致时提示前端「建议重新生成」
    const cfg = await getAiConfig().catch(() => null);
    const cachedModel = paper.aiTranslationModel;
    const modelChanged =
      !!cfg && !!cachedModel ? cfg.model !== cachedModel : false;
    return NextResponse.json({
      translation: paper.aiTranslation,
      generatedAt: paper.aiTranslationAt,
      scope: paper.aiTranslationScope,
      model: cachedModel,
      modelChanged,
      currentModel: cfg?.model ?? null,
      hasFulltext: !!(paper.content && paper.content.trim().length > 200),
      hasAbstract: !!(paper.abstract && paper.abstract.trim()),
      fulltextLength: paper.content?.length ?? 0,
    });
  } catch (error) {
    console.error("读取译文失败:", error);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

// 生成翻译（SSE 流式，长文分块顺序翻译）
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const scope: "abstract" | "fulltext" =
      body?.scope === "fulltext" ? "fulltext" : "abstract";

    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, abstract: true, content: true },
    });
    if (!paper) {
      return NextResponse.json({ error: "文献不存在" }, { status: 404 });
    }

    const raw =
      scope === "fulltext"
        ? (paper.content || "").trim()
        : (paper.abstract || "").trim();

    if (!raw) {
      return NextResponse.json(
        {
          error:
            scope === "fulltext"
              ? "还没有全文内容，请先在 PDF 预览区点「全文索引」提取正文"
              : "这篇文献没有摘要，可改用全文翻译",
          code: "NO_CONTENT",
        },
        { status: 400 },
      );
    }

    const cfg = await requireAiConfig();
    // 翻译要逐句对应，块开小一点，既降低漏译风险也让流式反馈更及时
    const chunks = chunkText(raw, Math.min(cfg.maxInputChars, 3500));

    const encoder = new TextEncoder();
    const send = (obj: unknown) =>
      encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

    const stream = new ReadableStream({
      async start(controller) {
        let acc = "";
        try {
          controller.enqueue(
            send({
              meta: {
                scope,
                totalChunks: chunks.length,
                chars: raw.length,
                model: cfg.model,
              },
            }),
          );

          for (let i = 0; i < chunks.length; i++) {
            controller.enqueue(
              send({ progress: { current: i + 1, total: chunks.length } }),
            );

            const messages: ChatMessage[] = [
              { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
              {
                role: "user",
                content:
                  chunks.length > 1
                    ? `这是论文《${paper.title}》的第 ${i + 1}/${chunks.length} 部分，请翻译为中文（保持段落划分，不要添加小节编号）：\n\n${chunks[i]}`
                    : `请把以下内容翻译为中文：\n\n${chunks[i]}`,
              },
            ];

            for await (const delta of chatStream(cfg, messages, {
              temperature: 0.2,
            })) {
              acc += delta;
              controller.enqueue(send({ delta }));
            }

            if (i < chunks.length - 1) {
              const sep = "\n\n";
              acc += sep;
              controller.enqueue(send({ delta: sep }));
            }
          }

          if (!acc.trim()) throw new AiUpstreamError("模型返回了空内容", 502);

          const saved = await prisma.paper.update({
            where: { id: paper.id },
            data: {
              aiTranslation: acc,
              aiTranslationAt: new Date(),
              aiTranslationScope: scope,
              aiTranslationModel: cfg.model,
            },
            select: { aiTranslationAt: true },
          });

          controller.enqueue(
            send({ done: true, generatedAt: saved.aiTranslationAt, scope }),
          );
        } catch (err) {
          const msg =
            err instanceof AiUpstreamError
              ? `模型服务错误（${err.status}）：${err.message}`
              : err instanceof Error
                ? err.message
                : "翻译失败";
          console.error("生成译文失败:", err);
          // 已经译出的部分先存下来，避免长文翻到一半失败全白费
          if (acc.trim()) {
            await prisma.paper
              .update({
                where: { id: paper.id },
                data: {
                  aiTranslation: `${acc}\n\n> ⚠️ 翻译中断：${msg}`,
                  aiTranslationAt: new Date(),
                  aiTranslationScope: scope,
                  aiTranslationModel: cfg.model,
                },
              })
              .catch(() => {});
          }
          controller.enqueue(send({ error: msg }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof AiConfigError) {
      return NextResponse.json(
        { error: error.message, code: "NO_AI_CONFIG" },
        { status: 400 },
      );
    }
    console.error("生成译文失败:", error);
    return NextResponse.json({ error: "翻译失败" }, { status: 500 });
  }
}

// 清除缓存的译文
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.paper.update({
      where: { id: params.id },
      data: {
        aiTranslation: null,
        aiTranslationAt: null,
        aiTranslationScope: null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("清除译文失败:", error);
    return NextResponse.json({ error: "清除失败" }, { status: 500 });
  }
}
