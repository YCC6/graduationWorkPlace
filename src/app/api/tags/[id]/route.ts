import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { name, color } = await request.json();
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (color !== undefined) updateData.color = color;

    const tag = await prisma.tag.update({
      where: { id: params.id },
      data: updateData,
      include: { _count: { select: { papers: true } } },
    });
    return NextResponse.json(tag);
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "标签名已存在" }, { status: 409 });
    }
    console.error("更新标签失败:", error);
    return NextResponse.json({ error: "更新标签失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 级联删除关联（PaperTagRelation 有 onDelete: Cascade）
    await prisma.tag.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除标签失败:", error);
    return NextResponse.json({ error: "删除标签失败" }, { status: 500 });
  }
}
