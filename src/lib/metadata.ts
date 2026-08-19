/**
 * 文献元数据工具库
 * ------------------------------------------------------------------
 * 供「浏览器扩展 / 小书签一键剪藏」与既有 DOI 导入功能共用。
 * 职责：DOI 抽取与规范化、外部源（Crossref / PubMed）元数据拉取、
 *       脏数据清洗（JATS 摘要、HTML 实体、作者姓名）。
 */

/** 规范化后的文献元数据（与 Paper 模型字段对齐） */
export interface PaperMetadata {
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  abstract: string | null;
  keywords: string[];
  url: string | null;
  /** 元数据来源，便于前端提示可信度：crossref | pubmed | page | mixed */
  source: string;
}

export function emptyMetadata(): PaperMetadata {
  return {
    title: "",
    authors: [],
    journal: null,
    year: null,
    volume: null,
    issue: null,
    pages: null,
    doi: null,
    abstract: null,
    keywords: [],
    url: null,
    source: "page",
  };
}

/* ------------------------------------------------------------------ */
/* DOI                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 从任意文本中抽取 DOI。
 * 与 api/papers/parse 中的实现保持一致，额外处理 URL 前缀与尾部标点。
 */
export function extractDoi(text: string | null | undefined): string | null {
  if (!text) return null;

  // 先剥掉 doi.org / dx.doi.org 前缀
  const stripped = text.replace(
    /https?:\/\/(dx\.)?doi\.org\//gi,
    ""
  );

  const m = stripped.match(/10\.\d{4,9}\/[^\s"'<>]+/);
  if (m) return trimDoiTail(m[0]);

  const m2 = stripped.match(/(?:doi|DOI)\s*[:：]\s*(\S+)/);
  if (m2) return trimDoiTail(m2[1]);

  return null;
}

/** 去掉 DOI 结尾容易被句子标点带上的字符 */
function trimDoiTail(doi: string): string {
  return doi
    .replace(/[.;,)\]}>]+$/, "")
    .replace(/&.*$/, "") // 去掉 URL query 残留
    .trim();
}

/** DOI 归一化：小写 + 去空白，便于唯一键比对 */
export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const d = trimDoiTail(String(doi).trim());
  if (!d) return null;
  const extracted = extractDoi(d) ?? d;
  return extracted.toLowerCase();
}

/** 校验是否长得像一个 DOI */
export function isValidDoi(doi: string | null | undefined): boolean {
  if (!doi) return false;
  return /^10\.\d{4,9}\/\S+$/.test(doi.trim());
}

/* ------------------------------------------------------------------ */
/* 文本清洗                                                             */
/* ------------------------------------------------------------------ */

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

export function decodeEntities(text: string): string {
  let out = text;
  for (const [k, v] of Object.entries(HTML_ENTITIES)) {
    out = out.split(k).join(v);
  }
  // 数字实体
  out = out.replace(/&#(\d+);/g, (_, n) =>
    String.fromCharCode(parseInt(n, 10))
  );
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
    String.fromCharCode(parseInt(n, 16))
  );
  return out;
}

/**
 * 清洗摘要：Crossref 返回的是 JATS XML（<jats:p> 等），
 * 网页抓取的可能带 HTML 标签与「摘要：」前缀。
 */
export function cleanAbstract(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let text = String(raw);

  // 去掉 JATS / HTML 标签
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);

  // 去掉常见前缀
  text = text.replace(/^\s*(abstract|摘要|Abstract)\s*[:：]?\s*/i, "");

  // 折叠空白
  text = text.replace(/\s+/g, " ").trim();

  return text || null;
}

/** 清洗标题：去标签、折叠空白、去掉站点后缀 */
export function cleanTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  let t = String(raw).replace(/<[^>]+>/g, " ");
  t = decodeEntities(t);
  t = t.replace(/\s+/g, " ").trim();
  // 去掉尾部句点（题录里常见）
  t = t.replace(/\.\s*$/, "");
  return t;
}

/**
 * 规范化作者列表：
 * - 去空、去重、折叠空白
 * - 处理 "Family, Given" → "Family Given"（英文）
 * - 中文姓名保持原样
 */
export function normalizeAuthors(
  input: unknown
): string[] {
  let list: string[] = [];

  if (Array.isArray(input)) {
    list = input.map((a) => {
      if (typeof a === "string") return a;
      if (a && typeof a === "object") {
        const obj = a as Record<string, unknown>;
        const family = String(obj.family ?? obj.lastName ?? "").trim();
        const given = String(obj.given ?? obj.firstName ?? "").trim();
        if (family || given) return `${family} ${given}`.trim();
        return String(obj.name ?? "");
      }
      return String(a ?? "");
    });
  } else if (typeof input === "string") {
    // 支持 ; , 、 和 " and " 分隔
    list = input.split(/\s*(?:;|,|、|\band\b)\s*/);
  }

  const seen = new Set<string>();
  const out: string[] = [];

  for (const rawName of list) {
    let name = decodeEntities(String(rawName)).replace(/\s+/g, " ").trim();
    // 去掉上标数字与星号等作者角标
    name = name.replace(/[\d*†‡§¶]+$/g, "").trim();
    // 去掉邮箱
    name = name.replace(/\S+@\S+/g, "").trim();
    if (!name || name.length > 60) continue;
    // 过滤明显不是人名的噪音
    if (/^(et al\.?|等|作者|authors?)$/i.test(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }

  return out;
}

/** 从各种形态里抠出年份 */
export function parseYear(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;

  if (typeof input === "number") {
    return input >= 1500 && input <= 2200 ? Math.floor(input) : null;
  }

  const m = String(input).match(/(1[5-9]\d{2}|20\d{2}|21\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return y >= 1500 && y <= 2200 ? y : null;
}

/** 规范化关键词 */
export function normalizeKeywords(input: unknown): string[] {
  let list: string[] = [];
  if (Array.isArray(input)) {
    list = input.map((k) => String(k ?? ""));
  } else if (typeof input === "string") {
    list = input.split(/\s*(?:;|,|、|；)\s*/);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const k = decodeEntities(String(raw)).replace(/\s+/g, " ").trim();
    if (!k || k.length > 50) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 外部元数据源                                                         */
/* ------------------------------------------------------------------ */

const UA = "GradWorkbench/1.0 (research literature manager)";
const FETCH_TIMEOUT = 10000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeout = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 通过 Crossref 拉取元数据。失败返回 null（不抛异常，便于降级）。
 */
export async function fetchCrossref(
  doi: string
): Promise<PaperMetadata | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      { headers: { "User-Agent": UA } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const msg = data?.message;
    if (!msg) return null;

    const dateParts =
      msg.published?.["date-parts"]?.[0] ??
      msg["published-print"]?.["date-parts"]?.[0] ??
      msg["published-online"]?.["date-parts"]?.[0] ??
      msg.created?.["date-parts"]?.[0] ??
      [];

    return {
      title: cleanTitle(msg.title?.[0] ?? ""),
      authors: normalizeAuthors(msg.author ?? []),
      journal: msg["container-title"]?.[0] ?? null,
      year: parseYear(dateParts[0]),
      volume: msg.volume ?? null,
      issue: msg.issue ?? null,
      pages: msg.page ?? null,
      doi: normalizeDoi(msg.DOI ?? doi),
      abstract: cleanAbstract(msg.abstract),
      keywords: normalizeKeywords(msg.subject ?? []),
      url: msg.URL ?? `https://doi.org/${msg.DOI ?? doi}`,
      source: "crossref",
    };
  } catch (error) {
    console.error("Crossref 查询失败:", error);
    return null;
  }
}

/**
 * 通过 NCBI E-utilities 用 PMID 拉取元数据。
 * 使用 esummary（JSON）以避免解析 XML。
 */
export async function fetchPubmed(
  pmid: string
): Promise<PaperMetadata | null> {
  const id = String(pmid).replace(/\D/g, "");
  if (!id) return null;

  try {
    const res = await fetchWithTimeout(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${id}`,
      { headers: { "User-Agent": UA } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const doc = data?.result?.[id];
    if (!doc || doc.error) return null;

    // articleids 里通常带 doi
    const doiEntry = (doc.articleids ?? []).find(
      (a: { idtype?: string }) => a.idtype === "doi"
    );

    return {
      title: cleanTitle(doc.title ?? ""),
      authors: normalizeAuthors(
        (doc.authors ?? []).map((a: { name?: string }) => a.name ?? "")
      ),
      journal: doc.fulljournalname || doc.source || null,
      year: parseYear(doc.pubdate),
      volume: doc.volume || null,
      issue: doc.issue || null,
      pages: doc.pages || null,
      doi: normalizeDoi(doiEntry?.value ?? null),
      abstract: null, // esummary 不含摘要，由页面抓取补充
      keywords: [],
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      source: "pubmed",
    };
  } catch (error) {
    console.error("PubMed 查询失败:", error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 合并                                                                 */
/* ------------------------------------------------------------------ */

function isBlank(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    (typeof v === "string" && v.trim() === "") ||
    (Array.isArray(v) && v.length === 0)
  );
}

/**
 * 合并多份元数据，排在前面的优先级更高，仅在高优先级字段为空时回填。
 * 典型用法：mergeMetadata(pageData, crossrefData) —— 页面抓的更贴合用户
 * 所见，Crossref 用来补全卷期页码等结构化字段。
 */
export function mergeMetadata(
  ...sources: (PaperMetadata | null)[]
): PaperMetadata {
  const valid = sources.filter((s): s is PaperMetadata => s !== null);
  if (valid.length === 0) return emptyMetadata();

  const out = emptyMetadata();
  const usedSources: string[] = [];

  const keys: (keyof PaperMetadata)[] = [
    "title",
    "authors",
    "journal",
    "year",
    "volume",
    "issue",
    "pages",
    "doi",
    "abstract",
    "keywords",
    "url",
  ];

  for (const key of keys) {
    for (const src of valid) {
      const val = src[key];
      if (!isBlank(val)) {
        // @ts-expect-error —— 键类型已由 keys 数组约束
        out[key] = val;
        if (!usedSources.includes(src.source)) usedSources.push(src.source);
        break;
      }
    }
  }

  out.source = usedSources.length > 1 ? "mixed" : usedSources[0] ?? "page";
  return out;
}

/**
 * 把外部传入的任意 JSON（扩展 / 小书签抓来的）规范化成 PaperMetadata。
 */
export function normalizeIncoming(body: Record<string, unknown>): PaperMetadata {
  const doiCandidate =
    (body.doi as string) ||
    extractDoi(body.url as string) ||
    extractDoi(body.citation as string);

  return {
    title: cleanTitle((body.title as string) ?? ""),
    authors: normalizeAuthors(body.authors),
    journal:
      (body.journal as string) ||
      (body.publication as string) ||
      (body.source as string) ||
      null,
    year: parseYear(body.year ?? body.date ?? body.publishedAt),
    volume: (body.volume as string) || null,
    issue: (body.issue as string) || null,
    pages: (body.pages as string) || null,
    doi: normalizeDoi(doiCandidate),
    abstract: cleanAbstract(body.abstract as string),
    keywords: normalizeKeywords(body.keywords),
    url: (body.url as string) || null,
    source: (body.source as string) || "page",
  };
}
