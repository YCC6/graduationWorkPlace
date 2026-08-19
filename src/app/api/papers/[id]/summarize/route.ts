import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AiConfigError,
  AiUpstreamError,
  SUMMARY_SYSTEM_PROMPT,
  chatStream,
  estimateTokens,
  extractKeySections,
  getAiConfig,
  requireAiConfig,
  type ChatMessage,
} from "@/lib/ai";

export const maxDuration = 300;

/** 拼装送给模型的论文内容：元信息 + 正文（过长则抽取关键章节） */
function buildPaperContext(
  paper: {
    title: string;
    authors: string;
    journal: string | null;
    year: number | null;
    abstract: string | null;
    content: string | null;
    keywords: string | null;
  },
  maxChars: number,
): { text: string; source: "fulltext" | "abstract"; truncated: boolean } {
  let authors = "";
  try {
    const arr = JSON.parse(paper.authors || "[]");
    if (Array.isArray(arr)) authors = arr.join(", ");
  } catch {
    authors = paper.authors || "";
  }
  let keywords = "";
  try {
    const arr = JSON.parse(paper.keywords || "[]");
    if (Array.isArray(arr)) keywords = arr.join("; ");
  } catch {
    /* 忽略 */
  }

  const header = [
    `标题：${paper.title}`,
    authors && `作者：${authors}`,
    paper.journal && `期刊：${paper.journal}`,
    paper.year && `年份：${paper.year}`,
    keywords && `关键词：${keywords}`,
  ]
    .filter(Boolean)
    .join("\n");

  const budget = maxChars - header.length - 200;
  const full = (paper.content || "").trim();

  if (full.length > 200) {
    const body = extractKeySections(full, budget);
    return {
      text: `${header}\n\n===== 正文 =====\n${body}`,
      source: "fulltext",
      truncated: body.length < full.length,
    };
  }

  const abs = (paper.abstract || "").trim();
  return {
    text: `${header}\n\n===== 摘要 =====\n${abs}`,
    source: "abstract",
    truncated: false,
  };
}

// 读取已缓存的总结
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
      select: {
        aiSummary: true,
        aiSummaryAt: true,
        aiSummaryModel: true,
        content: true,
        abstract: true,
      },
    });
    if (!paper) {
      return NextResponse.json({ error: "文献不存在" }, { status: 404 });
    }
    // 比对缓存所用模型与当前配置模型，不一致时提示前端「建议重新生成」
    const cfg = await getAiConfig().catch(() => null);
    const cachedModel = paper.aiSummaryModel;
    const modelChanged =
      !!cfg && !!cachedModel ? cfg.model !== cachedModel : false;
    return NextResponse.json({
      summary: paper.aiSummary,
      generatedAt: paper.aiSummaryAt,
      model: cachedModel,
      modelChanged,
      currentModel: cfg?.model ?? null,
      hasFulltext: !!(paper.content && paper.content.trim().length > 200),
      hasAbstract: !!(paper.abstract && paper.abstract.trim()),
    });
  } catch (error) {
    console.error("读取 AI 总结失败:", error);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

// 生成总结（SSE 流式）
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        authors: true,
        journal: true,
        year: true,
        abstract: true,
        content: true,
        keywords: true,
      },
    });
    if (!paper) {
      return NextResponse.json({ error: "文献不存在" }, { status: 404 });
    }

    const hasFulltext = !!(paper.content && paper.content.trim().length > 200);
    const hasAbstract = !!(paper.abstract && paper.abstract.trim());
    if (!hasFulltext && !hasAbstract) {
      return NextResponse.json(
        {
          error:
            "这篇文献既没有摘要也没有全文，请先在 PDF 预览区点「全文索引」提取正文",
          code: "NO_CONTENT",
        },
        { status: 400 },
      );
    }

    const cfg = await requireAiConfig();
    const ctx = buildPaperContext(paper, cfg.maxInputChars);

    const messages: ChatMessage[] = [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          ctx.source === "abstract"
            ? `以下只提供了论文的题录与摘要（没有全文），请基于这些信息尽力完成速读笔记，无法判断的部分如实写明。\n\n${ctx.text}`
            : `请为以下论文生成中文速读笔记。${
                ctx.truncated
                  ? "（注意：正文过长，已抽取摘要、引言与结论等关键章节，中间内容以 [...] 标记）"
                  : ""
              }\n\n${ctx.text}`,
      },
    ];

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
                source: ctx.source,
                truncated: ctx.truncated,
                model: cfg.model,
                estimatedTokens: estimateTokens(ctx.text),
              },
            }),
          );

          for await (const delta of chatStream(cfg, messages, {
            temperature: 0.3,
          })) {
            acc += delta;
            controller.enqueue(send({ delta }));
          }

          if (!acc.trim()) throw new AiUpstreamError("模型返回了空内容", 502);

          const saved = await prisma.paper.update({
            where: { id: paper.id },
            data: {
              aiSummary: acc,
              aiSummaryAt: new Date(),
              aiSummaryModel: cfg.model,
            },
            select: { aiSummaryAt: true },
          });

          controller.enqueue(
            send({ done: true, generatedAt: saved.aiSummaryAt, model: cfg.model }),
          );
        } catch (err) {
          const msg =
            err instanceof AiUpstreamError
              ? `模型服务错误（${err.status}）：${err.message}`
              : err instanceof Error
                ? err.message
                : "生成失败";
          console.error("生成 AI 总结失败:", err);
          // 与翻译一致：已生成的部分先存下来，避免长文生成到一半失败全白费
          if (acc.trim()) {
            await prisma.paper
              .update({
                where: { id: paper.id },
                data: {
                  aiSummary: `${acc}\n\n> ⚠️ 总结中断：${msg}`,
                  aiSummaryAt: new Date(),
                  aiSummaryModel: cfg.model,
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
        // 防止部署在 Nginx 后面时被缓冲，流式变成一次性返回
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
    console.error("生成 AI 总结失败:", error);
    return NextResponse.json({ error: "生成失败" }, { status: 500 });
  }
}

// 清除缓存的总结
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.paper.update({
      where: { id: params.id },
      data: { aiSummary: null, aiSummaryAt: null, aiSummaryModel: null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("清除 AI 总结失败:", error);
    return NextResponse.json({ error: "清除失败" }, { status: 500 });
  }
}
