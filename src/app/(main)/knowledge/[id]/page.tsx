"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Trash2, Edit3, Save, X, Loader2, Tag, FileText,
  FlaskConical, Brain, ExternalLink,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import toast from "react-hot-toast";

interface ResolvedLink {
  text: string;
  type: "paper" | "project" | "note" | "unknown";
  title: string;
  href: string;
}

interface KnowledgeDetail {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: Array<{ tag: { id: string; name: string } }>;
  createdAt: string;
  updatedAt: string;
  resolvedLinks: ResolvedLink[];
}

export default function KnowledgeDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [note, setNote] = useState<KnowledgeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadNote(); }, [id]);

  // 解析双链 [[xxx]]，通过搜索 API 查找匹配并替换为带颜色的 Markdown 链接
  const resolveLinks = async (content: string): Promise<string> => {
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    const matches = [...content.matchAll(linkRegex)];
    if (matches.length === 0) return content;

    const linkMap = new Map<string, { href: string; type: string }>();

    // 批量查找每个双链文本的匹配
    await Promise.all(
      matches.map(async (m) => {
        const text = m[1].trim();
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(text)}&type=paper,note,project`);
          const data = await res.json();
          const results = data.results || [];
          // 优先精确标题匹配
          const exact = results.find(
            (r: { title: string; score: number }) =>
              r.title.toLowerCase() === text.toLowerCase() && r.score >= 2
          );
          const best = exact || results[0];
          if (best) {
            linkMap.set(text, { href: best.url, type: best.type });
          }
        } catch {
          // ignore
        }
      })
    );

    // 替换 [[xxx]] 为带样式的 Markdown 链接
    return content.replace(linkRegex, (full, text) => {
      const t = text.trim();
      const match = linkMap.get(t);
      if (match) {
        const color =
          match.type === "paper" ? "#3B82F6" :
          match.type === "note" ? "#10B981" :
          match.type === "project" ? "#8B5CF6" :
          "#3B82F6";
        // 使用 HTML span 包裹以支持颜色，通过 Markdown 链接跳转
        return `[${t}](${match.href} "${color}")`;
      }
      // 未匹配：保留原文本，标记灰色虚线（用 Markdown 标记）
      return `~~${t}~~`;
    });
  };

  const loadNote = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/${id}`);
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      // 解析双链并替换为带颜色的链接
      if (data.content) {
        data.content = await resolveLinks(data.content);
      }
      setNote(data);
    } catch {
      toast.error("笔记不存在");
      router.push("/knowledge");
    }
    setLoading(false);
  };

  const startEdit = () => {
    if (!note) return;
    setEditTitle(note.title);
    setEditContent(note.content || "");
    setEditCategory(note.category || "");
    setEditTags(note.tags.map((t) => t.tag.name).join(", "));
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const tagList = editTags.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch(`/api/knowledge/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          category: editCategory || null,
          tags: tagList,
        }),
      });
      if (res.ok) {
        toast.success("已保存");
        setEditing(false);
        loadNote();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "保存失败");
      }
    } catch {
      toast.error("保存失败");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("确定删除这条笔记？")) return;
    try {
      await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      toast.success("已删除");
      router.push("/knowledge");
    } catch {
      toast.error("删除失败");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!note) return null;

  const linkIcon = (type: string) => {
    switch (type) {
      case "paper": return <FileText className="h-3.5 w-3.5" />;
      case "project": return <FlaskConical className="h-3.5 w-3.5" />;
      case "note": return <Brain className="h-3.5 w-3.5" />;
      default: return <ExternalLink className="h-3.5 w-3.5" />;
    }
  };

  const linkLabel = (type: string) => {
    switch (type) {
      case "paper": return "文献";
      case "project": return "项目";
      case "note": return "笔记";
      default: return "引用";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link href="/knowledge" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />返回笔记列表
      </Link>

      {/* 标题栏 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-xl font-semibold px-3 py-1.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <h1 className="text-xl font-semibold leading-snug">{note.title}</h1>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {note.category && (
              <span className="inline-flex px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">{note.category}</span>
            )}
            {note.tags.map((t) => (
              <span key={t.tag.id} className="inline-flex px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{t.tag.name}</span>
            ))}
            <span className="text-xs text-muted-foreground ml-1">更新于 {formatDate(note.updatedAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <button onClick={saveEdit} disabled={saving}
                className="inline-flex items-center gap-1 px-3 h-8 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存
              </button>
              <button onClick={() => setEditing(false)} className="px-3 h-8 text-sm rounded-lg border hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={startEdit}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors" title="编辑">
                <Edit3 className="h-4 w-4" />
              </button>
              <button onClick={handleDelete}
                className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors" title="删除">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 编辑区 */}
      {editing && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">分类</label>
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                className="w-full mt-0.5 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">无</option>
                {["方法学", "理论知识", "文献综述", "实验笔记", "研究思路", "其他"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">标签（逗号分隔）</label>
              <input value={editTags} onChange={(e) => setEditTags(e.target.value)}
                className="w-full mt-0.5 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">内容（Markdown · LaTeX · [[双链]]）</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={16}
              className="w-full mt-0.5 px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>
      )}

      {/* 内容渲染 */}
      {!editing && note.content && (
        <div className="rounded-xl border bg-card p-6 prose-custom max-h-[800px] overflow-y-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              a: ({ href, children, ...props }) => {
                const title = props.title as string | undefined;
                const color = title || "#3B82F6";
                return (
                  <a
                    href={href}
                    title={title}
                    style={{ color, borderBottom: `1px dashed ${color}` }}
                    className="font-medium hover:opacity-80 transition-opacity"
                  >
                    {children}
                  </a>
                );
              },
              del: ({ children }) => (
                <span style={{ color: "#9CA3AF", borderBottom: "1px dashed #9CA3AF" }}>
                  {children}
                </span>
              ),
            }}
          >
            {note.content}
          </ReactMarkdown>
        </div>
      )}

      {/* 双链引用 */}
      {!editing && note.resolvedLinks && note.resolvedLinks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />关联引用
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {note.resolvedLinks.map((link, idx) => (
              link.href ? (
                <Link
                  key={idx}
                  href={link.href}
                  className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all text-sm"
                >
                  <span className={`p-1.5 rounded ${
                    link.type === "paper" ? "bg-blue-100 text-blue-600" :
                    link.type === "project" ? "bg-green-100 text-green-600" :
                    "bg-purple-100 text-purple-600"
                  }`}>
                    {linkIcon(link.type)}
                  </span>
                  <div className="min-w-0">
                    <span className="text-[10px] text-muted-foreground">{linkLabel(link.type)}</span>
                    <p className="text-sm font-medium line-clamp-1">{link.title}</p>
                  </div>
                </Link>
              ) : (
                <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                  <ExternalLink className="h-4 w-4" />
                  <span>未找到: {link.text}</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* 元数据 */}
      <div className="text-xs text-muted-foreground border-t pt-4">
        创建于 {formatDate(note.createdAt)} · 更新于 {formatDate(note.updatedAt)}
      </div>
    </div>
  );
}
