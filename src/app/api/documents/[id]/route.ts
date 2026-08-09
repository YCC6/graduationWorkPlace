import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: params.id },
      include: {
        chapters: { orderBy: { order: "asc" } },
        versions: { orderBy: { createdAt: "desc" }, take: 10 },
        project: { select: { id: true, name: true } },
      },
    });
    if (!doc) return NextResponse.json({ error: "文档不存在" }, { status: 404 });

    return NextResponse.json(doc);
  } catch (error) {
    console.error("获取文档失败:", error);
    return NextResponse.json({ error: "获取文档失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const doc = await prisma.document.update({
      where: { id: params.id },
      data: {
        title: body.title,
        type: body.type,
        status: body.status,
        description: body.description,
        targetWordCount: body.targetWordCount,
        projectId: body.projectId,
      },
    });
    return NextResponse.json(doc);
  } catch (error) {
    console.error("更新文档失败:", error);
    return NextResponse.json({ error: "更新文档失败" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.document.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除文档失败:", error);
    return NextResponse.json({ error: "删除文档失败" }, { status: 500 });
  }
}
