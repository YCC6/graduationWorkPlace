import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: [
        { status: "asc" },
        { priority: "asc" },
        { dueDate: "asc" },
      ],
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("获取任务列表失败:", error);
    return NextResponse.json({ error: "获取任务列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const task = await prisma.task.create({
      data: {
        title: body.title,
        description: body.description || null,
        priority: body.priority || "medium",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        projectId: body.projectId || null,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("创建任务失败:", error);
    return NextResponse.json({ error: "创建任务失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const task = await prisma.task.update({
      where: { id: body.id },
      data: {
        title: body.title,
        description: body.description,
        priority: body.priority,
        status: body.status,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        pomodoroCount: body.pomodoroCount,
        pomodoroMinutes: body.pomodoroMinutes,
      },
    });

    // 如果完成了，记录活动
    if (body.status === "done") {
      await prisma.activity.create({
        data: {
          type: "task_completed",
          title: "完成了任务",
          detail: task.title,
        },
      });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("更新任务失败:", error);
    return NextResponse.json({ error: "更新任务失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 ID" }, { status: 400 });

    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除任务失败:", error);
    return NextResponse.json({ error: "删除任务失败" }, { status: 500 });
  }
}
