"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Languages,
  Loader2,
  Copy,
  Check,
  X,
  Settings,
} from "lucide-react";
import toast from "react-hot-toast";

type Target = "zh" | "en";

interface PopState {
  rectTop: number;
  rectBottom: number;
  rectCenterX: number;
  text: string;
  fromIframe: boolean;
}

const POP_W = 320;
const EDITABLE_SEL = "input, textarea, [contenteditable='true'], [contenteditable='']";

export default function SelectionTranslator() {
  const [pop, setPop] = useState<PopState | null>(null);
  const [target, setTarget] = useState<Target>("zh");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needConfig, setNeedConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const attachedIframes = useRef<WeakSet<HTMLIFrameElement>>(
    new WeakSet(),
  );

  const hide = useCallback(() => {
    setPop(null);
    setResult(null);
    setError(null);
    setNeedConfig(false);
    setCopied(false);
  }, []);

  const translate = useCallback(async (text: string, tgt: Target) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setNeedConfig(false);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target: tgt }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "NO_AI_CONFIG") {
          setNeedConfig(true);
          setError(data.error || "尚未配置 AI 模型");
        } else {
          setError(data.error || "翻译失败");
        }
        return;
      }
      setResult(data.translation);
    } catch {
      setError("网络错误，翻译失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 在指定文档（父文档或 PDF iframe 文档）里检测文本选中并弹出
  const handleSelectionInDoc = useCallback(
    (doc: Document, iframeEl?: HTMLIFrameElement) => {
      const sel = doc.getSelection?.();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length < 2 || text.length > 3000) return;

      // 忽略在输入框 / 可编辑区域里的选中（那通常是用户在编辑）
      const anchor = sel.anchorNode as Node | null;
      if (anchor) {
        const el =
          anchor.nodeType === Node.ELEMENT_NODE
            ? (anchor as HTMLElement)
            : (anchor.parentElement as HTMLElement | null);
        if (el && el.closest(EDITABLE_SEL)) return;
      }

      let rangeRect: DOMRect | null = null;
      try {
        rangeRect = sel.getRangeAt(0).getBoundingClientRect();
      } catch {
        return;
      }
      if (!rangeRect || (rangeRect.width === 0 && rangeRect.height === 0))
        return;

      let cx = rangeRect.left + rangeRect.width / 2;
      let top = rangeRect.top;
      let bottom = rangeRect.bottom;
      if (iframeEl) {
        const fr = iframeEl.getBoundingClientRect();
        cx += fr.left;
        top += fr.top;
        bottom += fr.top;
      }
      cx = Math.max(8, Math.min(cx, window.innerWidth - 8));

      setPop({ rectTop: top, rectBottom: bottom, rectCenterX: cx, text, fromIframe: !!iframeEl });
      setResult(null);
      setError(null);
      setNeedConfig(false);
    },
    [],
  );

  useEffect(() => {
    const onMouseUpParent = () =>
      setTimeout(() => handleSelectionInDoc(document), 0);
    const onMouseDownParent = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        hide();
      }
    };
    document.addEventListener("mouseup", onMouseUpParent);
    document.addEventListener("mousedown", onMouseDownParent);

    // 尽力为 PDF 预览的 iframe 挂监听：同源 / HTML 型 viewer（如 Firefox）可用；
    // Chrome 原生 PDF viewer 是插件、contentDocument 为 null，会静默跳过。
    const attachIframe = (iframe: HTMLIFrameElement) => {
      if (attachedIframes.current.has(iframe)) return;
      let doc: Document | null = null;
      try {
        doc = iframe.contentDocument;
      } catch {
        doc = null;
      }
      if (!doc) return;
      attachedIframes.current.add(iframe);
      const handler = () =>
        setTimeout(() => handleSelectionInDoc(doc as Document, iframe), 0);
      doc.addEventListener("mouseup", handler);
      doc.addEventListener("selectionchange", () => {
        const s = (doc as Document).getSelection?.();
        if (!s || s.isCollapsed) hide();
      });
    };

    const poll = setInterval(() => {
      const iframes = Array.from(
        document.querySelectorAll("iframe"),
      ) as HTMLIFrameElement[];
      for (const f of iframes) {
        if (f.title?.includes("PDF")) attachIframe(f);
      }
    }, 1200);

    return () => {
      document.removeEventListener("mouseup", onMouseUpParent);
      document.removeEventListener("mousedown", onMouseDownParent);
      clearInterval(poll);
    };
  }, [handleSelectionInDoc, hide]);

  if (!pop) return null;

  const showBelow = pop.rectTop < 130;
  const left = Math.max(
    8,
    Math.min(pop.rectCenterX - POP_W / 2, window.innerWidth - POP_W - 8),
  );
  const style: React.CSSProperties = { left, width: POP_W };
  if (showBelow) style.top = pop.rectBottom + 8;
  else style.bottom = window.innerHeight - pop.rectTop + 8;

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("已复制译文");
    setTimeout(() => setCopied(false), 1500);
  };

  const switchTarget = (t: Target) => {
    setTarget(t);
    if (pop && result !== null) translate(pop.text, t);
  };

  return (
    <div
      ref={popRef}
      className="fixed z-[200] rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl text-sm"
      style={style}
    >
      {/* 头部：选中原文 */}
      <div className="flex items-start gap-2 p-2.5 border-b">
        <span className="flex-1 min-w-0 text-xs text-muted-foreground line-clamp-2 break-words">
          {pop.text}
        </span>
        <button
          onClick={hide}
          className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
          title="关闭"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-2.5 space-y-2">
        {/* 方向切换 */}
        <div className="flex items-center rounded-md border overflow-hidden text-xs">
          {([
            { v: "zh", label: "译中" },
            { v: "en", label: "译英" },
          ] as const).map((o) => (
            <button
              key={o.v}
              onClick={() => switchTarget(o.v)}
              className={`flex-1 h-7 transition-colors ${
                target === o.v
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* 待翻译：主按钮 */}
        {!result && !loading && !error && (
          <button
            onClick={() => translate(pop.text, target)}
            className="w-full inline-flex items-center justify-center gap-1.5 h-8 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Languages className="h-3.5 w-3.5" />
            翻译
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 h-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            翻译中…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 space-y-1.5">
            <p className="leading-relaxed">{error}</p>
            {needConfig && (
              <a
                href="/settings"
                className="inline-flex items-center gap-1 px-2 h-6 bg-amber-600 text-white rounded text-[11px] font-medium hover:bg-amber-700 transition-colors"
              >
                <Settings className="h-3 w-3" />
                去设置 AI 模型
              </a>
            )}
          </div>
        )}

        {result && (
          <>
            <div className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed prose-custom">
              {result}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1 px-2 h-7 rounded border hover:bg-muted text-xs text-muted-foreground transition-colors"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "已复制" : "复制"}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => translate(pop.text, target)}
                disabled={loading}
                className="px-2 h-7 rounded border hover:bg-muted text-xs text-muted-foreground transition-colors disabled:opacity-50"
              >
                重译
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
