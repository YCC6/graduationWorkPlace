import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT: 标记里程碑完成/未完成
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const milestone = await prisma.milestone.update({
      where: { id: params.id },
      data: {
        completed: body.completed,
        title: body.title || undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      },
    });

    return NextResponse.json(milestone);
  } catch (error) {
    return NextResponse.json({ error: "更新里程碑失败" }, { status: 500 });
  }
}
