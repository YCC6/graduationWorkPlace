import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { ids, action, status } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "未选择文献" }, { status: 400 });
    }

    if (action === "delete") {
      await prisma.paper.deleteMany({
        where: { id: { in: ids } },
      });
      return NextResponse.json({ success: true, deleted: ids.length });
    }

    if (action === "status") {
      if (!status) {
        return NextResponse.json({ error: "缺少 status 参数" }, { status: 400 });
      }
      await prisma.paper.updateMany({
        where: { id: { in: ids } },
        data: { status },
      });

      if (status === "read") {
        await prisma.activity.createMany({
          data: ids.map((id: string) => ({
            type: "paper_read",
            title: "批量标记文献为已读",
            detail: `${ids.length} 篇文献`,
            targetId: id,
          })),
        });
      }

      return NextResponse.json({ success: true, updated: ids.length });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("批量操作失败:", error);
    return NextResponse.json({ error: "批量操作失败" }, { status: 500 });
  }
}
