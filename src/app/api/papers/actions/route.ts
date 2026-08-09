import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.type === "tag") {
      // 批量关联/取消标签
      const { paperId, tagId, action } = body;
      if (action === "add") {
        await prisma.paperTagRelation.create({
          data: { paperId, tagId },
        });
      } else if (action === "remove") {
        await prisma.paperTagRelation.deleteMany({
          where: { paperId, tagId },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("操作失败:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
