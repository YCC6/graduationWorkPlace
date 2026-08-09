import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const milestone = await prisma.milestone.create({
      data: {
        projectId: body.projectId,
        title: body.title,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });

    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "创建里程碑失败" }, { status: 500 });
  }
}
