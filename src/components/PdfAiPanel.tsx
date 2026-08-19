"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Copy,
  Languages,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  StickyNote,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";

type Mode = "summary" | "translate";
type Scope = "abstract" | "fulltext";

interface Props {
  paperId: string;
  paperTitle: string;
  mode: Mode;
  /** 保存为笔记后通知父组件刷新关联笔记列表 */
  onNoteSaved?: () => void;
}

interface StreamMeta {
  source?: string;
  scope?: string;
  truncated?: boolean;
  model?: string;
  totalChunks?: number;
  chars?: number;
  estimatedTokens?: number;
}

export default function PdfAiPanel({
  paperId,
  paperTitle,
  mode,
  onNoteSaved,
}: Props) {
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needConfig, setNeedConfig] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [hasFulltext, setHasFulltext] = useState(false);
  const [hasAbstract, setHasAbstract] = useState(false);
  const [modelChanged, setModelChanged] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("abstract");
  const [copied, setCopied] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickBottomRef = useRef(true);

  const endpoint = mode === "summary" ? "summarize" : "translate";
  const isSummary = mode === "summary";

  // ---- 载入缓存 ----
  const loadCached = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/papers/${paperId}/${endpoint}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setText(isSummary ? data.summary || "" : data.translation || "");
      setGeneratedAt(data.generatedAt || null);
      setHasFulltext(!!data.hasFulltext);
      setHasAbstract(!!data.hasAbstract);
      setModelChanged(!!data.modelChanged);
      setCurrentModel(data.currentModel || null);
      if (data.model) setMeta({ model: data.model });
      if (!isSummary) {
        // 有译文就沿用它的范围，否则默认选能用的那个
        const s: Scope =
          data.scope === "fulltext"
            ? "fulltext"
            : data.hasAbstract
              ? "abstract"
              : "fulltext";
        setScope(s);
      }
    } catch {
      /* 静默失败，界面上按"暂无内容"处理 */
    }
    setLoading(false);
  }, [paperId, endpoint, isSummary]);

  useEffect(() => {
    loadCached();
  }, [loadCached]);

  // 生成过程中自动滚到底，但用户手动往上翻时不再打扰
  useEffect(() => {
    if (!generating || !stickBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, generating]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // ---- 生成 ----
  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    setNeedConfig(false);
    setText("");
    setProgress(null);
    stickBottomRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/papers/${paperId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSummary ? {} : { scope }),
        signal: controller.signal,
      });

      // 配置缺失 / 无内容等前置校验错误走普通 JSON
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
            else if (evt.meta) setMeta(evt.meta);
            else if (evt.progress) setProgress(evt.progress);
            else if (evt.done) {
              setGeneratedAt(evt.generatedAt);
              setProgress(null);
              toast.success(isSummary ? "总结已生成" : "翻译完成");
            } else if (evt.error) {
              setError(evt.error);
            }
          } catch {
            /* 跳过解析不了的行 */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast("已停止生成");
      } else {
        setError((err as Error).message || "生成失败");
      }
    }
    setGenerating(false);
    abortRef.current = null;
  };

  const stop = () => abortRef.current?.abort();

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
          content: `> ${isSummary ? "AI 速读笔记" : "AI 译文"} · 由 ${meta?.model || "模型"} 生成于 ${new Date().toLocaleString("zh-CN")}\n\n${text}`,
          isPrivate: true,
        }),
      });
      if (res.ok) {
        toast.success("已存为文献笔记");
        onNoteSaved?.();
      } else {
        toast.error("保存笔记失败");
      }
    } catch {
      toast.error("保存笔记失败");
    }
    setSavingNote(false);
  };

  // ---- 渲染 ----
  const noSource = isSummary
    ? !hasFulltext && !hasAbstract
    : scope === "fulltext"
      ? !hasFulltext
      : !hasAbstract;

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 p-3 border-b flex-wrap">
        {!isSummary && (
          <div className="flex items-center rounded-md border overflow-hidden">
            {(
              [
                { v: "abstract", label: "摘要", ok: hasAbstract },
                { v: "fulltext", label: "全文", ok: hasFulltext },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setScope(o.v)}
                disabled={generating || !o.ok}
                title={o.ok ? undefined : "暂无内容"}
                className={`px-2.5 h-7 text-xs transition-colors disabled:opacity-40 ${
                  scope === o.v
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {isSummary && meta?.source && (
          <span className="text-xs text-muted-foreground">
            依据：{meta.source === "fulltext" ? "全文" : "摘要"}
            {meta.truncated && "（已抽取关键章节）"}
          </span>
        )}

        <div className="flex-1" />

        {text && !generating && (
          <>
            <button
              onClick={copy}
              title="复制"
              className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={saveAsNote}
              disabled={savingNote}
              title="存为文献笔记"
              className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
            >
              {savingNote ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <StickyNote className="h-3.5 w-3.5" />
              )}
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
            onClick={generate}
            disabled={noSource}
            className="inline-flex items-center gap-1 px-2.5 h-7 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {text ? (
              <RefreshCw className="h-3 w-3" />
            ) : isSummary ? (
              <Sparkles className="h-3 w-3" />
            ) : (
              <Languages className="h-3 w-3" />
            )}
            {text ? "重新生成" : isSummary ? "生成总结" : "开始翻译"}
          </button>
        )}
      </div>

      {/* 模型已变更提示 */}
      {modelChanged && text && !generating && (
        <div className="px-3 py-1.5 border-b bg-amber-50 text-[11px] text-amber-800 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            生成时使用的模型（{meta?.model || "未知"}）与当前配置（
            {currentModel || "未知"}）不一致，建议重新生成以确保结果一致
          </span>
        </div>
      )}

      {/* 进度条 */}
      {progress && progress.total > 1 && (
        <div className="px-3 py-1.5 border-b bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>
              正在翻译第 {progress.current} / {progress.total} 段
            </span>
            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 内容区 */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-3"
      >
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
              <Link
                href="/settings"
                className="inline-flex items-center gap-1 px-2.5 h-7 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors"
              >
                <Settings className="h-3 w-3" />
                去设置 AI 模型
              </Link>
            )}
          </div>
        ) : !text ? (
          <div className="text-center py-10 text-xs text-muted-foreground space-y-2">
            {isSummary ? (
              <Sparkles className="h-6 w-6 mx-auto opacity-30" />
            ) : (
              <Languages className="h-6 w-6 mx-auto opacity-30" />
            )}
            {noSource ? (
              <p className="leading-relaxed">
                暂无可用内容。
                <br />
                请先点上方「全文索引」提取 PDF 正文。
              </p>
            ) : (
              <p className="leading-relaxed">
                {isSummary
                  ? "点击「生成总结」，AI 将输出研究问题、方法、结论与创新点"
                  : "选择范围后点击「开始翻译」，长文会自动分段处理"}
              </p>
            )}
          </div>
        ) : (
          <div className="text-sm prose-custom">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {text}
            </ReactMarkdown>
            {generating && (
              <span className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse align-middle ml-0.5" />
            )}
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      {(generatedAt || meta?.model) && !loading && (
        <div className="px-3 py-1.5 border-t text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
          {generatedAt && <span>生成于 {formatDate(generatedAt, "full")}</span>}
          {meta?.model && (
            <span className="px-1.5 py-0.5 rounded bg-muted">{meta.model}</span>
          )}
          <span className="flex-1" />
          <span className="truncate max-w-[45%]" title={paperTitle}>
            {text.length > 0 && `${text.length} 字`}
          </span>
        </div>
      )}
    </div>
  );
}
