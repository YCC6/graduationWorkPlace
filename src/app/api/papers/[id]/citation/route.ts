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

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
    });

    if (!paper) {
      return NextResponse.json({ error: "文献不存在" }, { status: 404 });
    }

    const gbt7714 = generateGBT7714(paper);

    return NextResponse.json({
      style: "gbt7714",
      content: gbt7714,
      styles: {
        gbt7714: gbt7714,
        // 可扩展更多格式
      },
    });
  } catch (error) {
    console.error("生成引用失败:", error);
    return NextResponse.json({ error: "生成引用失败" }, { status: 500 });
  }
}
