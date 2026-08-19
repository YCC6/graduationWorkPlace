/**
 * 开放获取（OA）PDF 探源
 * ------------------------------------------------------------------
 * 目标：由 DOI 或标题反查一个「合法可直接下载」的 PDF 直链。
 *
 * 只走开放获取渠道。探源顺序是实测调出来的，不是拍脑袋：
 *   1. arXiv           —— 无限流，英文预印本命中率最高，主力
 *   2. Europe PMC      —— 无限流，生物医学方向的 OA 全文
 *   3. Semantic Scholar —— 覆盖面广但免 key 限流极严（实测连续调用持续 429），
 *                          因此降为兜底，且带退避重试
 *
 * 只有 DOI 没有标题时，先用 Crossref 补出标题（无限流，项目本就在用），
 * 否则 arXiv 这一路径直接失效。
 *
 * 刻意不做的事：
 *   - 不碰任何绕过付费墙的镜像站（法律风险）
 *   - 不做网页爬取猜链接（易碎且易误伤）
 *   订阅制文献查不到属于预期行为，调用方应降级为「仅存元数据」。
 */

import { fetchCrossref } from "./metadata";

const UA = "GradWorkbench/1.0 (research literature manager)";
const LOOKUP_TIMEOUT = 12000;

export interface OaPdfHit {
  /** PDF 直链 */
  url: string;
  /** 命中来源，前端用于展示可信度 */
  source: "semantic-scholar" | "arxiv" | "europepmc";
  /** 命中的标题，便于调用方二次核对是否张冠李戴 */
  matchedTitle: string | null;
}

async function fetchJsonWithTimeout(
  url: string,
  timeout = LOOKUP_TIMEOUT,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 带 429 退避的 JSON 拉取，专供 Semantic Scholar。
 * 免 key 额度极小，实测连续请求会持续 429，重试两次已是收益上限，
 * 再多只是拖慢整体响应。
 */
async function fetchJsonWithBackoff(
  url: string,
  attempts = 2,
): Promise<unknown | null> {
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: controller.signal,
      });
      if (res.ok) return await res.json();
      if (res.status !== 429) return null;
      // 最后一次失败就不必再等
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function fetchTextWithTimeout(
  url: string,
  timeout = LOOKUP_TIMEOUT,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 标题归一化后比对，避免检索命中一篇名字相近的别的论文 */
function titleRoughlyMatches(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // 缺一边则不拦截，交由用户肉眼确认
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/* ------------------------------------------------------------------ */
/* 源 1：Semantic Scholar                                              */
/* ------------------------------------------------------------------ */

async function trySemanticScholar(
  doi: string | null,
  title: string | null,
): Promise<OaPdfHit | null> {
  const fields = "title,openAccessPdf,externalIds";
  let data: Record<string, unknown> | null = null;

  if (doi) {
    data = (await fetchJsonWithBackoff(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${fields}`,
    )) as Record<string, unknown> | null;
  }

  // 无 DOI 或按 DOI 查不到时，退回标题检索取第一条
  if (!data && title) {
    const search = (await fetchJsonWithBackoff(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=${fields}`,
    )) as { data?: Record<string, unknown>[] } | null;
    data = search?.data?.[0] ?? null;
  }

  if (!data) return null;

  const matchedTitle = (data.title as string) ?? null;
  if (!titleRoughlyMatches(title, matchedTitle)) return null;

  // 1a. 直接给了 OA 直链
  const oa = data.openAccessPdf as { url?: string } | null | undefined;
  if (oa?.url) {
    return { url: oa.url, source: "semantic-scholar", matchedTitle };
  }

  // 1b. 没给直链但带 arXiv 号 —— 实测这条路命中率比 openAccessPdf 更高
  const ext = data.externalIds as Record<string, unknown> | null | undefined;
  const arxivId = ext?.ArXiv ? String(ext.ArXiv) : null;
  if (arxivId) {
    return {
      url: `https://arxiv.org/pdf/${arxivId}`,
      source: "arxiv",
      matchedTitle,
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* 源 2：arXiv 标题检索                                                 */
/* ------------------------------------------------------------------ */

async function tryArxiv(title: string | null): Promise<OaPdfHit | null> {
  if (!title) return null;

  const xml = await fetchTextWithTimeout(
    `https://export.arxiv.org/api/query?search_query=ti:%22${encodeURIComponent(title)}%22&max_results=1`,
  );
  if (!xml) return null;

  // Atom 里第一个 <entry> 才是结果，<feed> 自身也有 title/id 需跳过
  const entryStart = xml.indexOf("<entry>");
  if (entryStart === -1) return null;
  const entry = xml.slice(entryStart);

  const idMatch = entry.match(/<id>\s*(https?:\/\/arxiv\.org\/abs\/([^<\s]+))\s*<\/id>/);
  if (!idMatch) return null;

  const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
  const matchedTitle = titleMatch
    ? titleMatch[1].replace(/\s+/g, " ").trim()
    : null;

  if (!titleRoughlyMatches(title, matchedTitle)) return null;

  return {
    url: `https://arxiv.org/pdf/${idMatch[2]}`,
    source: "arxiv",
    matchedTitle,
  };
}

/* ------------------------------------------------------------------ */
/* 源 3：Europe PMC                                                     */
/* ------------------------------------------------------------------ */

async function tryEuropePmc(
  doi: string | null,
  title: string | null,
): Promise<OaPdfHit | null> {
  const query = doi ? `DOI:${doi}` : title ? `TITLE:"${title}"` : null;
  if (!query) return null;

  const data = (await fetchJsonWithTimeout(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=1`,
  )) as {
    resultList?: { result?: Record<string, unknown>[] };
  } | null;

  const hit = data?.resultList?.result?.[0];
  if (!hit) return null;

  // 非 OA 的直接放弃，避免拿到一个跳转付费墙的地址
  if (String(hit.isOpenAccess ?? "N") !== "Y") return null;

  const matchedTitle = (hit.title as string) ?? null;
  if (!titleRoughlyMatches(title, matchedTitle)) return null;

  const pmcid = hit.pmcid ? String(hit.pmcid) : null;
  if (!pmcid) return null;

  return {
    url: `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextPDF`,
    source: "europepmc",
    matchedTitle,
  };
}

/* ------------------------------------------------------------------ */
/* 对外入口                                                             */
/* ------------------------------------------------------------------ */

/**
 * 依次尝试各 OA 源，返回首个命中的 PDF 直链。
 * 全部未命中返回 null —— 这对订阅制文献是正常结果，不是错误。
 */
export async function findOaPdf(opts: {
  doi?: string | null;
  title?: string | null;
}): Promise<OaPdfHit | null> {
  const doi = opts.doi?.trim() || null;
  let title = opts.title?.trim() || null;
  if (!doi && !title) return null;

  // 只给了 DOI 的话先补标题，否则 arXiv / PMC 的标题检索无从下手。
  // Crossref 无限流且项目已依赖，代价可以接受。
  if (!title && doi) {
    try {
      const meta = await fetchCrossref(doi);
      if (meta?.title) title = meta.title;
    } catch (err) {
      console.error("Crossref 补标题失败:", err);
    }
  }

  const strategies = [
    () => tryArxiv(title),
    () => tryEuropePmc(doi, title),
    () => trySemanticScholar(doi, title),
  ];

  for (const run of strategies) {
    try {
      const hit = await run();
      if (hit?.url) return hit;
    } catch (err) {
      // 单个源故障不应中断整条探源链
      console.error("OA 探源单源失败:", err);
    }
  }

  return null;
}

/**
 * 校验下载回来的确实是一个完整 PDF。
 * 实测教训：下载超时会得到一个魔数正确但尾部截断的残件，
 * 这种文件能存进磁盘却会让 pdf-parse 抛 "Invalid PDF structure"，
 * 因此必须同时检查头部魔数与尾部 EOF 标记。
 */
export function isCompletePdf(buf: Buffer): boolean {
  if (buf.length < 1024) return false;
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return false;
  // EOF 标记允许有尾随空白，往回多看 2KB 足够
  const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString("latin1");
  return tail.includes("%%EOF");
}
