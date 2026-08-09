import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const documents = await prisma.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        chapters: { orderBy: { order: "asc" }, select: { id: true, title: true, wordCount: true, order: true } },
        project: { select: { id: true, name: true } },
        _count: { select: { chapters: true, versions: true } },
      },
    });

    // 计算每个文档总字数
    const docsWithStats = documents.map((doc) => {
      const totalWords = doc.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
      return { ...doc, currentWordCount: totalWords };
    });

    return NextResponse.json(docsWithStats);
  } catch (error) {
    console.error("获取文档列表失败:", error);
    return NextResponse.json({ error: "获取文档列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const doc = await prisma.document.create({
      data: {
        title: body.title,
        type: body.type || "paper",
        description: body.description || null,
        targetWordCount: body.targetWordCount || 5000,
        projectId: body.projectId || null,
      },
      include: {
        chapters: { orderBy: { order: "asc" } },
        project: { select: { id: true, name: true } },
        _count: { select: { chapters: true, versions: true } },
      },
    });

    // 创建默认章节
    if (body.autoChapters && body.type === "paper") {
      await prisma.chapter.createMany({
        data: [
          { documentId: doc.id, title: "引言", order: 0, wordCount: 0 },
          { documentId: doc.id, title: "材料与方法", order: 1, wordCount: 0 },
          { documentId: doc.id, title: "结果与讨论", order: 2, wordCount: 0 },
          { documentId: doc.id, title: "结论", order: 3, wordCount: 0 },
          { documentId: doc.id, title: "参考文献", order: 4, wordCount: 0 },
        ],
      });
    }

    // 记录活动
    await prisma.activity.create({
      data: {
        type: "writing",
        title: "创建了写作文档",
        detail: `"${body.title}"`,
        targetId: doc.id,
      },
    });

    return NextResponse.json(doc);
  } catch (error) {
    console.error("创建文档失败:", error);
    return NextResponse.json({ error: "创建文档失败" }, { status: 500 });
  }
}
