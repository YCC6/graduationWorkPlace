import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updateData: any = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.objective !== undefined) updateData.objective = body.objective;
    if (body.methods !== undefined) updateData.methods = body.methods;
    if (body.reagents !== undefined) updateData.reagents = typeof body.reagents === "string" ? body.reagents : JSON.stringify(body.reagents);
    if (body.conditions !== undefined) updateData.conditions = typeof body.conditions === "string" ? body.conditions : JSON.stringify(body.conditions);
    if (body.results !== undefined) updateData.results = body.results;
    if (body.conclusion !== undefined) updateData.conclusion = body.conclusion;
    if (body.images !== undefined) updateData.images = typeof body.images === "string" ? body.images : JSON.stringify(body.images);
    if (body.tags !== undefined) updateData.tags = typeof body.tags === "string" ? body.tags : JSON.stringify(body.tags);
    if (body.status !== undefined) updateData.status = body.status;

    const experiment = await prisma.experiment.update({
      where: { id: params.id },
      data: updateData,
    });

    // 更新项目进度
    await updateProjectProgress(experiment.projectId);

    return NextResponse.json(experiment);
  } catch (error) {
    console.error("更新实验失败:", error);
    return NextResponse.json({ error: "更新实验失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const experiment = await prisma.experiment.delete({
      where: { id: params.id },
    });

    // 更新项目进度
    await updateProjectProgress(experiment.projectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除实验失败:", error);
    return NextResponse.json({ error: "删除实验失败" }, { status: 500 });
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
