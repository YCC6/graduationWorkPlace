/**
 * 课表「作息时间」定义：每个节次对应的上课起止时间。
 * 存储于 AppSetting 表（key = SECTION_TIMES_KEY），前后端共用这里的默认值与归一化逻辑。
 */

export type SectionTime = {
  /** 上课时间，如 "08:00"；空串表示未设置 */
  start: string;
  /** 下课时间，如 "08:45"；空串表示未设置 */
  end: string;
};

/** 数据库中的配置键 */
export const SECTION_TIMES_KEY = "courses:sectionTimes";

/** 默认作息（12 节，常见的"上午4节 / 下午4节 / 晚上4节"制式），用户可在界面上改 */
export const DEFAULT_SECTION_TIMES: SectionTime[] = [
  { start: "08:00", end: "08:45" },
  { start: "08:55", end: "09:40" },
  { start: "10:00", end: "10:45" },
  { start: "10:55", end: "11:40" },
  { start: "14:00", end: "14:45" },
  { start: "14:55", end: "15:40" },
  { start: "16:00", end: "16:45" },
  { start: "16:55", end: "17:40" },
  { start: "19:00", end: "19:45" },
  { start: "19:55", end: "20:40" },
  { start: "20:50", end: "21:35" },
  { start: "21:45", end: "22:30" },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanTime(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return TIME_RE.test(t) ? t : "";
}

/**
 * 把任意输入归一化为「至少 DEFAULT_SECTION_TIMES.length 项、每项都有 start/end 字符串」的数组。
 * 超出 12 节的条目（课表里出现第 13 节等）按输入原样保留，缺失则留空。
 */
export function normalizeSectionTimes(input: unknown): SectionTime[] {
  const src = Array.isArray(input) ? input : [];
  const len = Math.max(DEFAULT_SECTION_TIMES.length, src.length);
  const out: SectionTime[] = [];
  for (let i = 0; i < len; i++) {
    const raw = src[i] as Partial<SectionTime> | undefined;
    const base = DEFAULT_SECTION_TIMES[i];
    out.push({
      start: cleanTime(raw?.start) || (base ? base.start : ""),
      end: cleanTime(raw?.end) || (base ? base.end : ""),
    });
  }
  return out;
}

/** 取第 N 节（1 起）的作息；不存在返回 null */
export function timeForSection(times: SectionTime[], section: number): SectionTime | null {
  const t = times?.[section - 1];
  if (!t || (!t.start && !t.end)) return null;
  return t;
}

/**
 * 把一段节次区间格式化为时间范围文本，如 1~2 节 → "08:00-09:40"；
 * 只有单节时 → "08:00-08:45"；无配置返回 ""。
 */
export function formatSectionRange(
  times: SectionTime[],
  sectionStart: number,
  sectionEnd?: number | null,
): string {
  const s = timeForSection(times, sectionStart);
  const e = timeForSection(times, sectionEnd || sectionStart);
  const start = s?.start || "";
  const end = e?.end || e?.start || s?.end || "";
  if (!start && !end) return "";
  if (start && end) return `${start}-${end}`;
  return start || end;
}
