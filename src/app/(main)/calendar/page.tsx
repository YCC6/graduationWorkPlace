"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Flag,
  Target,
  Rocket,
  FlagTriangleRight,
  Loader2,
  BookOpen,
  Upload,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

type CalEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: "task" | "milestone" | "project-start" | "project-end" | "course";
  priority?: string;
  status?: string;
  completed?: boolean;
  projectId?: string;
  projectName?: string;
  subtitle?: string;
  teacher?: string;
  url: string;
};

type CoursePreview = {
  name: string;
  teacher?: string | null;
  room?: string | null;
  weeks?: string | null;
  startWeek?: number | null;
  endWeek?: number | null;
  dayOfWeek: number;
  sectionStart: number;
  sectionEnd: number;
  period?: string | null;
};

const TYPE_META: Record<
  CalEvent["type"],
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  task: {
    label: "任务截止",
    color: "#185FA5",
    bg: "#E6F1FB",
    icon: <Flag className="h-3 w-3" />,
  },
  milestone: {
    label: "项目里程碑",
    color: "#72243E",
    bg: "#FBEAF0",
    icon: <Target className="h-3 w-3" />,
  },
  "project-start": {
    label: "项目启动",
    color: "#3B6D11",
    bg: "#EAF3DE",
    icon: <Rocket className="h-3 w-3" />,
  },
  "project-end": {
    label: "项目结题",
    color: "#854F0B",
    bg: "#FAEEDA",
    icon: <FlagTriangleRight className="h-3 w-3" />,
  },
  course: {
    label: "课程",
    color: "#6D28D9",
    bg: "#F1E9FF",
    icon: <BookOpen className="h-3 w-3" />,
  },
};

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function priorityColor(p?: string): string {
  switch (p) {
    case "urgent":
      return "#A32D2D";
    case "high":
      return "#BA7517";
    default:
      return "#185FA5";
  }
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // 导入课表弹窗状态
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<CoursePreview[]>([]);
  const [semStart, setSemStart] = useState("");
  const [importError, setImportError] = useState("");

  // 选中状态：点击左侧月历中的事件，右侧日程高亮并滚动到对应项
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<HTMLAnchorElement>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/events");
      const data = await res.json();
      setEvents(data.events || []);
    } catch {
      toast.error("加载日历事件失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // 选中项变化时，将右侧日程中对应的卡片滚动到可见区域
  useEffect(() => {
    if (selectedId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId]);

  // 按日期分组
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [events]);

  // 构建月历格子
  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // 周一=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: Array<{ day: number; dateStr: string; inMonth: boolean }> = [];
    for (let i = 0; i < startWeekday; i++) {
      const d = new Date(year, month, 1 - (startWeekday - i));
      arr.push({
        day: d.getDate(),
        dateStr: d.toISOString().slice(0, 10),
        inMonth: false,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      arr.push({ day: d, dateStr, inMonth: true });
    }
    while (arr.length % 7 !== 0) {
      const last = arr[arr.length - 1];
      const nd = new Date(last.dateStr);
      nd.setDate(nd.getDate() + 1);
      arr.push({
        day: nd.getDate(),
        dateStr: nd.toISOString().slice(0, 10),
        inMonth: false,
      });
    }
    return arr;
  }, [year, month]);

  const todayStr = now.toISOString().slice(0, 10);

  const goPrev = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else setMonth(month + 1);
  };
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  // 当月事件（用于右侧日程）
  const monthEvents = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return events
      .filter((e) => e.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, year, month]);

  // ===== 导入课表逻辑 =====
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    setPreview([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/courses/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) {
        setImportError(data.error || "解析失败");
        return;
      }
      if (!data.courses || data.courses.length === 0) {
        setImportError("未在文档中识别到课程，请确认是标准课表网格。");
        return;
      }
      setPreview(data.courses);
    } catch (err) {
      setImportError("上传或解析出错");
    } finally {
      setImporting(false);
    }
  };

  const onConfirmImport = async () => {
    if (!semStart) {
      toast.error("请先填写学期开始日期（第1周周一）");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: preview, semesterStart: semStart }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "保存失败");
        return;
      }
      toast.success(`已导入 ${preview.length} 门课程`);
      setImportOpen(false);
      setPreview([]);
      setSemStart("");
      loadEvents();
    } catch {
      toast.error("保存失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">日历 / 时间轴</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-8 text-xs rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            导入课表
          </button>
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg border hover:bg-muted transition-colors"
            title="上个月"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium w-28 text-center">
            {year} 年 {month + 1} 月
          </span>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg border hover:bg-muted transition-colors"
            title="下个月"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="ml-1 px-3 h-8 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            今天
          </button>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
        {(Object.keys(TYPE_META) as CalEvent["type"][]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded"
              style={{ backgroundColor: TYPE_META[t].bg, color: TYPE_META[t].color }}
            >
              {TYPE_META[t].icon}
            </span>
            {TYPE_META[t].label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* 月历 */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-7 border-b">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="py-2 text-center text-xs font-medium text-muted-foreground border-r last:border-r-0"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((c, i) => {
              const dayEvents = eventsByDate.get(c.dateStr) || [];
              const isToday = c.dateStr === todayStr;
              return (
                <div
                  key={i}
                  className={`min-h-[92px] border-r border-b p-1.5 ${
                    i % 7 === 6 ? "border-r-0" : ""
                  } ${c.inMonth ? "" : "bg-muted/30"}`}
                >
                  <div
                    className={`text-xs mb-1 ${
                      isToday
                        ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground font-medium"
                        : c.inMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {c.day}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e) => {
                      const meta = TYPE_META[e.type];
                      const dotColor =
                        e.type === "task" ? priorityColor(e.priority) : meta.color;
                      const isSel = selectedId === e.id;
                      return (
                        <Link
                          key={e.id}
                          href={e.url}
                          onClick={(ev) => {
                            // 课程事件 url 为 /calendar，无需跳转，仅做选中高亮
                            if (e.type === "course") ev.preventDefault();
                            setSelectedId((prev) => (prev === e.id ? null : e.id));
                          }}
                          className={`block truncate rounded px-1.5 py-0.5 text-[11px] hover:opacity-80 transition-opacity ${
                            isSel ? "ring-2 ring-offset-1 ring-primary" : ""
                          }`}
                          style={{
                            backgroundColor: meta.bg,
                            color: dotColor,
                            ...(isSel ? { boxShadow: `inset 0 0 0 1px ${meta.color}` } : {}),
                          }}
                          title={
                            e.subtitle
                              ? `${e.title} · ${e.subtitle}`
                              : `${e.title}${e.projectName ? " · " + e.projectName : ""}`
                          }
                        >
                          <span className="mr-1">●</span>
                          {e.title}
                          {e.subtitle ? <span className="opacity-70"> · {e.subtitle}</span> : null}
                        </Link>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1.5">
                        +{dayEvents.length - 3} 更多
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧日程 */}
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">
            本月日程 ({monthEvents.length})
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : monthEvents.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              本月暂无截止 / 里程碑 / 课程安排
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
              {monthEvents.map((e) => {
                const meta = TYPE_META[e.type];
                const dotColor =
                  e.type === "task" ? priorityColor(e.priority) : meta.color;
                const isSel = selectedId === e.id;
                return (
                  <Link
                    key={e.id}
                    href={e.url}
                    ref={isSel ? selectedRef : undefined}
                    onClick={() =>
                      setSelectedId((prev) => (prev === e.id ? null : e.id))
                    }
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border bg-background hover:border-primary/40 transition-colors ${
                      isSel
                        ? "border-primary ring-1 ring-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <span
                      className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded shrink-0"
                      style={{ backgroundColor: meta.bg, color: dotColor }}
                    >
                      {meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-medium truncate ${
                          e.completed ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {e.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {e.date.slice(5)}
                        </span>
                        {e.subtitle && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            · {e.subtitle}
                          </span>
                        )}
                        {!e.subtitle && e.projectName && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            · {e.projectName}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 导入课表弹窗 */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-card border shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                导入课表
              </h3>
              <button
                onClick={() => setImportOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {preview.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  支持 Word 课表（.doc / .docx）。系统会解析表格，自动识别星期、节次、课程、教师、教室与周次。
                </p>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-10 cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {importing ? "正在解析…" : "点击选择课表文件"}
                  </span>
                  <input
                    type="file"
                    accept=".doc,.docx"
                    className="hidden"
                    onChange={onPickFile}
                    disabled={importing}
                  />
                </label>
                {importError && (
                  <p className="text-sm text-red-600">{importError}</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">学期开始日期（第1周周一）：</span>
                  <input
                    type="date"
                    value={semStart}
                    onChange={(e) => setSemStart(e.target.value)}
                    className="border rounded-lg px-2 py-1 text-sm"
                  />
                </div>
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2">星期</th>
                        <th className="text-left p-2">节次</th>
                        <th className="text-left p-2">课程</th>
                        <th className="text-left p-2">教师</th>
                        <th className="text-left p-2">教室</th>
                        <th className="text-left p-2">周次</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((c, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{DAY_NAMES[c.dayOfWeek - 1]}</td>
                          <td className="p-2">
                            {c.period ? c.period + " " : ""}
                            {c.sectionStart}
                            {c.sectionEnd !== c.sectionStart ? `-${c.sectionEnd}` : ""}节
                          </td>
                          <td className="p-2 font-medium">{c.name}</td>
                          <td className="p-2">{c.teacher || "-"}</td>
                          <td className="p-2">{c.room || "-"}</td>
                          <td className="p-2">{c.weeks || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importError && <p className="text-sm text-red-600">{importError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setPreview([]);
                      setImportError("");
                    }}
                    className="px-3 h-8 text-xs rounded-lg border hover:bg-muted"
                  >
                    重新选择
                  </button>
                  <button
                    onClick={onConfirmImport}
                    disabled={importing}
                    className="px-3 h-8 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {importing ? "保存中…" : "确认导入"}
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
