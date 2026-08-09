import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const goal = await prisma.writingGoal.update({
      where: { id: params.id },
      data: {
        targetWords: body.targetWords,
        achievedWords: body.achievedWords,
      },
    });
    return NextResponse.json(goal);
  } catch (error) {
    console.error("更新写作目标失败:", error);
    return NextResponse.json({ error: "更新写作目标失败" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.writingGoal.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除写作目标失败:", error);
    return NextResponse.json({ error: "删除写作目标失败" }, { status: 500 });
  }
}
