import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tags = await prisma.knowledgeTag.findMany({
      include: {
        _count: { select: { notes: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(tags);
  } catch (error) {
    console.error("获取知识标签失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
