"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  Network,
  RefreshCw,
  ScanText,
  Settings,
  Square,
  StickyNote,
  LayoutList,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";

interface Props {
  paperId: string;
  paperTitle: string;
  onNoteSaved?: () => void;
}

interface Section {
  title: string;
  body: string;
}

const CARD_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
];

function parseSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      if (cur) sections.push(cur);
      cur = { title: m[1].trim(), body: "" };
    } else if (cur) {
      cur.body += line + "\n";
    }
  }
  if (cur) sections.push(cur);
  return sections;
}

export default function PdfAiSpeedRead({ paperId, paperTitle, onNoteSaved }: Props) {
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needConfig, setNeedConfig] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [hasFulltext, setHasFulltext] = useState(false);
  const [hasAbstract, setHasAbstract] = useState(false);
  const [view, setView] = useState<"card" | "map">("card");
  const [copied, setCopied] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [building, setBuilding] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadCached = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/papers/${paperId}/summarize`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setText(data.summary || "");
      setGeneratedAt(data.generatedAt || null);
      setHasFulltext(!!data.hasFulltext);
      setHasAbstract(!!data.hasAbstract);
    } catch {
      /* 静默：按暂无内容处理 */
    }
    setLoading(false);
  }, [paperId]);

  useEffect(() => {
    loadCached();
  }, [loadCached]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    setNeedConfig(false);
    setText("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/papers/${paperId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "NO_AI_CONFIG") setNeedConfig(true);
        setError(data.error || "请求失败");
        setGenerating(false);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("浏览器不支持流式读取");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(t.slice(5).trim());
            if (evt.delta) setText((prev) => prev + evt.delta);
            else if (evt.done) setGeneratedAt(evt.generatedAt);
            else if (evt.error) setError(evt.error);
          } catch {
            /* 跳过 */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") toast("已停止生成");
      else setError((err as Error).message || "生成失败");
    }
    setGenerating(false);
    abortRef.current = null;
  };

  const stop = () => abortRef.current?.abort();

  // 无全文索引时：先由服务端抽取正文，再自动速读（消除“请先点全文索引”死路）
  const buildAndRead = async () => {
    if (generating || building) return;
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch(`/api/papers/${paperId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ build: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "正文提取失败");
        setBuilding(false);
        return;
      }
      setHasFulltext(true);
      toast.success(`已提取正文 ${data.length || 0} 字，开始速读`);
      setBuilding(false);
      await generate();
    } catch {
      setError("正文提取失败，请检查网络后重试");
      setBuilding(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("已复制");
    setTimeout(() => setCopied(false), 1500);
  };

  const saveAsNote = async () => {
    if (!text.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperId,
          content: `> AI 速读笔记 · ${paperTitle} · 生成于 ${new Date().toLocaleString("zh-CN")}\n\n${text}`,
          isPrivate: true,
        }),
      });
      if (res.ok) {
        toast.success("已存为文献笔记");
        onNoteSaved?.();
      } else toast.error("保存笔记失败");
    } catch {
      toast.error("保存笔记失败");
    }
    setSavingNote(false);
  };

  const sections = text ? parseSections(text) : [];

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 p-3 border-b flex-wrap">
        <span className="text-xs text-muted-foreground">速读视图</span>
        <div className="flex items-center rounded-md border overflow-hidden text-xs">
          <button
            onClick={() => setView("card")}
            className={`flex-1 inline-flex items-center gap-1 px-2 h-7 transition-colors ${
              view === "card" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            卡片
          </button>
          <button
            onClick={() => setView("map")}
            className={`flex-1 inline-flex items-center gap-1 px-2 h-7 transition-colors ${
              view === "map" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            导图
          </button>
        </div>

        <div className="flex-1" />

        {text && !generating && (
          <>
            <button
              onClick={copy}
              title="复制"
              className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={saveAsNote}
              disabled={savingNote}
              title="存为文献笔记"
              className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
            >
              {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />}
            </button>
          </>
        )}

        {generating ? (
          <button
            onClick={stop}
            className="inline-flex items-center gap-1 px-2.5 h-7 rounded border text-xs font-medium hover:bg-muted transition-colors"
          >
            <Square className="h-3 w-3" />
            停止
          </button>
        ) : (
          <button
            onClick={hasFulltext || hasAbstract ? generate : buildAndRead}
            disabled={building}
            className="inline-flex items-center gap-1 px-2.5 h-7 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {building ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : text ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <ScanText className="h-3 w-3" />
            )}
            {building ? "提取正文中…" : text ? "重新速读" : hasFulltext || hasAbstract ? "一键速读" : "提取并速读"}
          </button>
        )}
      </div>

      {/* 进度条：提取正文 / 生成速读时显示 */}
      {(building || generating) && (
        <div className="h-0.5 w-full bg-muted overflow-hidden">
          <div className="h-full bg-primary animate-pulse w-1/3" />
        </div>
      )}

      {/* 内容区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
            <div className="flex items-start gap-2 text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
            {needConfig && (
              <a
                href="/settings"
                className="inline-flex items-center gap-1 px-2.5 h-7 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors"
              >
                <Settings className="h-3 w-3" />
                去设置 AI 模型
              </a>
            )}
          </div>
        ) : !text ? (
          <div className="text-center py-10 text-xs text-muted-foreground space-y-2">
            {building ? (
              <>
                <Loader2 className="h-6 w-6 mx-auto opacity-50 animate-spin" />
                <p className="leading-relaxed">正在由服务端从 PDF 抽取正文…</p>
              </>
            ) : (
              <>
                <ScanText className="h-6 w-6 mx-auto opacity-30" />
                <p className="leading-relaxed">
                  {!hasFulltext && !hasAbstract
                    ? "该文献暂无正文与摘要，点击「提取并速读」可自动从 PDF 抽取正文并生成要点"
                    : "点击「一键速读」，AI 将提取 6 大要点并生成结构化卡片"}
                </p>
              </>
            )}
          </div>
        ) : view === "card" ? (
          <div className="space-y-2.5">
            {sections.map((s, i) => (
              <div key={i} className="rounded-lg border bg-background overflow-hidden">
                <div
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold"
                  style={{ backgroundColor: `${CARD_COLORS[i % CARD_COLORS.length]}12`, color: CARD_COLORS[i % CARD_COLORS.length] }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: CARD_COLORS[i % CARD_COLORS.length] }}
                  />
                  {s.title}
                </div>
                <div className="px-3 py-2 text-sm prose-custom">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {s.body.trim()}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // 导图视图：根节点 → 各要点分支（逻辑树）
          <div className="pl-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-primary shrink-0" />
              <span className="text-sm font-semibold truncate" title={paperTitle}>
                {paperTitle}
              </span>
            </div>
            <div className="border-l-2 border-muted pl-4 space-y-3 ml-1.5">
              {sections.map((s, i) => (
                <div key={i} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-background"
                    style={{ backgroundColor: CARD_COLORS[i % CARD_COLORS.length] }}
                  />
                  <div className="text-xs font-semibold" style={{ color: CARD_COLORS[i % CARD_COLORS.length] }}>
                    {s.title}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">
                    {s.body.trim().replace(/[#*>`]/g, "").slice(0, 120)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {(generatedAt || text) && !loading && (
        <div className="px-3 py-1.5 border-t text-[11px] text-muted-foreground flex items-center gap-2">
          {generatedAt && <span>生成于 {formatDate(generatedAt, "full")}</span>}
          <span className="flex-1" />
          {text && <span>{text.length} 字</span>}
        </div>
      )}
    </div>
  );
}
