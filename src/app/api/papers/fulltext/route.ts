import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function buildSnippet(text: string | null, kw: string, max = 180): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const idx = lower.indexOf(kw.toLowerCase());
  const start = idx === -1 ? 0 : Math.max(0, idx - 60);
  const end = Math.min(text.length, start + max);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + slice + (end < text.length ? "…" : "");
}

// PDF 全文检索：标题 / 摘要 / 正文
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [] });

  try {
    const rows = await prisma.paper.findMany({
      where: {
        OR: [
          { title: { contains: q } },
          { abstract: { contains: q } },
          { content: { contains: q } },
        ],
      },
      take: 20,
      select: {
        id: true,
        title: true,
        authors: true,
        journal: true,
        year: true,
        abstract: true,
        content: true,
      },
    });

    const results = rows.map((r) => {
      const inContent =
        !!r.content && r.content.toLowerCase().includes(q.toLowerCase());
      let authors: string[] = [];
      try {
        authors = r.authors ? JSON.parse(r.authors) : [];
      } catch {
        authors = [];
      }
      return {
        id: r.id,
        title: r.title,
        subtitle: [authors.slice(0, 3).join(", "), r.journal, r.year]
          .filter(Boolean)
          .join(" · "),
        snippet: inContent ? buildSnippet(r.content, q) : buildSnippet(r.abstract, q),
        matchIn: inContent ? "fulltext" : "meta",
        url: `/papers/${r.id}`,
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("全文检索失败:", error);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}
