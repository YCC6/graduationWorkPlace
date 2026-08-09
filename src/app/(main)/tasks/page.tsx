"use client";

import { useState, useEffect } from "react";
import { CheckSquare, Plus, Clock, Loader2, Check, Circle, Trash2, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  project?: { id: string; name: string } | null;
}

const PRIORITY_LABELS: Record<string, string> = { urgent: "紧急", high: "高", medium: "中", low: "低" };
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-50",
  high: "text-orange-600 bg-orange-50",
  medium: "text-blue-600 bg-blue-50",
  low: "text-gray-500 bg-gray-100",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formPriority, setFormPriority] = useState("medium");
  const [formDueDate, setFormDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      setTasks(await res.json());
    } catch {
      toast.error("加载任务失败");
    }
    setLoading(false);
  };

  useEffect(() => { loadTasks(); }, []);

  const toggleTask = async (task: Task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    });
    loadTasks();
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          priority: formPriority,
          dueDate: formDueDate || null,
        }),
      });
      if (res.ok) {
        toast.success("任务已创建");
        setShowNewModal(false);
        setFormTitle("");
        setFormDueDate("");
        loadTasks();
        window.dispatchEvent(new Event("counts-changed"));
      } else {
        toast.error("创建失败");
      }
    } catch {
      toast.error("创建失败");
    }
    setSubmitting(false);
  };

  const deleteTask = async (id: string) => {
    if (!confirm("确定删除此任务？")) return;
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    toast.success("已删除");
    loadTasks();
    window.dispatchEvent(new Event("counts-changed"));
  };

  const todoTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">任务中心</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {todoTasks.length} 个待办 · {doneTasks.length} 个已完成
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新建任务
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 待办 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              待办 ({todoTasks.length})
            </h3>
            {todoTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
                暂无待办任务
              </p>
            ) : (
              todoTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors group"
                >
                  <button onClick={() => toggleTask(task)} className="shrink-0">
                    <Circle className="h-5 w-5 text-muted-foreground/40 hover:text-primary transition-colors" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{task.title}</p>
                    {task.project && (
                      <p className="text-xs text-muted-foreground mt-0.5">{task.project.name}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLORS[task.priority]}`}>
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                  {task.dueDate && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3" />
                      {formatDate(task.dueDate, "short")}
                    </span>
                  )}
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* 已完成 */}
          {doneTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                已完成 ({doneTasks.length})
              </h3>
              {doneTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-muted bg-muted/20 opacity-60 hover:opacity-80 transition-opacity group"
                >
                  <button onClick={() => toggleTask(task)} className="shrink-0">
                    <Check className="h-5 w-5 text-green-500" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-through">{task.title}</p>
                  </div>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 新建任务弹窗 */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewModal(false)}>
          <div className="bg-background rounded-xl shadow-xl border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-base font-semibold">新建任务</h3>
              <button onClick={() => setShowNewModal(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={createTask} className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium">任务标题 *</label>
                <input
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="例如: 完成实验数据整理"
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">优先级</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">紧急</option>
                    <option value="low">低</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">截止日期</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNewModal(false)} className="px-4 h-9 text-sm rounded-lg border hover:bg-muted">
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formTitle.trim()}
                  className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
