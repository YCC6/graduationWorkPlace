"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  X,
  Download,
  FileText,
  Star,
  BookOpen,
  BookMarked,
  BookCheck,
  ExternalLink,
  Hash,
  Loader2,
  Upload,
  FileUp,
  Settings,
  Trash2,
  Check,
  ClipboardPaste,
} from "lucide-react";
import { formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import toast from "react-hot-toast";

interface Paper {
  id: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  doi: string | null;
  status: string;
  rating: number | null;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  createdAt: string;
  standardType: string | null;
}

interface Tag {
  id: string;
  name: string;
  color: string;
  _count: { papers: number };
}

interface ParsedPaper {
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
  raw: string;
}

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "unread", label: "待读" },
  { value: "reading", label: "在读" },
  { value: "read", label: "已读" },
  { value: "starred", label: "星标" },
];

const COLOR_PRESETS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

export default function PapersPage() {
  const searchParams = useSearchParams();

  const [papers, setPapers] = useState<Paper[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newPaperDoi, setNewPaperDoi] = useState("");
  const [doiLoading, setDoiLoading] = useState(false);
  const [manualForm, setManualForm] = useState(false);
  const [addMode, setAddMode] = useState<"doi" | "paste" | "manual">("doi");
  const [pasteText, setPasteText] = useState("");
  const [parsedPapers, setParsedPapers] = useState<ParsedPaper[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedFormat, setParsedFormat] = useState<string>("");
  const [formData, setFormData] = useState({
    title: "",
    authors: "",
    journal: "",
    year: "",
    doi: "",
    abstract: "",
    filePath: "",
    fileName: "",
    fileSize: 0,
  });
  const [pdfUploading, setPdfUploading] = useState(false);

  // 标签管理弹窗状态
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(COLOR_PRESETS[0]);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("");
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  // 批量操作状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // 搜索防抖
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery]);

  // 加载文献
  const loadPapers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (tagFilter) params.set("tag", tagFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);

    try {
      const res = await fetch(`/api/papers/list?${params}`);
      const data = await res.json();
      setPapers(data.papers);
      setTotal(data.total);
    } catch (e) {
      toast.error("加载文献失败");
    }
    setLoading(false);
  }, [statusFilter, tagFilter, debouncedSearch]);

  // 加载标签
  const loadTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    const data = await res.json();
    setTags(data);
  }, []);

  useEffect(() => {
    loadPapers();
    loadTags();
  }, [loadPapers, loadTags]);

  // 检查是否需要打开新建弹窗
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setShowNewModal(true);
    }
  }, [searchParams]);

  // DOI 解析
  const handleDoiLookup = async () => {
    if (!newPaperDoi.trim()) return;
    setDoiLoading(true);
    try {
      const res = await fetch(`/api/papers/doi?doi=${encodeURIComponent(newPaperDoi.trim())}`);
      if (!res.ok) {
        toast.error("DOI 解析失败，请检查 DOI 是否正确或手动录入");
        setAddMode("manual");
        return;
      }
      const data = await res.json();
      setFormData((prev) => ({
        ...prev,
        title: data.title || "",
        authors: (data.authors || []).join(", "),
        journal: data.journal || "",
        year: data.year?.toString() || "",
        doi: data.doi || newPaperDoi,
        abstract: data.abstract || "",
      }));
      setAddMode("manual");
      toast.success("DOI 解析成功！");
    } catch (e) {
      toast.error("DOI 解析失败");
      setAddMode("manual");
    }
    setDoiLoading(false);
  };

  // PDF 上传
  const handlePdfUpload = async (file: File) => {
    setPdfUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "上传失败");
      }
      const data = await res.json();
      setFormData((prev) => ({
        ...prev,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
      }));
      toast.success("PDF 上传成功");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "PDF 上传失败";
      toast.error(msg);
    }
    setPdfUploading(false);
  };

  // 创建文献
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/papers/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          authors: formData.authors.split(",").map((s) => s.trim()).filter(Boolean),
          journal: formData.journal || undefined,
          year: formData.year ? parseInt(formData.year) : undefined,
          doi: formData.doi || undefined,
          abstract: formData.abstract || undefined,
          filePath: formData.filePath || undefined,
          fileName: formData.fileName || undefined,
          fileSize: formData.fileSize || undefined,
        }),
      });
      if (res.ok) {
        toast.success("文献添加成功！");
        setShowNewModal(false);
        resetForm();
        loadPapers();
        window.dispatchEvent(new Event("counts-changed"));
      } else {
        const errText = await res.text();
        let err;
        try { err = JSON.parse(errText); } catch { err = {}; }
        toast.error(err.error || "添加失败，请稍后重试");
        console.error("创建文献失败:", errText);
      }
    } catch (e) {
      toast.error("添加失败");
      console.error("创建文献异常:", e);
    }
  };

  // 快速更新状态
  const handleStatusChange = async (paperId: string, newStatus: string) => {
    try {
      await fetch(`/api/papers/${paperId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      loadPapers();
      toast.success(`已标记为${getStatusLabel(newStatus)}`);
    } catch (e) {
      toast.error("更新失败");
    }
  };

  const resetForm = () => {
    setNewPaperDoi("");
    setManualForm(false);
    setAddMode("doi");
    setPasteText("");
    setParsedPapers([]);
    setParsedFormat("");
    setFormData({ title: "", authors: "", journal: "", year: "", doi: "", abstract: "", filePath: "", fileName: "", fileSize: 0 });
  };

  // 智能题录解析（GB/T 7714 文本 或 BibTeX）
  const handlePasteParse = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const res = await fetch("/api/papers/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (res.ok && data.papers) {
        setParsedPapers(data.papers);
        setParsedFormat(data.format || "");
        if (data.papers.length === 0) {
          toast.error("未能解析出题录，请检查格式（支持知网 GB/T 7714 或 BibTeX）");
        } else {
          toast.success(`已解析 ${data.papers.length} 篇文献`);
        }
      } else {
        toast.error(data.error || "解析失败");
      }
    } catch (e) {
      toast.error("解析失败");
    }
    setParsing(false);
  };

  // 批量导入解析结果
  const handleImportParsed = async () => {
    if (parsedPapers.length === 0) return;
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const p of parsedPapers) {
      try {
        const res = await fetch("/api/papers/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: p.title,
            authors: p.authors,
            journal: p.journal || undefined,
            year: p.year || undefined,
            volume: p.volume || undefined,
            issue: p.issue || undefined,
            pages: p.pages || undefined,
            doi: p.doi || undefined,
            abstract: p.abstract || undefined,
            url: p.url || undefined,
          }),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setImporting(false);
    if (ok > 0) {
      toast.success(`成功导入 ${ok} 篇${fail > 0 ? `，${fail} 篇失败` : ""}`);
      setShowNewModal(false);
      resetForm();
      loadPapers();
      window.dispatchEvent(new Event("counts-changed"));
    } else {
      toast.error("导入失败，请重试");
    }
  };

  // 解析作者
  const parseAuthors = (authorsStr: string): string => {
    try {
      const arr = JSON.parse(authorsStr);
      return arr.slice(0, 3).join(", ") + (arr.length > 3 ? " 等" : "");
    } catch {
      return authorsStr;
    }
  };

  // ===== 标签管理 =====
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      if (res.ok) {
        toast.success("标签创建成功");
        setNewTagName("");
        setNewTagColor(COLOR_PRESETS[0]);
        loadTags();
      } else {
        const err = await res.json();
        toast.error(err.error || "创建失败");
      }
    } catch (e) {
      toast.error("创建失败");
    }
  };

  const handleUpdateTag = async (tagId: string) => {
    if (!editTagName.trim()) return;
    try {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editTagName.trim(), color: editTagColor }),
      });
      if (res.ok) {
        toast.success("标签已更新");
        setEditingTagId(null);
        loadTags();
      } else {
        const err = await res.json();
        toast.error(err.error || "更新失败");
      }
    } catch (e) {
      toast.error("更新失败");
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("标签已删除");
        setDeletingTagId(null);
        loadTags();
      } else {
        toast.error("删除失败");
      }
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const startEditTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
  };

  // ===== 批量操作 =====
  const toggleSelect = (paperId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else {
        next.add(paperId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === papers.length && papers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(papers.map((p) => p.id)));
    }
  };

  const handleBatchStatus = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const res = await fetch("/api/papers/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "status", status: newStatus }),
      });
      if (res.ok) {
        toast.success(`已批量标记 ${selectedIds.size} 篇为${getStatusLabel(newStatus)}`);
        setSelectedIds(new Set());
        loadPapers();
      } else {
        toast.error("批量操作失败");
      }
    } catch (e) {
      toast.error("批量操作失败");
    }
    setBatchLoading(false);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 篇文献？此操作不可撤销。`)) return;
    setBatchLoading(true);
    try {
      const res = await fetch("/api/papers/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: "delete" }),
      });
      if (res.ok) {
        toast.success(`已删除 ${selectedIds.size} 篇文献`);
        setSelectedIds(new Set());
        loadPapers();
        window.dispatchEvent(new Event("counts-changed"));
      } else {
        toast.error("批量删除失败");
      }
    } catch (e) {
      toast.error("批量删除失败");
    }
    setBatchLoading(false);
  };

  const allSelected = papers.length > 0 && selectedIds.size === papers.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < papers.length;

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">文献管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">共 {total} 篇文献</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowNewModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          添加文献
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 状态筛选 */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                statusFilter === f.value
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索文献..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* 标签筛选 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {tagFilter && (
            <button
              onClick={() => setTagFilter("")}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary/10 text-primary"
            >
              <X className="h-3 w-3" />
              清除筛选
            </button>
          )}
          {tags.slice(0, 8).map((tag) => (
            <button
              key={tag.id}
              onClick={() => setTagFilter(tagFilter === tag.name ? "" : tag.name)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                tagFilter === tag.name
                  ? "ring-2 ring-offset-1"
                  : "hover:bg-muted"
              }`}
              style={{
                backgroundColor: tagFilter === tag.name ? `${tag.color}20` : `${tag.color}10`,
                color: tag.color,
                borderColor: tag.color,
              }}
            >
              {tag.name}
              <span className="opacity-60">({tag._count.papers})</span>
            </button>
          ))}
          {/* 管理标签按钮 */}
          <button
            onClick={() => setShowTagModal(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="管理标签"
          >
            <Settings className="h-3.5 w-3.5" />
            管理标签
          </button>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-primary/5 flex-wrap">
          <span className="text-sm font-medium">
            已选中 {selectedIds.size} 篇
          </span>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => handleBatchStatus("unread")}
            disabled={batchLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-50 transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            待读
          </button>
          <button
            onClick={() => handleBatchStatus("reading")}
            disabled={batchLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            <BookMarked className="h-3.5 w-3.5" />
            在读
          </button>
          <button
            onClick={() => handleBatchStatus("read")}
            disabled={batchLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50 transition-colors"
          >
            <BookCheck className="h-3.5 w-3.5" />
            已读
          </button>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={handleBatchDelete}
            disabled={batchLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {batchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            删除
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            disabled={batchLoading}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            取消选择
          </button>
        </div>
      )}

      {/* 文献表格 */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : papers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">暂无文献</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="mt-2 text-sm text-primary hover:underline"
            >
              添加第一篇文献
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-center text-xs font-medium text-muted-foreground px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded cursor-pointer accent-primary"
                  />
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">标题</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3 hidden md:table-cell">作者</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3 hidden lg:table-cell">期刊/年份</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-5 py-3 w-20">状态</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-5 py-3 w-28">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {papers.map((paper) => (
                <tr key={paper.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(paper.id)}
                      onChange={() => toggleSelect(paper.id)}
                      className="h-4 w-4 rounded cursor-pointer accent-primary"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/papers/${paper.id}`}
                      className="text-sm font-medium hover:text-primary transition-colors line-clamp-2"
                    >
                      {paper.title}
                    </Link>
                    {/* 标签 */}
                    {paper.tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {paper.tags.slice(0, 3).map((t) => (
                          <span
                            key={t.tag.id}
                            className="inline-flex px-1.5 py-0.5 rounded text-[10px]"
                            style={{
                              backgroundColor: `${t.tag.color}15`,
                              color: t.tag.color,
                            }}
                          >
                            {t.tag.name}
                          </span>
                        ))}
                        {paper.tags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{paper.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground hidden md:table-cell">
                    {parseAuthors(paper.authors)}
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    <div className="text-sm">{paper.journal || (paper.standardType ? `${paper.standardType} 标准` : "-")}</div>
                    <div className="text-xs text-muted-foreground">{paper.year || "-"}</div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusColor(paper.status)}`}
                    >
                      {getStatusLabel(paper.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* 状态快捷切换 */}
                      <button
                        onClick={() => handleStatusChange(paper.id, "unread")}
                        className="p-1 rounded hover:bg-orange-100 text-orange-400"
                        title="标记待读"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(paper.id, "reading")}
                        className="p-1 rounded hover:bg-blue-100 text-blue-400"
                        title="标记在读"
                      >
                        <BookMarked className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(paper.id, "read")}
                        className="p-1 rounded hover:bg-green-100 text-green-400"
                        title="标记已读"
                      >
                        <BookCheck className="h-3.5 w-3.5" />
                      </button>
                      {paper.doi && (
                        <a
                          href={`https://doi.org/${paper.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="打开原文"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 新建文献弹窗 */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl shadow-xl border w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-base font-semibold">添加新文献</h3>
              <button
                onClick={() => {
                  setShowNewModal(false);
                  resetForm();
                }}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 添加方式切换 */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => { setAddMode("doi"); setParsedPapers([]); }}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    addMode === "doi" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  DOI 导入
                </button>
                <button
                  onClick={() => { setAddMode("paste"); }}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    addMode === "paste" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  智能粘贴
                </button>
                <button
                  onClick={() => { setAddMode("manual"); setParsedPapers([]); }}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    addMode === "manual" ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  手动录入
                </button>
              </div>

              {addMode === "doi" && (
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    输入 DOI 自动获取文献元数据（适合有 DOI 的英文文献）
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="例如: 10.1016/j.envpol.2024.123456"
                      value={newPaperDoi}
                      onChange={(e) => setNewPaperDoi(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleDoiLookup()}
                      className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={handleDoiLookup}
                      disabled={doiLoading || !newPaperDoi.trim()}
                      className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {doiLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      解析
                    </button>
                  </div>
                  <button
                    onClick={() => setAddMode("manual")}
                    className="mt-3 text-sm text-primary hover:underline"
                  >
                    手动录入
                  </button>
                </div>
              )}

              {addMode === "paste" && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      粘贴知网「导出参考文献」(GB/T 7714) 或 BibTeX，可一次解析多篇
                    </p>
                    <textarea
                      rows={5}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={'[1] 张伟, 李娜. 深度学习图像识别研究[J]. 计算机科学, 2023, 45(2): 123-130.\n或 @article{key, title={...}, author={...}}'}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePasteParse}
                      disabled={parsing || !pasteText.trim()}
                      className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {parsing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ClipboardPaste className="h-4 w-4" />
                      )}
                      解析
                    </button>
                    {parsedPapers.length > 0 && (
                      <button
                        onClick={() => { setPasteText(""); setParsedPapers([]); }}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        清空
                      </button>
                    )}
                  </div>

                  {parsedPapers.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          已识别 {parsedPapers.length} 篇（{parsedFormat === "bibtex" ? "BibTeX" : "GB/T 7714"}）
                        </span>
                        <button
                          onClick={handleImportParsed}
                          disabled={importing}
                          className="inline-flex items-center gap-1.5 px-3 h-8 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {importing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          全部入库
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
                        {parsedPapers.map((p, idx) => (
                          <div key={idx} className="p-2.5 text-sm">
                            <div className="font-medium line-clamp-2">{p.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {p.authors.join(", ")}
                              {p.authors.length > 0 && (p.journal || p.year) ? " · " : ""}
                              {p.journal}
                              {p.year ? `, ${p.year}` : ""}
                              {p.volume ? `, ${p.volume}${p.issue ? `(${p.issue})` : ""}` : ""}
                              {p.pages ? `: ${p.pages}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {addMode === "manual" && (
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">标题 *</label>
                    <input
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">作者</label>
                      <input
                        placeholder="逗号分隔"
                        value={formData.authors}
                        onChange={(e) => setFormData({ ...formData, authors: e.target.value })}
                        className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">年份</label>
                      <input
                        type="number"
                        value={formData.year}
                        onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                        className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">期刊</label>
                    <input
                      value={formData.journal}
                      onChange={(e) => setFormData({ ...formData, journal: e.target.value })}
                      className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">DOI</label>
                    <input
                      value={formData.doi}
                      onChange={(e) => setFormData({ ...formData, doi: e.target.value })}
                      className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">摘要</label>
                    <textarea
                      rows={4}
                      value={formData.abstract}
                      onChange={(e) => setFormData({ ...formData, abstract: e.target.value })}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>

                  {/* PDF 上传 */}
                  <div>
                    <label className="text-sm font-medium mb-1 flex items-center gap-1.5">
                      <FileUp className="h-3.5 w-3.5 text-muted-foreground" />
                      PDF 文件（可选）
                    </label>
                    {formData.fileName ? (
                      <div className="flex items-center gap-2 mt-1 p-2 rounded-lg border bg-green-50 border-green-200">
                        <FileText className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-green-700 flex-1 truncate">{formData.fileName}</span>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, fileName: "", filePath: "", fileSize: 0 })}
                          className="p-1 rounded hover:bg-green-100"
                        >
                          <X className="h-3.5 w-3.5 text-green-600" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center mt-1 h-20 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-colors">
                        {pdfUploading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            上传中...
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-muted-foreground">
                            <Upload className="h-5 w-5" />
                            <span className="text-xs">点击上传 PDF 或拖拽到此处</span>
                          </div>
                        )}
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          disabled={pdfUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePdfUpload(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAddMode("doi")}
                      className="px-4 h-9 text-sm rounded-lg border hover:bg-muted transition-colors"
                    >
                      返回
                    </button>
                    <button
                      type="submit"
                      disabled={!formData.title.trim()}
                      className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      保存
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 标签管理弹窗 */}
      {showTagModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => {
            setShowTagModal(false);
            setEditingTagId(null);
            setDeletingTagId(null);
          }}
        >
          <div
            className="bg-background rounded-xl shadow-xl border w-full max-w-md max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-background z-10">
              <h3 className="text-base font-semibold">管理标签</h3>
              <button
                onClick={() => {
                  setShowTagModal(false);
                  setEditingTagId(null);
                  setDeletingTagId(null);
                }}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 新增标签表单 */}
              <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                <h4 className="text-sm font-medium">新增标签</h4>
                <input
                  type="text"
                  placeholder="标签名称"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`h-6 w-6 rounded-full transition-transform ${
                        newTagColor === color ? "ring-2 ring-offset-2 ring-foreground scale-110" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <button
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim()}
                  className="inline-flex items-center gap-1 px-3 h-8 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加
                </button>
              </div>

              {/* 标签列表 */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">已有标签 ({tags.length})</h4>
                {tags.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">暂无标签</p>
                )}
                {tags.map((tag) => (
                  <div key={tag.id}>
                    {editingTagId === tag.id ? (
                      /* 编辑模式 */
                      <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTagName}
                            onChange={(e) => setEditTagName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleUpdateTag(tag.id)}
                            className="flex-1 h-8 px-3 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateTag(tag.id)}
                            className="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                            title="保存"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditingTagId(null)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
                            title="取消"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {COLOR_PRESETS.map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditTagColor(color)}
                              className={`h-5 w-5 rounded-full transition-transform ${
                                editTagColor === color ? "ring-2 ring-offset-1 ring-foreground scale-110" : "hover:scale-110"
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : deletingTagId === tag.id ? (
                      /* 删除确认模式 */
                      <div className="rounded-lg border p-3 space-y-2 bg-red-50/50 border-red-200">
                        <p className="text-sm text-red-600">
                          确定删除标签「{tag.name}」？
                        </p>
                        {tag._count.papers > 0 && (
                          <p className="text-xs text-red-500">
                            该标签关联了 {tag._count.papers} 篇文献，删除后将取消关联。
                          </p>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setDeletingTagId(null)}
                            className="px-3 h-8 text-xs rounded-lg border hover:bg-muted transition-colors"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => handleDeleteTag(tag.id)}
                            className="inline-flex items-center gap-1 px-3 h-8 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            确认删除
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 正常显示模式 */
                      <div className="flex items-center gap-2 rounded-lg border p-2.5 hover:bg-muted/30 transition-colors">
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm font-medium flex-1">{tag.name}</span>
                        <span className="text-xs text-muted-foreground">{tag._count.papers} 篇</span>
                        <button
                          onClick={() => startEditTag(tag)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="编辑"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingTagId(tag.id)}
                          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
