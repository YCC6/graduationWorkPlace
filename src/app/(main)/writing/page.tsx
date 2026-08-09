"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  BookOpen,
  GraduationCap,
  FileCheck,
  ClipboardList,
  Target,
  TrendingUp,
  Calendar,
  Clock,
  Loader2,
  Gauge,
  BarChart3,
  PenTool,
  ChevronRight,
  ChevronDown,
  Trash2,
} from "lucide-react";

interface DocType {
  id: string;
  title: string;
  type: string;
  status: string;
  description: string | null;
  targetWordCount: number;
  currentWordCount: number;
  project: { id: string; name: string } | null;
  _count: { chapters: number; versions: number };
  updatedAt: string;
}

interface Goal {
  id: string;
  type: string;
  targetWords: number;
  achievedWords: number;
  date: string;
}

const TYPE_ICONS: Record<string, any> = {
  paper: FileText,
  thesis: GraduationCap,
  report: ClipboardList,
  proposal: FileCheck,
};

const TYPE_LABELS: Record<string, string> = {
  paper: "期刊论文",
  thesis: "学位论文",
  report: "研究报告",
  proposal: "开题报告",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  writing: "写作中",
  revising: "修改中",
  submitted: "已投稿",
  published: "已发表",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  writing: "bg-blue-100 text-blue-700",
  revising: "bg-yellow-100 text-yellow-700",
  submitted: "bg-green-100 text-green-700",
  published: "bg-purple-100 text-purple-700",
};

export default function WritingPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocType[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showGoalPanel, setShowGoalPanel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    type: "paper",
    description: "",
    targetWordCount: 5000,
  });

  const loadData = useCallback(async () => {
    try {
      const [docsRes, goalsRes] = await Promise.all([
        fetch("/api/documents"),
        fetch("/api/goals"),
      ]);
      const docsData = await docsRes.json();
      const goalsData = await goalsRes.json();
      setDocs(docsData);
      setGoals(goalsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 全局统计
  const totalWritingWords = docs.reduce((s, d) => s + d.currentWordCount, 0);
  const totalTargetWords = docs.reduce((s, d) => s + d.targetWordCount, 0);
  const activeDocs = docs.filter((d) => d.status !== "published" && d.status !== "submitted");

  // 今日目标
  const today = new Date().toISOString().slice(0, 10);
  const todayGoal = goals.find((g) => g.date === today && g.type === "daily");
  const todayAchieved = todayGoal?.achievedWords || 0;
  const todayTarget = todayGoal?.targetWords || 500;

  // 近7天记录
  const last7Days: { date: string; words: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const g = goals.find((g) => g.date === ds && g.type === "daily");
    last7Days.push({ date: ds, words: g?.achievedWords || 0 });
  }
  const maxDaily = Math.max(...last7Days.map((d) => d.words), todayTarget);

  const createDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, autoChapters: true }),
      });
      if (res.ok) {
        setShowNewModal(false);
        setFormData({ title: "", type: "paper", description: "", targetWordCount: 5000 });
        loadData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDoc = async (id: string, title: string) => {
    if (!confirm(`确定删除文档「${title}」？此操作不可恢复。`)) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    loadData();
  };

  // 快速开始写作（跳转到编辑器）
  const startWriting = (docId: string) => {
    router.push(`/writing/${docId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">写作工坊</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Phase 4 · 论文写作 · 字数追踪 · 版本管理</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGoalPanel(!showGoalPanel)}
            className="inline-flex items-center gap-1.5 px-3 h-9 border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            <Target className="h-4 w-4" />
            写作目标
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            新建文档
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PenTool className="h-4 w-4" />
            活跃文档
          </div>
          <p className="text-2xl font-semibold">{activeDocs.length}</p>
          <p className="text-xs text-muted-foreground">共 {docs.length} 篇</p>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
            总字数
          </div>
          <p className="text-2xl font-semibold">{totalWritingWords.toLocaleString()}</p>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${totalTargetWords ? Math.min(100, (totalWritingWords / totalTargetWords) * 100) : 0}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{totalTargetWords.toLocaleString()}</span>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4" />
            今日目标
          </div>
          <p className="text-2xl font-semibold">{todayAchieved.toLocaleString()}</p>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${todayAchieved >= todayTarget ? "bg-green-500" : "bg-amber-500"}`}
                style={{ width: `${Math.min(100, (todayAchieved / todayTarget) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {todayAchieved >= todayTarget ? "已完成" : `${todayTarget.toLocaleString()}`}
            </span>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gauge className="h-4 w-4" />
            今日完成度
          </div>
          <p className="text-2xl font-semibold">
            {Math.round(Math.min(100, (todayAchieved / Math.max(1, todayTarget)) * 100))}%
          </p>
          <p className="text-xs text-muted-foreground">
            {todayAchieved >= todayTarget ? "🎉 目标达成" : `还差 ${(todayTarget - todayAchieved).toLocaleString()} 字`}
          </p>
        </div>
      </div>

      {/* 写作目标面板 */}
      {showGoalPanel && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">写作目标</h2>
            <TodayGoalForm onUpdate={loadData} currentTarget={todayTarget} />
          </div>

          {/* 近7天趋势 */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">近 7 天每日字数</p>
            <div className="flex items-end gap-2 h-24">
              {last7Days.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {d.words > 0 ? d.words.toLocaleString() : "-"}
                  </span>
                  <div
                    className="w-full rounded-t-sm bg-blue-200 transition-all min-h-[4px]"
                    style={{
                      height: `${maxDaily ? (d.words / maxDaily) * 100 * 0.6 : 0}%`,
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {d.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 快速类型入口 */}
      <div className="grid grid-cols-4 gap-3">
        {(["paper", "thesis", "report", "proposal"] as const).map((type) => {
          const Icon = TYPE_ICONS[type];
          const count = docs.filter((d) => d.type === type).length;
          return (
            <button
              key={type}
              onClick={() => {
                setFormData({ ...formData, type });
                setShowNewModal(true);
              }}
              className="flex items-center gap-3 p-3 rounded-xl border hover:border-primary/50 hover:bg-muted/50 transition-all group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">{TYPE_LABELS[type]}</p>
                <p className="text-xs text-muted-foreground">{count} 篇</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 文档列表 */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          全部文档
        </h2>
        {docs.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground border rounded-xl">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">还没有文档</p>
            <p className="text-xs mt-1">点击「新建文档」开始写作</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => {
              const Icon = TYPE_ICONS[doc.type] || FileText;
              const progress = doc.targetWordCount
                ? Math.min(100, Math.round((doc.currentWordCount / doc.targetWordCount) * 100))
                : 0;
              const updatedFs = new Date(doc.updatedAt);
              const timeAgo = getTimeAgo(updatedFs);

              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 p-4 rounded-xl border hover:border-primary/30 transition-all group cursor-pointer"
                  onClick={() => startWriting(doc.id)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[doc.status]}`}>
                        {STATUS_LABELS[doc.status]}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {TYPE_LABELS[doc.type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{doc.currentWordCount.toLocaleString()} / {doc.targetWordCount.toLocaleString()} 字</span>
                      <span>{doc._count.chapters} 章</span>
                      <span>{doc._count.versions} 个版本</span>
                      {doc.project && <span>关联: {doc.project.name}</span>}
                      <span>更新于 {timeAgo}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progress >= 100 ? "bg-green-500" : doc.status === "published" ? "bg-purple-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteDoc(doc.id, doc.title);
                    }}
                    className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 新建文档弹窗 */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNewModal(false)}>
          <div
            className="bg-background rounded-xl border shadow-xl w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">新建文档</h2>
            <form onSubmit={createDoc} className="space-y-4">
              <div>
                <label className="text-sm font-medium">文档标题 *</label>
                <input
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="输入文章标题..."
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">类型</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="paper">期刊论文</option>
                    <option value="thesis">学位论文</option>
                    <option value="report">研究报告</option>
                    <option value="proposal">开题报告</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">目标字数</label>
                  <input
                    type="number"
                    value={formData.targetWordCount}
                    onChange={(e) => setFormData({ ...formData, targetWordCount: parseInt(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">描述（可选）</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 h-9 border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  创建文档
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 今日目标设置组件
function TodayGoalForm({ onUpdate, currentTarget }: { onUpdate: () => void; currentTarget: number }) {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(currentTarget);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "daily", targetWords: target, date: today }),
    });
    setSaving(false);
    setEditing(false);
    onUpdate();
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-primary hover:underline"
      >
        设置每日目标 ({currentTarget} 字)
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={target}
        onChange={(e) => setTarget(parseInt(e.target.value) || 0)}
        className="w-20 px-2 py-1 border rounded text-sm"
      />
      <button
        onClick={save}
        disabled={saving}
        className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        {saving ? "..." : "保存"}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:underline">取消</button>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString("zh-CN");
}
