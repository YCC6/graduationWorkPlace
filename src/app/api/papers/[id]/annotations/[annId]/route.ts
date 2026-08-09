import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; annId: string } }
) {
  try {
    const body = await request.json();
    const updateData: any = {};
    if (body.content !== undefined) updateData.content = body.content;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.page !== undefined) updateData.page = body.page;
    if (body.selectedText !== undefined) updateData.selectedText = body.selectedText;

    const annotation = await prisma.pdfAnnotation.update({
      where: { id: params.annId },
      data: updateData,
    });
    return NextResponse.json(annotation);
  } catch (error) {
    console.error("更新批注失败:", error);
    return NextResponse.json({ error: "更新批注失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; annId: string } }
) {
  try {
    await prisma.pdfAnnotation.delete({
      where: { id: params.annId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除批注失败:", error);
    return NextResponse.json({ error: "删除批注失败" }, { status: 500 });
  }
}
