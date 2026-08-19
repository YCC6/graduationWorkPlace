import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface SearchResult {
  type: "paper" | "note" | "project" | "experiment" | "task";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  highlight: string;
  score: number;
  matchIn?: "title" | "abstract" | "keywords" | "content";
}

function truncate(text: string, max = 100): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function extractHighlight(text: string | null, keyword: string): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return truncate(text);
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, start + 100);
  const snippet = text.slice(start, end);
  return (start > 0 ? "..." : "") + snippet + (end < text.length ? "..." : "");
}

const PHASE_NAMES: Record<string, string> = {
  preparation: "准备阶段",
  experiment: "实验阶段",
  writing: "写作阶段",
  completed: "已完成",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const kw = q;

  const [papersRes, notesRes, projectsRes, experimentsRes, tasksRes] =
    await Promise.allSettled([
      // 文献：title, abstract, keywords
      prisma.paper
        .findMany({
          where: {
            OR: [
              { title: { contains: kw } },
              { abstract: { contains: kw } },
              { keywords: { contains: kw } },
              { content: { contains: kw } },
            ],
          },
          take: 5,
          select: {
            id: true,
            title: true,
            authors: true,
            journal: true,
            abstract: true,
            keywords: true,
            content: true,
          },
        })
        .then((rows) =>
          rows.map((r) => {
            const titleMatch = r.title.toLowerCase().includes(kw.toLowerCase());
            const abstractMatch = r.abstract?.toLowerCase().includes(kw.toLowerCase());
            const keywordsMatch = r.keywords?.toLowerCase().includes(kw.toLowerCase());
            const contentMatch = r.content?.toLowerCase().includes(kw.toLowerCase());
            let score = 0;
            if (titleMatch) score = r.title.toLowerCase() === kw.toLowerCase() ? 3 : 2;
            else if (abstractMatch || keywordsMatch) score = 1;
            else if (contentMatch) score = 1;

            // 命中字段：用于前端标记「正文」来源，并决定高亮片段取自何处
            let matchIn: "title" | "abstract" | "keywords" | "content" | undefined;
            if (contentMatch) matchIn = "content";
            else if (abstractMatch) matchIn = "abstract";
            else if (keywordsMatch) matchIn = "keywords";
            else if (titleMatch) matchIn = "title";

            let authors: string[] = [];
            try {
              authors = r.authors ? JSON.parse(r.authors) : [];
            } catch {
              authors = [];
            }
            const authorStr = Array.isArray(authors) && authors.length > 0 ? authors.join(", ") : "未知作者";

            // 高亮片段优先取实际命中的字段（命中正文就显示正文，不再默认摘要）
            const highlight = matchIn === "content" && r.content
              ? extractHighlight(r.content, kw)
              : matchIn === "abstract" && r.abstract
                ? extractHighlight(r.abstract, kw)
                : matchIn === "keywords" && r.keywords
                  ? extractHighlight(r.keywords, kw)
                  : matchIn === "title"
                    ? extractHighlight(r.title, kw)
                    : r.abstract
                      ? extractHighlight(r.abstract, kw)
                      : r.content
                        ? extractHighlight(r.content, kw)
                        : r.title;

            return {
              type: "paper" as const,
              id: r.id,
              title: r.title,
              subtitle: `${authorStr}${r.journal ? " · " + r.journal : ""}`,
              url: `/papers/${r.id}`,
              highlight,
              score,
              matchIn,
            };
          }),
        ),

      // 知识笔记：title, content
      prisma.knowledgeNote
        .findMany({
          where: {
            OR: [
              { title: { contains: kw } },
              { content: { contains: kw } },
            ],
          },
          take: 5,
          select: {
            id: true,
            title: true,
            content: true,
            category: true,
          },
        })
        .then((rows) =>
          rows.map((r) => {
            const titleMatch = r.title.toLowerCase().includes(kw.toLowerCase());
            const contentMatch = r.content?.toLowerCase().includes(kw.toLowerCase());
            let score = 0;
            if (titleMatch) score = r.title.toLowerCase() === kw.toLowerCase() ? 3 : 2;
            else if (contentMatch) score = 1;

            return {
              type: "note" as const,
              id: r.id,
              title: r.title,
              subtitle: r.category || "未分类",
              url: `/knowledge/${r.id}`,
              highlight: extractHighlight(r.content, kw),
              score,
            };
          }),
        ),

      // 研究项目：name, description
      prisma.project
        .findMany({
          where: {
            OR: [
              { name: { contains: kw } },
              { description: { contains: kw } },
            ],
          },
          take: 3,
          select: {
            id: true,
            name: true,
            description: true,
            phase: true,
          },
        })
        .then((rows) =>
          rows.map((r) => {
            const titleMatch = r.name.toLowerCase().includes(kw.toLowerCase());
            const descMatch = r.description?.toLowerCase().includes(kw.toLowerCase());
            let score = 0;
            if (titleMatch) score = r.name.toLowerCase() === kw.toLowerCase() ? 3 : 2;
            else if (descMatch) score = 1;

            return {
              type: "project" as const,
              id: r.id,
              title: r.name,
              subtitle: PHASE_NAMES[r.phase] || r.phase,
              url: `/projects/${r.id}`,
              highlight: extractHighlight(r.description, kw),
              score,
            };
          }),
        ),

      // 实验记录：title, objective, results
      prisma.experiment
        .findMany({
          where: {
            OR: [
              { title: { contains: kw } },
              { objective: { contains: kw } },
              { results: { contains: kw } },
            ],
          },
          take: 3,
          include: {
            project: { select: { name: true } },
          },
        })
        .then((rows) =>
          rows.map((r) => {
            const titleMatch = r.title.toLowerCase().includes(kw.toLowerCase());
            const objMatch = r.objective?.toLowerCase().includes(kw.toLowerCase());
            const resultsMatch = r.results?.toLowerCase().includes(kw.toLowerCase());
            let score = 0;
            if (titleMatch) score = r.title.toLowerCase() === kw.toLowerCase() ? 3 : 2;
            else if (objMatch || resultsMatch) score = 1;

            const highlight = r.objective
              ? extractHighlight(r.objective, kw)
              : r.results
                ? extractHighlight(r.results, kw)
                : r.title;

            return {
              type: "experiment" as const,
              id: r.id,
              title: r.title,
              subtitle: r.project?.name || "未关联项目",
              url: `/projects/${r.projectId}`,
              highlight,
              score,
            };
          }),
        ),

      // 待办任务：title, description, status != "done"
      prisma.task
        .findMany({
          where: {
            AND: [
              { status: { not: "done" } },
              {
                OR: [
                  { title: { contains: kw } },
                  { description: { contains: kw } },
                ],
              },
            ],
          },
          take: 3,
          select: {
            id: true,
            title: true,
            description: true,
            priority: true,
            dueDate: true,
          },
        })
        .then((rows) =>
          rows.map((r) => {
            const titleMatch = r.title.toLowerCase().includes(kw.toLowerCase());
            const descMatch = r.description?.toLowerCase().includes(kw.toLowerCase());
            let score = 0;
            if (titleMatch) score = r.title.toLowerCase() === kw.toLowerCase() ? 3 : 2;
            else if (descMatch) score = 1;

            const priorityNames: Record<string, string> = {
              low: "低",
              medium: "中",
              high: "高",
              urgent: "紧急",
            };
            const dueStr = r.dueDate
              ? new Date(r.dueDate).toLocaleDateString("zh-CN")
              : "无截止日期";

            return {
              type: "task" as const,
              id: r.id,
              title: r.title,
              subtitle: `${priorityNames[r.priority] || r.priority} · ${dueStr}`,
              url: `/tasks`,
              highlight: extractHighlight(r.description, kw),
              score,
            };
          }),
        ),
    ]);

  const results: SearchResult[] = [];

  if (papersRes.status === "fulfilled") results.push(...papersRes.value);
  if (notesRes.status === "fulfilled") results.push(...notesRes.value);
  if (projectsRes.status === "fulfilled") results.push(...projectsRes.value);
  if (experimentsRes.status === "fulfilled") results.push(...experimentsRes.value);
  if (tasksRes.status === "fulfilled") results.push(...tasksRes.value);

  // 按相关性排序：score 高的在前
  results.sort((a, b) => b.score - a.score);

  return NextResponse.json({ results });
}
