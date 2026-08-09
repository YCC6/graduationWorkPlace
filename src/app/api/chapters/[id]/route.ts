import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.content !== undefined) {
      data.content = body.content;
      data.wordCount = body.content.replace(/\s/g, "").length;
    }

    const chapter = await prisma.chapter.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(chapter);
  } catch (error) {
    console.error("更新章节失败:", error);
    return NextResponse.json({ error: "更新章节失败" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.chapter.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除章节失败:", error);
    return NextResponse.json({ error: "删除章节失败" }, { status: 500 });
  }
}
