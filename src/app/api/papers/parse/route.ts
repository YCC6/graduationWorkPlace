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
  docType?: string | null; // GB/T 7714 文献类型: J|M|D|R|S|N|C|P|EB/OL|Z
  pubInfo?: PubInfo | null; // 出版社/出版地/学位单位等
}

// 文献类型归一化：把 [J]/[M]… 标记或条目类型映射为规范类型码
export type PubInfo = {
  publisher?: string | null;
  publishPlace?: string | null;
  institution?: string | null;
  degree?: string | null;
  version?: string | null;
  newspaper?: string | null;
  date?: string | null;
  updateDate?: string | null;
  citeDate?: string | null;
  patentCountry?: string | null;
  patentNumber?: string | null;
  publicDate?: string | null;
};

const DOC_TYPE_ALIASES: Record<string, string> = {
  J: "J",
  M: "M",
  D: "D",
  R: "R",
  S: "S",
  N: "N",
  C: "C",
  P: "P",
  G: "Z", // 资料
  K: "Z", // 参考工具书
  Z: "Z",
  DB: "DB",
  CP: "CP",
  EB: "EB/OL",
  OL: "EB/OL",
  "EB/OL": "EB/OL",
  "EB/OL]": "EB/OL",
};

function normalizeDocType(raw: string | null | undefined): string {
  if (!raw) return "J";
  const key = raw.replace(/[[\]]/g, "").trim().toUpperCase();
  return DOC_TYPE_ALIASES[key] || "J";
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

  // 由 BibTeX 条目类型推断 GB/T 7714 文献类型
  const entryTypeMatch = entry.match(/@([a-zA-Z]+)\s*{/);
  const entryType = (entryTypeMatch ? entryTypeMatch[1] : "article").toLowerCase();
  const BIB_DOC_TYPE: Record<string, string> = {
    article: "J", book: "M", inbook: "M", booklet: "M", incollection: "C",
    inproceedings: "C", conference: "C", phdthesis: "D", mastersthesis: "D",
    thesis: "D", techreport: "R", manual: "R", report: "R", standard: "S",
    patent: "P", electronic: "EB/OL", online: "EB/OL", misc: "Z", unpublished: "Z",
  };
  let docType = BIB_DOC_TYPE[entryType] || "J";
  if (entryType === "misc" && (fields.url || fields.doi)) docType = "EB/OL";

  const pubInfo: PubInfo = {};
  if (fields.publisher) pubInfo.publisher = fields.publisher;
  if (fields.address) pubInfo.publishPlace = fields.address;
  if (fields.school || fields.institution) {
    pubInfo.institution = fields.school || fields.institution;
  }
  if (fields.number) pubInfo.patentNumber = fields.number;
  if (docType === "EB/OL") {
    pubInfo.updateDate = fields.year ? fields.year.replace(/[^0-9]/g, "").slice(0, 4) : null;
  }
  const hasPubInfo = Object.values(pubInfo).some((v) => v);

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
    docType,
    pubInfo: hasPubInfo ? pubInfo : null,
  };
}

// ====== GB/T 7714 解析 ======

// RIS / EndNote 文献类型 → GB/T 7714 类型码
function risDocType(ty: string): string {
  const t = (ty || "").toUpperCase().trim();
  const MAP: Record<string, string> = {
    JOUR: "J", JOURNAL: "J", BOOK: "M", BOOKT: "M", THES: "D", RPRT: "R",
    STD: "S", NEWS: "N", CPAPER: "C", CONF: "C", ELEC: "EB/OL", PAT: "P",
    SER: "J", UNPB: "R", MISC: "Z", MAP: "Z",
  };
  return MAP[t] || "J";
}

function endNoteDocType(t0: string): string {
  const t = (t0 || "").toLowerCase();
  if (/journal/.test(t)) return "J";
  if (/thesis|dissertation/.test(t)) return "D";
  if (/report/.test(t)) return "R";
  if (/standard/.test(t)) return "S";
  if (/news|newspaper/.test(t)) return "N";
  if (/patent/.test(t)) return "P";
  if (/conference|proceedings|paper/.test(t)) return "C";
  if (/electronic|web|webpage|web page|blog/.test(t)) return "EB/OL";
  if (/book/.test(t)) return "M";
  if (/program|software/.test(t)) return "CP";
  return "Z";
}

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

  const typeIdx = text.search(/\[[A-Za-z/]+\]/);
  if (typeIdx < 0) return null;

  const head = text.slice(0, typeIdx); // "作者. 标题"
  const tail = text.slice(typeIdx); // "[J]. 期刊, 年, 卷(期): 页."

  const markerMatch = tail.match(/\[([^\]]+)\]/);
  const docType = normalizeDocType(markerMatch ? markerMatch[1] : "J");

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

  const tailContent = tail.replace(/^\[[A-Za-z/]+\]\.\s*/, "");
  const pubInfo: PubInfo = {};

  let journal: string | null = null;
  let year: number | null = null;
  let volume: string | null = null;
  let issue: string | null = null;
  let pages: string | null = null;
  let parsedUrl: string | null = null;

  if (docType === "J") {
    const m = tailContent.match(
      /^(.*?),\s*(\d{4})(?:[,\s]+(\d+)\s*(?:\((\d+)\))?)?(?:\s*[:：]\s*([\d\-–—]+))?/
    );
    if (m) {
      journal = m[1]?.trim() || null;
      year = parseInt(m[2]) || null;
      volume = m[3] || null;
      issue = m[4] || null;
      pages = m[5] || null;
    } else {
      const ym = tailContent.match(/(\d{4})/);
      if (ym) year = parseInt(ym[1]);
    }
  } else if (docType === "N") {
    // 报纸文章：报纸名, 出版日期(版次).
    const n = tailContent.match(/^(.*?),\s*([\d-]+)(?:\((\d+)\))?/);
    if (n) {
      journal = n[1]?.trim() || null;
      pubInfo.newspaper = journal;
      pubInfo.date = n[2] || null;
      year = parseInt(n[2].slice(0, 4)) || null;
      pubInfo.version = n[3] || null;
    } else {
      const ym = tailContent.match(/(\d{4})/);
      if (ym) year = parseInt(ym[1]);
    }
  } else if (docType === "EB/OL") {
    // 电子资源: (更新日期) [引用日期]. 获取和访问路径.
    const upd = tailContent.match(/\(([\d-]+)\)/);
    if (upd) pubInfo.updateDate = upd[1] || null;
    const cite = tailContent.match(/\[([\d-]+)\]/);
    if (cite) pubInfo.citeDate = cite[1] || null;
    const urlM = tailContent.match(/https?:\/\/\S+/);
    if (urlM) parsedUrl = urlM[0].replace(/[.。。]+$/, "");
    const refYear = pubInfo.updateDate || pubInfo.citeDate;
    if (refYear) year = parseInt(refYear.slice(0, 4)) || null;
  } else {
    // M/C/R/S/D/P/Z 等：抽取 出版地: 出版者, 年
    const pubMatch = tailContent.match(/([^,，:：]+?)[:：]\s*([^,，]+?)\s*,\s*(\d{4})/);
    if (pubMatch) {
      const place = pubMatch[1].trim();
      const publisher = pubMatch[2].trim();
      year = parseInt(pubMatch[3]) || null;
      if (docType === "D") {
        pubInfo.publishPlace = place || null;
        pubInfo.institution = publisher || null;
      } else {
        pubInfo.publishPlace = place || null;
        pubInfo.publisher = publisher || null;
      }
    } else {
      const ym = tailContent.match(/([^,，]+?)\s*,\s*(\d{4})/);
      if (ym) {
        year = parseInt(ym[2]) || null;
        if (docType === "D") pubInfo.institution = ym[1].trim();
        else pubInfo.publisher = ym[1].trim();
      } else {
        const y2 = tailContent.match(/(\d{4})/);
        if (y2) year = parseInt(y2[1]);
      }
    }
  }

  const hasPubInfo = Object.values(pubInfo).some((v) => v);
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
    url: parsedUrl,
    raw: line.trim(),
    docType,
    pubInfo: hasPubInfo ? pubInfo : null,
  };
}

// ====== RIS 解析 ======

function parseRIS(raw: string): ParsedPaper[] {
  const papers: ParsedPaper[] = [];
  // RIS 通常以空行或 ER 分隔记录
  let blocks: string[];
  if (/\n\s*\n/.test(raw) && /TY\s+-\s/i.test(raw)) {
    blocks = raw
      .split(/\n\s*\n/)
      .map((r) => r.trim())
      .filter(Boolean);
  } else {
    blocks = raw
      .split(/ER\s*-\s*/i)
      .map((r) => r.trim())
      .filter(Boolean);
  }

  for (const block of blocks) {
    const fields: Record<string, string> = {};
    const authors: string[] = [];
    let title = "";
    let abstract = "";
    let sp = "";
    let ep = "";

    for (const line of block.split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z0-9]{2})\s+-\s+(.*)$/);
      if (!m) continue;
      const tag = m[1].toUpperCase();
      const val = m[2].trim();
      switch (tag) {
        case "TY":
        case "PT":
          fields.docType = risDocType(val);
          break;
        case "PB":
          fields.publisher = val;
          break;
        case "CY":
          fields.publishPlace = val;
          break;
        case "TI":
        case "T1":
          title = val;
          break;
        case "AU":
        case "A1":
        case "A2":
          authors.push(val);
          break;
        case "JO":
        case "JF":
        case "JA":
        case "T2":
          fields.journal = val;
          break;
        case "PY":
        case "Y1":
          fields.year = val;
          break;
        case "VL":
          fields.volume = val;
          break;
        case "IS":
        case "N1":
          fields.issue = val;
          break;
        case "SP":
          sp = val;
          break;
        case "EP":
          ep = val;
          break;
        case "DO":
          fields.doi = val;
          break;
        case "UR":
          fields.url = val;
          break;
        case "AB":
        case "N2":
          abstract = val;
          break;
      }
    }

    if (!title) continue;
    const year = fields.year
      ? parseInt(fields.year.replace(/[^0-9]/g, "").slice(0, 4)) || null
      : null;
    const pages = sp ? (ep ? `${sp}-${ep}` : sp) : ep || null;

    const risPub: PubInfo = {};
    if (fields.publisher) risPub.publisher = fields.publisher;
    if (fields.publishPlace) risPub.publishPlace = fields.publishPlace;
    const risHasPub = Object.values(risPub).some((v) => v);

    papers.push({
      title,
      authors,
      journal: fields.journal || null,
      year,
      volume: fields.volume || null,
      issue: fields.issue || null,
      pages,
      doi: fields.doi || null,
      abstract: abstract || null,
      url: fields.url || (fields.doi ? `https://doi.org/${fields.doi}` : null),
      raw: block,
      docType: fields.docType || "J",
      pubInfo: risHasPub ? risPub : null,
    });
  }
  return papers;
}

// ====== EndNote 标记格式 (.enw) 解析 ======

function parseEndNote(raw: string): ParsedPaper[] {
  const papers: ParsedPaper[] = [];
  const blocks = raw
    .split(/(?=%0)/)
    .map((r) => r.trim())
    .filter(Boolean);
  const segs = blocks.length > 1 ? blocks : raw.split(/\n\s*\n/).map((r) => r.trim()).filter(Boolean);

  for (const block of segs) {
    const fields: Record<string, string> = {};
    const authors: string[] = [];
    let title = "";
    let abstract = "";

    for (const line of block.split(/\r?\n/)) {
      const m = line.trim().match(/^%([A-Za-z0-9])\s+(.*)$/);
      if (!m) continue;
      const tag = m[1].toUpperCase();
      const val = m[2].trim();
      switch (tag) {
        case "0":
          fields.docType = endNoteDocType(val);
          break;
        case "I":
          fields.publisher = val;
          break;
        case "C":
          fields.publishPlace = val;
          break;
        case "T":
        case "T1":
          title = val;
          break;
        case "A":
        case "A1":
        case "AU":
          authors.push(val);
          break;
        case "J":
        case "JF":
        case "JO":
          fields.journal = val;
          break;
        case "D":
          fields.year = val;
          break;
        case "V":
          fields.volume = val;
          break;
        case "N":
          fields.issue = val;
          break;
        case "P":
          fields.pages = val;
          break;
        case "R":
          fields.doi = val;
          break;
        case "U":
        case "UR":
          fields.url = val;
          break;
        case "X":
        case "AB":
          abstract = val;
          break;
      }
    }

    if (!title) continue;
    const year = fields.year
      ? parseInt(fields.year.replace(/[^0-9]/g, "").slice(0, 4)) || null
      : null;

    const enPub: PubInfo = {};
    if (fields.publisher) enPub.publisher = fields.publisher;
    if (fields.publishPlace) enPub.publishPlace = fields.publishPlace;
    const enHasPub = Object.values(enPub).some((v) => v);

    papers.push({
      title,
      authors,
      journal: fields.journal || null,
      year,
      volume: fields.volume || null,
      issue: fields.issue || null,
      pages: fields.pages || null,
      doi: fields.doi || null,
      abstract: abstract || null,
      url: fields.url || (fields.doi ? `https://doi.org/${fields.doi}` : null),
      raw: block,
      docType: fields.docType || "J",
      pubInfo: enHasPub ? enPub : null,
    });
  }
  return papers;
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
    const isRIS = /(^|\n)\s*(TY|PT)\s+-\s/i.test(raw);
    const isEndNote = /(^|\n)\s*%[A-Za-z0-9]\s+/m.test(raw) && /%T/i.test(raw);

    let papers: ParsedPaper[] = [];
    let format = "gbt7714";

    if (isBibtex) {
      const entries = extractBibtexEntries(raw);
      for (const e of entries) {
        const p = parseBibtexEntry(e);
        if (p) papers.push(p);
      }
      format = "bibtex";
    } else if (isRIS) {
      papers = parseRIS(raw);
      format = "ris";
    } else if (isEndNote) {
      papers = parseEndNote(raw);
      format = "endnote";
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

    return NextResponse.json({ papers, format });
  } catch (error) {
    console.error("题录解析失败:", error);
    return NextResponse.json({ error: "题录解析失败" }, { status: 500 });
  }
}
