import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const where: any = {};
    if (projectId) where.projectId = projectId;

    const experiments = await prisma.experiment.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(experiments);
  } catch (error) {
    console.error("获取实验列表失败:", error);
    return NextResponse.json({ error: "获取实验列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const experiment = await prisma.experiment.create({
      data: {
        projectId: body.projectId,
        title: body.title,
        objective: body.objective || null,
        methods: body.methods || null,
        reagents: body.reagents ? JSON.stringify(body.reagents) : null,
        conditions: body.conditions ? JSON.stringify(body.conditions) : null,
        results: body.results || null,
        conclusion: body.conclusion || null,
        images: body.images ? JSON.stringify(body.images) : null,
        tags: body.tags ? JSON.stringify(body.tags) : null,
        status: body.status || "draft",
      },
    });

    // 更新项目进度
    await updateProjectProgress(body.projectId);

    // 创建活动
    await prisma.activity.create({
      data: {
        type: "experiment_created",
        title: "创建了实验",
        detail: `"${experiment.title}"`,
        targetId: experiment.projectId,
      },
    });

    return NextResponse.json(experiment, { status: 201 });
  } catch (error) {
    console.error("创建实验失败:", error);
    return NextResponse.json({ error: "创建实验失败" }, { status: 500 });
  }
}

async function updateProjectProgress(projectId: string) {
  const [total, completed] = await Promise.all([
    prisma.experiment.count({ where: { projectId } }),
    prisma.experiment.count({ where: { projectId, status: "completed" } }),
  ]);

  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  await prisma.project.update({
    where: { id: projectId },
    data: { progress },
  });
}
