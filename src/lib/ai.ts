import { prisma } from "@/lib/prisma";

/**
 * 通用 LLM 客户端 —— 只用 fetch 调 OpenAI 兼容的 /chat/completions。
 *
 * 之所以不装 SDK：DeepSeek / 通义千问 / Kimi / 智谱 / OpenAI / 各类中转站
 * 全都实现了同一套协议，换服务商只需要改 baseURL + model，
 * 装 SDK 反而会把项目绑死在某一家上。
 */

// ---------- 配置 ----------

export interface AiConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 单次请求最大输入字符数，超出会自动分块 */
  maxInputChars: number;
}

/** 常见服务商预设，前端设置页直接复用这份清单 */
export const AI_PRESETS: Array<{
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  hint: string;
}> = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    hint: "性价比最高，中文论文效果好",
  },
  {
    id: "dashscope",
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    hint: "阿里云百炼，长文本能力强",
  },
  {
    id: "moonshot",
    name: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-32k",
    hint: "超长上下文，适合整篇论文",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    hint: "有免费额度模型可选",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hint: "需要能访问 OpenAI 的网络环境",
  },
  {
    id: "custom",
    name: "自定义 / 本地",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:7b",
    hint: "Ollama、vLLM 等本地服务，API Key 可留空",
  },
];

export const AI_SETTING_KEYS = {
  provider: "ai.provider",
  baseUrl: "ai.baseUrl",
  apiKey: "ai.apiKey",
  model: "ai.model",
} as const;

/** 配置缺失时抛出，路由层据此返回 400 而不是 500 */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

/** 上游服务返回错误时抛出，携带原始状态码 */
export class AiUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AiUpstreamError";
    this.status = status;
  }
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * 读取配置，优先级：数据库 AppSetting > 环境变量。
 * 数据库优先是为了让用户在设置页改完立刻生效，不必重启 dev server。
 */
export async function getAiConfig(): Promise<AiConfig | null> {
  let rows: Array<{ key: string; value: string }> = [];
  try {
    rows = await prisma.appSetting.findMany({
      where: { key: { in: Object.values(AI_SETTING_KEYS) } },
      select: { key: true, value: true },
    });
  } catch {
    // 表还没建出来时不应该炸掉整个接口，退回环境变量
    rows = [];
  }
  const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const baseUrl =
    db[AI_SETTING_KEYS.baseUrl] || process.env.AI_BASE_URL || "";
  const apiKey = db[AI_SETTING_KEYS.apiKey] || process.env.AI_API_KEY || "";
  const model = db[AI_SETTING_KEYS.model] || process.env.AI_MODEL || "";
  const provider = db[AI_SETTING_KEYS.provider] || "custom";

  if (!baseUrl || !model) return null;

  // 本地模型（localhost / 127.0.0.1）通常不需要 Key，不强制要求
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(
    baseUrl,
  );
  if (!apiKey && !isLocal) return null;

  return {
    provider,
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    model,
    maxInputChars: Number(process.env.AI_MAX_INPUT_CHARS) || 24000,
  };
}

/** 配置缺失时统一抛错，供各路由复用 */
export async function requireAiConfig(): Promise<AiConfig> {
  const cfg = await getAiConfig();
  if (!cfg) {
    throw new AiConfigError(
      "尚未配置 AI 模型，请到「设置 → AI 模型」填写服务地址、模型名与 API Key",
    );
  }
  return cfg;
}

// ---------- 文本处理 ----------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 粗估 token 数。中文约 1 字 1 token，英文约 4 字符 1 token。
 * 只用来决定要不要分块，不追求精确。
 */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk + rest / 4);
}

/**
 * 按字符上限切块，尽量在段落 / 句子边界断开，避免把一句话劈成两半。
 */
export function chunkText(text: string, maxChars: number): string[] {
  const clean = text.replace(/\r\n/g, "\n");
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  const paragraphs = clean.split(/\n{2,}/);
  let buf = "";

  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // 单段就超长：退一步按句子切
      flush();
      const sentences = para.split(/(?<=[。！？.!?])\s*/);
      let sbuf = "";
      for (const s of sentences) {
        if (sbuf.length + s.length > maxChars) {
          if (sbuf.trim()) chunks.push(sbuf.trim());
          // 单句还超长（多见于无标点的表格文本）只能硬切
          if (s.length > maxChars) {
            for (let i = 0; i < s.length; i += maxChars) {
              chunks.push(s.slice(i, i + maxChars));
            }
            sbuf = "";
          } else {
            sbuf = s;
          }
        } else {
          sbuf += s;
        }
      }
      if (sbuf.trim()) chunks.push(sbuf.trim());
      continue;
    }

    if (buf.length + para.length + 2 > maxChars) flush();
    buf += (buf ? "\n\n" : "") + para;
  }
  flush();

  return chunks.filter(Boolean);
}

/**
 * 论文往往只有「摘要 + 引言 + 结论」是高信息密度的部分。
 * 全文太长时优先提取这几段，比无脑截断前 N 字效果好得多，也便宜十倍。
 */
export function extractKeySections(fullText: string, maxChars: number): string {
  if (fullText.length <= maxChars) return fullText;

  const headings = [
    { name: "Abstract", re: /\n\s*(abstract|摘\s*要)\s*[:：]?\s*\n/i },
    {
      name: "Introduction",
      re: /\n\s*(1\.?\s*)?(introduction|引\s*言|前\s*言)\s*\n/i,
    },
    {
      name: "Conclusion",
      re: /\n\s*(\d\.?\s*)?(conclusions?|结\s*论|结论与展望|总\s*结)\s*\n/i,
    },
  ];

  const picked: string[] = [];
  for (const h of headings) {
    const m = fullText.match(h.re);
    if (!m || m.index === undefined) continue;
    const start = m.index;
    // 每段最多取 1/3 预算
    const slice = fullText.slice(start, start + Math.floor(maxChars / 3));
    picked.push(slice.trim());
  }

  if (picked.length >= 2) {
    const joined = picked.join("\n\n[...]\n\n");
    return joined.slice(0, maxChars);
  }

  // 识别不出章节标题（扫描版 PDF 常见）：取头尾，中间省略
  const head = fullText.slice(0, Math.floor(maxChars * 0.65));
  const tail = fullText.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[...中间内容略...]\n\n${tail}`;
}

// ---------- 请求 ----------

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      return j?.error?.message || j?.message || text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return res.statusText;
  }
}

function buildHeaders(cfg: AiConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  return headers;
}

/** 非流式调用，返回完整文本 */
export async function chat(
  cfg: AiConfig,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      stream: false,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new AiUpstreamError(await readErrorMessage(res), res.status);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new AiUpstreamError("模型返回了空内容", 502);
  return content;
}

/**
 * 流式调用，逐段吐出增量文本。
 * 用 async generator 而不是回调，路由层可以直接 for-await 转成 SSE。
 */
export async function* chatStream(
  cfg: AiConfig,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new AiUpstreamError(await readErrorMessage(res), res.status);
  }
  if (!res.body) throw new AiUpstreamError("上游未返回响应流", 502);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 以空行分隔事件；保留最后一段不完整的数据等下一轮
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload);
          const delta: string = json?.choices?.[0]?.delta?.content ?? "";
          if (delta) yield delta;
        } catch {
          // 个别服务商会插入非 JSON 的心跳行，忽略即可
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 测试连通性，返回耗时。设置页的「测试连接」按钮用 */
export async function testConnection(
  cfg: AiConfig,
): Promise<{ ok: true; latencyMs: number; reply: string }> {
  const started = Date.now();
  const reply = await chat(
    cfg,
    [{ role: "user", content: "回复两个字：连通" }],
    { temperature: 0, maxTokens: 16 },
  );
  return { ok: true, latencyMs: Date.now() - started, reply: reply.trim() };
}

// ---------- 提示词 ----------

export const SUMMARY_SYSTEM_PROMPT = `你是一位严谨的科研文献助读专家，服务对象是中文母语的研究生。

请阅读用户提供的论文内容，输出一份结构化中文速读笔记，严格使用以下 Markdown 结构（不要添加其他一级标题）：

## 一句话总结
（30 字以内说清这篇论文做了什么）

## 研究问题
（作者想解决什么问题，为什么重要）

## 研究方法
（用了什么数据、模型、实验设计或分析手段，尽量具体到方法名称与关键参数）

## 主要结论
（分点列出，带上论文中出现的关键数据与指标）

## 创新点
（相比已有工作的实质性改进，分点列出）

## 局限与存疑
（样本、假设、适用范围上的限制；若作者未提及，写出你的判断并标注"（推断）"）

## 关键术语
（列出 3-6 个专业术语，格式为 **英文术语**（中文译名）：一句话解释）

硬性要求：
1. 只依据给定内容作答，不要编造论文中没有的数据、结论或参考文献。
2. 若某个部分在给定内容中确实找不到依据，写"原文未提供足够信息"，不要凭空补全。
3. 保留原文中的专业术语英文原词，首次出现时给出中文译名。
4. 语言精炼，不要写"本文认为""综上所述"这类空话。`;

export const TRANSLATE_SYSTEM_PROMPT = `你是一位专业的学术论文翻译，擅长将英文科研文献译为准确、通顺的学术中文。

翻译要求：
1. 忠实原意，不增删内容，不做归纳总结。
2. 使用学术书面语，符合中文科技论文表达习惯，避免翻译腔。
3. 专业术语采用学科通行译法，首次出现时用「中文（English）」的形式标注原文。
4. 保留原文的段落划分。数学公式、化学式、变量名、单位、图表编号（如 Fig. 1、Table 2）一律保持原样不译。
5. 参考文献条目、作者姓名、期刊名不翻译。
6. 直接输出译文正文，不要写"以下是译文"之类的开场白，也不要重复英文原文。`;

// ---------- 文献对话 ----------

/** 普通对话模式的系统提示词 */
export const CHAT_SYSTEM_PROMPT = `你是一位专业的「文献对话助手」，服务对象是中文母语的研究生。
用户正在阅读下面这篇论文，并会就它向你提问。请基于给定论文内容作答：

1. 只依据给定的论文内容回答，不要编造论文中不存在的数据、结论或参考文献。
2. 若论文内容不足以回答，明确说明"原文未提供足够信息"，并在你自行推断处标注"（推断）"。
3. 保留专业术语的英文原词，首次出现时给出中文译名。
4. 回答要具体，尽量引用论文中的细节（方法名、关键数据、图表、结论原文）。
5. 语言精炼、有条理，避免"本文认为""综上所述"这类空话；用户用中文提问就用中文回答。`;

/** 深度思考模式的系统提示词：引导分步推理 + 输出可见思考过程 */
export const CHAT_SYSTEM_PROMPT_DEEP = `你是一位专业的「文献对话助手」，服务对象是中文母语的研究生。
用户正在阅读下面这篇论文，并会就它向你提问。请基于给定论文内容作答，并务必进行深度思考。

【深度思考要求】
在给出最终回答之前，先逐步拆解问题：
- 厘清用户真正想问什么，识别其中的隐含假设与可能歧义。
- 在论文中多位置检索证据，交叉验证，而非只看单一段落。
- 考虑可能的反例、边界条件与作者未明言的局限。
- 将上述思考整理为一段「🔍 思考过程」，放在最终回答之前；可长可短，但要真实体现你的推理，而不是客套话。
- 最终回答要具体、可引用论文细节，并明确区分"论文明确说了什么"与"你的推断"。

【作答约束】
1. 只依据给定的论文内容回答，不要编造论文中不存在的数据、结论或参考文献。
2. 若论文内容不足以回答，明确说明"原文未提供足够信息"，并在推断处标注"（推断）"。
3. 保留专业术语的英文原词，首次出现时给出中文译名。
4. 语言精炼、有条理；用户用中文提问就用中文回答。`;

export type StreamEvent =
  | { kind: "reasoning"; delta: string }
  | { kind: "content"; delta: string }
  | { kind: "done" };

/**
 * 与 chatStream 类似，但额外捕获推理内容（reasoning_content）。
 * 当服务商提供原生推理链（如 DeepSeek-Reasoner）时，推理过程会作为
 * reasoning 事件先行吐出；普通模型该字段为空，只会触发 content 事件。
 */
export async function* chatStreamEvents(
  cfg: AiConfig,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<StreamEvent, void, unknown> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new AiUpstreamError(await readErrorMessage(res), res.status);
  }
  if (!res.body) throw new AiUpstreamError("上游未返回响应流", 502);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          yield { kind: "done" };
          return;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta ?? {};
          const reasoning: string = delta?.reasoning_content ?? "";
          const content: string = delta?.content ?? "";
          if (reasoning) yield { kind: "reasoning", delta: reasoning };
          if (content) yield { kind: "content", delta: content };
        } catch {
          /* 个别服务商会插入非 JSON 的心跳行，忽略即可 */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 深度思考时选择实际调用的模型：
 * - DeepSeek 且为 deepseek-chat 时切换为 deepseek-reasoner（原生推理链）。
 * - 其他服务商没有原生推理模型，保持原模型，由增强版系统提示词引导分步推理。
 */
export function resolveChatModel(
  cfg: AiConfig,
  deepThink: boolean,
): AiConfig {
  if (!deepThink) return cfg;
  const isDeepseek =
    cfg.provider === "deepseek" ||
    cfg.baseUrl.toLowerCase().includes("deepseek");
  if (!isDeepseek) return cfg;
  let model = cfg.model;
  if (model.includes("reasoner")) {
    // 已经是指推理模型，保持不变
  } else if (model.includes("chat")) {
    model = model.replace("chat", "reasoner");
  } else {
    model = "deepseek-reasoner";
  }
  return { ...cfg, model };
}
