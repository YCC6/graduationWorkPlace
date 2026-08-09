"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Search, X, Brain, Loader2, Trash2, Eye, Tag, Filter,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface KnowledgeNote {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: Array<{ tag: { id: string; name: string } }>;
  createdAt: string;
  updatedAt: string;
  _count?: { tags: number };
}

interface KTag {
  id: string;
  name: string;
  _count: { notes: number };
}

const CATEGORIES = [
  { value: "", label: "全部分类" },
  { value: "方法学", label: "方法学" },
  { value: "理论知识", label: "理论知识" },
  { value: "文献综述", label: "文献综述" },
  { value: "实验笔记", label: "实验笔记" },
  { value: "研究思路", label: "研究思路" },
  { value: "其他", label: "其他" },
];

export default function KnowledgePage() {
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [tags, setTags] = useState<KTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [showNewModal, setShowNewModal] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formTags, setFormTags] = useState("");
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (tagFilter) params.set("tag", tagFilter);
    if (categoryFilter) params.set("category", categoryFilter);

    try {
      const res = await fetch(`/api/knowledge?${params}`);
      const data = await res.json();
      setNotes(data.notes);
      setTotal(data.total);
    } catch (e) {
      toast.error("加载笔记失败");
    }
    setLoading(false);
  }, [searchQuery, tagFilter, categoryFilter]);

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge-tags");
      const data = await res.json();
      setTags(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadNotes();
    loadTags();
  }, [loadNotes, loadTags]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const tagList = formTags.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          content: formContent,
          category: formCategory || null,
          tags: tagList.length > 0 ? tagList : undefined,
        }),
      });
      if (res.ok) {
        toast.success("笔记创建成功");
        resetForm();
        loadNotes();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "创建失败");
      }
    } catch (e) {
      toast.error("创建失败");
    }
    setSaving(false);
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("确定删除这条笔记？")) return;
    try {
      await fetch(`/api/knowledge/${noteId}`, { method: "DELETE" });
      toast.success("已删除");
      loadNotes();
    } catch {
      toast.error("删除失败");
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormCategory("");
    setFormTags("");
    setShowNewModal(false);
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">知识笔记</h1>
          <p className="text-sm text-muted-foreground mt-0.5">共 {total} 条笔记 · 支持 [[双链引用]]</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />新建笔记
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 搜索 */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text" placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-8 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* 分类 */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategoryFilter(c.value)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                categoryFilter === c.value
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* 标签筛选 */}
        {tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {tagFilter && (
              <button onClick={() => setTagFilter("")} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary/10 text-primary">
                <X className="h-3 w-3" />清除
              </button>
            )}
            {tags.slice(0, 6).map((tag) => (
              <button
                key={tag.id}
                onClick={() => setTagFilter(tagFilter === tag.name ? "" : tag.name)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  tagFilter === tag.name ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {tag.name} ({tag._count.notes})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 笔记列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border rounded-xl">
          <Brain className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm">暂无知识笔记</p>
          <button onClick={() => setShowNewModal(true)} className="mt-2 text-sm text-primary hover:underline">
            创建第一条笔记
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/knowledge/${note.id}`}
              className="rounded-xl border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                  {note.title}
                </h3>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(note.id);
                  }}
                  className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed mb-3">
                {note.content?.slice(0, 200) || "（空内容）"}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {note.category && (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">
                      {note.category}
                    </span>
                  )}
                  {note.tags?.slice(0, 2).map((t) => (
                    <span key={t.tag.id} className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                      {t.tag.name}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDate(note.updatedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 新建笔记弹窗 */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl shadow-xl border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-base font-semibold">新建知识笔记</h3>
              <button onClick={resetForm} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium">标题 *</label>
                <input
                  required value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">分类</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {CATEGORIES.filter((c) => c.value).map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                    <option value="">无分类</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">标签</label>
                  <input
                    placeholder="逗号分隔，如 重金属,吸附"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 flex items-center gap-2">
                  内容（Markdown · 支持 LaTeX · [[双链引用]]）
                </label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={12}
                  placeholder={`# 标题\n\n正文内容...\n\n引用文献：[[微塑料对水生态的影响]]\n引用概念：[[高级氧化技术]]\n\n$$E = mc^2$$`}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={resetForm} className="px-4 h-9 text-sm rounded-lg border hover:bg-muted">
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving || !formTitle.trim()}
                  className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
