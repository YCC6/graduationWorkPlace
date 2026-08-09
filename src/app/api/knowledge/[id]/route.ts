import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 解析双链引用，找到关联的文献/项目/实验
async function resolveLinks(links: string | null) {
  if (!links) return [];
  try {
    const rawLinks: string[] = JSON.parse(links);
    const resolved: Array<{ text: string; type: string; title: string; href: string }> = [];

    for (const text of rawLinks) {
      // 先尝试按标题搜索文献
      const paper = await prisma.paper.findFirst({
        where: { title: { contains: text } },
        select: { id: true, title: true },
      });
      if (paper) {
        resolved.push({ text, type: "paper", title: paper.title, href: `/papers/${paper.id}` });
        continue;
      }

      // 搜索项目
      const project = await prisma.project.findFirst({
        where: { name: { contains: text } },
        select: { id: true, name: true },
      });
      if (project) {
        resolved.push({ text, type: "project", title: project.name, href: `/projects/${project.id}` });
        continue;
      }

      // 搜索其他知识笔记
      const note = await prisma.knowledgeNote.findFirst({
        where: { title: { contains: text } },
        select: { id: true, title: true },
      });
      if (note) {
        resolved.push({ text, type: "note", title: note.title, href: `/knowledge/${note.id}` });
        continue;
      }

      // 未找到匹配的作为纯文本链接
      resolved.push({ text, type: "unknown", title: text, href: "" });
    }

    return resolved;
  } catch {
    return [];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const note = await prisma.knowledgeNote.findUnique({
      where: { id: params.id },
      include: {
        tags: { include: { tag: true } },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
    }

    // 解析双链引用
    const resolvedLinks = await resolveLinks(note.links);

    return NextResponse.json({ ...note, resolvedLinks });
  } catch (error) {
    console.error("获取知识笔记失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    // 解析双链
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    const rawLinks: string[] = [];
    let match;
    while ((match = linkRegex.exec(body.content || "")) !== null) {
      rawLinks.push(match[1]);
    }
    const cleanContent = (body.content || "").replace(linkRegex, "$1");

    const note = await prisma.knowledgeNote.update({
      where: { id: params.id },
      data: {
        title: body.title,
        content: cleanContent,
        category: body.category,
        links: rawLinks.length > 0 ? JSON.stringify(rawLinks) : null,
      },
      include: {
        tags: { include: { tag: true } },
      },
    });

    // 重新处理标签（替换模式）
    if (body.tags !== undefined) {
      // 删除旧关联
      await prisma.knowledgeNoteTag.deleteMany({ where: { noteId: note.id } });
      // 创建新关联
      if (Array.isArray(body.tags)) {
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
    }

    // 重新加载带标签
    const updated = await prisma.knowledgeNote.findUnique({
      where: { id: params.id },
      include: { tags: { include: { tag: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("更新知识笔记失败:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.knowledgeNote.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除知识笔记失败:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
