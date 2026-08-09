import { NextRequest, NextResponse } from "next/server";

export interface ParsedPaper {
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  abstract: string | null;
  url: string | null;
  raw: string; // 原始题录行，便于前端展示
}

// ====== BibTeX 解析 ======

// 去除 BibTeX 值中的花括号与转义
function cleanBibValue(v: string): string {
  return v
    .replace(/[{}]/g, "")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

// 花括号感知地切分 BibTeX 条目
function extractBibtexEntries(text: string): string[] {
  const entries: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "@") {
      let j = i + 1;
      while (j < text.length && /[a-zA-Z]/.test(text[j])) j++;
      if (text[j] === "{") {
        let depth = 0;
        let k = j;
        for (; k < text.length; k++) {
          if (text[k] === "{") depth++;
          else if (text[k] === "}") {
            depth--;
            if (depth === 0) break;
          }
        }
        entries.push(text.slice(i, k + 1));
        i = k + 1;
        continue;
      }
    }
    i++;
  }
  return entries;
}

// 解析单条 BibTeX 条目为字段
function parseBibtexEntry(entry: string): ParsedPaper | null {
  const firstBrace = entry.indexOf("{");
  const lastBrace = entry.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0) return null;
  const inner = entry.slice(firstBrace + 1, lastBrace);

  const commaIdx = inner.indexOf(",");
  if (commaIdx < 0) return null;
  const fieldsStr = inner.slice(commaIdx + 1);

  const fields: Record<string, string> = {};
  let i = 0;
  while (i < fieldsStr.length) {
    while (i < fieldsStr.length && /[\s,]/.test(fieldsStr[i])) i++;
    if (i >= fieldsStr.length) break;
    const nameStart = i;
    while (i < fieldsStr.length && /[a-zA-Z]/.test(fieldsStr[i])) i++;
    const name = fieldsStr.slice(nameStart, i).toLowerCase();
    while (i < fieldsStr.length && fieldsStr[i] !== "=") i++;
    i++;
    while (i < fieldsStr.length && /\s/.test(fieldsStr[i])) i++;
    let value = "";
    if (fieldsStr[i] === "{") {
      let depth = 0;
      const start = i;
      for (; i < fieldsStr.length; i++) {
        if (fieldsStr[i] === "{") depth++;
        else if (fieldsStr[i] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      value = fieldsStr.slice(start + 1, i);
      i++;
    } else if (fieldsStr[i] === '"') {
      const start = i + 1;
      let k = start;
      while (k < fieldsStr.length && fieldsStr[k] !== '"') k++;
      value = fieldsStr.slice(start, k);
      i = k + 1;
    } else {
      const start = i;
      while (i < fieldsStr.length && fieldsStr[i] !== "," && fieldsStr[i] !== "}") i++;
      value = fieldsStr.slice(start, i).trim();
    }
    if (name) fields[name] = cleanBibValue(value);
  }

  const title = fields.title || fields.booktitle || "";
  if (!title) return null;

  // 作者: "Last, First and Last2, First2" → 保留原始
  const authorsRaw = fields.author || fields.editor || "";
  const authors = authorsRaw
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean);

  const year = fields.year ? parseInt(fields.year.replace(/[^0-9]/g, "").slice(0, 4)) || null : null;
  const doi = fields.doi || null;
  const url = fields.url || (doi ? `https://doi.org/${doi}` : null);

  return {
    title,
    authors,
    journal: fields.journal || fields.booktitle || null,
    year,
    volume: fields.volume || null,
    issue: fields.number || null,
    pages: fields.pages || null,
    doi,
    abstract: fields.abstract || null,
    url,
    raw: entry.trim(),
  };
}

// ====== GB/T 7714 解析 ======

function extractDoi(text: string): string | null {
  // 优先匹配标准 DOI 格式 10.xxxx/...（允许内部含点号）
  const m = text.match(/10\.\d{4,9}\/\S+/);
  if (m) return m[0].replace(/[.;,)\]]+$/, "");
  // 退路：doi: xxx 形式
  const m2 = text.match(/(?:doi|DOI)\s*[:：]\s*(\S+)/);
  if (m2) return m2[1].replace(/[.;,)\]]+$/, "");
  return null;
}

function parseGBT7714Line(line: string): ParsedPaper | null {
  let text = line.replace(/^\[\d+\]\.?\s*/, "").trim();
  if (!text) return null;

  const typeIdx = text.search(/\[[A-Za-z]+\]/);
  if (typeIdx < 0) return null;

  const head = text.slice(0, typeIdx); // "作者. 标题"
  const tail = text.slice(typeIdx); // "[J]. 期刊, 年, 卷(期): 页."

  const dotIdx = head.indexOf(". ");
  let authorsStr = "";
  let title = "";
  if (dotIdx >= 0) {
    authorsStr = head.slice(0, dotIdx).trim();
    title = head.slice(dotIdx + 2).trim();
  } else {
    title = head.trim();
  }
  if (!title) return null;

  const authors = authorsStr
    .split(/[，,]/)
    .map((a) => a.trim())
    .filter(Boolean);

  const tailContent = tail.replace(/^\[[A-Za-z]+\]\.\s*/, "");
  const m = tailContent.match(
    /^(.*?),\s*(\d{4})(?:[,\s]+(\d+)\s*(?:\((\d+)\))?)?(?:\s*[:：]\s*([\d\-–—]+))?/
  );

  let journal: string | null = null;
  let year: number | null = null;
  let volume: string | null = null;
  let issue: string | null = null;
  let pages: string | null = null;

  if (m) {
    journal = m[1]?.trim() || null;
    year = parseInt(m[2]) || null;
    volume = m[3] || null;
    issue = m[4] || null;
    pages = m[5] || null;
  } else {
    // 退路：仅提取年份
    const ym = tailContent.match(/(\d{4})/);
    if (ym) year = parseInt(ym[1]);
  }

  return {
    title,
    authors,
    journal,
    year,
    volume,
    issue,
    pages,
    doi: extractDoi(text),
    abstract: null,
    url: null,
    raw: line.trim(),
  };
}

// ====== 主解析逻辑 ======

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = (body.text as string) || "";
    if (!raw.trim()) {
      return NextResponse.json({ papers: [] });
    }

    const isBibtex = /@(article|book|inproceedings|incollection|thesis|mastersthesis|phdthesis|conference|techreport|misc)/i.test(
      raw
    );

    let papers: ParsedPaper[] = [];

    if (isBibtex) {
      const entries = extractBibtexEntries(raw);
      for (const e of entries) {
        const p = parseBibtexEntry(e);
        if (p) papers.push(p);
      }
    } else {
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      for (const line of lines) {
        const p = parseGBT7714Line(line);
        if (p) papers.push(p);
      }
    }

    // 去重（按标题 + 年份）
    const seen = new Set<string>();
    papers = papers.filter((p) => {
      const key = `${p.title.toLowerCase()}|${p.year}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ papers, format: isBibtex ? "bibtex" : "gbt7714" });
  } catch (error) {
    console.error("题录解析失败:", error);
    return NextResponse.json({ error: "题录解析失败" }, { status: 500 });
  }
}
