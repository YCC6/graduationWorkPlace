import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const note = await prisma.paperNote.create({
      data: {
        paperId: body.paperId,
        content: body.content,
        isPrivate: body.isPrivate ?? true,
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("创建笔记失败:", error);
    return NextResponse.json({ error: "创建笔记失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const note = await prisma.paperNote.update({
      where: { id: body.id },
      data: {
        content: body.content,
        isPrivate: body.isPrivate,
      },
    });

    return NextResponse.json(note);
  } catch (error) {
    console.error("更新笔记失败:", error);
    return NextResponse.json({ error: "更新笔记失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 ID" }, { status: 400 });

    await prisma.paperNote.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除笔记失败:", error);
    return NextResponse.json({ error: "删除笔记失败" }, { status: 500 });
  }
}
