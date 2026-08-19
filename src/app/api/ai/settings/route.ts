import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AI_PRESETS,
  AI_SETTING_KEYS,
  AiUpstreamError,
  getAiConfig,
  testConnection,
  type AiConfig,
} from "@/lib/ai";

/** 只回显尾部 4 位，避免把完整 Key 明文送回前端 */
function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}${"*".repeat(6)}${key.slice(-4)}`;
}

// 读取当前配置（Key 掩码）
export async function GET() {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: Object.values(AI_SETTING_KEYS) } },
      select: { key: true, value: true, updatedAt: true },
    });
    const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const cfg = await getAiConfig();

    return NextResponse.json({
      configured: !!cfg,
      provider: db[AI_SETTING_KEYS.provider] || "",
      baseUrl: db[AI_SETTING_KEYS.baseUrl] || process.env.AI_BASE_URL || "",
      model: db[AI_SETTING_KEYS.model] || process.env.AI_MODEL || "",
      apiKeyMasked: maskKey(
        db[AI_SETTING_KEYS.apiKey] || process.env.AI_API_KEY || "",
      ),
      hasApiKey: !!(db[AI_SETTING_KEYS.apiKey] || process.env.AI_API_KEY),
      fromEnv: !db[AI_SETTING_KEYS.baseUrl] && !!process.env.AI_BASE_URL,
      presets: AI_PRESETS,
      updatedAt: rows[0]?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("读取 AI 配置失败:", error);
    return NextResponse.json({ error: "读取配置失败" }, { status: 500 });
  }
}

// 保存配置
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = String(body.provider || "custom").trim();
    const baseUrl = String(body.baseUrl || "").trim();
    const model = String(body.model || "").trim();
    // 前端传空字符串表示"不改动已有 Key"，传 null 表示"清空"
    const apiKeyRaw = body.apiKey;

    if (!baseUrl || !model) {
      return NextResponse.json(
        { error: "服务地址与模型名称不能为空" },
        { status: 400 },
      );
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      return NextResponse.json(
        { error: "服务地址需以 http:// 或 https:// 开头" },
        { status: 400 },
      );
    }

    const writes: Array<{ key: string; value: string }> = [
      { key: AI_SETTING_KEYS.provider, value: provider },
      { key: AI_SETTING_KEYS.baseUrl, value: baseUrl },
      { key: AI_SETTING_KEYS.model, value: model },
    ];
    if (typeof apiKeyRaw === "string" && apiKeyRaw.trim()) {
      writes.push({ key: AI_SETTING_KEYS.apiKey, value: apiKeyRaw.trim() });
    } else if (apiKeyRaw === null) {
      writes.push({ key: AI_SETTING_KEYS.apiKey, value: "" });
    }

    await prisma.$transaction(
      writes.map((w) =>
        prisma.appSetting.upsert({
          where: { key: w.key },
          create: { key: w.key, value: w.value },
          update: { value: w.value },
        }),
      ),
    );

    const cfg = await getAiConfig();
    return NextResponse.json({ ok: true, configured: !!cfg });
  } catch (error) {
    console.error("保存 AI 配置失败:", error);
    return NextResponse.json({ error: "保存配置失败" }, { status: 500 });
  }
}

// 测试连接：优先用请求体里的临时配置，便于"先测再存"
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    let cfg: AiConfig | null;
    if (body?.baseUrl && body?.model) {
      let apiKey = String(body.apiKey || "").trim();
      // 前端没重新输入 Key 时，沿用库里已存的
      if (!apiKey) {
        const saved = await prisma.appSetting.findUnique({
          where: { key: AI_SETTING_KEYS.apiKey },
        });
        apiKey = saved?.value || process.env.AI_API_KEY || "";
      }
      cfg = {
        provider: String(body.provider || "custom"),
        baseUrl: String(body.baseUrl).trim().replace(/\/+$/, ""),
        apiKey,
        model: String(body.model).trim(),
        maxInputChars: 24000,
      };
    } else {
      cfg = await getAiConfig();
    }

    if (!cfg) {
      return NextResponse.json(
        { ok: false, error: "配置不完整，请填写服务地址、模型名与 API Key" },
        { status: 400 },
      );
    }

    const result = await testConnection(cfg);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiUpstreamError) {
      return NextResponse.json(
        { ok: false, error: `模型服务返回错误：${error.message}`, status: error.status },
        { status: 200 }, // 让前端能读到具体原因而不是被 fetch 当成网络失败
      );
    }
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("测试 AI 连接失败:", error);
    return NextResponse.json(
      { ok: false, error: `无法连接到模型服务：${msg}` },
      { status: 200 },
    );
  }
}
