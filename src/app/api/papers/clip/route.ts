/**
 * 文献剪藏接口 —— 供浏览器扩展 / 小书签调用
 * ------------------------------------------------------------------
 * POST /api/papers/clip   把当前页面的论文元数据一键入库
 * GET  /api/papers/clip   健康检查 + 按 DOI 查重（扩展用来显示"已入库"角标）
 * OPTIONS                 CORS 预检（含 Chrome Private Network Access）
 *
 * 设计要点：
 * 1. 这是唯一对外开放跨域写入的接口，因此支持可选的 X-Api-Key 校验
 *    （设置环境变量 CLIPPER_TOKEN 后生效）。
 * 2. DOI 幂等：命中已有记录时补全空字段而不是报 500（Paper.doi 是唯一键）。
 * 3. 元数据降级链：页面抓取 → Crossref/PubMed 补全，任一失败都不影响入库。
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchCrossref,
  fetchPubmed,
  mergeMetadata,
  normalizeIncoming,
  normalizeDoi,
  isValidDoi,
  type PaperMetadata,
} from "@/lib/metadata";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    // 回显来源；无 Origin（如 curl / 扩展后台）时放行
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
    // Chrome 会对「公网页面 → localhost」额外发起私有网络预检
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** 统一带 CORS 头的 JSON 响应 */
function json(
  request: NextRequest,
  body: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/* ------------------------------------------------------------------ */
/* 鉴权                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 未配置 CLIPPER_TOKEN 时不做校验（本地单机默认体验优先）；
 * 一旦配置，则要求请求头携带匹配的 X-Api-Key。
 */
function checkAuth(request: NextRequest): boolean {
  const expected = process.env.CLIPPER_TOKEN;
  if (!expected) return true;
  const provided =
    request.headers.get("x-api-key") ||
    new URL(request.url).searchParams.get("key");
  return provided === expected;
}

/* ------------------------------------------------------------------ */
/* GET —— 健康检查 / 查重                                               */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return json(request, { error: "密钥无效" }, 401);
    }

    const { searchParams } = new URL(request.url);
    const doi = normalizeDoi(searchParams.get("doi"));
    const title = searchParams.get("title");

    // 无参数 → 纯健康检查，扩展启动时探测服务是否在线
    if (!doi && !title) {
      const total = await prisma.paper.count();
      return json(request, {
        ok: true,
        service: "GradWorkbench Clipper",
        version: 1,
        authRequired: Boolean(process.env.CLIPPER_TOKEN),
        paperCount: total,
      });
    }

    const existing = await findExisting(doi, title);

    return json(request, {
      ok: true,
      exists: Boolean(existing),
      paper: existing
        ? { id: existing.id, title: existing.title, status: existing.status }
        : null,
    });
  } catch (error) {
    console.error("剪藏查询失败:", error);
    return json(request, { error: "剪藏查询失败" }, 500);
  }
}

/* ------------------------------------------------------------------ */
/* POST —— 入库                                                         */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return json(request, { error: "密钥无效，请检查扩展设置" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json(request, { error: "请求体不是合法 JSON" }, 400);
    }

    // 1. 规范化页面抓取到的数据
    const pageData = normalizeIncoming(body);

    // 2. 需要时向外部源补全
    const enrich = body.enrich !== false; // 默认开启
    let external: PaperMetadata | null = null;

    if (enrich) {
      if (pageData.doi && isValidDoi(pageData.doi)) {
        external = await fetchCrossref(pageData.doi);
      } else if (body.pmid) {
        external = await fetchPubmed(String(body.pmid));
        // PubMed 给了 DOI 的话，再用 Crossref 补全卷期页码
        if (external?.doi) {
          const cr = await fetchCrossref(external.doi);
          if (cr) external = mergeMetadata(external, cr);
        }
      }
    }

    // 页面数据优先（贴近用户所见），外部源补空缺
    const meta = mergeMetadata(pageData, external);

    // 3. 校验：至少要有标题
    if (!meta.title) {
      return json(
        request,
        {
          error:
            "未能识别论文标题，请在页面上打开论文详情页后重试，或手动录入",
        },
        400
      );
    }

    // 4. 查重
    const existing = await findExisting(meta.doi, meta.title, meta.year);

    if (existing) {
      // 幂等：补全此前缺失的字段，不覆盖已有内容
      const patch = buildPatch(existing, meta);

      if (Object.keys(patch).length === 0) {
        return json(request, {
          status: "duplicate",
          message: "该文献已在库中",
          paper: slim(existing),
        });
      }

      const updated = await prisma.paper.update({
        where: { id: existing.id },
        data: patch,
      });

      return json(request, {
        status: "updated",
        message: `已补全 ${Object.keys(patch).length} 个字段`,
        updatedFields: Object.keys(patch),
        paper: slim(updated),
      });
    }

    // 5. 新建
    const paper = await prisma.paper.create({
      data: {
        title: meta.title,
        authors: JSON.stringify(meta.authors),
        journal: meta.journal,
        year: meta.year,
        volume: meta.volume,
        issue: meta.issue,
        pages: meta.pages,
        doi: meta.doi,
        abstract: meta.abstract,
        keywords: JSON.stringify(meta.keywords),
        url: meta.url,
        status: typeof body.status === "string" ? body.status : "unread",
      },
    });

    // 沿用项目的活动日志约定
    await prisma.activity.create({
      data: {
        type: "paper_added",
        title: "通过剪藏添加了文献",
        detail: `"${paper.title.substring(0, 40)}${
          paper.title.length > 40 ? "..." : ""
        }"`,
        targetId: paper.id,
      },
    });

    // 可选：附加标签
    if (typeof body.tag === "string" && body.tag.trim()) {
      await attachTag(paper.id, body.tag.trim());
    }

    return json(
      request,
      {
        status: "created",
        message: "已保存到文献库",
        source: meta.source,
        paper: slim(paper),
      },
      201
    );
  } catch (error) {
    // 兜底：并发下仍可能撞唯一键
    if ((error as { code?: string }).code === "P2002") {
      return json(
        request,
        { status: "duplicate", message: "该文献已在库中" },
        200
      );
    }
    console.error("剪藏入库失败:", error);
    return json(request, { error: "剪藏入库失败" }, 500);
  }
}

/* ------------------------------------------------------------------ */
/* 辅助                                                                 */
/* ------------------------------------------------------------------ */

type PaperRow = Awaited<ReturnType<typeof prisma.paper.create>>;

/** 精简返回体，扩展只需要这些 */
function slim(paper: PaperRow) {
  return {
    id: paper.id,
    title: paper.title,
    doi: paper.doi,
    year: paper.year,
    journal: paper.journal,
    status: paper.status,
  };
}

/**
 * 查重策略：
 * 1. DOI 命中（最可靠）
 * 2. 标题完全一致（忽略大小写与空白）且年份不冲突
 */
async function findExisting(
  doi: string | null,
  title: string | null,
  year?: number | null
): Promise<PaperRow | null> {
  if (doi) {
    const byDoi = await prisma.paper.findUnique({ where: { doi } });
    if (byDoi) return byDoi;
  }

  if (title && title.length >= 8) {
    // SQLite 的 contains 不区分大小写（默认排序规则），先粗筛再精确比对
    const candidates = await prisma.paper.findMany({
      where: { title: { contains: title.substring(0, 40) } },
      take: 10,
    });

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const target = norm(title);

    for (const c of candidates) {
      if (norm(c.title) !== target) continue;
      // 年份都存在且不同 → 视为不同版本，不算重复
      if (year && c.year && c.year !== year) continue;
      return c;
    }
  }

  return null;
}

/** 只补全空字段，绝不覆盖用户已有数据 */
function buildPatch(
  existing: PaperRow,
  meta: PaperMetadata
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const scalarFields: [keyof PaperMetadata, keyof PaperRow][] = [
    ["journal", "journal"],
    ["year", "year"],
    ["volume", "volume"],
    ["issue", "issue"],
    ["pages", "pages"],
    ["doi", "doi"],
    ["abstract", "abstract"],
    ["url", "url"],
  ];

  for (const [metaKey, dbKey] of scalarFields) {
    const incoming = meta[metaKey];
    const current = existing[dbKey];
    if (
      (current === null || current === undefined || current === "") &&
      incoming !== null &&
      incoming !== undefined &&
      incoming !== ""
    ) {
      patch[dbKey] = incoming;
    }
  }

  // JSON 数组字段：原本为空数组时才写入
  if (meta.authors.length > 0 && isEmptyJsonArray(existing.authors)) {
    patch.authors = JSON.stringify(meta.authors);
  }
  if (meta.keywords.length > 0 && isEmptyJsonArray(existing.keywords)) {
    patch.keywords = JSON.stringify(meta.keywords);
  }

  return patch;
}

function isEmptyJsonArray(value: string | null): boolean {
  if (!value) return true;
  try {
    const arr = JSON.parse(value);
    return !Array.isArray(arr) || arr.length === 0;
  } catch {
    return value.trim() === "";
  }
}

/** 按名称找标签，没有就创建，然后挂到文献上 */
async function attachTag(paperId: string, name: string): Promise<void> {
  try {
    let tag = await prisma.tag.findUnique({ where: { name } });
    if (!tag) {
      tag = await prisma.tag.create({ data: { name } });
    }
    await prisma.paperTagRelation.create({
      data: { paperId, tagId: tag.id },
    });
  } catch (error) {
    // 标签失败不应阻塞入库
    console.error("附加标签失败:", error);
  }
}
