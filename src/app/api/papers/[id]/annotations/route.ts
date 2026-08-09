import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const annotations = await prisma.pdfAnnotation.findMany({
      where: { paperId: params.id },
      orderBy: { page: "asc" },
    });
    return NextResponse.json(annotations);
  } catch (error) {
    console.error("获取批注失败:", error);
    return NextResponse.json({ error: "获取批注失败" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const annotation = await prisma.pdfAnnotation.create({
      data: {
        paperId: params.id,
        page: body.page || 1,
        content: body.content || "",
        color: body.color || "#FFEB3B",
        selectedText: body.selectedText || null,
      },
    });
    return NextResponse.json(annotation, { status: 201 });
  } catch (error) {
    console.error("创建批注失败:", error);
    return NextResponse.json({ error: "创建批注失败" }, { status: 500 });
  }
}
