import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractPdfText } from "@/lib/pdf";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const tag = searchParams.get("tag");
    const q = searchParams.get("q");
    const ids = searchParams.get("ids");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: any = {};

    // 批量按 ID 获取
    if (ids) {
      const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
      where.id = { in: idList };
    }

    if (status && status !== "all" && !ids) {
      if (status === "starred") {
        where.rating = { gte: 4 };
      } else {
        where.status = status;
      }
    }

    if (tag && !ids) {
      where.tags = {
        some: {
          tag: { name: tag },
        },
      };
    }

    if (q && !ids) {
      where.OR = [
        { title: { contains: q } },
        { abstract: { contains: q } },
        { authors: { contains: q } },
        { keywords: { contains: q } },
        { journal: { contains: q } },
      ];
    }

    const [papers, total] = await Promise.all([
      prisma.paper.findMany({
        where,
        include: {
          tags: {
            include: { tag: true },
          },
        },
        orderBy: ids ? undefined : { createdAt: "desc" },
        skip: ids ? 0 : skip,
        take: ids ? undefined : limit,
      }),
      prisma.paper.count({ where }),
    ]);

    return NextResponse.json({
      papers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("获取文献列表失败:", error);
    return NextResponse.json({ error: "获取文献列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const paper = await prisma.paper.create({
      data: {
        title: body.title,
        authors: JSON.stringify(body.authors || []),
        journal: body.journal || null,
        year: body.year || null,
        volume: body.volume || null,
        issue: body.issue || null,
        pages: body.pages || null,
        doi: body.doi || null,
        abstract: body.abstract || null,
        keywords: JSON.stringify(body.keywords || []),
        url: body.url || null,
        filePath: body.filePath || null,
        fileName: body.fileName || null,
        fileSize: body.fileSize || null,
        status: body.status || "unread",
        rating: body.rating || null,
        standardType: body.standardType || null,
        standardNumber: body.standardNumber || null,
        docType: body.docType || "J",
        pubInfo: body.pubInfo || null,
      },
    });

    // 创建活动日志
    await prisma.activity.create({
      data: {
        type: "paper_added",
        title: "添加了文献",
        detail: `"${paper.title.substring(0, 40)}..."`,
        targetId: paper.id,
      },
    });

    // 上传的是 PDF 则自动提取全文，使 AI 总结/翻译开箱即用，无需手动点「全文索引」
    let indexedChars = 0;
    if (paper.filePath && /\.pdf$/i.test(paper.filePath)) {
      try {
        const text = await extractPdfText(paper.filePath);
        if (text) {
          await prisma.paper.update({
            where: { id: paper.id },
            data: { content: text },
          });
          indexedChars = text.length;
        }
      } catch (e) {
        // 提取失败不影响文献创建，用户仍可在详情页手动触发「全文索引」
        console.error("自动提取全文失败:", e);
      }
    }

    // paper 是 create 时的快照，content 恒为 null，
    // 单独回传 indexedChars 让前端能提示「已索引 N 字」或索引失败。
    return NextResponse.json(
      { ...paper, indexedChars },
      { status: 201 },
    );
  } catch (error) {
    console.error("创建文献失败:", error);
    return NextResponse.json({ error: "创建文献失败" }, { status: 500 });
  }
}
