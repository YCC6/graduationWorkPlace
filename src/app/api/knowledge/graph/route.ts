import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const notes = await prisma.knowledgeNote.findMany({
      select: { id: true, title: true, links: true, category: true, content: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const nodes: Array<{
      id: string;
      label: string;
      group: string;
      size: number;
    }> = [];

    const edges: Array<{
      source: string;
      target: string;
      label: string;
      style?: string;
    }> = [];

    const nodeMap = new Map<string, boolean>();
    const edgeSet = new Set<string>(); // 去重：source|target|label

    const addNode = (id: string, label: string, group: string, size: number) => {
      if (!nodeMap.has(id)) {
        nodeMap.set(id, true);
        nodes.push({
          id,
          label: label.length > 20 ? label.slice(0, 20) + "..." : label,
          group,
          size,
        });
      }
    };

    const addEdge = (source: string, target: string, label: string, style?: string) => {
      const key = `${source}|${target}|${label}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source, target, label, style });
      }
    };

    // 添加所有笔记为节点
    for (const note of notes) {
      addNode(note.id, note.title, note.category || "未分类", 1);
    }

    // 解析 links 中的引用（显式双链）
    for (const note of notes) {
      if (note.links) {
        try {
          const links: string[] = JSON.parse(note.links);
          for (const linkText of links) {
            // 优先使用 contains 匹配
            let paper = await prisma.paper.findFirst({
              where: { title: { contains: linkText } },
              select: { id: true, title: true },
            });

            // 回退：提取核心关键词（去掉标记符号）
            if (!paper) {
              const core = linkText.replace(/[\[\]#\*\\-_`]/g, "").trim();
              if (core.length > 0 && core !== linkText) {
                paper = await prisma.paper.findFirst({
                  where: { title: { contains: core } },
                  select: { id: true, title: true },
                });
              }
            }

            // 也尝试匹配笔记标题
            if (!paper) {
              const matchedNote = await prisma.knowledgeNote.findFirst({
                where: { title: { contains: linkText } },
                select: { id: true, title: true },
              });
              if (matchedNote && matchedNote.id !== note.id) {
                addNode(matchedNote.id, matchedNote.title, "笔记", 0.8);
                addEdge(note.id, matchedNote.id, linkText);
              }
              continue;
            }

            if (paper) {
              const targetId = `paper:${paper.id}`;
              addNode(targetId, paper.title, "文献", 0.7);
              addEdge(note.id, targetId, linkText);
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    // 隐式关联：检测笔记 content 中出现其他笔记标题的引用
    for (const note of notes) {
      if (!note.content) continue;
      for (const otherNote of notes) {
        if (otherNote.id === note.id) continue;
        // 检查 content 中是否包含其他笔记的标题
        if (note.content.includes(otherNote.title)) {
          // 检查是否已有显式边
          const hasExplicitEdge = edges.some(
            (e) =>
              (e.source === note.id && e.target === otherNote.id) ||
              (e.source === otherNote.id && e.target === note.id)
          );
          if (!hasExplicitEdge) {
            addEdge(note.id, otherNote.id, "mentioned", "dashed");
          }
        }
      }
    }

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    console.error("获取知识图谱失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
