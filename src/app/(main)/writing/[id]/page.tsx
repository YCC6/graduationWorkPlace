"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  GripVertical,
  Clock,
  FileText,
  BookOpen,
  Quote,
  Layers,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  PenTool,
  Hash,
  Eye,
  Edit3,
  Download,
  Columns,
  MoreHorizontal,
} from "lucide-react";
import toast from "react-hot-toast";

interface Chapter {
  id: string;
  documentId: string;
  title: string;
  content: string;
  order: number;
  wordCount: number;
  updatedAt?: string;
}

interface Document {
  id: string;
  title: string;
  type: string;
  status: string;
  description: string | null;
  targetWordCount: number;
  project: { id: string; name: string } | null;
  chapters: Chapter[];
  versions: { id: string; versionName: string; wordCount: number; createdAt: string }[];
}

interface Paper {
  id: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  standardType: string | null;
  standardNumber: string | null;
}

interface ReferenceItem {
  paperId: string;
  index: number;
  citation: string;
  paper: Paper;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", writing: "写作中", revising: "修改中", submitted: "已投稿", published: "已发表",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", writing: "bg-blue-100 text-blue-700",
  revising: "bg-yellow-100 text-yellow-700", submitted: "bg-green-100 text-green-700",
  published: "bg-purple-100 text-purple-700",
};

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params.id as string;

  const [doc, setDoc] = useState<Document | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [showPapers, setShowPapers] = useState(false);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperSearch, setPaperSearch] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editorMode, setEditorMode] = useState<"edit" | "preview" | "split">("edit");
  const [draggedChapterId, setDraggedChapterId] = useState<string | null>(null);
  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null);
  const [showReferences, setShowReferences] = useState(false);
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLTextAreaElement>(null);
  const isSyncingScroll = useRef(false);

  const loadDoc = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const data = await res.json();
      setDoc(data);
      if (data.chapters.length > 0 && !activeChapterId) {
        setActiveChapterId(data.chapters[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [docId, activeChapterId]);

  useEffect(() => { loadDoc(); }, []);

  // 当活跃章节切换时加载内容
  useEffect(() => {
    if (!doc || !activeChapterId) return;
    const ch = doc.chapters.find((c) => c.id === activeChapterId);
    if (ch) {
      setChapterContent(ch.content);
      setChapterTitle(ch.title);
    }
  }, [activeChapterId, doc]);

  // 自动保存（2 秒无输入后触发）
  const autoSave = useCallback((content: string, title: string) => {
    if (!activeChapterId) return;
    setAutoSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        await fetch(`/api/chapters/${activeChapterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, title }),
        });
        setAutoSaveStatus("saved");
        loadDoc(); // 刷新字数统计
      } catch (e) {
        setAutoSaveStatus("unsaved");
      }
    }, 2000);
  }, [activeChapterId, loadDoc]);

  // 保存全文（手动触发：版本快照）
  const saveVersion = async () => {
    setSaving(true);
    const name = `v${doc?.versions.length ? doc.versions.length + 1 : 1} - ${new Date().toLocaleString("zh-CN")}`;
    await fetch("/api/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: docId, versionName: name }),
    });
    setSaving(false);
    loadDoc();
  };

  // 添加新章节
  const addChapter = async () => {
    const res = await fetch(`/api/documents/${docId}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新章节" }),
    });
    if (res.ok) {
      const ch = await res.json();
      await loadDoc();
      setActiveChapterId(ch.id);
    }
  };

  // 删除章节
  const deleteChapter = async (chId: string) => {
    if (!confirm("确定删除此章节？")) return;
    await fetch(`/api/chapters/${chId}`, { method: "DELETE" });
    if (activeChapterId === chId) setActiveChapterId(null);
    loadDoc();
  };

  // 加载文献列表（用于引用插入）
  const loadPapers = async () => {
    try {
      const res = await fetch("/api/papers/list");
      const data = await res.json();
      setPapers(data.papers || []);
      setShowPapers(true);
    } catch (e) {
      console.error(e);
    }
  };

  // 插入引用
  const insertCitation = (paper: Paper) => {
    let ref = "";
    if (paper.standardType && paper.standardNumber) {
      ref = paper.standardNumber;
    } else {
      try {
        const authors = JSON.parse(paper.authors);
        const firstAuthor = authors[0] || "";
        const lastName = firstAuthor.split(" ").pop() || firstAuthor;
        ref = `${lastName}, ${paper.year}`;
      } catch {
        ref = `${paper.title.slice(0, 20)}...`;
      }
    }

    const citation = `[${ref}](ref:${paper.id})`;
    const textarea = editorRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = chapterContent.slice(0, start) + citation + chapterContent.slice(end);
      setChapterContent(newContent);
      autoSave(newContent, chapterTitle);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + citation.length, start + citation.length);
      }, 0);
    }
    setShowPapers(false);
  };

  // 更新文档状态
  const updateStatus = async (status: string) => {
    await fetch(`/api/documents/${docId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadDoc();
  };

  // ====== 章节拖拽排序 ======
  const handleDragStart = (e: React.DragEvent, chId: string) => {
    setDraggedChapterId(chId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, chId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedChapterId && draggedChapterId !== chId) {
      setDragOverChapterId(chId);
    }
  };

  const handleDragEnd = async () => {
    if (!draggedChapterId || !dragOverChapterId || draggedChapterId === dragOverChapterId) {
      setDraggedChapterId(null);
      setDragOverChapterId(null);
      return;
    }

    if (!doc) return;
    const chapters = [...doc.chapters];
    const fromIdx = chapters.findIndex((c) => c.id === draggedChapterId);
    const toIdx = chapters.findIndex((c) => c.id === dragOverChapterId);
    if (fromIdx === -1 || toIdx === -1) return;

    // 重新排序
    const [moved] = chapters.splice(fromIdx, 1);
    chapters.splice(toIdx, 0, moved);

    // 更新 order 字段
    const orders = chapters.map((c, i) => ({ id: c.id, order: i }));

    // 乐观更新 UI
    setDoc({ ...doc, chapters: chapters.map((c, i) => ({ ...c, order: i })) });

    try {
      await fetch(`/api/documents/${docId}/chapters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      toast.success("章节排序已更新");
    } catch {
      toast.error("排序更新失败");
      loadDoc(); // 回滚
    }

    setDraggedChapterId(null);
    setDragOverChapterId(null);
  };

  // ====== 文档导出 ======
  const exportDocument = () => {
    if (!doc) return;

    const chaptersHtml = doc.chapters
      .map((ch) => {
        const chHtml = renderMarkdown(ch.content);
        return `<section><h1>${ch.title}</h1>${chHtml}</section>`;
      })
      .join("\n");

    // 收集参考文献
    const refHtml = references.length > 0
      ? `<section class="references"><h1>参考文献</h1><ol>${references.map((r) => `<li>${r.citation}</li>`).join("")}</ol></section>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${doc.title}</title>
<style>
  body { font-family: "SimSun", "Times New Roman", serif; max-width: 800px; margin: 2em auto; padding: 0 1em; line-height: 1.8; color: #333; }
  h1 { font-size: 1.5em; font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; }
  h2 { font-size: 1.25em; font-weight: bold; margin-top: 1.2em; margin-bottom: 0.4em; }
  h3 { font-size: 1.1em; font-weight: bold; margin-top: 1em; margin-bottom: 0.3em; }
  p { text-indent: 2em; margin-bottom: 0.5em; }
  .doc-title { text-align: center; font-size: 1.75em; font-weight: bold; margin-bottom: 1em; text-indent: 0; }
  .doc-meta { text-align: center; color: #666; margin-bottom: 2em; text-indent: 0; }
  section { page-break-after: auto; }
  .references h1 { font-size: 1.25em; }
  .references ol { padding-left: 2em; }
  .references li { text-indent: 0; margin-bottom: 0.3em; font-size: 0.9em; }
  pre { background: #f5f5f5; padding: 0.5em; border-radius: 4px; overflow-x: auto; }
  code { font-family: "Courier New", monospace; }
  blockquote { border-left: 3px solid #ccc; padding-left: 1em; color: #666; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.3em 0.5em; }
  @media print {
    body { margin: 0; max-width: none; }
    .no-print { display: none; }
    section { page-break-inside: avoid; }
  }
  .toolbar { text-align: center; margin-bottom: 1em; }
  .toolbar button { padding: 0.3em 1em; margin: 0 0.3em; cursor: pointer; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">打印 / 保存为 PDF</button>
    <button onclick="downloadHtml()">下载 HTML</button>
  </div>
  <div class="doc-title">${doc.title}</div>
  <div class="doc-meta">
    ${doc.project ? `项目: ${doc.project.name}<br/>` : ""}
    类型: ${doc.type === "paper" ? "期刊论文" : doc.type === "thesis" ? "学位论文" : doc.type === "report" ? "研究报告" : "开题报告"} |
    字数: ${totalWords.toLocaleString()}
  </div>
  ${chaptersHtml}
  ${refHtml}
<script>
  function downloadHtml() {
    const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '${doc.title}.html';
    a.click();
  }
  // 自动触发打印提示
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 500);
  });
</script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const newWin = window.open(url, "_blank");
    if (!newWin) {
      // 如果弹窗被拦截，直接下载
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.title}.html`;
      a.click();
      toast.success("导出 HTML 已下载");
    } else {
      toast.success("文档已在新窗口打开，可打印或下载");
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // ====== 参考文献自动生成 ======
  const generateReferences = async () => {
    if (!doc) return;
    setLoadingRefs(true);
    try {
      // 扫描所有章节，提取 [xxx](ref:paperId) 格式引用
      const paperIds: string[] = [];
      const seen = new Set<string>();
      const refRegex = /\[([^\]]*)\]\(ref:([^)]+)\)/g;
      for (const ch of doc.chapters) {
        let match;
        while ((match = refRegex.exec(ch.content)) !== null) {
          const pid = match[2];
          if (!seen.has(pid)) {
            seen.add(pid);
            paperIds.push(pid);
          }
        }
      }

      if (paperIds.length === 0) {
        setReferences([]);
        toast("未发现引用文献", { icon: "ℹ️" });
        return;
      }

      // 批量获取文献数据
      const res = await fetch(`/api/papers/list?ids=${paperIds.join(",")}`);
      const data = await res.json();
      const papersMap = new Map<string, Paper>();
      for (const p of data.papers || []) {
        papersMap.set(p.id, p);
      }

      // 按出现顺序生成引用
      const refs: ReferenceItem[] = paperIds.map((pid, i) => {
        const paper = papersMap.get(pid);
        const citation = paper ? generateGBT7714(paper) : `[文献 ${pid} 未找到]`;
        return { paperId: pid, index: i + 1, citation, paper: paper as Paper };
      }).filter((r) => r.paper);

      setReferences(refs);
      toast.success(`已生成 ${refs.length} 篇参考文献`);
    } catch (e) {
      console.error(e);
      toast.error("生成参考文献失败");
    } finally {
      setLoadingRefs(false);
    }
  };

  // 切换参考文献面板时自动生成
  const toggleReferences = () => {
    const next = !showReferences;
    setShowReferences(next);
    if (next && references.length === 0) {
      generateReferences();
    }
  };

  // ====== 分栏滚动同步 ======
  const handleEditorScroll = () => {
    if (editorMode !== "split" || isSyncingScroll.current) return;
    const editor = editorScrollRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;
    isSyncingScroll.current = true;
    const ratio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight || 1);
    requestAnimationFrame(() => { isSyncingScroll.current = false; });
  };

  const handlePreviewScroll = () => {
    if (editorMode !== "split" || isSyncingScroll.current) return;
    const editor = editorScrollRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;
    isSyncingScroll.current = true;
    const ratio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
    editor.scrollTop = ratio * (editor.scrollHeight - editor.clientHeight || 1);
    requestAnimationFrame(() => { isSyncingScroll.current = false; });
  };

  // 总字数
  const totalWords = doc?.chapters.reduce((s, c) => s + c.wordCount, 0) || 0;
  const progress = doc ? Math.min(100, Math.round((totalWords / doc.targetWordCount) * 100)) : 0;

  // 引用文献计数
  const citationCount = doc
    ? doc.chapters.reduce((s, c) => {
        const matches = c.content.match(/\]\(ref:[^)]+\)/g);
        return s + (matches ? matches.length : 0);
      }, 0)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>文档不存在</p>
        <button onClick={() => router.push("/writing")} className="mt-2 text-primary hover:underline text-sm">返回写作中心</button>
      </div>
    );
  }

  const activeChapter = doc.chapters.find((c) => c.id === activeChapterId);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* 左侧章节列表 */}
      <div className="w-56 border-r bg-muted/30 flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <button
            onClick={() => router.push("/writing")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            返回
          </button>
          <h2 className="font-semibold text-sm truncate" title={doc.title}>{doc.title}</h2>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[doc.status]}`}>
              {STATUS_LABELS[doc.status]}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {totalWords.toLocaleString()} / {doc.targetWordCount.toLocaleString()} 字
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 状态切换 */}
          <div className="flex flex-wrap gap-1">
            {(["draft", "writing", "revising", "submitted", "published"] as const).map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${
                  doc.status === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {doc.chapters.map((ch) => (
            <div
              key={ch.id}
              draggable="true"
              onDragStart={(e) => handleDragStart(e, ch.id)}
              onDragOver={(e) => handleDragOver(e, ch.id)}
              onDragEnd={handleDragEnd}
              onClick={() => {
                setActiveChapterId(ch.id);
                setEditorMode("edit");
              }}
              className={`flex items-center gap-1.5 p-2 rounded-lg cursor-pointer transition-colors group ${
                ch.id === activeChapterId
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted text-foreground/80"
              } ${draggedChapterId === ch.id ? "opacity-40" : ""} ${
                dragOverChapterId === ch.id && draggedChapterId !== ch.id ? "border-t-2 border-primary" : ""
              }`}
            >
              <span
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                title="拖拽排序"
              >
                <GripVertical className="h-3 w-3" />
              </span>
              <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">
                {ch.order + 1}
              </span>
              <span className="text-xs truncate flex-1">{ch.title}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {ch.wordCount.toLocaleString()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChapter(ch.id);
                }}
                className="p-0.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                title="删除章节"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-2 border-t">
          <button
            onClick={addChapter}
            className="flex items-center gap-1.5 w-full p-2 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            添加章节
          </button>
        </div>
      </div>

      {/* 中间编辑器 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 工具栏 */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-background">
          {/* 左侧：章节标题 + 状态信息 */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <input
              value={chapterTitle}
              onChange={(e) => {
                setChapterTitle(e.target.value);
                autoSave(chapterContent, e.target.value);
              }}
              className="text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0 min-w-[120px] max-w-[260px] truncate placeholder:text-muted-foreground/50"
              placeholder="章节标题"
              title={chapterTitle}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              <span className="px-1.5 py-0.5 rounded-md bg-muted">
                {activeChapter?.wordCount.toLocaleString() || 0} 字
              </span>
              <span className="flex items-center gap-1" title={autoSaveStatus === "saved" ? "已自动保存" : autoSaveStatus === "saving" ? "保存中..." : "有未保存的更改"}>
                {autoSaveStatus === "saved" && <><Check className="h-3 w-3 text-green-500" />已保存</>}
                {autoSaveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" />保存中</>}
                {autoSaveStatus === "unsaved" && "未保存"}
              </span>
            </div>
          </div>

          {/* 右侧：操作按钮组 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 编辑/预览/分栏 模式切换 */}
            <div className="flex items-center bg-muted/60 rounded-lg p-0.5">
              {[
                { key: "edit", label: "编辑", icon: Edit3 },
                { key: "preview", label: "预览", icon: Eye },
                { key: "split", label: "分栏", icon: Columns },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setEditorMode(key as "edit" | "preview" | "split")}
                  className={`inline-flex items-center gap-1 px-2.5 h-7 text-xs font-medium rounded-md transition-all ${
                    editorMode === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  title={label}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-border mx-1" />

            {/* 文献相关 */}
            <button
              onClick={loadPapers}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="插入引用"
            >
              <Quote className="h-3.5 w-3.5" />
              <span className="hidden md:inline">引用</span>
            </button>
            <button
              onClick={toggleReferences}
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-colors ${
                showReferences
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title="参考文献列表"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden md:inline">参考文献</span>
            </button>

            <div className="w-px h-6 bg-border mx-1" />

            {/* 更多操作 */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={`inline-flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium transition-colors ${
                  showMoreMenu ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title="更多操作"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {showMoreMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMoreMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border bg-background shadow-lg z-50 py-1">
                    <button
                      onClick={() => { exportDocument(); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors"
                    >
                      <Download className="h-3.5 w-3.5 text-muted-foreground" />
                      导出文档
                    </button>
                    <button
                      onClick={() => { saveVersion(); setShowMoreMenu(false); }}
                      disabled={saving}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      保存版本
                    </button>
                    <button
                      onClick={() => { setShowVersions(!showVersions); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      历史版本 ({doc.versions.length})
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 编辑器区域 */}
        <div className="flex-1 flex overflow-hidden">
          {activeChapter ? (
            <>
              {editorMode === "edit" && (
                <textarea
                  ref={editorRef}
                  value={chapterContent}
                  onChange={(e) => {
                    setChapterContent(e.target.value);
                    autoSave(e.target.value, chapterTitle);
                  }}
                  placeholder="开始写作...&#10;&#10;支持 Markdown 语法&#10;支持 LaTeX 公式: $E = mc^2$"
                  className="flex-1 w-full p-6 bg-background text-sm font-mono resize-none focus:outline-none border-0 leading-relaxed overflow-y-auto"
                />
              )}
              {editorMode === "preview" && (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(chapterContent) }} />
                </div>
              )}
              {editorMode === "split" && (
                <>
                  <textarea
                    ref={editorScrollRef}
                    value={chapterContent}
                    onChange={(e) => {
                      setChapterContent(e.target.value);
                      autoSave(e.target.value, chapterTitle);
                    }}
                    onScroll={handleEditorScroll}
                    placeholder="开始写作..."
                    className="w-1/2 p-6 bg-background text-sm font-mono resize-none focus:outline-none border-0 border-r leading-relaxed overflow-y-auto"
                  />
                  <div
                    ref={previewRef}
                    onScroll={handlePreviewScroll}
                    className="w-1/2 overflow-y-auto p-6 bg-muted/20"
                  >
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(chapterContent) }} />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <PenTool className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">选择或创建一个章节开始写作</p>
                <button onClick={addChapter} className="mt-2 text-xs text-primary hover:underline">新建章节</button>
              </div>
            </div>
          )}

          {/* 参考文献面板 */}
          {showReferences && (
            <div className="w-64 border-l bg-muted/30 overflow-y-auto p-3 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold">参考文献</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={generateReferences}
                    disabled={loadingRefs}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                    title="刷新"
                  >
                    {loadingRefs ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={() => setShowReferences(false)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    关闭
                  </button>
                </div>
              </div>
              {references.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {loadingRefs ? "生成中..." : "未发现引用文献。在文中使用 [作者, 年份](ref:文献ID) 格式添加引用。"}
                </p>
              ) : (
                <div className="space-y-2">
                  {references.map((ref) => (
                    <div key={ref.paperId} className="p-2 rounded-lg text-xs border bg-background space-y-1">
                      <div className="flex items-start gap-1.5">
                        <span className="font-semibold text-primary shrink-0">[{ref.index}]</span>
                        <p className="text-foreground/80 leading-relaxed">{ref.citation}</p>
                      </div>
                      {ref.paper.doi && (
                        <a
                          href={`https://doi.org/${ref.paper.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          DOI
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 版本历史面板 */}
          {showVersions && (
            <div className="w-56 border-l bg-muted/30 overflow-y-auto p-3 shrink-0">
              <h3 className="text-xs font-semibold mb-2">版本历史</h3>
              {doc.versions.length === 0 ? (
                <p className="text-xs text-muted-foreground">尚无版本</p>
              ) : (
                <div className="space-y-1.5">
                  {doc.versions.map((v) => (
                    <div key={v.id} className="p-2 rounded-lg text-xs border bg-background space-y-0.5">
                      <p className="font-medium">{v.versionName}</p>
                      <p className="text-muted-foreground">{v.wordCount.toLocaleString()} 字</p>
                      <p className="text-muted-foreground">{new Date(v.createdAt).toLocaleString("zh-CN")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-4 py-1.5 border-t bg-muted/30 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>全文: {totalWords.toLocaleString()} 字</span>
            <span>引用: {references.length || citationCount} 篇文献</span>
            {doc.project && <span>项目: {doc.project.name}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span>{STATUS_LABELS[doc.status]}</span>
            <span>{doc.type === "paper" ? "期刊论文" : doc.type === "thesis" ? "学位论文" : doc.type === "report" ? "研究报告" : "开题报告"}</span>
          </div>
        </div>
      </div>

      {/* 文献引用弹窗 */}
      {showPapers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPapers(false)}>
          <div
            className="bg-background rounded-xl border shadow-xl w-full max-w-xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">插入引用</h3>
                <button onClick={() => setShowPapers(false)} className="text-muted-foreground hover:text-foreground text-xs">关闭</button>
              </div>
              <input
                value={paperSearch}
                onChange={(e) => setPaperSearch(e.target.value)}
                placeholder="搜索文献..."
                className="w-full px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {papers
                .filter((p) => p.title.toLowerCase().includes(paperSearch.toLowerCase()))
                .slice(0, 20)
                .map((paper) => (
                  <button
                    key={paper.id}
                    onClick={() => insertCitation(paper)}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-muted transition-colors space-y-0.5"
                  >
                    <p className="text-xs font-medium line-clamp-1">{paper.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(() => {
                        try { return JSON.parse(paper.authors).slice(0, 3).join(", "); }
                        catch { return paper.authors; }
                      })()}
                      {paper.journal ? ` · ${paper.journal}` : ""}
                      {paper.year ? ` · ${paper.year}` : ""}
                    </p>
                    {paper.standardType && (
                      <p className="text-[10px] text-blue-600">{paper.standardType} {paper.standardNumber}</p>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 简易 Markdown 渲染（粗体/斜体/标题/列表/LaTeX 公式/行内代码/代码块/引用）
function renderMarkdown(md: string): string {
  let html = md
    // 转义 HTML
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // 代码块（优先级最高，在换行替换之前）
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="bg-muted rounded-lg p-3 my-3 overflow-x-auto text-xs font-mono"><code>${code.trim()}</code></pre>`
    )
    // LaTeX 块级公式 $$...$$
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, f) =>
      `<div class="my-3 p-3 bg-muted/50 rounded text-center font-mono text-sm">${f.trim()}</div>`
    )
    // 行内公式 $...$
    .replace(/\$(.*?)\$/g, (_, f) =>
      `<code class="bg-muted/50 px-1 rounded text-xs font-mono">${f}</code>`
    )
    // 标题
    .replace(/^#### (.+)$/gm, "<h4 class='text-sm font-semibold mt-4 mb-1'>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3 class='text-base font-semibold mt-4 mb-2'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class='text-lg font-semibold mt-5 mb-2'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class='text-xl font-bold mt-6 mb-3'>$1</h1>")
    // 粗体/斜体
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // 行内代码
    .replace(/`([^`]+)`/g, "<code class='bg-muted px-1 rounded text-xs font-mono text-red-600'>$1</code>")
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "<img src='$2' alt='$1' class='max-w-full rounded my-2' />")
    // 引用链接 [text](ref:paperId) — 转为上标引用标记
    .replace(/\[([^\]]+)\]\(ref:([^)]+)\)/g, "<sup class='text-primary font-medium'>[$1]</sup>")
    // 普通链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href='$2' class='text-primary underline' target='_blank'>$1</a>")
    // 引用
    .replace(/^> (.+)$/gm, "<blockquote class='border-l-2 border-primary pl-3 py-1 my-2 text-muted-foreground text-sm'>$1</blockquote>")
    // 水平线
    .replace(/^---$/gm, "<hr class='my-4 border-muted'/>")
    // 有序列表
    .replace(/^(\d+)\. (.+)$/gm, "<li class='ml-5 list-decimal text-sm my-0.5'>$2</li>")
    // 无序列表
    .replace(/^- (.+)$/gm, "<li class='ml-5 list-disc text-sm my-0.5'>$1</li>")
    // 表格 (simplified)
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.split("|").filter(Boolean);
      if (cells.every((c) => /^[-:]+$/.test(c.trim()))) return "";
      const isHeader = line.includes("---");
      return `<tr>${cells.map((c) =>
        `<${isHeader ? "th" : "td"} class="border px-2 py-1 text-xs">${c.trim()}</${isHeader ? "th" : "td"}>`
      ).join("")}</tr>`;
    })
    // 段落换行
    .replace(/\n\n/g, "</p><p class='text-sm leading-relaxed mb-2'>")
    .replace(/\n/g, "<br/>");

  return `<p class='text-sm leading-relaxed mb-2'>${html}</p>`;
}

// 生成 GB/T 7714 格式引用（客户端版本）
function generateGBT7714(paper: Paper): string {
  // 标准文献 [S]
  if (paper.standardType && paper.standardNumber) {
    return `${paper.standardNumber} ${paper.title}[S].`;
  }

  let authors: string[] = [];
  try {
    authors = JSON.parse(paper.authors);
  } catch {
    authors = paper.authors.split(",").map((s) => s.trim()).filter(Boolean);
  }

  let citation = "";

  // 作者部分：最多列出 3 人
  if (authors.length > 0) {
    citation += authors.slice(0, 3).join(", ");
    if (authors.length > 3) citation += ", 等";
    citation += ". ";
  }

  // 题名
  citation += `${paper.title}[J]. `;

  // 刊名
  if (paper.journal) {
    citation += `${paper.journal}, `;
  }

  // 年份
  if (paper.year) {
    citation += `${paper.year}`;
  }

  // 卷号(期号)
  if (paper.volume || paper.issue) {
    citation += ", ";
    if (paper.volume) citation += paper.volume;
    if (paper.issue) citation += `(${paper.issue})`;
  }

  // 页码
  if (paper.pages) {
    citation += `: ${paper.pages}`;
  }

  citation += ".";

  return citation;
}
