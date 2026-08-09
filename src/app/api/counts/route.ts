import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [papers, projects, tasks] = await Promise.all([
      prisma.paper.count(),
      prisma.project.count(),
      prisma.task.count({ where: { status: { in: ["todo", "in_progress"] } } }),
    ]);

    return NextResponse.json({ papers, projects, tasks });
  } catch (error) {
    console.error("获取计数失败:", error);
    return NextResponse.json({ papers: 0, projects: 0, tasks: 0 }, { status: 200 });
  }
}
