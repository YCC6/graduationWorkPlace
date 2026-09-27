"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalendarDays,
  Upload,
  X,
  Loader2,
  Trash2,
  CalendarRange,
  Filter,
  Clock,
  RotateCcw,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  DEFAULT_SECTION_TIMES,
  formatSectionRange,
  normalizeSectionTimes,
  timeForSection,
  type SectionTime,
} from "@/lib/scheduleTimes";

type Course = {
  id?: string;
  name: string;
  teacher?: string | null;
  room?: string | null;
  weeks?: string | null;
  startWeek?: number | null;
  endWeek?: number | null;
  dayOfWeek: number; // 1=周一 ... 7=周日
  sectionStart: number;
  sectionEnd: number;
  period?: string | null;
  color?: string;
  semesterStart?: string | null;
};

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const PALETTE = [
  "#7C3AED", // violet
  "#2563EB", // blue
  "#059669", // emerald
  "#D97706", // amber
  "#DB2777", // pink
  "#0891B2", // cyan
  "#DC2626", // red
  "#4F46E5", // indigo
  "#16A34A", // green
  "#CA8A04", // yellow
];

function colorFor(c: Course): string {
  if (c.color && c.color !== "#7C3AED") return c.color; // 已自定义则沿用
  let h = 0;
  for (let i = 0; i < c.name.length; i++) h = (h * 31 + c.name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function tint(hex: string): string {
  // 用 hex + alpha 制造浅色背景
  return hex.length === 7 ? `${hex}1A` : hex;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [sectionTimes, setSectionTimes] = useState<SectionTime[]>(DEFAULT_SECTION_TIMES);
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const [onlyThisWeek, setOnlyThisWeek] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [courseRes, timeRes] = await Promise.all([
        fetch("/api/courses"),
        fetch("/api/courses/settings"),
      ]);
      const data = await courseRes.json();
      setCourses(data.courses || []);
      const t = await timeRes.json().catch(() => ({}));
      if (Array.isArray(t?.sectionTimes)) {
        setSectionTimes(normalizeSectionTimes(t.sectionTimes));
      }
    } catch {
      toast.error("加载课表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const todayDow = useMemo(() => {
    const d = new Date().getDay(); // 0=周日
    return d === 0 ? 7 : d;
  }, []);

  const visible = useMemo(() => {
    if (!onlyThisWeek || currentWeek == null) return courses;
    return courses.filter(
      (c) =>
        c.startWeek == null ||
        (currentWeek >= (c.startWeek ?? 1) && currentWeek <= (c.endWeek ?? c.startWeek ?? 1)),
    );
  }, [courses, onlyThisWeek, currentWeek]);

  const maxSection = useMemo(() => {
    const m = visible.reduce((a, c) => Math.max(a, c.sectionEnd || c.sectionStart || 0), 0);
    return Math.max(12, m);
  }, [visible]);

  // 课程块布局：按天划分"冲突泳道"。
  // 同一天同一时段可能并列多门课（教务系统课表常见），
  // 若按"节次→单门课"映射会互相覆盖丢数据，这里给每天独立分列，各占一条泳道。
  const { layout, lanesPerDay, dayStartLine } = useMemo(() => {
    const byDay: Record<number, Course[]> = {};
    for (const c of visible) {
      if (!byDay[c.dayOfWeek]) byDay[c.dayOfWeek] = [];
      byDay[c.dayOfWeek].push(c);
    }
    const lanesPerDay: Record<number, number> = {};
    const dayStartLine: Record<number, number> = {};
    const layout: Record<number, { course: Course; lane: number }[]> = {};
    let line = 2; // 第 1 条网格线留给左侧「节次」标签列
    for (let d = 1; d <= 7; d++) {
      const list = (byDay[d] || [])
        .slice()
        .sort(
          (a, b) =>
            a.sectionStart - b.sectionStart ||
            (a.sectionEnd || a.sectionStart) - (b.sectionEnd || b.sectionStart),
        );
      const lanes: Course[][] = [];
      const assigned: { course: Course; lane: number }[] = [];
      for (const c of list) {
        let placed = -1;
        for (let i = 0; i < lanes.length; i++) {
          const last = lanes[i][lanes[i].length - 1];
          if ((last.sectionEnd || last.sectionStart) < c.sectionStart) {
            placed = i;
            break;
          }
        }
        if (placed === -1) {
          lanes.push([c]);
          placed = lanes.length - 1;
        } else {
          lanes[placed].push(c);
        }
        assigned.push({ course: c, lane: placed });
      }
      const laneCount = Math.max(1, lanes.length);
      lanesPerDay[d] = laneCount;
      dayStartLine[d] = line;
      line += laneCount;
      layout[d] = assigned;
    }
    return { layout, lanesPerDay, dayStartLine };
  }, [visible]);

  // 列模板：左侧节次列（含作息时间，略宽）+ 每天若干条泳道
  const gridCols = useMemo(
    () =>
      ["76px", ...DAYS.map((_, i) => `repeat(${lanesPerDay[i + 1] ?? 1}, minmax(0, 1fr))`)].join(
        " ",
      ),
    [lanesPerDay],
  );

  /** 节次列里显示的作息文本：只有配置过时间才显示 */
  const timeFor = useCallback((s: number) => timeForSection(sectionTimes, s), [sectionTimes]);

  const semesterStart = courses[0]?.semesterStart || null;

  return (
    <div className="p-6 space-y-5">
      {/* 顶部标题 + 操作 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">课程表</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            只看第
            <input
              type="number"
              min={1}
              max={30}
              value={currentWeek ?? ""}
              disabled={!onlyThisWeek}
              onChange={(e) => setCurrentWeek(e.target.value ? Number(e.target.value) : null)}
              className="w-14 h-8 rounded-md border border-input bg-background px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            周
            <input
              type="checkbox"
              checked={onlyThisWeek}
              onChange={(e) => setOnlyThisWeek(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <button
            onClick={() => setTimeOpen(true)}
            title="设置每节课的上课 / 下课时间"
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm hover:bg-muted transition-colors"
          >
            <Clock className="h-4 w-4" />
            作息时间
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Upload className="h-4 w-4" />
            导入课表
          </button>
          {courses.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm("确定清空当前课表？此操作不可撤销。")) return;
                try {
                  await fetch("/api/courses", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ courses: [] }),
                  });
                  toast.success("已清空课表");
                  load();
                } catch {
                  toast.error("清空失败");
                }
              }}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-destructive/40 text-destructive text-sm hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              清空
            </button>
          )}
        </div>
      </div>

      {semesterStart && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          学期起始日（第1周周一）：{semesterStart.slice(0, 10)}
        </div>
      )}

      {/* 周视图网格 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          加载中...
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-xl">
          <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">还没有课表</p>
          <p className="text-xs text-muted-foreground mt-1">
            登录教务系统 → 导出课表文件（HTML / Word）→ 点「导入课表」即可映射进来
          </p>
          <button
            onClick={() => setImportOpen(true)}
            className="mt-4 flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            导入课表
          </button>
        </div>
      ) : (
        <div
          className="grid border rounded-xl overflow-hidden bg-background"
          style={{
            gridTemplateColumns: gridCols,
            gridTemplateRows: `40px repeat(${maxSection}, minmax(64px, auto))`,
          }}
        >
          {/* 表头 */}
          <div className="bg-muted/60 border-b border-r" style={{ gridColumn: 1, gridRow: 1 }} />
          {DAYS.map((d, i) => {
            const day = i + 1;
            const isToday = todayDow === day;
            return (
              <div
                key={d}
                className={`bg-muted/60 border-b border-r px-2 py-2 text-center text-sm font-medium ${
                  isToday ? "text-primary" : ""
                }`}
                style={{
                  gridColumn: `${dayStartLine[day]} / span ${lanesPerDay[day]}`,
                  gridRow: 1,
                }}
              >
                {d}
                {isToday && <span className="block text-[10px] text-primary/70">今天</span>}
              </div>
            );
          })}

          {/* 背景格线：节次标签 + 空白单元格（先铺底，课程块再叠上去） */}
          {Array.from({ length: maxSection }, (_, idx) => {
            const s = idx + 1;
            const t = timeFor(s);
            return (
              <div key={`bg-${s}`} className="contents">
                <div
                  className="border-b border-r bg-muted/30 px-0.5 py-1 text-center leading-tight"
                  style={{ gridColumn: 1, gridRow: s + 1 }}
                  title={t ? `第${s}节  ${t.start || "—"} ~ ${t.end || "—"}` : `第${s}节（未设置时间）`}
                >
                  <div className="text-[11px] text-muted-foreground">第{s}节</div>
                  {t && (
                    <div className="mt-0.5 text-[9px] tabular-nums text-muted-foreground/70">
                      {t.start && <div>{t.start}</div>}
                      {t.end && <div>{t.end}</div>}
                    </div>
                  )}
                </div>
                {DAYS.map((_, di) => {
                  const day = di + 1;
                  return (
                    <div
                      key={`bg-${day}-${s}`}
                      className="border-b border-r"
                      style={{
                        gridColumn: `${dayStartLine[day]} / span ${lanesPerDay[day]}`,
                        gridRow: s + 1,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* 课程块：可跨节次；同一天并行的课程各占一条泳道，互不遮挡 */}
          {DAYS.map((_, di) => {
            const day = di + 1;
            return (layout[day] || []).map(({ course: c, lane }) => {
              const color = colorFor(c);
              const end = c.sectionEnd || c.sectionStart;
              const timeText = formatSectionRange(sectionTimes, c.sectionStart, end);
              const spans = end - c.sectionStart + 1;
              return (
                <div
                  key={`c-${day}-${lane}-${c.sectionStart}-${c.name}`}
                  className="relative z-10 m-0.5 p-1.5 rounded-md overflow-hidden"
                  style={{
                    backgroundColor: tint(color),
                    borderLeft: `3px solid ${color}`,
                    gridColumn: `${dayStartLine[day] + lane}`,
                    gridRow: `${c.sectionStart + 1} / span ${spans}`,
                  }}
                  title={`${c.name}\n教师：${c.teacher || "—"}\n教室：${c.room || "—"}\n周次：${c.weeks || "—"}${
                    timeText ? `\n时间：${timeText}` : ""
                  }`}
                >
                  <div className="text-[12px] font-semibold leading-tight" style={{ color }}>
                    {c.name}
                  </div>
                  {timeText && spans >= 2 && (
                    <div className="text-[10px] tabular-nums text-foreground/60 leading-tight mt-0.5">
                      {timeText}
                    </div>
                  )}
                  {c.teacher && (
                    <div className="text-[11px] text-foreground/70 leading-tight mt-0.5 truncate">
                      {c.teacher}
                    </div>
                  )}
                  {c.room && (
                    <div className="text-[11px] text-foreground/60 leading-tight truncate">
                      {c.room}
                    </div>
                  )}
                  {c.weeks && (
                    <div className="text-[10px] text-foreground/50 leading-tight mt-0.5 truncate">
                      {c.weeks}
                    </div>
                  )}
                </div>
              );
            });
          })}
        </div>
      )}

      {/* 导入弹窗 */}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onSaved={() => {
            setImportOpen(false);
            setOnlyThisWeek(false);
            setCurrentWeek(null);
            load();
          }}
        />
      )}

      {/* 作息时间设置弹窗 */}
      {timeOpen && (
        <SectionTimeModal
          times={sectionTimes}
          minSections={maxSection}
          onClose={() => setTimeOpen(false)}
          onSaved={(next) => {
            setSectionTimes(next);
            setTimeOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SectionTimeModal({
  times,
  minSections,
  onClose,
  onSaved,
}: {
  times: SectionTime[];
  minSections: number;
  onClose: () => void;
  onSaved: (times: SectionTime[]) => void;
}) {
  const total = Math.max(times.length, minSections, 12);
  const [rows, setRows] = useState<SectionTime[]>(() => {
    const base = normalizeSectionTimes(times);
    const len = Math.max(base.length, total);
    return Array.from({ length: len }, (_, i) => base[i] ?? { start: "", end: "" });
  });
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, patch: Partial<SectionTime>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    // 校验：同一节里 end 必须晚于 start
    for (let i = 0; i < rows.length; i++) {
      const { start, end } = rows[i];
      if (start && end && start >= end) {
        toast.error(`第${i + 1}节 的下课时间需晚于上课时间`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/courses/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionTimes: rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        toast.error(data.error || "保存失败");
        return;
      }
      toast.success("作息时间已保存");
      onSaved(normalizeSectionTimes(data.sectionTimes ?? rows));
    } catch (e) {
      toast.error("保存出错：" + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            作息时间
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-muted-foreground leading-relaxed">
            设置每节课的上课 / 下课时间，保存后会显示在课表左侧的节次列里。
            <br />
            留空表示该节不显示时间。
          </p>

          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border px-3 py-1.5 bg-muted/20"
              >
                <span className="w-12 shrink-0 text-xs text-muted-foreground">第{i + 1}节</span>
                <input
                  type="time"
                  step={300}
                  value={r.start}
                  onChange={(e) => setRow(i, { start: e.target.value })}
                  className="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground text-xs">~</span>
                <input
                  type="time"
                  step={300}
                  value={r.end}
                  onChange={(e) => setRow(i, { end: e.target.value })}
                  className="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t">
          <button
            onClick={() => setRows(normalizeSectionTimes(DEFAULT_SECTION_TIMES))}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm hover:bg-muted transition-colors"
            title="恢复为默认作息（每天 12 节）"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-md border text-sm hover:bg-muted">
              取消
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Course[] | null>(null);
  const [semesterStart, setSemesterStart] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/courses/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "解析失败");
      } else {
        setPreview(data.courses || []);
        if ((data.courses || []).length === 0) toast("未解析到课程，请检查文件格式");
      }
    } catch (e) {
      toast.error("解析出错：" + (e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courses: preview.map((c) => ({
            name: c.name,
            teacher: c.teacher ?? null,
            room: c.room ?? null,
            weeks: c.weeks ?? null,
            startWeek: c.startWeek ?? null,
            endWeek: c.endWeek ?? null,
            dayOfWeek: c.dayOfWeek,
            sectionStart: c.sectionStart,
            sectionEnd: c.sectionEnd,
            period: c.period ?? null,
          })),
          semesterStart: semesterStart || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "保存失败");
      } else {
        toast.success(`已导入 ${preview.length} 门课程`);
        onSaved();
      }
    } catch (e) {
      toast.error("保存出错：" + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4" />
            导入课表（来自教务系统）
          </h2>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <p className="text-xs text-muted-foreground leading-relaxed">
            在教务系统里打开「我的课表」→ 把整张课表页 <b>另存为网页（.html）</b>，或导出
            Word（.doc/.docx）→ 上传。系统会自动识别课程名 / 教师 / 教室 / 星期 / 节次 / 周次。
            <br />
            （HTML 解析无需本机安装 Word；Word 解析需要本机有 Word 且 Python 含 python-docx。）
          </p>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".html,.htm,.doc,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:opacity-90"
            />
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              解析中...
            </div>
          )}

          {preview && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm">共解析到 {preview.length} 门课程</span>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  学期起始日（第1周周一，可选）：
                  <input
                    type="date"
                    value={semesterStart}
                    onChange={(e) => setSemesterStart(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>

              <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">课程</th>
                      <th className="px-2 py-1.5 text-left font-medium">教师</th>
                      <th className="px-2 py-1.5 text-left font-medium">教室</th>
                      <th className="px-2 py-1.5 text-left font-medium">星期</th>
                      <th className="px-2 py-1.5 text-left font-medium">节次</th>
                      <th className="px-2 py-1.5 text-left font-medium">周次</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1.5">{c.name}</td>
                        <td className="px-2 py-1.5">{c.teacher || "—"}</td>
                        <td className="px-2 py-1.5">{c.room || "—"}</td>
                        <td className="px-2 py-1.5">{DAYS[c.dayOfWeek - 1]}</td>
                        <td className="px-2 py-1.5">
                          {c.sectionStart}
                          {c.sectionEnd && c.sectionEnd > c.sectionStart ? `-${c.sectionEnd}` : ""}
                        </td>
                        <td className="px-2 py-1.5">{c.weeks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md border text-sm hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={!preview || preview.length === 0 || saving}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存到课表
          </button>
        </div>
      </div>
    </div>
  );
}
