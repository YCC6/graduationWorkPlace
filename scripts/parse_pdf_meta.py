#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 PDF 文献中抽取元数据（标题 / 作者 / 期刊 / 年份 / 卷期 / 页码 / DOI / 摘要）。
纯本地解析，不依赖外部网络。优先使用内嵌元数据，缺失时用首页文本启发式补全。
用法: python parse_pdf_meta.py <file1.pdf> [file2.pdf ...]
输出: JSON 数组，每个元素对应一个文件。
"""
import sys, os, re, json
from pypdf import PdfReader
import pdfplumber

# 强制 UTF-8 输出：Windows 下被 Node 派生时会继承 GBK 代码页(cp936)，
# 而调用方按 UTF-8 解码 → 中文（标题/作者/摘要）会变成 U+FFFD(�)。
# 这里双保险：① 重设文本层；② 最终结果直接用 buffer 写 UTF-8 字节，绕开文本层。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass


def emit(obj):
    """把对象以 UTF-8 字节写到 stdout（绕开文本层编码，杜绝 cp936 乱码）。"""
    payload = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    buf = getattr(sys.stdout, "buffer", None)
    if buf is not None:
        try:
            buf.write(payload)
            buf.write(b"\n")
            buf.flush()
            return
        except Exception:
            pass
    sys.stdout.write(payload.decode("utf-8", "replace") + "\n")


def split_authors(raw: str):
    if not raw:
        return []
    s = raw.replace(" and ", ", ").replace(";", ", ")
    parts = [p.strip() for p in re.split(r",\s*", s) if p.strip()]
    # 去掉可能的邮箱/机构残留
    out = []
    for p in parts:
        p = re.sub(r"\s*\[email.*?\]", "", p, flags=re.I)
        if p and not re.fullmatch(r"[\d\s\-\.]+", p):
            out.append(p)
    return out


def parse_citation(text: str):
    """从首页文本中识别 'Journal Year, Vol, Pages' 或 'Journal Vol (Year) Pages' 形态。"""
    # 去掉 ACS 等常见的引用前缀噪声
    t = re.sub(r"CiteThis\s*:", " ", text, flags=re.I)
    DASH = r"[-–—\u2212]"  # 连字符 / en-dash / em-dash / 真正的减号(U+2212)
    norm = lambda s: (s or "").replace("–", "-").replace("—", "-").replace("−", "-").strip(" ,") or None
    # 形态1: Anal.Chem.2025,97,5324-5331  （年份后紧跟逗号+卷号，强约束）
    m = re.search(
        r"([A-Z][A-Za-z\.\-&:()\'/ ]+?)\s*((?:19|20)\d{2})\s*,\s*(\d{1,4})\s*,?\s*([\d]{2,5}\s*"
        + DASH
        + r"\s*[\d]{2,5}|[\d]{2,5})?",
        t,
    )
    if m:
        return norm(m.group(1)), int(m.group(2)), m.group(3), None, norm(m.group(4))
    # 形态2: Journal Name 401 (2025) 135012
    m = re.search(
        r"([A-Z][A-Za-z\.\-&:()\'/ ]+?)\s+(\d{1,4})\s*\(\s*((?:19|20)\d{2})\s*\)\s*([\d]{2,5}\s*"
        + DASH
        + r"\s*[\d]{2,5}|[\d]{2,5})?",
        t,
    )
    if m:
        return norm(m.group(1)), int(m.group(3)), m.group(2), None, norm(m.group(4))
    return None, None, None, None, None


def find_doi(text: str):
    m = re.search(r"(10\.\d{4,9}/[^\s,;)\]'>\"\u2013\u2014]+)", text)
    return m.group(1) if m else None


def extract_abstract(text: str):
    m = re.search(r"ABSTRACT[:\s]*(.*?)(?:\n\s*(?:KEYWORDS|Keywords|Index Terms|1\.\s*Introduction|INTRODUCTION)\b)", text, re.S | re.I)
    if not m:
        m = re.search(r"ABSTRACT[:\s]*(.{80,1200})", text, re.S | re.I)
    if m:
        a = m.group(1).strip()
        a = re.sub(r"\s+", " ", a)
        return a[:2000]
    return None


def process(path: str):
    res = {
        "fileName": os.path.basename(path),
        "fileSize": os.path.getsize(path),
        "title": None,
        "authors": [],
        "journal": None,
        "year": None,
        "volume": None,
        "issue": None,
        "pages": None,
        "doi": None,
        "abstract": None,
        "error": None,
    }
    try:
        # 1) 内嵌元数据
        meta = PdfReader(path).metadata or {}
        meta_title = (meta.get("/Title") or "").strip()
        meta_author = (meta.get("/Author") or "").strip()
        if meta_title and len(meta_title) > 5 and not meta_title.lower().endswith(".pdf"):
            res["title"] = meta_title
        if meta_author:
            res["authors"] = split_authors(meta_author)

        # 2) 首页文本
        with pdfplumber.open(path) as pdf:
            first = pdf.pages[0].extract_text() or "" if pdf.pages else ""
            head = first
            for pg in pdf.pages[1:3]:
                head += "\n" + (pg.extract_text() or "")
            # DOI（全文本首 3 页）
            res["doi"] = find_doi(head) or res.get("doi")
            # 期刊/年/卷/页
            journal, year, volume, issue, pages = parse_citation(first)
            if journal:
                res["journal"] = journal
            if year:
                res["year"] = year
            if volume:
                res["volume"] = volume
            if issue:
                res["issue"] = issue
            if pages:
                res["pages"] = pages
            # 标题兜底：元数据缺失时用首页前几行
            if not res["title"]:
                lines = [l.strip() for l in first.splitlines() if l.strip()]
                cand = []
                for l in lines[:6]:
                    if re.search(r"[A-Za-z]{4}", l) and "abstract" not in l.lower():
                        cand.append(l)
                    if len(cand) >= 2:
                        break
                res["title"] = " ".join(cand) or None
            # 作者兜底
            if not res["authors"]:
                am = re.search(r"([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)(?:,\s*[A-Z][a-z]+)+)", first)
                if am:
                    res["authors"] = split_authors(am.group(1))
            # 摘要
            res["abstract"] = extract_abstract(first)
    except Exception as e:
        res["error"] = f"{type(e).__name__}: {e}"
    return res


if __name__ == "__main__":
    paths = sys.argv[1:]
    out = [process(p) for p in paths]
    emit(out)
