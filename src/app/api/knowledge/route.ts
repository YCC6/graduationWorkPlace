import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const tag = searchParams.get("tag");
    const category = searchParams.get("category");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: any = {};

    if (tag) {
      where.tags = { some: { tag: { name: tag } } };
    }

    if (category) {
      where.category = category;
    }

    if (q) {
      where.OR = [
        { title: { contains: q } },
        { content: { contains: q } },
      ];
    }

    const [notes, total] = await Promise.all([
      prisma.knowledgeNote.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.knowledgeNote.count({ where }),
    ]);

    return NextResponse.json({ notes, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("获取知识笔记列表失败:", error);
    return NextResponse.json({ error: "获取列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 解析双链 [[text]] 并生成 links 引用
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    const rawLinks: string[] = [];
    let match;
    while ((match = linkRegex.exec(body.content || "")) !== null) {
      rawLinks.push(match[1]);
    }

    // 去除双链标记后的纯文本（用于全文搜索）
    const cleanContent = (body.content || "").replace(linkRegex, "$1");

    const note = await prisma.knowledgeNote.create({
      data: {
        title: body.title,
        content: cleanContent,
        category: body.category || null,
        links: rawLinks.length > 0 ? JSON.stringify(rawLinks) : null,
      },
      include: {
        tags: { include: { tag: true } },
      },
    });

    // 处理标签
    if (body.tags && Array.isArray(body.tags)) {
      for (const tagName of body.tags) {
        const tag = await prisma.knowledgeTag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        await prisma.knowledgeNoteTag.create({
          data: { noteId: note.id, tagId: tag.id },
        });
      }
    }

    // 活动日志
    await prisma.activity.create({
      data: {
        type: "note_created",
        title: "创建了知识笔记",
        detail: `"${note.title}"`,
        targetId: note.id,
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("创建知识笔记失败:", error);
    return NextResponse.json({ error: "创建笔记失败" }, { status: 500 });
  }
}
