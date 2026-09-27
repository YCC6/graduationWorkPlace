"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Loader2,
  Check,
  Circle,
  Trash2,
  X,
  Timer,
  Play,
  Pause,
  RotateCcw,
  ListTodo,
  CheckCircle2,
  TrendingUp,
  Search,
  Flame,
  Clock,
  AlertCircle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useSidebar } from "@/components/ui/SidebarContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  project?: { id: string; name: string } | null;
  pomodoroCount: number;
  pomodoroMinutes: number;
}

const PRIORITY_LABELS: Record<string, string> = { urgent: "紧急", high: "高", medium: "中", low: "低" };
const PRIORITY_WEIGHT: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_BAR: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-gray-400",
};
const PRIORITY_CHIP: Record<string, string> = {
  urgent: "bg-red-50 text-red-600 dark:bg-red-500/10",
  high: "bg-orange-50 text-orange-600 dark:bg-orange-500/10",
  medium: "bg-blue-50 text-blue-600 dark:bg-blue-500/10",
  low: "bg-gray-100 text-gray-500 dark:bg-gray-500/10",
};

const DEFAULT_POMODORO_MIN = 25;
const DURATION_OPTIONS = [15, 25, 45];

const isOverdue = (due: string | null, done: boolean) => {
  if (!due || done) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return d < today;
};

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-foreground">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { collapsed } = useSidebar();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState("medium");
  const [formDueDate, setFormDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 筛选
  const [filter, setFilter] = useState<"active" | "done">("active");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  // 番茄钟状态
  const [pomodoroTask, setPomodoroTask] = useState<Task | null>(null);
  const [durationMin, setDurationMin] = useState(DEFAULT_POMODORO_MIN);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_POMODORO_MIN * 60);
  const [isRunning, setIsRunning] = useState(false);
  const completingRef = useRef(false);

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

  // 番茄钟倒计时
  useEffect(() => {
    if (isRunning && pomodoroTask) {
      const t = setInterval(() => {
        setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
      return () => clearInterval(t);
    }
  }, [isRunning, pomodoroTask]);

  // 倒计时归零 -> 自动记录一个番茄钟
  useEffect(() => {
    if (secondsLeft === 0 && isRunning && pomodoroTask && !completingRef.current) {
      completingRef.current = true;
      completePomodoro();
    }
  }, [secondsLeft, isRunning, pomodoroTask]);

  const openPomodoro = (task: Task) => {
    setPomodoroTask(task);
    setDurationMin(DEFAULT_POMODORO_MIN);
    setSecondsLeft(DEFAULT_POMODORO_MIN * 60);
    setIsRunning(true);
    completingRef.current = false;
  };

  const closePomodoro = () => {
    setPomodoroTask(null);
    setIsRunning(false);
    completingRef.current = false;
  };

  const changeDuration = (min: number) => {
    if (isRunning) return;
    setDurationMin(min);
    setSecondsLeft(min * 60);
  };

  const completePomodoro = async () => {
    if (!pomodoroTask) return;
    const newCount = (pomodoroTask.pomodoroCount || 0) + 1;
    const newMinutes = (pomodoroTask.pomodoroMinutes || 0) + durationMin;
    try {
      await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pomodoroTask.id,
          pomodoroCount: newCount,
          pomodoroMinutes: newMinutes,
        }),
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === pomodoroTask.id ? { ...t, pomodoroCount: newCount, pomodoroMinutes: newMinutes } : t
        )
      );
      toast.success(`完成 1 个番茄钟（${durationMin} 分钟）`);
    } catch {
      toast.error("记录番茄钟失败");
    }
    setIsRunning(false);
    setSecondsLeft(durationMin * 60);
    completingRef.current = false;
  };

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
          description: formDescription || null,
          priority: formPriority,
          dueDate: formDueDate || null,
        }),
      });
      if (res.ok) {
        toast.success("任务已创建");
        setShowNewModal(false);
        setFormTitle("");
        setFormDescription("");
        setFormDueDate("");
        setFormPriority("medium");
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

  const totalFocusMinutes = tasks.reduce((sum, t) => sum + (t.pomodoroMinutes || 0), 0);
  const total = tasks.length;
  const completionRate = total > 0 ? Math.round((doneTasks.length / total) * 100) : 0;

  // 应用筛选
  const baseList = filter === "active" ? todoTasks : doneTasks;
  const visibleTasks = baseList
    .filter((t) => (priorityFilter === "all" ? true : t.priority === priorityFilter))
    .filter((t) => (query.trim() ? t.title.toLowerCase().includes(query.trim().toLowerCase()) : true))
    .sort((a, b) => {
      if (filter === "active") {
        const w = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        if (w !== 0) return w;
      }
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  const quickFocusTasks = todoTasks
    .slice()
    .sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority])
    .slice(0, 4);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const totalSec = durationMin * 60;
  const progress = totalSec > 0 ? 1 - secondsLeft / totalSec : 0;
  const RADIUS = 86;
  const CIRC = 2 * Math.PI * RADIUS;
  const OFFSET = CIRC * (1 - progress);

  const FILTER_TABS: { key: "active" | "done"; label: string; count: number }[] = [
    { key: "active", label: "进行中", count: todoTasks.length },
    { key: "done", label: "已完成", count: doneTasks.length },
  ];

  return (
    <div className={cn("space-y-6 p-6", collapsed ? "max-w-none" : "max-w-6xl")}>
      {/* 头部 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">任务中心</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {todoTasks.length} 个进行中 · {doneTasks.length} 个已完成
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          新建任务
        </button>
      </div>

      {/* 统计卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={ListTodo} label="进行中" value={todoTasks.length} tint="bg-orange-500/10 text-orange-500" />
        <StatCard icon={CheckCircle2} label="已完成" value={doneTasks.length} tint="bg-emerald-500/10 text-emerald-500" />
        <StatCard icon={Flame} label="累计专注" value={`${totalFocusMinutes} 分`} tint="bg-rose-500/10 text-rose-500" />
        <StatCard icon={TrendingUp} label="完成率" value={`${completionRate}%`} tint="bg-blue-500/10 text-blue-500" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左侧：任务列表 */}
        <div className="space-y-4 lg:col-span-2">
          {/* 筛选栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === tab.key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      filter === tab.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative w-full max-w-[200px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索任务…"
                className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* 优先级色块 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setPriorityFilter("all")}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                priorityFilter === "all" ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              全部
            </button>
            {(["urgent", "high", "medium", "low"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  priorityFilter === p ? `${PRIORITY_CHIP[p]} ring-1 ring-current` : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_BAR[p]}`} />
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>

          {/* 任务列表 */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <Circle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {filter === "active" ? "暂无进行中的任务，享受片刻清闲 🍵" : "还没有已完成的任务"}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleTasks.map((task) => {
                const done = task.status === "done";
                const overdue = isOverdue(task.dueDate, done);
                return (
                  <div
                    key={task.id}
                    className={`group relative overflow-hidden rounded-xl border bg-card p-3.5 pl-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md ${
                      done ? "opacity-60 hover:opacity-90" : ""
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${
                        done ? "bg-gray-300 dark:bg-gray-600" : PRIORITY_BAR[task.priority]
                      }`}
                    />
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleTask(task)}
                        className="mt-0.5 shrink-0 rounded-full transition-colors"
                        title={done ? "标记为进行中" : "标记为已完成"}
                      >
                        {done ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/40 transition-colors hover:text-primary" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                          {task.title}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {!done && (
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_CHIP[task.priority]}`}>
                              {PRIORITY_LABELS[task.priority]}
                            </span>
                          )}
                          {task.project && (
                            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {task.project.name}
                            </span>
                          )}
                          {task.dueDate && (
                            <span
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                                overdue ? "bg-red-50 font-medium text-red-600 dark:bg-red-500/10" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                              {overdue ? "逾期 " : ""}
                              {formatDate(task.dueDate, "short")}
                            </span>
                          )}
                          {task.pomodoroCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-rose-500" title={`已专注 ${task.pomodoroMinutes} 分钟`}>
                              🍅 {task.pomodoroCount}
                            </span>
                          )}
                        </div>
                      </div>

                      {!done && (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => openPomodoro(task)}
                            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-500"
                            title="开始专注（番茄钟）"
                          >
                            <Timer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 右侧：专注概览 */}
        <div className="space-y-4">
          {/* 完成率圆环 */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">总体进度</h3>
            <div className="flex items-center gap-4">
              <div className="relative h-[96px] w-[96px] shrink-0">
                <svg width="96" height="96" className="absolute inset-0">
                  <circle cx="48" cy="48" r="40" strokeWidth="9" fill="none" className="stroke-muted/40" />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    strokeWidth="9"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - completionRate / 100)}
                    transform="rotate(-90 48 48)"
                    className="stroke-primary transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-semibold text-foreground">{completionRate}%</span>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  已完成 {doneTasks.length}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                  进行中 {todoTasks.length}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  专注 {totalFocusMinutes} 分
                </p>
              </div>
            </div>
          </div>

          {/* 快速专注 */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Flame className="h-4 w-4 text-rose-500" />
              快速专注
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">点 🍅 直接开始一个番茄钟</p>
            {quickFocusTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无进行中的任务</p>
            ) : (
              <div className="space-y-1.5">
                {quickFocusTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_BAR[t.priority]}`} />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{t.title}</span>
                    <button
                      onClick={() => openPomodoro(t)}
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-500"
                      title="开始专注"
                    >
                      <Timer className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 番茄钟弹窗 */}
      {pomodoroTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closePomodoro}>
          <div
            className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Timer className="h-4 w-4 text-rose-500" />
                专注中
              </h3>
              <button onClick={closePomodoro} className="rounded p-1 transition-colors hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-1 truncate text-sm text-foreground">{pomodoroTask.title}</p>
            <p className="mb-4 text-xs text-muted-foreground">
              累计 🍅 {pomodoroTask.pomodoroCount} 个 · {pomodoroTask.pomodoroMinutes} 分钟
            </p>

            {/* 圆环倒计时 */}
            <div className="relative mx-auto mb-5 h-[200px] w-[200px]">
              <svg width="200" height="200" className="absolute inset-0">
                <circle cx="100" cy="100" r={RADIUS} strokeWidth="10" fill="none" className="stroke-muted/30" />
                <circle
                  cx="100"
                  cy="100"
                  r={RADIUS}
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={OFFSET}
                  transform="rotate(-90 100 100)"
                  className="stroke-rose-500 transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-semibold tabular-nums text-foreground">{fmt(secondsLeft)}</span>
                <span className="mt-1 text-xs text-muted-foreground">{isRunning ? "进行中" : "已暂停"}</span>
              </div>
            </div>

            {/* 时长选择 */}
            <div className="mb-4 flex justify-center gap-2">
              {DURATION_OPTIONS.map((min) => (
                <button
                  key={min}
                  onClick={() => changeDuration(min)}
                  disabled={isRunning}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    durationMin === min ? "bg-rose-500 text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {min} 分
                </button>
              ))}
            </div>

            {/* 控制按钮 */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setIsRunning((r) => !r)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-4 text-sm font-medium text-white transition-colors hover:bg-rose-600"
              >
                {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isRunning ? "暂停" : "开始"}
              </button>
              <button
                onClick={() => { setSecondsLeft(durationMin * 60); setIsRunning(false); }}
                className="h-9 w-9 rounded-lg border transition-colors hover:bg-muted"
                title="重置"
              >
                <RotateCcw className="mx-auto h-4 w-4" />
              </button>
              <button
                onClick={completePomodoro}
                className="h-9 rounded-lg border px-3 text-sm transition-colors hover:bg-muted"
                title="提前记录本次"
              >
                记录本次
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建任务弹窗 */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewModal(false)}>
          <div
            className="w-full max-w-md rounded-2xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">新建任务</h3>
              <button onClick={() => setShowNewModal(false)} className="rounded p-1 transition-colors hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={createTask} className="space-y-4 p-5">
              <div>
                <label className="text-sm font-medium text-foreground">任务标题 *</label>
                <input
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="例如: 完成实验数据整理"
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">描述（可选）</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  placeholder="补充任务细节…"
                  className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">优先级</label>
                <div className="mt-1.5 flex gap-1.5">
                  {(["urgent", "high", "medium", "low"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormPriority(p)}
                      className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                        formPriority === p
                          ? `${PRIORITY_CHIP[p]} border-current ring-1 ring-current`
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_BAR[p]}`} />
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">截止日期</label>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="h-9 rounded-lg border px-4 text-sm transition-colors hover:bg-muted"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formTitle.trim()}
                  className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
