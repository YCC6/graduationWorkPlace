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
  Edit3,
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
  Save,
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
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  abstract?: string | null;
  keywords?: string | null;
  url?: string | null;
  filePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
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
  docType?: string | null;
  pubInfo?: PubInfo | null;
}

// 与解析器 PubInfo 对齐（仅前端编辑用，结构从简）
type PubInfo = {
  publisher?: string | null;
  publishPlace?: string | null;
  institution?: string | null;
  [k: string]: string | null | undefined;
};

// GB/T 7714 文献类型下拉选项
const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "J", label: "期刊文章 [J]" },
  { value: "M", label: "专著 [M]" },
  { value: "D", label: "学位论文 [D]" },
  { value: "R", label: "报告 [R]" },
  { value: "S", label: "标准 [S]" },
  { value: "N", label: "报纸文章 [N]" },
  { value: "C", label: "论文集 [C]" },
  { value: "P", label: "专利 [P]" },
  { value: "EB/OL", label: "电子资源 [EB/OL]" },
  { value: "Z", label: "其他 [Z]" },
];

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

  // 全文检索（接 /api/papers/fulltext）
  const [fulltextMode, setFulltextMode] = useState(false);
  const [fulltextResults, setFulltextResults] = useState<
    { id: string; title: string; subtitle: string; snippet: string; matchIn: "fulltext" | "meta"; url: string }[]
  >([]);
  const [fulltextLoading, setFulltextLoading] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);

  // 批量导入（BibTeX / RIS / EndNote）
  const [showImportModal, setShowImportModal] = useState(false);
  const [importParsed, setImportParsed] = useState<
    { title: string; authors: string[]; journal: string | null; year: number | null; volume: string | null; issue: string | null; pages: string | null; doi: string | null; abstract: string | null; url: string | null; docType?: string | null; pubInfo?: PubInfo | null }[]
  >([]);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importFormat, setImportFormat] = useState("");

  // 批量导入：读取题录文件 → 解析 → 展示 → 勾选导入
  const handleImportFile = async (file: File) => {
    setImportLoading(true);
    setImportParsed([]);
    try {
      const text = await file.text();
      const res = await fetch("/api/papers/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      const list = data.papers || [];
      setImportParsed(list);
      setImportFormat(data.format || "");
      setImportSelected(new Set(list.map((_: unknown, i: number) => i)));
      if (list.length === 0) toast.error("未解析到有效文献，请检查文件格式");
    } catch (e) {
      toast.error("解析失败");
    }
    setImportLoading(false);
  };

  const handleConfirmImport = async () => {
    const toImport = importParsed.filter((_, i) => importSelected.has(i));
    if (toImport.length === 0) {
      toast.error("请至少选择一篇");
      return;
    }
    setImportSubmitting(true);
    let ok = 0;
    for (const p of toImport) {
      try {
        const res = await fetch("/api/papers/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: p.title,
            authors: p.authors,
            journal: p.journal,
            year: p.year,
            volume: p.volume,
            issue: p.issue,
            pages: p.pages,
            doi: p.doi,
            abstract: p.abstract,
            url: p.url,
            docType: p.docType || "J",
            pubInfo: p.pubInfo || null,
          }),
        });
        if (res.ok) ok++;
      } catch {
        /* 跳过失败项 */
      }
    }
    setImportSubmitting(false);
    toast.success(`成功导入 ${ok} 篇文献`);
    setShowImportModal(false);
    setImportParsed([]);
    setImportSelected(new Set());
    loadPapers();
  };

  // 编辑文献弹窗状态
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPaperId, setEditingPaperId] = useState<string | null>(null);
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
    filePath: "",
    fileName: "",
    fileSize: 0,
  });
  const [editPdfUploading, setEditPdfUploading] = useState(false);
  const [editPdfSource, setEditPdfSource] = useState("");
  const [editFindingPdf, setEditFindingPdf] = useState(false);
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
    docType: "J",
    publisher: "",
    publishPlace: "",
    institution: "",
  });
  const [pdfUploading, setPdfUploading] = useState(false);
  // 自动查找开放获取 PDF
  const [findingPdf, setFindingPdf] = useState(false);
  const [pdfSource, setPdfSource] = useState("");

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

  // 批量导入 PDF：读取 PDF → 解析元数据 → 预览/编辑 → 勾选导入
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfItems, setPdfItems] = useState<
    Array<{
      originalName: string;
      fileName: string;
      filePath: string;
      fileSize: number;
      title: string | null;
      authors: string[];
      journal: string | null;
      year: number | null;
      volume: string | null;
      issue: string | null;
      pages: string | null;
      doi: string | null;
      abstract: string | null;
      error: string | null;
    }>
  >([]);
  const [pdfSelected, setPdfSelected] = useState<Set<number>>(new Set());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfSubmitting, setPdfSubmitting] = useState(false);

  const handleImportPdf = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPdfLoading(true);
    setPdfItems([]);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await fetch("/api/papers/import-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "PDF 解析失败");
        return;
      }
      const list = data.items || [];
      setPdfItems(list);
      setPdfSelected(new Set(list.map((_: unknown, i: number) => i)));
      if (list.length === 0) toast.error("未识别到有效 PDF");
    } catch {
      toast.error("上传或解析出错");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleConfirmPdfImport = async () => {
    const toImport = pdfItems.filter((_, i) => pdfSelected.has(i));
    if (toImport.length === 0) {
      toast.error("请至少选择一篇");
      return;
    }
    setPdfSubmitting(true);
    let ok = 0;
    let dup = 0;
    for (const p of toImport) {
      try {
        const res = await fetch("/api/papers/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: p.title || p.originalName,
          authors: (p.authors || []).map((a) => a.trim()).filter(Boolean),
          journal: p.journal,
          year: p.year ? Number(p.year) : null,
          volume: p.volume,
          issue: p.issue,
          pages: p.pages,
          doi: p.doi,
          abstract: p.abstract,
          filePath: p.filePath,
          fileName: p.originalName,
          fileSize: p.fileSize,
          docType: "J",
          pubInfo: null,
        }),
        });
        if (res.ok) ok++;
        else {
          const d = await res.json().catch(() => ({}));
          if (/unique|doi/i.test(d.error || "")) dup++;
        }
      } catch {
        /* 跳过失败项 */
      }
    }
    setPdfSubmitting(false);
    toast.success(`成功导入 ${ok} 篇${dup ? `，${dup} 篇因 DOI 重复跳过` : ""}`);
    setShowPdfModal(false);
    setPdfItems([]);
    setPdfSelected(new Set());
    loadPapers();
  };

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

  // 全文检索：全文模式下按关键词拉取正文命中结果
  useEffect(() => {
    if (!fulltextMode || !debouncedSearch.trim()) {
      setFulltextResults([]);
      return;
    }
    let cancelled = false;
    setFulltextLoading(true);
    fetch(`/api/papers/fulltext?q=${encodeURIComponent(debouncedSearch.trim())}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setFulltextResults(d.results || []);
      })
      .catch(() => {
        if (!cancelled) setFulltextResults([]);
      })
      .finally(() => {
        if (!cancelled) setFulltextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fulltextMode, debouncedSearch]);

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
      setPdfSource("");
      toast.success("PDF 上传成功");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "PDF 上传失败";
      toast.error(msg);
    }
    setPdfUploading(false);
  };

  // 自动查找开放获取 PDF —— 仅覆盖 arXiv / Europe PMC 等 OA 源，
  // 订阅制期刊与中文数据库查不到属正常，此时保留手动上传通道。
  const handleFindPdf = async () => {
    const doi = (formData.doi || newPaperDoi).trim();
    const title = formData.title.trim();
    if (!doi && !title) {
      toast.error("请先填写 DOI 或标题");
      return;
    }
    setFindingPdf(true);
    const tid = toast.loading("正在检索开放获取版本…");
    try {
      const res = await fetch("/api/papers/find-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi: doi || undefined, title: title || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查找失败");

      if (!data.found) {
        toast.error(data.reason || "未找到开放获取版本", { id: tid, duration: 6000 });
        setFindingPdf(false);
        return;
      }

      setFormData((prev) => ({
        ...prev,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
      }));
      const SOURCE_LABEL: Record<string, string> = {
        arxiv: "arXiv",
        europepmc: "Europe PMC",
        "semantic-scholar": "Semantic Scholar",
      };
      setPdfSource(SOURCE_LABEL[data.source] || data.source);
      toast.success(
        `已从 ${SOURCE_LABEL[data.source] || data.source} 获取 PDF（${(data.fileSize / 1024 / 1024).toFixed(1)}MB）`,
        { id: tid },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "查找 PDF 失败";
      toast.error(msg, { id: tid });
    }
    setFindingPdf(false);
  };

  // 编辑弹窗：上传 PDF
  const handleEditPdfUpload = async (file: File) => {
    setEditPdfUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("上传失败");
      const data = await res.json();
      setEditForm((prev) => ({
        ...prev,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
      }));
      setEditPdfSource("");
      toast.success("PDF 已更新");
    } catch {
      toast.error("PDF 上传失败");
    }
    setEditPdfUploading(false);
  };

  // 编辑弹窗：自动查找 PDF
  const handleEditFindPdf = async () => {
    const doi = editForm.doi.trim();
    const title = editForm.title.trim();
    if (!doi && !title) {
      toast.error("请先填写 DOI 或标题");
      return;
    }
    setEditFindingPdf(true);
    const tid = toast.loading("正在检索开放获取版本…");
    try {
      const res = await fetch("/api/papers/find-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi: doi || undefined, title: title || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查找失败");

      if (!data.found) {
        toast.error(data.reason || "未找到开放获取版本", { id: tid, duration: 6000 });
        setEditFindingPdf(false);
        return;
      }

      setEditForm((prev) => ({
        ...prev,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
      }));
      const SOURCE_LABEL: Record<string, string> = {
        arxiv: "arXiv",
        europepmc: "Europe PMC",
        "semantic-scholar": "Semantic Scholar",
      };
      setEditPdfSource(SOURCE_LABEL[data.source] || data.source);
      toast.success(
        `已从 ${SOURCE_LABEL[data.source] || data.source} 获取 PDF（${(data.fileSize / 1024 / 1024).toFixed(1)}MB）`,
        { id: tid },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "查找 PDF 失败";
      toast.error(msg, { id: tid });
    }
    setEditFindingPdf(false);
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
          docType: formData.docType || "J",
          pubInfo:
            formData.publisher || formData.publishPlace || formData.institution
              ? JSON.stringify({
                  publisher: formData.publisher || null,
                  publishPlace: formData.publishPlace || null,
                  institution: formData.institution || null,
                })
              : null,
        }),
      });
      if (res.ok) {
        const created = await res.json().catch(() => ({}));
        if (created?.indexedChars > 0) {
          toast.success(
            `文献添加成功，已索引全文 ${created.indexedChars.toLocaleString()} 字`,
          );
        } else if (formData.filePath) {
          // 有 PDF 却没索引出内容：多为扫描件（图片型 PDF），需要 OCR
          toast.success("文献添加成功，但未能提取全文（可能是扫描件）");
        } else {
          toast.success("文献添加成功！");
        }
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
    setFormData({ title: "", authors: "", journal: "", year: "", doi: "", abstract: "", filePath: "", fileName: "", fileSize: 0, docType: "J", publisher: "", publishPlace: "", institution: "" });
    setPdfSource("");
  };

  // 编辑文献：打开弹窗并预填当前行数据
  const startRowEdit = (p: Paper) => {
    const parseArrToStr = (str: string | null | undefined): string => {
      if (!str) return "";
      try {
        return JSON.parse(str).join(", ");
      } catch {
        return str;
      }
    };
    setEditForm({
      title: p.title,
      authors: parseArrToStr(p.authors),
      journal: p.journal || "",
      year: p.year?.toString() || "",
      volume: p.volume || "",
      issue: p.issue || "",
      pages: p.pages || "",
      doi: p.doi || "",
      abstract: p.abstract || "",
      keywords: parseArrToStr(p.keywords),
      filePath: p.filePath || "",
      fileName: p.fileName || (p.filePath ? p.filePath.split("/").pop() || "" : ""),
      fileSize: p.fileSize || 0,
    });
    setEditingPaperId(p.id);
    setEditPdfSource("");
    setShowEditModal(true);
  };

  // 编辑文献：保存（复用详情页同款 PUT 逻辑）
  const handleSaveRowEdit = async () => {
    if (!editingPaperId) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/papers/${editingPaperId}`, {
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
          filePath: editForm.filePath || null,
          fileName: editForm.fileName || null,
          fileSize: editForm.fileSize || null,
        }),
      });
      if (res.ok) {
        toast.success("文献信息已更新");
        setShowEditModal(false);
        setEditingPaperId(null);
        loadPapers();
      } else {
        toast.error("保存失败");
      }
    } catch (e) {
      toast.error("保存失败");
    }
    setSavingEdit(false);
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
            docType: p.docType || "J",
            pubInfo: p.pubInfo || null,
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">文献管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">共 {total} 篇文献</p>
        </div>
        {/* 操作按钮组：右对齐、统一高度、主次分明 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              resetForm();
              setShowNewModal(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            添加文献
          </button>
          <span className="w-px h-5 bg-border" aria-hidden />
          <button
            onClick={() => {
              setImportParsed([]);
              setImportSelected(new Set());
              setImportFormat("");
              setShowImportModal(true);
            }}
            title="从 BibTeX / RIS / EndNote 导入文献"
            className="inline-flex items-center gap-1.5 h-9 px-3 border rounded-lg text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap"
          >
            <FileUp className="h-4 w-4 text-muted-foreground" />
            导入文献
          </button>
          <button
            onClick={() => {
              setPdfItems([]);
              setPdfSelected(new Set());
              setShowPdfModal(true);
            }}
            title="批量导入 PDF，自动识别标题/作者/期刊/年份"
            className="inline-flex items-center gap-1.5 h-9 px-3 border rounded-lg text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap"
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
            导入 PDF
          </button>
        </div>
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
            placeholder={fulltextMode ? "搜索文献正文..." : "搜索文献..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-16 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {/* 全文模式切换 */}
          <button
            onClick={() => setFulltextMode((v) => !v)}
            title="切换为「搜索正文」模式"
            className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center px-1.5 h-5 rounded text-[11px] font-medium transition-colors ${
              fulltextMode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            全文
          </button>

          {/* 全文检索结果下拉面板 */}
          {fulltextMode && debouncedSearch.trim() && (
            <div className="absolute top-11 left-0 right-0 z-50 rounded-md border bg-popover shadow-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              {fulltextLoading ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  检索正文中...
                </div>
              ) : fulltextResults.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  正文未命中「{debouncedSearch.trim()}」
                </div>
              ) : (
                <ul className="divide-y">
                  {fulltextResults.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={r.url}
                        className="block px-3 py-2.5 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{r.title}</span>
                          <span
                            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                              r.matchIn === "fulltext"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {r.matchIn === "fulltext" ? "正文" : "摘要"}
                          </span>
                        </div>
                        {r.subtitle && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {r.subtitle}
                          </p>
                        )}
                        {r.snippet && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {r.snippet}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
                      <button
                        onClick={() => startRowEdit(paper)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                        title="编辑"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
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
                    <label className="text-sm font-medium">文献类型（GB/T 7714）</label>
                    <select
                      value={formData.docType}
                      onChange={(e) => setFormData({ ...formData, docType: e.target.value })}
                      className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {DOC_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {formData.docType !== "J" && formData.docType !== "N" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">
                          {formData.docType === "D" ? "学位授予单位" : "出版者"}
                        </label>
                        <input
                          value={formData.docType === "D" ? formData.institution : formData.publisher}
                          onChange={(e) =>
                            setFormData(
                              formData.docType === "D"
                                ? { ...formData, institution: e.target.value }
                                : { ...formData, publisher: e.target.value }
                            )
                          }
                          placeholder={formData.docType === "D" ? "如：清华大学" : "如：科学出版社"}
                          className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">出版地</label>
                        <input
                          value={formData.publishPlace}
                          onChange={(e) => setFormData({ ...formData, publishPlace: e.target.value })}
                          placeholder="如：北京"
                          className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                  )}
                  {(formData.docType === "J" || formData.docType === "N") && (
                    <div>
                      <label className="text-sm font-medium">
                        {formData.docType === "N" ? "报纸名" : "期刊"}
                      </label>
                      <input
                        value={formData.journal}
                        onChange={(e) => setFormData({ ...formData, journal: e.target.value })}
                        className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}
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
                        <FileText className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-xs text-green-700 flex-1 truncate">{formData.fileName}</span>
                        {pdfSource && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200 shrink-0">
                            来自 {pdfSource}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, fileName: "", filePath: "", fileSize: 0 });
                            setPdfSource("");
                          }}
                          className="p-1 rounded hover:bg-green-100 shrink-0"
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

                    {!formData.fileName && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={handleFindPdf}
                          disabled={findingPdf || pdfUploading}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-input text-xs hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {findingPdf ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              检索中，最长约 2 分钟…
                            </>
                          ) : (
                            <>
                              <Search className="h-3.5 w-3.5" />
                              按 DOI / 标题自动查找 PDF
                            </>
                          )}
                        </button>
                        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                          仅检索 arXiv、Europe PMC 等开放获取来源；订阅制期刊与中文数据库需手动上传。
                        </p>
                      </div>
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

      {/* 编辑文献弹窗 */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-background rounded-xl shadow-xl border w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-background z-10">
              <h3 className="text-base font-semibold">编辑文献</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
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

              {/* PDF 文件区 */}
              <div>
                <label className="text-sm font-medium mb-1 flex items-center gap-1.5">
                  <FileUp className="h-3.5 w-3.5 text-muted-foreground" />
                  PDF 文件（可选）
                </label>
                {editForm.fileName ? (
                  <div className="flex items-center gap-2 mt-1 p-2 rounded-lg border bg-green-50 border-green-200">
                    <FileText className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-xs text-green-700 flex-1 truncate">{editForm.fileName}</span>
                    {editPdfSource && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200 shrink-0">
                        来自 {editPdfSource}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditForm((prev) => ({ ...prev, fileName: "", filePath: "", fileSize: 0 }));
                        setEditPdfSource("");
                      }}
                      className="p-1 rounded hover:bg-green-100 shrink-0"
                    >
                      <X className="h-3.5 w-3.5 text-green-600" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center mt-1 h-20 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-colors">
                    {editPdfUploading ? (
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
                      disabled={editPdfUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleEditPdfUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}

                {!editForm.fileName && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleEditFindPdf}
                      disabled={editFindingPdf || editPdfUploading}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-input text-xs hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {editFindingPdf ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          检索中，最长约 2 分钟…
                        </>
                      ) : (
                        <>
                          <Search className="h-3.5 w-3.5" />
                          按 DOI / 标题自动查找 PDF
                        </>
                      )}
                    </button>
                    <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                      仅检索 arXiv、Europe PMC 等开放获取来源；订阅制期刊与中文数据库需手动上传。
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 h-9 text-sm rounded-lg border hover:bg-muted transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveRowEdit}
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

      {/* 批量导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-xl border bg-card flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold">批量导入文献</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {importParsed.length === 0 ? (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-10 cursor-pointer hover:bg-muted/40 transition-colors">
                  <FileUp className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    选择 BibTeX / RIS / EndNote 文件
                  </span>
                  <span className="text-xs text-muted-foreground/70">
                    支持 .bib .ris .enw .txt .xml
                  </span>
                  <input
                    type="file"
                    accept=".bib,.ris,.enw,.txt,.xml,application/x-bibtex,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      解析到 {importParsed.length} 篇（格式：
                      {importFormat.toUpperCase()}）
                    </span>
                    <button
                      onClick={() =>
                        setImportSelected(
                          new Set(importParsed.map((_, i) => i)),
                        )
                      }
                      className="text-xs text-primary hover:underline"
                    >
                      全选
                    </button>
                  </div>
                  <ul className="divide-y border rounded-lg max-h-72 overflow-y-auto">
                    {importParsed.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={importSelected.has(i)}
                          onChange={(e) => {
                            const next = new Set(importSelected);
                            if (e.target.checked) next.add(i);
                            else next.delete(i);
                            setImportSelected(next);
                          }}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {(p.authors || []).slice(0, 3).join(", ")}
                            {p.journal ? ` · ${p.journal}` : ""}
                            {p.year ? ` (${p.year})` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      setImportParsed([]);
                      setImportSelected(new Set());
                      setImportFormat("");
                    }}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    重新选择文件
                  </button>
                </>
              )}
            </div>

            {importParsed.length > 0 && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 h-9 text-sm rounded-lg border hover:bg-muted transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importSubmitting || importSelected.size === 0}
                  className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {importSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="h-4 w-4" />
                  )}
                  导入选中（{importSelected.size}）
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 批量导入 PDF 弹窗 */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl border bg-card shadow-xl flex flex-col">
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
                  <Upload className="h-4 w-4" />
                </span>
                批量导入 PDF 文献
              </h2>
              <button
                onClick={() => setShowPdfModal(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 主体 */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {pdfItems.length === 0 ? (
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.length)
                      handleImportPdf(e.dataTransfer.files);
                  }}
                  className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-14 cursor-pointer transition-colors ${
                    pdfLoading
                      ? "border-primary/40 bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5"
                  }`}
                >
                  <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted text-muted-foreground">
                    <Upload className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-medium">
                    {pdfLoading ? "正在解析…" : "点击选择，或将 PDF 拖拽到此处"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    自动识别 标题 / 作者 / 期刊 / 年份，支持一次多选多个文件
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="hidden"
                    disabled={pdfLoading}
                    onChange={(e) => {
                      handleImportPdf(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : (
                <>
                  {/* 工具栏 */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      已解析 <b className="text-foreground">{pdfItems.length}</b> 篇 PDF
                      <span className="ml-2 text-xs">
                        已选 <b className="text-primary">{pdfSelected.size}</b>
                      </span>
                    </span>
                    <button
                      onClick={() =>
                        setPdfSelected(
                          pdfSelected.size === pdfItems.length
                            ? new Set()
                            : new Set(pdfItems.map((_, i) => i)),
                        )
                      }
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {pdfSelected.size === pdfItems.length ? "取消全选" : "全选"}
                    </button>
                  </div>

                  {/* 卡片列表 */}
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {pdfItems.map((p, i) => {
                      const detected =
                        !!(p.title && p.authors?.length && p.journal && p.year);
                      const selected = pdfSelected.has(i);
                      return (
                        <div
                          key={i}
                          className={`rounded-xl border p-3.5 transition-all ${
                            selected
                              ? "border-primary ring-1 ring-primary/30 bg-primary/[0.03]"
                              : "border-muted-foreground/15 bg-background hover:border-primary/30"
                          }`}
                        >
                          {/* 卡片头：文件名 + 识别状态 */}
                          <div className="flex items-center gap-2 mb-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => {
                                const next = new Set(pdfSelected);
                                if (e.target.checked) next.add(i);
                                else next.delete(i);
                                setPdfSelected(next);
                              }}
                              className="mt-0.5 accent-primary"
                            />
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span
                              className="text-xs text-muted-foreground truncate flex-1"
                              title={p.originalName}
                            >
                              {p.originalName}
                            </span>
                            {p.error ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 shrink-0">
                                解析异常
                              </span>
                            ) : detected ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                                已识别
                              </span>
                            ) : (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                                待核对
                              </span>
                            )}
                          </div>

                          {/* 可编辑字段 */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-6">
                            <div className="sm:col-span-2">
                              <label className="text-[11px] text-muted-foreground">标题</label>
                              <input
                                value={p.title || ""}
                                onChange={(e) => {
                                  const n = [...pdfItems];
                                  n[i] = { ...n[i], title: e.target.value };
                                  setPdfItems(n);
                                }}
                                className="w-full border border-muted-foreground/20 rounded-md px-2.5 py-1.5 text-sm bg-background focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition"
                                placeholder="未能识别，请手填"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-[11px] text-muted-foreground">
                                作者（逗号或 “and” 分隔）
                              </label>
                              <input
                                value={(p.authors || []).join(", ")}
                                onChange={(e) => {
                                  const n = [...pdfItems];
                                  n[i] = {
                                    ...n[i],
                                    authors: e.target.value
                                      .split(/,| and /i)
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  };
                                  setPdfItems(n);
                                }}
                                className="w-full border border-muted-foreground/20 rounded-md px-2.5 py-1.5 text-sm bg-background focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition"
                                placeholder="未能识别，请手填"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground">期刊</label>
                              <input
                                value={p.journal || ""}
                                onChange={(e) => {
                                  const n = [...pdfItems];
                                  n[i] = { ...n[i], journal: e.target.value };
                                  setPdfItems(n);
                                }}
                                className="w-full border border-muted-foreground/20 rounded-md px-2.5 py-1.5 text-sm bg-background focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground">年份</label>
                              <input
                                value={p.year ?? ""}
                                onChange={(e) => {
                                  const n = [...pdfItems];
                                  n[i] = {
                                    ...n[i],
                                    year: e.target.value ? Number(e.target.value) : null,
                                  };
                                  setPdfItems(n);
                                }}
                                className="w-full border border-muted-foreground/20 rounded-md px-2.5 py-1.5 text-sm bg-background focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition"
                                inputMode="numeric"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground">卷</label>
                              <input
                                value={p.volume || ""}
                                onChange={(e) => {
                                  const n = [...pdfItems];
                                  n[i] = { ...n[i], volume: e.target.value };
                                  setPdfItems(n);
                                }}
                                className="w-full border border-muted-foreground/20 rounded-md px-2.5 py-1.5 text-sm bg-background focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground">页</label>
                              <input
                                value={p.pages || ""}
                                onChange={(e) => {
                                  const n = [...pdfItems];
                                  n[i] = { ...n[i], pages: e.target.value };
                                  setPdfItems(n);
                                }}
                                className="w-full border border-muted-foreground/20 rounded-md px-2.5 py-1.5 text-sm bg-background focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition"
                              />
                            </div>
                          </div>

                          {/* 底部元信息 */}
                          {p.doi && (
                            <div className="mt-2.5 pl-6 text-[11px] text-muted-foreground truncate">
                              DOI {p.doi}
                            </div>
                          )}
                          {p.error && (
                            <div className="mt-1.5 pl-6 text-[11px] text-red-600">
                              解析异常：{p.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => {
                      setPdfItems([]);
                      setPdfSelected(new Set());
                    }}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    重新选择文件
                  </button>
                </>
              )}
            </div>

            {/* 底部操作 */}
            {pdfItems.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-5 py-4 border-t bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  将导入 <b className="text-foreground">{pdfSelected.size}</b> / {pdfItems.length} 篇
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPdfModal(false)}
                    className="px-4 h-9 text-sm rounded-lg border hover:bg-muted transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmPdfImport}
                    disabled={pdfSubmitting || pdfSelected.size === 0}
                    className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {pdfSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    导入选中（{pdfSelected.size}）
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
