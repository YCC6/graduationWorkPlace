import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const goals = await prisma.writingGoal.findMany({
      orderBy: { date: "desc" },
      take: 30,
    });
    return NextResponse.json(goals);
  } catch (error) {
    console.error("获取写作目标失败:", error);
    return NextResponse.json({ error: "获取写作目标失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const goal = await prisma.writingGoal.upsert({
      where: { type_date: { type: body.type, date: body.date } },
      update: {
        targetWords: body.targetWords,
        achievedWords: body.achievedWords ?? 0,
      },
      create: {
        type: body.type,
        targetWords: body.targetWords,
        achievedWords: body.achievedWords ?? 0,
        date: body.date,
      },
    });
    return NextResponse.json(goal);
  } catch (error) {
    console.error("创建写作目标失败:", error);
    return NextResponse.json({ error: "创建写作目标失败" }, { status: 500 });
  }
}
