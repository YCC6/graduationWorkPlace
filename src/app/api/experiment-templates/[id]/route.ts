import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updateData: any = {};
    const fields = ["name", "category", "description", "objective", "methods", "reagents", "conditions"];
    for (const f of fields) {
      if (body[f] !== undefined) updateData[f] = body[f];
    }
    const template = await prisma.experimentTemplate.update({
      where: { id: params.id },
      data: updateData,
    });
    return NextResponse.json(template);
  } catch (error) {
    console.error("更新模板失败:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tpl = await prisma.experimentTemplate.findUnique({ where: { id: params.id } });
    if (tpl?.isBuiltin) {
      return NextResponse.json({ error: "内置模板不可删除" }, { status: 400 });
    }
    await prisma.experimentTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除模板失败:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
