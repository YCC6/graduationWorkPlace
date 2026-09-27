"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Brain,
  Copy,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Send,
  Settings,
  Sparkles,
  Square,
  StickyNote,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import toast from "react-hot-toast";

type Scope = "abstract" | "fulltext";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  pending?: boolean;
  /** 用户上传、随本条消息一起发送的本地图片（仅内存态，持久化时剥离大体积 data URL） */
  images?: { name: string; url?: string }[];
}

interface Props {
  paperId: string;
  paperTitle: string;
  onNoteSaved?: () => void;
}

const SUGGESTIONS = [
  "用三句话概括这篇论文的核心贡献",
  "它的研究方法存在哪些局限？",
  "这项研究的方法能否迁移到我的课题？",
  "论文里最重要的图表说明了什么结论？",
];

export default function PdfAiChat({
  paperId,
  paperTitle,
  onNoteSaved,
}: Props) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [scope, setScope] = useState<Scope>("fulltext");
  const [hasFulltext, setHasFulltext] = useState(false);
  const [hasAbstract, setHasAbstract] = useState(false);
  const [needConfig, setNeedConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 图片附件（待发送的本地图片，已压缩为 data URL）
  const [attachments, setAttachments] = useState<
    { id: string; url: string; name: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 已落库的消息 id（幂等去重，避免重复写入）
  const savedIdsRef = useRef<Set<string>>(new Set());
  // 流式接收时的内容/推理累加器，用于对话结束后落库
  const accContentRef = useRef("");
  const accReasoningRef = useRef("");

  /** 把单条对话写入数据库（图片只传文件名，剥离 data URL） */
  const persist = useCallback(
    async (turn: ChatTurn) => {
      if (savedIdsRef.current.has(turn.id)) return;
      try {
        const res = await fetch(`/api/papers/${paperId}/chat/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                id: turn.id,
                role: turn.role,
                content: turn.content,
                reasoning: turn.reasoning,
                images: turn.images?.map((i) => ({ name: i.name })),
              },
            ],
          }),
        });
        if (res.ok) savedIdsRef.current.add(turn.id);
      } catch {
        /* 离线时静默失败，下次发送/接收时再尝试 */
      }
    },
    [paperId],
  );

  // 探测可用范围（复用 summarize 的缓存接口即可）
  const probe = useCallback(async () => {
    try {
      const res = await fetch(`/api/papers/${paperId}/summarize`);
      if (!res.ok) return;
      const data = await res.json();
      setHasFulltext(!!data.hasFulltext);
      setHasAbstract(!!data.hasAbstract);
      setScope(data.hasFulltext ? "fulltext" : "abstract");
    } catch {
      /* 静默 */
    }
  }, [paperId]);

  useEffect(() => {
    probe();
  }, [probe]);

  // 加载已保存的对话（优先从数据库读取，实现多设备同步）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/papers/${paperId}/chat/history`);
        if (!res.ok) return;
        const data = await res.json();
        const remote: ChatTurn[] = Array.isArray(data.messages)
          ? data.messages
          : [];
        if (!alive) return;

        if (remote.length) {
          // 数据库已有记录：直接采用，并标记已落库避免重复写入
          savedIdsRef.current = new Set(remote.map((m) => m.id));
          setMessages(remote.map((m) => ({ ...m, pending: false })));
        } else {
          // 首次为空：把浏览器里已有的旧对话一次性迁移进数据库，随后清掉本地副本
          const raw = localStorage.getItem(`chat:${paperId}`);
          if (raw) {
            const local = JSON.parse(raw) as ChatTurn[];
            const slim = local.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              reasoning: m.reasoning,
              images: m.images?.map((i) => ({ name: i.name })),
            }));
            await fetch(`/api/papers/${paperId}/chat/history`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: slim }),
            });
            savedIdsRef.current = new Set(local.map((m) => m.id));
            setMessages(local.map((m) => ({ ...m, pending: false })));
            localStorage.removeItem(`chat:${paperId}`);
          }
        }
      } catch {
        /* 离线时忽略，使用内存态 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [paperId]);

  useEffect(() => {
    if (!stickBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // 读取并压缩图片：限制最长边 <=1600px，统一转 JPEG 以控制体积
  const addImages = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      toast.error("请选择图片文件");
      return;
    }
    list.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const maxDim = 1600;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          const finalize = (url: string) =>
            setAttachments((prev) => [
              ...prev,
              {
                id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                url,
                name: file.name,
              },
            ]);
          if (!ctx) {
            finalize(src); // 无 canvas 时降级用原图
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          try {
            finalize(canvas.toDataURL("image/jpeg", 0.85));
          } catch {
            finalize(src);
          }
        };
        img.onerror = () => setAttachments((prev) => [
          ...prev,
          { id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, url: src, name: file.name },
        ]);
        img.src = src;
      };
      reader.onerror = () => toast.error(`读取 ${file.name} 失败`);
      reader.readAsDataURL(file);
    });
  }, []);

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // 支持 Ctrl/⌘+V 直接粘贴图片（截图等），走与选图相同的压缩流程
  const onPaste = (e: React.ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const imageFiles: File[] = [];
    if (dt.files && dt.files.length) {
      for (const f of Array.from(dt.files)) {
        if (f.type.startsWith("image/")) imageFiles.push(f);
      }
    } else {
      // 部分浏览器把剪贴板图片放在 items 而非 files
      for (const item of Array.from(dt.items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
    }
    if (imageFiles.length) {
      e.preventDefault();
      addImages(imageFiles);
      toast.success(`已粘贴 ${imageFiles.length} 张图片`);
    }
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if ((!text && attachments.length === 0) || sending) return;

    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userTurn: ChatTurn = {
      id: `u-${uid}`,
      role: "user",
      content: text,
      images:
        attachments.length > 0
          ? attachments.map((a) => ({ name: a.name, url: a.url }))
          : undefined,
    };
    const assistantTurn: ChatTurn = {
      id: `a-${uid}`,
      role: "assistant",
      content: "",
      reasoning: "",
      pending: true,
    };

    // 构造历史（不含当前这一轮及占位助手）；图片只随本轮发送，不进历史文本
    const history = [
      ...messages.filter((m) => !m.pending),
      userTurn,
    ].map((m) => ({ role: m.role, content: m.content }));

    accContentRef.current = "";
    accReasoningRef.current = "";
    setMessages((prev) => [...prev, userTurn, assistantTurn]);
    setInput("");
    setAttachments([]);
    setSending(true);
    setError(null);
    stickBottomRef.current = true;
    // 用户轮立即落库（幂等）
    persist(userTurn);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/papers/${paperId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          deepThink,
          scope,
          images: attachments.map((a) => a.url),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "NO_AI_CONFIG") setNeedConfig(true);
        setError(data.error || "请求失败");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantTurn.id
              ? { ...m, pending: false, content: "" }
              : m,
          ),
        );
        setSending(false);
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
            if (evt.delta) {
              accContentRef.current += evt.delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantTurn.id
                    ? { ...m, content: m.content + evt.delta, pending: true }
                    : m,
                ),
              );
            } else if (evt.reasoning) {
              accReasoningRef.current += evt.reasoning;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantTurn.id
                    ? { ...m, reasoning: (m.reasoning || "") + evt.reasoning }
                    : m,
                ),
              );
            } else if (evt.done) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantTurn.id ? { ...m, pending: false } : m,
                ),
              );
            } else if (evt.error) {
              setError(evt.error);
            }
          } catch {
            /* 跳过解析不了的行 */
          }
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantTurn.id ? { ...m, pending: false } : m,
        ),
      );
      // 助手轮落库（幂等）
      if (accContentRef.current.trim() || accReasoningRef.current.trim()) {
        persist({
          id: assistantTurn.id,
          role: "assistant",
          content: accContentRef.current,
          reasoning: accReasoningRef.current || undefined,
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast("已停止生成");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantTurn.id ? { ...m, pending: false } : m,
          ),
        );
        // 中途停止也尽量保存已生成的部分
        if (accContentRef.current.trim() || accReasoningRef.current.trim()) {
          persist({
            id: assistantTurn.id,
            role: "assistant",
            content: accContentRef.current,
            reasoning: accReasoningRef.current || undefined,
          });
        }
      } else {
        setError((err as Error).message || "对话失败");
      }
    }
    setSending(false);
    abortRef.current = null;
  };

  const stop = () => abortRef.current?.abort();

  const clearChat = async () => {
    if (sending) return;
    setMessages([]);
    setError(null);
    savedIdsRef.current.clear();
    try {
      await fetch(`/api/papers/${paperId}/chat/history`, { method: "DELETE" });
    } catch {
      /* 忽略 */
    }
  };

  const copyTurn = async (turn: ChatTurn) => {
    await navigator.clipboard.writeText(turn.content);
    toast.success("已复制");
  };

  const saveAsNote = async (turn: ChatTurn) => {
    if (!turn.content.trim()) return;
    try {
      const body = turn.reasoning
        ? `> AI 对话（深度思考）· ${paperTitle}\n\n**🔍 思考过程**\n\n${turn.reasoning}\n\n---\n\n${turn.content}`
        : `> AI 对话 · ${paperTitle}\n\n${turn.content}`;
      const res = await fetch(`/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId, content: body, isPrivate: true }),
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
  };

  const disabled = sending;
  const noSource = scope === "fulltext" ? !hasFulltext : !hasAbstract;
  const canSend = !!input.trim() || attachments.length > 0;
  // 无正文且无图片时禁止发送（避免对空白文献提问）；有图片则允许
  const sendDisabled = disabled || !canSend || (noSource && attachments.length === 0);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-muted/20">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-background/80 backdrop-blur-sm flex-wrap">
        <div className="flex items-center rounded-lg border border-border bg-muted/30 overflow-hidden shadow-sm">
          {(
            [
              { v: "abstract", label: "摘要", ok: hasAbstract },
              { v: "fulltext", label: "全文", ok: hasFulltext },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              onClick={() => setScope(o.v)}
              disabled={disabled || !o.ok}
              title={o.ok ? undefined : "暂无内容"}
              className={`px-3 h-7 text-xs font-medium transition-all duration-200 disabled:opacity-40 ${
                scope === o.v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "hover:bg-background/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setDeepThink((v) => !v)}
          disabled={disabled}
          title="深度思考：先推理再作答（DeepSeek 会调用推理模型）"
          className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-lg border text-xs font-medium transition-all duration-200 disabled:opacity-40 shadow-sm ${
            deepThink
              ? "bg-gradient-to-r from-violet-500 to-purple-500 border-violet-400 text-white shadow-md shadow-violet-200"
              : "border-border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <Brain className={`h-3.5 w-3.5 ${deepThink ? "animate-pulse" : ""}`} />
          深度思考
        </button>

        <div className="flex-1" />

        {messages.length > 0 && (
          <button
            onClick={clearChat}
            disabled={disabled}
            title="新对话"
            className="inline-flex items-center gap-1.5 px-3 h-7 rounded-lg border border-border bg-muted/30 text-xs font-medium hover:bg-muted transition-all duration-200 disabled:opacity-40 shadow-sm"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            新对话
          </button>
        )}
      </div>

      {/* 消息区 */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
      >
        {error && (
          <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/50 p-3.5 text-xs space-y-2.5 shadow-sm">
            <div className="flex items-start gap-2 text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
            {needConfig && (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 px-3 h-8 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-xs font-medium hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm"
              >
                <Settings className="h-3 w-3" />
                去 AI 设置
              </Link>
            )}
          </div>
        )}

        {messages.length === 0 && !error && (
          <div className="text-center py-10 text-xs text-muted-foreground space-y-4">
            <div className="relative w-14 h-14 mx-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-violet-200/40 rounded-2xl animate-pulse" />
              <div className="relative w-14 h-14 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-primary/60" />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground/70">
                向这篇文献提问
              </p>
              <p className="leading-relaxed max-w-[260px] mx-auto">
                AI 会基于论文内容作答
                {deepThink ? "，并先展示思考过程" : "，开启「深度思考」可先推理再回答"}
              </p>
            </div>
            <div className="flex flex-col gap-2 max-w-[92%] mx-auto pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={disabled || (noSource && attachments.length === 0)}
                  className="group px-4 py-2.5 rounded-xl border border-border/60 bg-background text-left text-xs hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-40"
                >
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                    {s}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-2 duration-300`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-shadow hover:shadow-md ${
                m.role === "user"
                  ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-md"
                  : "bg-background border border-border/50 rounded-bl-md"
              }`}
            >
              {m.role === "assistant" && (m.reasoning || m.pending) && (
                <details
                  className="mb-2.5 rounded-xl bg-gradient-to-br from-violet-50/90 to-purple-50/60 border border-violet-200/70 shadow-sm overflow-hidden"
                  open={!!m.reasoning && m.pending}
                >
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-violet-700 select-none flex items-center gap-1.5 hover:bg-violet-100/40 transition-colors">
                    <Brain className="h-3.5 w-3.5" />
                    🔍 思考过程
                    <span className="ml-auto text-[10px] font-normal text-violet-400">点击展开/收起</span>
                  </summary>
                  <div className="px-3 pb-3 text-[12px] leading-relaxed text-violet-900/85 whitespace-pre-wrap border-t border-violet-200/30 mt-0.5 pt-2">
                    {m.reasoning}
                    {m.pending && !m.reasoning && (
                      <span className="inline-flex items-center gap-1.5 text-violet-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        正在深度思考…
                      </span>
                    )}
                  </div>
                </details>
              )}

              {m.role === "assistant" ? (
                m.content ? (
                  <div className="prose-custom">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {m.content}
                    </ReactMarkdown>
                    {m.pending && (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground mt-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        生成中…
                      </span>
                    )}
                  </div>
                ) : (
                  m.pending && (
                    <span className="inline-flex items-center gap-2 text-muted-foreground py-1">
                      <div className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                      </div>
                      思考中…
                    </span>
                  )
                )
              ) : (
                <>
                  {m.images && m.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {m.images.map((img, i) =>
                        img.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={img.url}
                            alt={img.name}
                            className="h-20 w-20 object-cover rounded-lg border border-white/30 shadow-sm"
                          />
                        ) : (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 text-[11px]"
                          >
                            📎 {img.name}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  <span className="whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </span>
                </>
              )}

              {m.role === "assistant" &&
                !m.pending &&
                m.content.trim() && (
                  <div className="flex items-center gap-0.5 mt-2 -mb-1 pt-2 border-t border-border/30">
                    <button
                      onClick={() => copyTurn(m)}
                      title="复制"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
                    >
                      <Copy className="h-3 w-3" />
                      复制
                    </button>
                    <button
                      onClick={() => saveAsNote(m)}
                      title="存为文献笔记"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
                    >
                      <StickyNote className="h-3 w-3" />
                      存笔记
                    </button>
                  </div>
                )}
            </div>
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <div
        className="border-t border-border/60 bg-background/80 backdrop-blur-sm p-3"
        onPaste={onPaste}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5 px-0.5">
            {attachments.map((a) => (
              <div key={a.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.name}
                  className="h-16 w-16 object-cover rounded-lg border border-border/60 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  title="移除"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:scale-110 transition-transform"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative flex items-end gap-2 rounded-2xl border border-border/70 bg-muted/30 shadow-inner focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200 p-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title="上传图片分析（图表 / 公式 / 实验照片 / 手写笔记）"
            className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files && e.target.files.length) addImages(e.target.files);
              e.target.value = "";
            }}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={
              noSource && attachments.length === 0
                ? "请先提取 PDF 正文，或上传/粘贴图片让我分析…"
                : "就这篇文献提问，或上传/粘贴图片分析…（Enter 发送，Shift+Enter 换行）"
            }
            disabled={disabled}
            className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50 max-h-32 leading-relaxed"
          />
          {sending ? (
            <button
              onClick={stop}
              className="inline-flex items-center justify-center gap-1 px-4 h-9 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm hover:shadow shrink-0"
            >
              <Square className="h-3.5 w-3.5" />
              停止
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={sendDisabled}
              className={`inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
                !sendDisabled
                  ? "bg-gradient-to-r from-primary to-blue-500 text-white shadow-sm hover:shadow-md hover:shadow-primary/25 hover:scale-[1.02] active:scale-95"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Send className={`h-3.5 w-3.5 ${!sendDisabled ? "" : "opacity-50"}`} />
              发送
            </button>
          )}
        </div>
        <p className="text-[10px] text-center text-muted-foreground/50 mt-2 select-none">
          {attachments.length > 0
            ? "图片分析需要支持视觉的模型（如 GPT-4o、通义千问 VL、GLM-4V 等）"
            : "支持点击图标或 Ctrl/⌘+V 粘贴图片 · AI 回答基于论文内容，仅供参考"}
        </p>
      </div>
    </div>
  );
}
