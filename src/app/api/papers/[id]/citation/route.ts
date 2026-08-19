import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseJSON(str: string | null): string[] {
  if (!str) return [];
  try {
    return JSON.parse(str);
  } catch {
    return str.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

function firstSurname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] || name).toLowerCase();
}

/**
 * 生成 GB/T 7714 格式引用
 */
function generateGBT7714(paper: any): string {
  // 标准文献 [S]
  if (paper.standardType && paper.standardNumber) {
    return `${paper.standardNumber} ${paper.title}[S].`;
  }

  const authors = parseJSON(paper.authors);
  let citation = "";

  // 作者部分：最多列出 3 人
  if (authors.length > 0) {
    citation += authors.slice(0, 3).join(", ");
    if (authors.length > 3) citation += ", 等";
    citation += ". ";
  }

  // 题名
  citation += `${paper.title}[J]. `;

  // 刊名
  if (paper.journal) {
    citation += `${paper.journal}, `;
  }

  // 年份
  if (paper.year) {
    citation += `${paper.year}`;
  }

  // 卷号(期号)
  if (paper.volume || paper.issue) {
    citation += ", ";
    if (paper.volume) citation += paper.volume;
    if (paper.issue) citation += `(${paper.issue})`;
  }

  // 页码
  if (paper.pages) {
    citation += `: ${paper.pages}`;
  }

  citation += ".";

  return citation;
}

/** APA 第 7 版（简化：保留作者全名，未做姓氏/名缩写拆分） */
function generateAPA(paper: any): string {
  const authors = parseJSON(paper.authors);
  const yr = paper.year ? `(${paper.year}).` : "(n.d.).";
  let s = (authors.length ? authors.join(", ") + " " : "") + yr + " ";
  s += `${paper.title}. `;
  if (paper.journal) s += `${paper.journal}`;
  if (paper.volume) s += `, ${paper.volume}`;
  if (paper.issue) s += `(${paper.issue})`;
  if (paper.pages) s += `, ${paper.pages}`;
  s += ".";
  if (paper.doi) s += ` https://doi.org/${paper.doi}`;
  return s;
}

/** MLA 第 9 版（简化） */
function generateMLA(paper: any): string {
  const authors = parseJSON(paper.authors);
  let s = authors.length ? authors.join(", ") + ". " : "";
  s += `"${paper.title}." `;
  if (paper.journal) s += `${paper.journal}`;
  if (paper.volume) s += `, vol. ${paper.volume}`;
  if (paper.issue) s += `, no. ${paper.issue}`;
  if (paper.year) s += `, ${paper.year}`;
  if (paper.pages) s += `, pp. ${paper.pages}`;
  s += ".";
  if (paper.doi) s += ` DOI: ${paper.doi}.`;
  return s;
}

/** BibTeX @article 条目 */
function generateBibTeX(paper: any): string {
  const authors = parseJSON(paper.authors);
  const first = authors[0] ? firstSurname(authors[0]) : "ref";
  const key = `${first}${paper.year || ""}`;
  let s = `@article{${key},\n`;
  s += `  title = {${paper.title}},\n`;
  if (authors.length) s += `  author = {${authors.join(" and ")}},\n`;
  if (paper.journal) s += `  journal = {${paper.journal}},\n`;
  if (paper.year) s += `  year = {${paper.year}},\n`;
  if (paper.volume) s += `  volume = {${paper.volume}},\n`;
  if (paper.issue) s += `  number = {${paper.issue}},\n`;
  if (paper.pages) s += `  pages = {${paper.pages}},\n`;
  if (paper.doi) s += `  doi = {${paper.doi}}\n`;
  s += "}";
  return s;
}

const GENERATORS: Record<string, (p: any) => string> = {
  gbt7714: generateGBT7714,
  apa: generateAPA,
  mla: generateMLA,
  bibtex: generateBibTeX,
};

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
    });

    if (!paper) {
      return NextResponse.json({ error: "文献不存在" }, { status: 404 });
    }

    const reqFormat = request.nextUrl.searchParams.get("format");
    const format = reqFormat && GENERATORS[reqFormat] ? reqFormat : "gbt7714";

    // 全部格式一次性生成，前端可自由切换
    const styles: Record<string, string> = {};
    for (const key of Object.keys(GENERATORS)) {
      styles[key] = GENERATORS[key](paper);
    }

    // 落库缓存（GB/T 7714 为主，保持备份/导出兼容）
    try {
      await prisma.citation.upsert({
        where: { paperId: paper.id },
        create: { paperId: paper.id, style: "gbt7714", content: styles.gbt7714 },
        update: { content: styles.gbt7714 },
      });
    } catch (e) {
      console.error("引用落库失败:", e);
    }

    return NextResponse.json({
      style: format,
      content: styles[format],
      styles,
    });
  } catch (error) {
    console.error("生成引用失败:", error);
    return NextResponse.json({ error: "生成引用失败" }, { status: 500 });
  }
}
