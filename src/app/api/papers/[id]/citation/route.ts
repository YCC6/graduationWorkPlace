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
 * 出版信息（pubInfo JSON）结构
 */
interface PubInfo {
  publisher?: string | null;
  publishPlace?: string | null;
  institution?: string | null; // 学位授予单位 / 报告发布单位
  degree?: string | null; // 学位级别
  version?: string | null; // 报纸版次 / 版本
  newspaper?: string | null; // 报纸名
  date?: string | null; // 报纸/电子资源完整日期 YYYY-MM-DD
  updateDate?: string | null; // 电子资源更新日期
  citeDate?: string | null; // 电子资源引用日期
  patentCountry?: string | null;
  patentNumber?: string | null;
  publicDate?: string | null;
}

function parsePubInfo(raw: string | null | undefined): PubInfo {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object") return o as PubInfo;
  } catch {
    /* 忽略损坏的 JSON */
  }
  return {};
}

function authorPrefix(authors: string[]): string {
  if (authors.length === 0) return "";
  const head = authors.slice(0, 3).join(", ");
  return (authors.length > 3 ? `${head}, 等` : head) + ". ";
}

/**
 * 生成 GB/T 7714 格式引用（按文献类型分支）
 */
function generateGBT7714(paper: any): string {
  // 标准文献 [S]（优先用标准号，符合 GB/T、HJ、EPA、ISO 等环境标准著录）
  if (paper.standardType && paper.standardNumber) {
    return `${paper.standardNumber} ${paper.title}[S].`;
  }

  const authors = parseJSON(paper.authors);
  const lead = authorPrefix(authors);
  const docType: string = (paper.docType || "J").toUpperCase();
  const pub = parsePubInfo(paper.pubInfo);
  const doi = paper.doi ? ` DOI:${paper.doi}` : "";

  switch (docType) {
    // 期刊文章
    case "J": {
      let s = lead + `${paper.title}[J]. `;
      if (paper.journal) s += `${paper.journal}, `;
      if (paper.year) s += `${paper.year}`;
      if (paper.volume || paper.issue) {
        s += ", ";
        if (paper.volume) s += paper.volume;
        if (paper.issue) s += `(${paper.issue})`;
      }
      if (paper.pages) s += `: ${paper.pages}`;
      s += ".";
      return s + doi;
    }

    // 专著 / 论文集 / 报告 / 标准：出版地: 出版者, 年.
    case "M":
    case "C":
    case "R":
    case "S": {
      let s = lead + `${paper.title}[${docType}]. `;
      const place = pub.publishPlace || "";
      // 报告[R]/标准[S] 的出版者常为发布单位（institution）
      const publisher =
        pub.publisher ||
        (docType === "R" || docType === "S" ? pub.institution : null) ||
        paper.journal ||
        "";
      if (place && publisher) s += `${place}: ${publisher}, `;
      else if (publisher) s += `${publisher}, `;
      s += `${paper.year || ""}.`;
      return s + doi;
    }

    // 学位论文：保存地: 保存单位, 年.
    case "D": {
      let s = lead + `${paper.title}[D]. `;
      const place = pub.publishPlace || "";
      const inst = pub.institution || paper.journal || "";
      if (place && inst) s += `${place}: ${inst}, `;
      else if (inst) s += `${inst}, `;
      s += `${paper.year || ""}.`;
      return s;
    }

    // 报纸文章：报纸名, 出版日期(版次).
    case "N": {
      const newspaper = pub.newspaper || paper.journal || "";
      let s = lead + `${paper.title}[N]. ${newspaper}`;
      if (pub.date) s += `, ${pub.date}`;
      else if (paper.year) s += `, ${paper.year}`;
      if (pub.version) s += `(${pub.version})`;
      return s + ".";
    }

    // 专利：专利国别, 专利号. 公告日期.
    case "P": {
      let s = lead + `${paper.title}[P]. `;
      if (pub.patentCountry) s += `${pub.patentCountry}, `;
      if (pub.patentNumber) s += `${pub.patentNumber}. `;
      if (pub.publicDate) s += `${pub.publicDate}.`;
      else if (paper.year) s += `${paper.year}.`;
      return s;
    }

    // 电子资源：题名[EB/OL]. (更新日期)[引用日期]. 获取路径.
    case "EB/OL":
    case "EB":
    case "OL": {
      let s = lead + `${paper.title}[EB/OL]. `;
      if (pub.updateDate) s += `(${pub.updateDate})`;
      if (pub.citeDate) s += `[${pub.citeDate}]`;
      const link = paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : "");
      return s + (link ? ` ${link}.` : ".");
    }

    // 其他 / 未定义类型 [Z]：退路，按专著形式
    default: {
      let s = lead + `${paper.title}[Z]. `;
      const place = pub.publishPlace || "";
      const publisher = pub.publisher || paper.journal || "";
      if (place && publisher) s += `${place}: ${publisher}, `;
      else if (publisher) s += `${publisher}, `;
      s += `${paper.year || ""}.`;
      return s + doi;
    }
  }
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
