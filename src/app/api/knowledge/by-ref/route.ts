import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 根据文献或实验 ID 查找关联的知识笔记
// 查找策略:
// 1. links 字段中包含 paper:<id> 或 experiment:<id>
// 2. links 字段中包含文献标题（双链 [[标题]] 的模糊匹配）
// 3. content 中包含文献 DOI
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "paper" | "experiment"
    const refId = searchParams.get("id");

    if (!type || !refId) {
      return NextResponse.json({ error: "缺少参数 type 和 id" }, { status: 400 });
    }

    let title = "";
    let doi = "";

    if (type === "paper") {
      const paper = await prisma.paper.findUnique({
        where: { id: refId },
        select: { title: true, doi: true },
      });
      if (paper) {
        title = paper.title;
        doi = paper.doi || "";
      }
    } else if (type === "experiment") {
      const exp = await prisma.experiment.findUnique({
        where: { id: refId },
        select: { title: true },
      });
      if (exp) {
        title = exp.title;
      }
    }

    // 获取所有笔记
    const allNotes = await prisma.knowledgeNote.findMany({
      include: { tags: { include: { tag: true } } },
      orderBy: { updatedAt: "desc" },
    });

    // 过滤关联笔记
    const matched = allNotes.filter((note) => {
      // 策略1: links 字段中包含 paper:<id> 或 experiment:<id>
      if (note.links) {
        try {
          const links: string[] = JSON.parse(note.links);
          const refPattern = `${type}:${refId}`;
          if (links.some((l) => l === refPattern || l.includes(refPattern))) {
            return true;
          }
          // 策略2: links 中包含标题
          if (title && links.some((l) => l.toLowerCase().includes(title.toLowerCase()) || title.toLowerCase().includes(l.toLowerCase()))) {
            return true;
          }
        } catch {}
      }
      // 策略3: content 中包含 DOI
      if (doi && note.content && note.content.includes(doi)) {
        return true;
      }
      // 策略4: content 中包含标题（精确匹配，避免过多噪音）
      if (title && note.content && note.content.includes(title)) {
        return true;
      }
      return false;
    });

    return NextResponse.json(matched);
  } catch (error) {
    console.error("查找关联笔记失败:", error);
    return NextResponse.json({ error: "查找失败" }, { status: 500 });
  }
}
