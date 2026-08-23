import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AiConfigError,
  AiUpstreamError,
  CHAT_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT_DEEP,
  chatStreamEvents,
  estimateTokens,
  extractKeySections,
  getAiConfig,
  requireAiConfig,
  resolveChatModel,
  type ChatMessage,
} from "@/lib/ai";

export const maxDuration = 300;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

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

// 文献对话（SSE 流式）
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const history: IncomingMessage[] = Array.isArray(body.messages)
      ? body.messages
      : [];
    const deepThink: boolean = !!body.deepThink;
    const scopePref: "abstract" | "fulltext" | undefined = body.scope;

    // 仅保留有效的用户/助手轮次，并限制单条长度，避免历史过长
    const cleanHistory = history
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
      .slice(-20)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 8000),
      }));

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

    // 范围按用户选择 + 实际可用性收敛
    const source =
      scopePref === "abstract" && hasAbstract
        ? "abstract"
        : scopePref === "fulltext" && hasFulltext
          ? "fulltext"
          : ctx.source;

    const chatCfg = resolveChatModel(cfg, deepThink);

    const contextText =
      source === "abstract"
        ? `以下只提供了论文的题录与摘要（没有全文），请基于这些信息回答，无法判断的部分如实说明。\n\n${ctx.text}`
        : `请基于下面这篇论文的内容回答后续问题。${
            ctx.truncated
              ? "（注意：正文过长，已抽取摘要、引言与结论等关键章节，中间内容以 [...] 标记）"
              : ""
          }\n\n${ctx.text}`;

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: deepThink ? CHAT_SYSTEM_PROMPT_DEEP : CHAT_SYSTEM_PROMPT,
      },
      { role: "user", content: contextText },
      ...(cleanHistory as ChatMessage[]),
    ];

    const encoder = new TextEncoder();
    const send = (obj: unknown) =>
      encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            send({
              meta: {
                model: chatCfg.model,
                source,
                deepThink,
                estimatedTokens: estimateTokens(contextText),
              },
            }),
          );

          let acc = "";
          for await (const evt of chatStreamEvents(chatCfg, messages, {
            temperature: deepThink ? 0.2 : 0.4,
          })) {
            if (evt.kind === "reasoning") {
              controller.enqueue(send({ reasoning: evt.delta }));
            } else if (evt.kind === "content") {
              acc += evt.delta;
              controller.enqueue(send({ delta: evt.delta }));
            } else if (evt.kind === "done") {
              controller.enqueue(send({ done: true, model: chatCfg.model }));
            }
          }

          if (!acc.trim()) throw new AiUpstreamError("模型返回了空内容", 502);
        } catch (err) {
          const msg =
            err instanceof AiUpstreamError
              ? `模型服务错误（${err.status}）：${err.message}`
              : err instanceof Error
                ? err.message
                : "生成失败";
          console.error("文献对话失败:", err);
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
    console.error("文献对话失败:", error);
    return NextResponse.json({ error: "对话失败" }, { status: 500 });
  }
}
