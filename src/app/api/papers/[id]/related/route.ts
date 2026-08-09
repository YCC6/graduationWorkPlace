import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 解析 JSON 数组字符串
function parseArr(str: string | null): string[] {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 计算 Jaccard 相似度
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase().trim()));
  const setB = new Set(b.map((s) => s.toLowerCase().trim()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// 从标题中提取核心词（取前 2-3 个实词）
function extractCoreWords(title: string): string[] {
  // 去掉常见停用词和标点
  const stopWords = new Set([
    "的", "了", "在", "是", "和", "与", "及", "或", "a", "an", "the",
    "of", "in", "on", "for", "and", "or", "with", "to", "from", "by",
    "study", "research", "analysis", "基于", "研究", "分析", "应用",
  ]);
  const words = title
    .replace(/[\[\]【】()（）{}:：,，。.!！?？;；""''`'""\-_]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()));
  return words.slice(0, 3);
}

interface RelatedPaper {
  id: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  reason: string;
  matchCount: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 获取当前文献
    const currentPaper = await prisma.paper.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        keywords: true,
        abstract: true,
        tags: { select: { tag: { select: { id: true, name: true } } } },
      },
    });

    if (!currentPaper) {
      return NextResponse.json({ error: "文献不存在" }, { status: 404 });
    }

    const currentKeywords = parseArr(currentPaper.keywords);
    const currentTagIds = currentPaper.tags.map((t) => t.tag.id);
    const currentTagNames = currentPaper.tags.map((t) => t.tag.name);
    const coreWords = extractCoreWords(currentPaper.title);

    // 1. 查找共享标签的文献
    const papersByTags = currentTagIds.length > 0
      ? await prisma.paper.findMany({
          where: {
            id: { not: id },
            tags: { some: { tagId: { in: currentTagIds } } },
          },
          select: {
            id: true,
            title: true,
            authors: true,
            journal: true,
            year: true,
            keywords: true,
            abstract: true,
            tags: { select: { tag: { select: { id: true, name: true } } } },
          },
        })
      : [];

    // 2. 查找关键词重叠的文献（使用 contains 匹配关键词字段）
    const papersByKeywords: typeof papersByTags = [];
    if (currentKeywords.length > 0) {
      const keywordResults = await prisma.paper.findMany({
        where: {
          id: { not: id },
          OR: currentKeywords.map((kw) => ({
            keywords: { contains: kw },
          })),
        },
        select: {
          id: true,
          title: true,
          authors: true,
          journal: true,
          year: true,
          keywords: true,
          abstract: true,
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
      });
      papersByKeywords.push(...keywordResults);
    }

    // 3. 查找标题/摘要核心词匹配的文献
    const papersByCoreWords: typeof papersByTags = [];
    if (coreWords.length > 0) {
      const coreWordResults = await prisma.paper.findMany({
        where: {
          id: { not: id },
          OR: [
            ...coreWords.map((cw) => ({ title: { contains: cw } })),
            ...coreWords.map((cw) => ({ abstract: { contains: cw } })),
          ],
        },
        select: {
          id: true,
          title: true,
          authors: true,
          journal: true,
          year: true,
          keywords: true,
          abstract: true,
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
      });
      papersByCoreWords.push(...coreWordResults);
    }

    // 合并候选文献，去重
    const candidateMap = new Map<string, typeof papersByTags[number]>();
    for (const p of [...papersByTags, ...papersByKeywords, ...papersByCoreWords]) {
      if (!candidateMap.has(p.id)) {
        candidateMap.set(p.id, p);
      }
    }

    // 计算每篇候选文献的匹配信息
    const results: RelatedPaper[] = [];

    for (const [paperId, paper] of candidateMap) {
      let matchCount = 0;
      const reasons: string[] = [];

      // 检查共享标签
      const sharedTagNames = paper.tags
        .filter((t) => currentTagIds.includes(t.tag.id))
        .map((t) => t.tag.name);

      if (sharedTagNames.length > 0) {
        matchCount += sharedTagNames.length;
        reasons.push(
          `共享 ${sharedTagNames.length} 个标签：${sharedTagNames.join("、")}`
        );
      }

      // 检查关键词重叠
      const candidateKeywords = parseArr(paper.keywords);
      if (currentKeywords.length > 0 && candidateKeywords.length > 0) {
        const lowerCurrent = new Set(
          currentKeywords.map((k) => k.toLowerCase().trim())
        );
        const sharedKeywords = candidateKeywords.filter((k) =>
          lowerCurrent.has(k.toLowerCase().trim())
        );
        if (sharedKeywords.length > 0) {
          matchCount += sharedKeywords.length;
          reasons.push(
            `关键词重叠 ${sharedKeywords.length} 个：${sharedKeywords.slice(0, 3).join("、")}`
          );
        }
      }

      // 检查标题/摘要核心词
      const titleAbstract = `${paper.title} ${paper.abstract || ""}`;
      const matchedCoreWords = coreWords.filter((cw) =>
        titleAbstract.toLowerCase().includes(cw.toLowerCase())
      );
      if (matchedCoreWords.length > 0) {
        matchCount += matchedCoreWords.length;
        reasons.push(`标题/摘要含核心词：${matchedCoreWords.join("、")}`);
      }

      // 只保留有匹配的文献
      if (matchCount > 0) {
        // 解析作者
        let authorStr = paper.authors;
        try {
          const authors = JSON.parse(paper.authors);
          if (Array.isArray(authors)) {
            authorStr = authors.join(", ");
          }
        } catch {
          // keep original
        }

        results.push({
          id: paper.id,
          title: paper.title,
          authors: authorStr,
          journal: paper.journal,
          year: paper.year,
          reason: reasons.join("；"),
          matchCount,
        });
      }
    }

    // 按 matchCount 降序排列，限制 5 篇
    results.sort((a, b) => b.matchCount - a.matchCount);
    const topResults = results.slice(0, 5);

    return NextResponse.json({ related: topResults });
  } catch (error) {
    console.error("获取相关文献推荐失败:", error);
    return NextResponse.json({ error: "获取推荐失败" }, { status: 500 });
  }
}
