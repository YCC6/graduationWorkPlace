import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
      include: {
        tags: { include: { tag: true } },
        notes: {
          orderBy: { updatedAt: "desc" },
        },
        citations: true,
      },
    });

    if (!paper) {
      return NextResponse.json({ error: "文献不存在" }, { status: 404 });
    }

    return NextResponse.json(paper);
  } catch (error) {
    console.error("获取文献详情失败:", error);
    return NextResponse.json({ error: "获取文献详情失败" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updateData: any = {};

    const fields = [
      "title", "journal", "year", "volume", "issue", "pages",
      "doi", "abstract", "url", "status", "rating",
      "standardType", "standardNumber", "docType", "pubInfo",
      "filePath", "fileName", "fileSize",
    ];

    for (const field of fields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (body.authors !== undefined) {
      updateData.authors = JSON.stringify(body.authors);
    }

    if (body.keywords !== undefined) {
      updateData.keywords = JSON.stringify(body.keywords);
    }

    const paper = await prisma.paper.update({
      where: { id: params.id },
      data: updateData,
      include: {
        tags: { include: { tag: true } },
      },
    });

    // 如果状态变更为已读，记录活动
    if (body.status === "read") {
      await prisma.activity.create({
        data: {
          type: "paper_read",
          title: "标记了文献为已读",
          detail: `"${paper.title.substring(0, 40)}"`,
          targetId: paper.id,
        },
      });
    }

    return NextResponse.json(paper);
  } catch (error) {
    console.error("更新文献失败:", error);
    return NextResponse.json({ error: "更新文献失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.paper.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除文献失败:", error);
    return NextResponse.json({ error: "删除文献失败" }, { status: 500 });
  }
}
