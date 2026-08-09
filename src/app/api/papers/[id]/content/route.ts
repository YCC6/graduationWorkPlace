import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 存储 PDF 提取的全文（用于全文检索）
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const content =
      typeof body.content === "string" ? body.content.slice(0, 5_000_000) : "";
    await prisma.paper.update({
      where: { id: params.id },
      data: { content },
    });
    return NextResponse.json({ ok: true, length: content.length });
  } catch (error) {
    console.error("保存全文失败:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
