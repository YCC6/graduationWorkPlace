"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit3,
  Trash2,
  ExternalLink,
  Star,
  BookOpen,
  BookMarked,
  BookCheck,
  FileText,
  Calendar,
  Hash,
  Tag,
  Quote,
  Save,
  X,
  Search,
  Plus,
  Loader2,
  Download,
  Copy,
  Check,
  Eye,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Highlighter,
  Brain,
  Lightbulb,
  Sparkles,
  Languages,
  Upload,
  Maximize,
} from "lucide-react";
import { formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import toast from "react-hot-toast";
import PdfAiPanel from "@/components/PdfAiPanel";

interface PdfAnnotation {
  id: string;
  page: number;
  content: string;
  color: string;
  selectedText?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RelatedNote {
  id: string;
  title: string;
  content: string;
  category: string | null;
  updatedAt: string;
  tags: Array<{ tag: { name: string } }>;
}

interface RelatedPaper {
  id: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  reason: string;
  matchCount: number;
}

const ANNOTATION_COLORS = [
  { name: "黄色高亮", value: "#FFEB3B" },
  { name: "蓝色笔记", value: "#2196F3" },
  { name: "绿色重要", value: "#4CAF50" },
  { name: "红色问题", value: "#F44336" },
];

interface PaperDetail {
  id: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  abstract: string | null;
  keywords: string | null;
  status: string;
  rating: number | null;
  standardType: string | null;
  standardNumber: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  content: string | null;
  url: string | null;
  createdAt: string;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }>;
  citations: Array<{
    style: string;
    content: string;
  }>;
  pdfAnnotations?: PdfAnnotation[];
}

export default function PaperDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [citationContent, setCitationContent] = useState("");
  const [citationStyles, setCitationStyles] = useState<Record<string, string>>({});
  const [citationFormat, setCitationFormat] = useState<"gbt7714" | "apa" | "mla" | "bibtex">("gbt7714");
  const [citationLoading, setCitationLoading] = useState(false);
  const [citationCopied, setCitationCopied] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    authors: "",
    journal: "",
    year: "",
    volume: "",
    issue: "",
    pages: "",
    doi: "",
    abstract: "",
    keywords: "",
  });
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [showPdfPanel, setShowPdfPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [annotationForm, setAnnotationForm] = useState({
    page: 1,
    content: "",
    color: "#FFEB3B",
    selectedText: "",
  });
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [relatedNotes, setRelatedNotes] = useState<RelatedNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [relatedPapers, setRelatedPapers] = useState<RelatedPaper[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [indexing, setIndexing] = useState(false);
  // PDF 右侧面板页签：批注 / AI 总结 / 翻译
  const [pdfSideTab, setPdfSideTab] = useState<"annotation" | "summary" | "translate">(
    "annotation",
  );
  // 详情页直接上传 PDF（论文尚未上传时）
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  // PDF 全屏预览开关
  const [pdfFullscreen, setPdfFullscreen] = useState(false);
  // Esc 退出 PDF 全屏预览
  useEffect(() => {
    if (!pdfFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPdfFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pdfFullscreen]);

  useEffect(() => {
    loadPaper();
    loadAnnotations();
    loadRelatedNotes();
    loadRelatedPapers();
  }, [id]);

  const startEdit = () => {
    if (!paper) return;
    const parseArrToStr = (str: string | null): string => {
      if (!str) return "";
      try {
        return JSON.parse(str).join(", ");
      } catch {
        return str;
      }
    };
    setEditForm({
      title: paper.title,
      authors: parseArrToStr(paper.authors),
      journal: paper.journal || "",
      year: paper.year?.toString() || "",
      volume: paper.volume || "",
      issue: paper.issue || "",
      pages: paper.pages || "",
      doi: paper.doi || "",
      abstract: paper.abstract || "",
      keywords: parseArrToStr(paper.keywords),
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/papers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          authors: editForm.authors.split(",").map((s) => s.trim()).filter(Boolean),
          journal: editForm.journal || null,
          year: editForm.year ? parseInt(editForm.year) : null,
          volume: editForm.volume || null,
          issue: editForm.issue || null,
          pages: editForm.pages || null,
          doi: editForm.doi || null,
          abstract: editForm.abstract || null,
          keywords: editForm.keywords.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        toast.success("文献信息已更新");
        setEditing(false);
        loadPaper();
      } else {
        toast.error("保存失败");
      }
    } catch (e) {
      toast.error("保存失败");
    }
    setSavingEdit(false);
  };

  // 详情页直接为文献上传 PDF（无 PDF 时显示入口）
  const handleUploadPdf = async (file: File) => {
    setUploadingPdf(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: form });
      if (!up.ok) {
        const err = await up.json().catch(() => null);
        toast.error(err?.error || "上传失败");
        return;
      }
      const data = await up.json();
      const res = await fetch(`/api/papers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: data.filePath,
          fileName: data.fileName,
          fileSize: data.fileSize,
        }),
      });
      if (res.ok) {
        toast.success("PDF 已上传");
        loadPaper();
      } else {
        toast.error("PDF 已上传但关联文献失败");
      }
    } catch (e) {
      toast.error("上传失败");
    }
    setUploadingPdf(false);
  };

  const loadPaper = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/papers/${id}`);
      const data = await res.json();
      setPaper(data);
    } catch (e) {
      toast.error("加载文献详情失败");
    }
    setLoading(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await fetch(`/api/papers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      loadPaper();
      toast.success(`已标记为${getStatusLabel(newStatus)}`);
    } catch (e) {
      toast.error("更新失败");
    }
  };

  const handleRatingChange = async (rating: number) => {
    try {
      await fetch(`/api/papers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, status: "read" }),
      });
      loadPaper();
    } catch (e) {
      toast.error("更新失败");
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定删除这篇文献？相关笔记也会被删除。")) return;
    try {
      await fetch(`/api/papers/${id}`, { method: "DELETE" });
      toast.success("文献已删除");
      window.dispatchEvent(new Event("counts-changed"));
      router.push("/papers");
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const saveNote = async () => {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: id, content: noteContent }),
      });
      toast.success("笔记已保存");
      setShowNoteEditor(false);
      setNoteContent("");
      loadPaper();
    } catch (e) {
      toast.error("保存失败");
    }
    setSavingNote(false);
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm("确定删除这条笔记？")) return;
    try {
      await fetch(`/api/notes?id=${noteId}`, { method: "DELETE" });
      toast.success("笔记已删除");
      loadPaper();
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const fetchCitation = async () => {
    setCitationLoading(true);
    try {
      const res = await fetch(`/api/papers/${id}/citation`);
      const data = await res.json();
      if (data.styles) setCitationStyles(data.styles);
      const fmt = (data.style as "gbt7714") || "gbt7714";
      setCitationFormat(fmt);
      setCitationContent(data.content);
      await navigator.clipboard.writeText(data.content);
      setCitationCopied(true);
      toast.success("引用已复制到剪贴板");
      setTimeout(() => setCitationCopied(false), 2000);
    } catch (e) {
      toast.error("生成引用失败");
    }
    setCitationLoading(false);
  };

  // 当前选中格式的引用文本
  const displayedCitation = citationStyles[citationFormat] ?? citationContent;

  const downloadCitation = (text: string, fmt: string) => {
    const ext = fmt === "bibtex" ? "bib" : "txt";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `citation.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadAnnotations = async () => {
    try {
      const res = await fetch(`/api/papers/${id}/annotations`);
      const data = await res.json();
      setAnnotations(data);
    } catch (e) {
      // silent
    }
  };

  const loadRelatedNotes = async () => {
    setLoadingNotes(true);
    try {
      const res = await fetch(`/api/knowledge/by-ref?type=paper&id=${id}`);
      const data = await res.json();
      setRelatedNotes(data);
    } catch (e) {
      // silent
    }
    setLoadingNotes(false);
  };

  const loadRelatedPapers = async () => {
    setLoadingRelated(true);
    try {
      const res = await fetch(`/api/papers/${id}/related`);
      const data = await res.json();
      setRelatedPapers(data.related || []);
    } catch (e) {
      // silent
    }
    setLoadingRelated(false);
  };

  // 动态加载 pdf.js（用于浏览器端提取 PDF 全文）
  const loadPdfJs = () =>
    new Promise<any>((resolve, reject) => {
      if ((window as any).pdfjsLib) return resolve((window as any).pdfjsLib);
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => resolve((window as any).pdfjsLib);
      s.onerror = () => reject(new Error("无法加载 PDF 解析库（请检查网络）"));
      document.body.appendChild(s);
    });

  // 建立 PDF 全文索引（提取正文 → 存储 → 可用于全局搜索）
  const indexPdfFulltext = async () => {
    if (!paper?.filePath) return;
    setIndexing(true);
    try {
      const PDFJS: any = await loadPdfJs();
      PDFJS.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await PDFJS.getDocument({ url: paper.filePath }).promise;
      let text = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        text += (tc.items as any[]).map((it) => it.str ?? "").join(" ") + "\n";
      }
      const res = await fetch(`/api/papers/${id}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        toast.success("全文索引已建立，现在可在搜索中检索正文");
        setPaper((prev) => (prev ? { ...prev, content: text } : prev));
      } else {
        throw new Error("保存失败");
      }
    } catch (e: any) {
      toast.error("建立索引失败：" + (e?.message || "PDF 解析错误"));
    } finally {
      setIndexing(false);
    }
  };

  const saveAnnotation = async () => {
    if (!annotationForm.content.trim()) return;
    setSavingAnnotation(true);
    try {
      const res = await fetch(`/api/papers/${id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: annotationForm.page,
          content: annotationForm.content,
          color: annotationForm.color,
          selectedText: annotationForm.selectedText || undefined,
        }),
      });
      if (res.ok) {
        toast.success("批注已添加");
        setShowAnnotationForm(false);
        setAnnotationForm({ page: currentPage, content: "", color: "#FFEB3B", selectedText: "" });
        loadAnnotations();
      } else {
        toast.error("添加批注失败");
      }
    } catch (e) {
      toast.error("添加批注失败");
    }
    setSavingAnnotation(false);
  };

  const updateAnnotation = async () => {
    if (!editingAnnotationId || !annotationForm.content.trim()) return;
    setSavingAnnotation(true);
    try {
      const res = await fetch(`/api/papers/${id}/annotations/${editingAnnotationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: annotationForm.page,
          content: annotationForm.content,
          color: annotationForm.color,
          selectedText: annotationForm.selectedText || undefined,
        }),
      });
      if (res.ok) {
        toast.success("批注已更新");
        setShowAnnotationForm(false);
        setEditingAnnotationId(null);
        setAnnotationForm({ page: currentPage, content: "", color: "#FFEB3B", selectedText: "" });
        loadAnnotations();
      } else {
        toast.error("更新批注失败");
      }
    } catch (e) {
      toast.error("更新批注失败");
    }
    setSavingAnnotation(false);
  };

  const deleteAnnotation = async (annId: string) => {
    if (!confirm("确定删除这条批注？")) return;
    try {
      const res = await fetch(`/api/papers/${id}/annotations/${annId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("批注已删除");
        loadAnnotations();
      } else {
        toast.error("删除失败");
      }
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const handleAnnotationSubmit = () => {
    if (editingAnnotationId) {
      updateAnnotation();
    } else {
      saveAnnotation();
    }
  };

  const startEditAnnotation = (ann: PdfAnnotation) => {
    setEditingAnnotationId(ann.id);
    setAnnotationForm({
      page: ann.page,
      content: ann.content,
      color: ann.color,
      selectedText: ann.selectedText || "",
    });
    setShowAnnotationForm(true);
  };

  const cancelAnnotationForm = () => {
    setShowAnnotationForm(false);
    setEditingAnnotationId(null);
    setAnnotationForm({ page: currentPage, content: "", color: "#FFEB3B", selectedText: "" });
  };

  const stripMarkdown = (md: string): string => {
    return md
      .replace(/[#*`~]/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*[-+*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^\s*>/gm, "")
      .trim();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <FileText className="h-12 w-12 mb-3 opacity-30" />
        <p>文献不存在</p>
        <Link href="/papers" className="mt-2 text-sm text-primary hover:underline">返回列表</Link>
      </div>
    );
  }

  const parseArr = (str: string | null): string[] => {
    if (!str) return [];
    try {
      return JSON.parse(str);
    } catch {
      return str.split(",").map((s) => s.trim());
    }
  };

  const authors = parseArr(paper.authors);
  const keywords = parseArr(paper.keywords);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* 返回 */}
      <Link
        href="/papers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        返回文献列表
      </Link>

      {editing ? (
        /* 编辑模式 */
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">编辑文献信息</h2>
            <button
              onClick={() => setEditing(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="text-sm font-medium">标题 *</label>
            <input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">作者</label>
              <input
                placeholder="逗号分隔"
                value={editForm.authors}
                onChange={(e) => setEditForm({ ...editForm, authors: e.target.value })}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">期刊</label>
              <input
                value={editForm.journal}
                onChange={(e) => setEditForm({ ...editForm, journal: e.target.value })}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">年份</label>
              <input
                type="number"
                value={editForm.year}
                onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">卷号</label>
              <input
                value={editForm.volume}
                onChange={(e) => setEditForm({ ...editForm, volume: e.target.value })}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">期号</label>
              <input
                value={editForm.issue}
                onChange={(e) => setEditForm({ ...editForm, issue: e.target.value })}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">页码</label>
              <input
                value={editForm.pages}
                onChange={(e) => setEditForm({ ...editForm, pages: e.target.value })}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">DOI</label>
            <input
              value={editForm.doi}
              onChange={(e) => setEditForm({ ...editForm, doi: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-sm font-medium">摘要</label>
            <textarea
              rows={5}
              value={editForm.abstract}
              onChange={(e) => setEditForm({ ...editForm, abstract: e.target.value })}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium">关键词</label>
            <input
              placeholder="逗号分隔"
              value={editForm.keywords}
              onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
              className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setEditing(false)}
              className="px-4 h-9 text-sm rounded-lg border hover:bg-muted transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={savingEdit || !editForm.title.trim()}
              className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {savingEdit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存
            </button>
          </div>
        </div>
      ) : (
        <>
      {/* 标题和操作 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold leading-snug">{paper.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="text-sm text-muted-foreground">{authors.join(", ")}</span>
            {paper.journal && (
              <span className="text-sm italic text-muted-foreground">
                {paper.journal}
                {paper.year && ` (${paper.year})`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* 编辑 */}
          <button
            onClick={startEdit}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
            title="编辑"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          {/* 未上传 PDF 时显示上传入口 */}
          {!paper.filePath && (
            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={uploadingPdf}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title="上传 PDF"
            >
              {uploadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              上传 PDF
            </button>
          )}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadPdf(file);
              e.target.value = "";
            }}
          />
          {/* 引用复制 */}
          <button
            onClick={fetchCitation}
            disabled={citationLoading}
            className={`p-1.5 rounded transition-colors text-muted-foreground ${
              citationCopied ? "bg-green-50 text-green-600" : "hover:bg-muted"
            }`}
            title="复制 GB/T 7714 引用"
          >
            {citationLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : citationCopied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Quote className="h-4 w-4" />
            )}
          </button>
          {paper.filePath && (
            <a
              href={paper.filePath}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
              title={`下载 PDF: ${paper.fileName || ""}`}
              download={paper.fileName}
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <button
            onClick={handleDelete}
            className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
            title="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
              title="打开原文"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* 元数据卡片 */}
      <div className="rounded-xl border bg-card p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 状态 */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> 阅读状态
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusColor(paper.status)}`}>
                {getStatusLabel(paper.status)}
              </span>
              <div className="flex gap-0.5">
                {["unread", "reading", "read"].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`p-1 rounded text-xs transition-colors ${
                      paper.status === s
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    title={getStatusLabel(s)}
                  >
                    {s === "unread" && <BookOpen className="h-3 w-3" />}
                    {s === "reading" && <BookMarked className="h-3 w-3" />}
                    {s === "read" && <BookCheck className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 评分 */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <Star className="h-3 w-3" /> 评分
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => handleRatingChange(n)}
                  className={`p-0.5 transition-colors ${
                    paper.rating && n <= paper.rating
                      ? "text-yellow-400"
                      : "text-muted-foreground/30 hover:text-yellow-300"
                  }`}
                >
                  <Star className="h-4 w-4 fill-current" />
                </button>
              ))}
            </div>
          </div>

          {/* 年份 */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> 出版信息
            </div>
            <div className="text-sm">
              {paper.year || "-"}
              {paper.volume && `, Vol.${paper.volume}`}
              {paper.pages && `, pp.${paper.pages}`}
            </div>
          </div>

          {/* DOI */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <Hash className="h-3 w-3" /> DOI
            </div>
            <div className="text-sm font-mono truncate">
              {paper.doi ? (
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  {paper.doi}
                </a>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 标签 */}
      {paper.tags.length > 0 && (
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          {paper.tags.map((t) => (
            <span
              key={t.tag.id}
              className="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
              style={{
                backgroundColor: `${t.tag.color}15`,
                color: t.tag.color,
              }}
            >
              {t.tag.name}
            </span>
          ))}
        </div>
      )}

      {/* 引用格式 */}
      {citationContent && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Quote className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">引用格式</span>
            <div className="flex items-center gap-1 ml-auto">
              {(["gbt7714", "apa", "mla", "bibtex"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setCitationFormat(fmt)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    citationFormat === fmt
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {fmt === "gbt7714" ? "GB/T 7714" : fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm leading-relaxed break-all font-mono">{displayedCitation}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(displayedCitation);
                toast.success("已复制");
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
              title="复制"
            >
              <Copy className="h-3 w-3" />
              复制
            </button>
            <button
              onClick={() => downloadCitation(displayedCitation, citationFormat)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
              title="下载"
            >
              <Download className="h-3 w-3" />
              下载
            </button>
          </div>
        </div>
      )}

      {/* PDF 批注面板 */}
      {paper.filePath && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* 折叠头部 */}
          <button
            onClick={() => setShowPdfPanel(!showPdfPanel)}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              {showPdfPanel ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <Highlighter className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">PDF 批注</span>
              {annotations.length > 0 && (
                <span className="text-xs text-muted-foreground">({annotations.length})</span>
              )}
            </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="truncate max-w-[200px]">{paper.fileName || "PDF 文件"}</span>
                {paper.fileSize && (
                  <span>{(paper.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                )}
                {paper.content ? (
                  <span className="inline-flex items-center gap-1 px-2 h-7 rounded text-xs font-medium bg-green-50 text-green-700">
                    <Check className="h-3 w-3" /> 已索引
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      indexPdfFulltext();
                    }}
                    disabled={indexing}
                    className="inline-flex items-center gap-1 px-2 h-7 rounded text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                    title="提取 PDF 全文用于搜索"
                  >
                    {indexing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    {indexing ? "索引中" : "全文索引"}
                  </button>
                )}
                <a
                href={paper.filePath}
                target="_blank"
                rel="noopener noreferrer"
                download={paper.fileName || undefined}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2 h-7 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 transition-colors"
              >
                <Download className="h-3 w-3" />
                下载
              </a>
            </div>
          </button>

          {/* 展开内容 */}
          {showPdfPanel && (
            <div className="border-t flex" style={{ height: 600 }}>
              {/* 左侧 PDF 预览 52% */}
              <div className="border-r relative overflow-hidden group" style={{ width: "52%" }}>
                <button
                  onClick={() => setPdfFullscreen(true)}
                  title="全屏预览"
                  className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-black/40 text-white/85 text-xs font-medium border border-white/15 backdrop-blur-md shadow-lg opacity-90 hover:opacity-100 hover:bg-black/70 hover:text-white hover:scale-[1.04] active:scale-95 transition-all"
                >
                  <Maximize className="h-3.5 w-3.5" />
                  全屏
                </button>
                <iframe
                  src={`${paper.filePath}#page=${currentPage}&toolbar=1`}
                  className="w-full h-full"
                  title="PDF 预览"
                />
              </div>

              {/* 右侧面板 48%：批注 / AI 总结 / 翻译 */}
              <div className="flex flex-col" style={{ width: "48%" }}>
                {/* 页签切换 */}
                <div className="flex items-center border-b bg-muted/30">
                  {(
                    [
                      { key: "annotation", label: "批注", icon: MessageSquare },
                      { key: "summary", label: "AI 总结", icon: Sparkles },
                      { key: "translate", label: "翻译", icon: Languages },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setPdfSideTab(t.key)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 text-xs font-medium border-b-2 transition-colors ${
                        pdfSideTab === t.key
                          ? "border-primary text-primary bg-background"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <t.icon className="h-3.5 w-3.5" />
                      {t.label}
                      {t.key === "annotation" && annotations.length > 0 && (
                        <span className="px-1 rounded bg-muted text-[10px] text-muted-foreground">
                          {annotations.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* AI 总结 / 翻译面板 */}
                {pdfSideTab !== "annotation" && (
                  <PdfAiPanel
                    key={pdfSideTab}
                    paperId={paper.id}
                    paperTitle={paper.title}
                    mode={pdfSideTab === "summary" ? "summary" : "translate"}
                  />
                )}

                {/* 批注面板 */}
                {pdfSideTab === "annotation" && (
                <div className="flex flex-col flex-1 min-h-0">
                {/* 顶部工具栏 */}
                <div className="flex items-center gap-2 p-3 border-b">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">页码:</span>
                    <input
                      type="number"
                      min={1}
                      value={currentPage}
                      onChange={(e) => {
                        const page = parseInt(e.target.value) || 1;
                        setCurrentPage(Math.max(1, page));
                      }}
                      className="w-16 h-7 px-2 rounded border border-input bg-background text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={() => {
                      if (showAnnotationForm && editingAnnotationId) {
                        cancelAnnotationForm();
                      } else {
                        setAnnotationForm({
                          page: currentPage,
                          content: "",
                          color: "#FFEB3B",
                          selectedText: "",
                        });
                        setEditingAnnotationId(null);
                        setShowAnnotationForm(true);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 h-7 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    添加批注
                  </button>
                </div>

                {/* 批注表单 */}
                {showAnnotationForm && (
                  <div className="p-3 border-b bg-muted/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">页码:</span>
                      <input
                        type="number"
                        min={1}
                        value={annotationForm.page}
                        onChange={(e) =>
                          setAnnotationForm({ ...annotationForm, page: parseInt(e.target.value) || 1 })
                        }
                        className="w-16 h-7 px-2 rounded border border-input bg-background text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex-1" />
                      <span className="text-xs text-muted-foreground">颜色:</span>
                      <div className="flex gap-1">
                        {ANNOTATION_COLORS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => setAnnotationForm({ ...annotationForm, color: c.value })}
                            className={`w-5 h-5 rounded-full border-2 transition-transform ${
                              annotationForm.color === c.value
                                ? "border-foreground scale-110"
                                : "border-transparent"
                            }`}
                            style={{ backgroundColor: c.value }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                    <textarea
                      placeholder="批注内容（支持 Markdown）..."
                      value={annotationForm.content}
                      onChange={(e) =>
                        setAnnotationForm({ ...annotationForm, content: e.target.value })
                      }
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={cancelAnnotationForm}
                        className="px-3 h-7 text-xs rounded border hover:bg-muted transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleAnnotationSubmit}
                        disabled={savingAnnotation || !annotationForm.content.trim()}
                        className="inline-flex items-center gap-1 px-3 h-7 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {savingAnnotation ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        {editingAnnotationId ? "更新" : "保存"}
                      </button>
                    </div>
                  </div>
                )}

                {/* 批注列表 */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {annotations.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      暂无批注，点击&ldquo;添加批注&rdquo;开始
                    </div>
                  ) : (
                    annotations
                      .slice()
                      .sort((a, b) => a.page - b.page)
                      .map((ann) => (
                        <div
                          key={ann.id}
                          className="rounded-lg border bg-background p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: ann.color }}
                              />
                              <span className="text-xs font-medium">第 {ann.page} 页</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEditAnnotation(ann)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => deleteAnnotation(ann.id)}
                                className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {ann.selectedText && (
                            <p
                              className="text-xs italic text-muted-foreground border-l-2 pl-2"
                              style={{ borderColor: ann.color }}
                            >
                              {ann.selectedText}
                            </p>
                          )}
                          <div className="text-sm prose-custom">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                            >
                              {ann.content}
                            </ReactMarkdown>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(ann.updatedAt, "full")}
                          </p>
                        </div>
                      ))
                  )}
                </div>
                </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PDF 全屏预览 */}
      {paper.filePath && pdfFullscreen && (
        <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col">
          {/* 顶部工具栏 */}
          <div className="flex items-center gap-3 px-4 h-14 bg-gradient-to-r from-zinc-800/95 via-zinc-800/85 to-zinc-900/95 backdrop-blur-md text-white border-b border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.45)] shrink-0">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
              {paper.title}
            </span>
            <span className="text-xs text-zinc-300 flex items-center gap-1.5 shrink-0">
              页码:
              <input
                type="number"
                min={1}
                value={currentPage}
                onChange={(e) => setCurrentPage(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-7 px-2 rounded-md border border-white/15 bg-white/5 text-white text-sm text-center focus:outline-none focus:bg-white/10 focus:border-white/30 transition-colors"
              />
            </span>
            <button
              onClick={() => setPdfFullscreen(false)}
              title="退出全屏 (Esc)"
              className="inline-flex items-center gap-1 px-3 h-7 bg-white/10 border border-white/15 hover:bg-white/20 rounded-md text-xs transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
              退出
            </button>
          </div>
          <iframe
            src={`${paper.filePath}#page=${currentPage}&toolbar=1&view=FitH`}
            className="flex-1 w-full bg-white"
            title="PDF 全屏预览"
          />
        </div>
      )}

      {/* 标准信息 */}
      {paper.standardType && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium">
          <Quote className="h-3.5 w-3.5" />
          {paper.standardType} {paper.standardNumber}
        </div>
      )}

      {/* 摘要 */}
      {paper.abstract && (
        <div>
          <h2 className="text-sm font-semibold mb-2">摘要</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{paper.abstract}</p>
        </div>
      )}

      {/* 关键词 */}
      {keywords.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">关键词:</span>
          {keywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center px-2 py-1 rounded-full bg-muted text-xs"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* 关联知识笔记 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Brain className="h-4 w-4 text-primary" />
            关联知识笔记 ({relatedNotes.length})
          </h2>
        </div>

        {loadingNotes ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : relatedNotes.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-20" />
            暂无关联的知识笔记
            <div className="mt-3">
              <Link
                href={`/knowledge?title=${encodeURIComponent(paper.title)}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                新建关联笔记
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {relatedNotes.map((note) => (
                <Link
                  key={note.id}
                  href={`/knowledge/${note.id}`}
                  className="block rounded-lg border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-medium line-clamp-1">{note.title}</h3>
                    {note.category && (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary">
                        {note.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {stripMarkdown(note.content).slice(0, 100)}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 flex-wrap">
                      {note.tags?.slice(0, 3).map((t, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted"
                        >
                          {t.tag.name}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(note.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-3 text-center">
              <Link
                href={`/knowledge?title=${encodeURIComponent(paper.title)}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                新建关联笔记
              </Link>
            </div>
          </>
        )}
      </div>

      {/* 相关推荐 */}
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          相关推荐
        </h2>

        {loadingRelated ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : relatedPapers.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-20" />
            暂无相关文献推荐
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {relatedPapers.map((rp) => (
              <Link
                key={rp.id}
                href={`/papers/${rp.id}`}
                className="block p-4 hover:bg-muted/30 transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <h3 className="text-sm font-bold line-clamp-2 hover:text-primary transition-colors">
                  {rp.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {rp.authors}
                  {rp.journal && ` · ${rp.journal}`}
                  {rp.year && ` · ${rp.year}`}
                </p>
                <span className="inline-flex items-center h-6 px-2 mt-2 rounded bg-green-50 text-green-700 text-xs font-medium">
                  {rp.reason}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 笔记 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">
            笔记 ({paper.notes?.length || 0})
          </h2>
          <button
            onClick={() => {
              setNoteContent("");
              setShowNoteEditor(true);
            }}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            添加笔记
          </button>
        </div>

        {showNoteEditor && (
          <div className="mb-4 rounded-lg border bg-card p-4">
            <textarea
              placeholder="支持 Markdown 和 LaTeX 公式..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowNoteEditor(false)}
                className="px-3 h-8 text-sm rounded-lg border hover:bg-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveNote}
                disabled={savingNote || !noteContent.trim()}
                className="inline-flex items-center gap-1 px-3 h-8 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {savingNote ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存
              </button>
            </div>
          </div>
        )}

        {paper.notes?.length === 0 && !showNoteEditor && (
          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
            暂无笔记，点击上方按钮添加第一条笔记
          </div>
        )}

        <div className="space-y-4">
          {paper.notes?.map((note) => (
            <div key={note.id} className="rounded-lg border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
                <span className="text-xs text-muted-foreground">
                  {formatDate(note.updatedAt, "full")}
                </span>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="p-4 prose-custom max-h-[500px] overflow-y-auto">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {note.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
