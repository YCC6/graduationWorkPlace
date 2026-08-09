import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const doi = searchParams.get("doi");

  if (!doi) {
    return NextResponse.json({ error: "请提供 DOI" }, { status: 400 });
  }

  try {
    // 调用 Crossref API
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": "GradWorkbench/1.0 (mailto:research@example.com)" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "DOI 解析失败" }, { status: 404 });
    }

    const data = await res.json();
    const msg = data.message;

    const result = {
      title: msg.title?.[0] || "",
      authors: (msg.author || []).map(
        (a: any) => `${a.family || ""} ${a.given || ""}`.trim()
      ),
      journal: msg["container-title"]?.[0] || "",
      year: msg.published?.["date-parts"]?.[0]?.[0] || msg.created?.["date-parts"]?.[0]?.[0] || null,
      volume: msg.volume || null,
      issue: msg.issue || null,
      pages: msg.page || null,
      abstract: msg.abstract || null,
      doi: msg.DOI || doi,
      url: msg.URL || `https://doi.org/${msg.DOI}`,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("DOI 解析失败:", error);
    return NextResponse.json({ error: "DOI 解析服务暂时不可用" }, { status: 500 });
  }
}
