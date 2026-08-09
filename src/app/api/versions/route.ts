import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 抓取文档所有章节作为快照
    const chapters = await prisma.chapter.findMany({
      where: { documentId: body.documentId },
      orderBy: { order: "asc" },
      select: { id: true, title: true, content: true, order: true, wordCount: true },
    });

    const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

    const version = await prisma.version.create({
      data: {
        documentId: body.documentId,
        versionName: body.versionName || `v${Date.now()}`,
        content: JSON.stringify(chapters),
        wordCount: totalWords,
      },
    });

    return NextResponse.json(version);
  } catch (error) {
    console.error("创建版本失败:", error);
    return NextResponse.json({ error: "创建版本失败" }, { status: 500 });
  }
}
