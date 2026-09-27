import { NextRequest, NextResponse } from "next/server";
import {
  AiConfigError,
  AiUpstreamError,
  TRANSLATE_SYSTEM_PROMPT,
  chat,
  requireAiConfig,
  type ChatMessage,
} from "@/lib/ai";

export const maxDuration = 120;

const MAX_CHARS = 4000;

// 中译英：划词翻译的反向场景（翻译中文笔记 / 术语等）
const TO_EN_PROMPT = `你是一位专业的学术论文翻译，擅长将中文科研内容译为准确、通顺的学术英文。

翻译要求：
1. 忠实原意，不增删内容。
2. 使用学术书面英语，符合英文科技论文表达习惯。
3. 专业术语采用学科通行英文表述，必要时首次出现标注中文原词。
4. 保留段落划分；公式、变量、单位、图表编号保持原样。
5. 直接输出译文，不要写开场白，也不要重复原文。`;

// 通用的「划词翻译」接口：不限文献，传入任意文本即可翻译。
// 复用 lib/ai 的统一配置（DB AppSetting > 环境变量），无需新增配置项。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const text: string =
      typeof body.text === "string" ? body.text.trim() : "";
    const target: "zh" | "en" = body.target === "en" ? "en" : "zh";

    if (!text) {
      return NextResponse.json({ error: "没有可翻译的文本" }, { status: 400 });
    }
    if (text.length > MAX_CHARS) {
      return NextResponse.json(
        {
          error: `选中文本过长（${text.length} 字），划词翻译单次上限 ${MAX_CHARS} 字，请缩短选中范围`,
        },
        { status: 400 },
      );
    }

    const cfg = await requireAiConfig();
    const system = target === "zh" ? TRANSLATE_SYSTEM_PROMPT : TO_EN_PROMPT;

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      {
        role: "user",
        content:
          target === "zh"
            ? `请把以下内容翻译为学术中文：\n\n${text}`
            : `Please translate the following into academic English:\n\n${text}`,
      },
    ];

    const translation = await chat(cfg, messages, { temperature: 0.2 });
    if (!translation.trim()) {
      throw new AiUpstreamError("模型返回了空内容", 502);
    }
    return NextResponse.json({ translation: translation.trim() });
  } catch (error) {
    if (error instanceof AiConfigError) {
      return NextResponse.json(
        { error: error.message, code: "NO_AI_CONFIG" },
        { status: 400 },
      );
    }
    if (error instanceof AiUpstreamError) {
      return NextResponse.json(
        { error: `翻译服务错误（${error.status}）：${error.message}` },
        { status: 502 },
      );
    }
    console.error("划词翻译失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "翻译失败" },
      { status: 500 },
    );
  }
}
