import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const maxOrder = await prisma.chapter.findFirst({
      where: { documentId: params.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const chapter = await prisma.chapter.create({
      data: {
        documentId: params.id,
        title: body.title || "新章节",
        content: body.content || "",
        order: body.order ?? ((maxOrder?.order ?? -1) + 1),
        wordCount: body.content ? body.content.replace(/\s/g, "").length : 0,
      },
    });

    return NextResponse.json(chapter);
  } catch (error) {
    console.error("创建章节失败:", error);
    return NextResponse.json({ error: "创建章节失败" }, { status: 500 });
  }
}

// 批量更新排序
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { orders } = body; // [{id: string, order: number}, ...]

    if (orders && Array.isArray(orders)) {
      await Promise.all(
        orders.map((o: { id: string; order: number }) =>
          prisma.chapter.update({ where: { id: o.id }, data: { order: o.order } })
        )
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("更新章节排序失败:", error);
    return NextResponse.json({ error: "更新章节排序失败" }, { status: 500 });
  }
}
