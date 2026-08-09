import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    // 统计数据
    const [totalPapers, unreadPapers, readingPapers, readPapers, totalNotes, totalKnowledgeNotes, totalProjects, activeTasks] =
      await Promise.all([
        prisma.paper.count(),
        prisma.paper.count({ where: { status: "unread" } }),
        prisma.paper.count({ where: { status: "reading" } }),
        prisma.paper.count({ where: { status: "read" } }),
        prisma.paperNote.count(),
        prisma.knowledgeNote.count(),
        prisma.project.count({ where: { status: "active" } }),
        prisma.task.count({ where: { status: { in: ["todo", "in_progress"] } } }),
      ]);

    // 近期活动
    const activities = await prisma.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // 近期任务
    const upcomingTasks = await prisma.task.findMany({
      where: {
        status: { in: ["todo", "in_progress"] },
        dueDate: { not: null },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: {
        project: { select: { name: true } },
      },
    });

    // 本周新增文献
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentPapers = await prisma.paper.count({
      where: { createdAt: { gte: oneWeekAgo } },
    });

    return NextResponse.json({
      stats: {
        totalPapers,
        unreadPapers,
        readingPapers,
        readPapers,
        totalNotes,
        totalKnowledgeNotes,
        totalProjects,
        activeTasks,
        recentPapers,
      },
      activities,
      upcomingTasks,
    });
  } catch (error) {
    console.error("获取仪表盘数据失败:", error);
    return NextResponse.json({ error: "获取仪表盘数据失败" }, { status: 500 });
  }
}
