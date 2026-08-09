"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit3,
  Trash2,
  FlaskConical,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Save,
  X,
  Calendar,
  BookOpen,
  Loader2,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Upload,
  Tag,
  ChevronsUpDown,
  LayoutTemplate,
  FileText,
  Brain,
  BarChart3,
  TrendingUp,
  LineChart,
  Download,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

// --- 阶段标签和颜色 ---
const PHASE_LABELS: Record<string, string> = {
  preparation: "准备阶段",
  experiment: "实验阶段",
  writing: "写作阶段",
  completed: "已完成",
};
const PHASE_COLORS: Record<string, string> = {
  preparation: "bg-blue-100 text-blue-700",
  experiment: "bg-amber-100 text-amber-700",
  writing: "bg-violet-100 text-violet-700",
  completed: "bg-green-100 text-green-700",
};
const PHASE_ORDER = ["preparation", "experiment", "writing", "completed"];

// --- 实验标签颜色 ---
const TAG_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
  "#F97316", "#6366F1",
];
// 根据标签名计算颜色索引
function getTagColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

// --- 类型 ---
interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  phase: string;
  progress: number;
  startDate: string | null;
  milestones: Milestone[];
  experiments: Experiment[];
  papers: { paper: PaperRef }[];
  tasks: Task[];
}

interface Milestone {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
  projectId: string;
}

interface Experiment {
  id: string;
  title: string;
  objective: string | null;
  methods: string | null;
  reagents: string | null;
  conditions: string | null;
  results: string | null;
  conclusion: string | null;
  images: string | null;
  tags: string | null;
  status: string;
  createdAt: string;
}

interface PaperRef {
  id: string;
  title: string;
  authors: string;
  journal: string | null;
  year: number | null;
  status: string;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
}

interface ExperimentTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  objective: string | null;
  methods: string | null;
  reagents: string | null;
  conditions: string | null;
  isBuiltin: boolean;
}

interface KnowledgeNote {
  id: string;
  title: string;
  content: string;
  category: string | null;
  updatedAt: string;
  tags: { tag: { name: string } }[];
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-50",
  high: "text-orange-600 bg-orange-50",
  medium: "text-blue-600 bg-blue-50",
  low: "text-gray-500 bg-gray-100",
};

// --- 数据表格解析 ---
function parseDataTable(text: string): { type: "tsv" | "csv" | "md-table" | "none"; headers: string[]; rows: string[][] } {
  if (!text) return { type: "none", headers: [], rows: [] };

  const lines = text.trim().split("\n").filter(Boolean);

  // 检测 Markdown 表格
  if (lines.length >= 2 && lines[0].includes("|") && lines[1].includes("---")) {
    const headers = lines[0].split("|").map(s => s.trim()).filter(Boolean);
    const rows: string[][] = [];
    for (let i = 2; i < lines.length; i++) {
      const cells = lines[i].split("|").map(s => s.trim()).filter(Boolean);
      if (cells.length > 0) rows.push(cells);
    }
    return { type: "md-table", headers, rows };
  }

  // 检测制表符分隔
  if (lines[0].includes("\t")) {
    const headers = lines[0].split("\t").map(s => s.trim());
    const rows = lines.slice(1).map(line => line.split("\t").map(s => s.trim()));
    return { type: "tsv", headers, rows };
  }

  // 检测逗号分隔
  if (lines[0].includes(",")) {
    const headers = lines[0].split(",").map(s => s.trim());
    const rows = lines.slice(1).map(line => line.split(",").map(s => s.trim()));
    return { type: "csv", headers, rows };
  }

  return { type: "none", headers: [], rows: [] };
}

// --- 实验数据图表 ---
const CHART_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B"];

interface ExpDataPoint {
  id?: string;
  label: string;
  xValue: string;
  yValue: string;
  series: string;
}

// 渲染 SVG 实验图表
function renderExpChart(data: ExpDataPoint[], chartType: "line" | "bar") {
  const validData = data
    .filter((d) => d.label.trim() && !isNaN(parseFloat(d.xValue)) && !isNaN(parseFloat(d.yValue)))
    .map((d) => ({
      label: d.label.trim(),
      xValue: parseFloat(d.xValue),
      yValue: parseFloat(d.yValue),
      series: d.series.trim() || "默认",
    }));

  if (validData.length === 0) return null;

  const W = 600, H = 320;
  const M = { top: 30, right: 40, bottom: 50, left: 60 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  // 唯一标签（X 轴）
  const labels = [...new Set(validData.map((d) => d.label))];
  // 系列列表
  const seriesList = [...new Set(validData.map((d) => d.series))];

  // Y 轴范围（最小值的 80% ~ 最大值的 120%）
  const yValues = validData.map((d) => d.yValue);
  let yMin = Math.min(...yValues) * 0.8;
  let yMax = Math.max(...yValues) * 1.2;
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yRange = yMax - yMin;

  // 坐标计算
  const xPos = (label: string) => {
    const idx = labels.indexOf(label);
    return labels.length > 1 ? M.left + (idx * innerW) / (labels.length - 1) : M.left + innerW / 2;
  };
  const yPos = (val: number) => M.top + innerH - ((val - yMin) / yRange) * innerH;

  // Y 轴刻度（5 条线，6 个刻度点）
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + (yRange * i) / 5);

  return (
    <svg width={W} height={H} style={{ maxWidth: "100%" }}>
      {/* Y 轴刻度线和标签 */}
      {yTicks.map((tick, i) => {
        const y = yPos(tick);
        return (
          <g key={`ytick-${i}`}>
            <line x1={M.left} y1={y} x2={W - M.right} y2={y} stroke="#E5E7EB" strokeWidth={1} />
            <text x={M.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="#6B7280">
              {tick.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* X 轴 */}
      <line x1={M.left} y1={M.top + innerH} x2={W - M.right} y2={M.top + innerH} stroke="#374151" strokeWidth={1.5} />
      {/* Y 轴 */}
      <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + innerH} stroke="#374151" strokeWidth={1.5} />

      {/* X 轴标签（倾斜 -45 度） */}
      {labels.map((label, i) => {
        const x = xPos(label);
        const yBase = M.top + innerH + 8;
        return (
          <text
            key={`xlabel-${i}`}
            x={x}
            y={yBase}
            textAnchor="end"
            fontSize={10}
            fill="#6B7280"
            transform={`rotate(-45 ${x} ${yBase})`}
          >
            {label}
          </text>
        );
      })}

      {/* 图例（右上角） */}
      {seriesList.map((series, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const lx = W - M.right - 5;
        const ly = M.top - 8 + i * 16;
        return (
          <g key={`legend-${i}`}>
            <rect x={lx - 70} y={ly} width={10} height={10} fill={color} rx={2} />
            <text x={lx - 55} y={ly + 9} fontSize={10} fill="#374151">
              {series}
            </text>
          </g>
        );
      })}

      {/* 图表内容 */}
      {chartType === "line" ? (
        // 折线图
        seriesList.map((series, si) => {
          const color = CHART_COLORS[si % CHART_COLORS.length];
          const points = validData.filter((d) => d.series === series);
          const pathData = points
            .map((d, i) => {
              const x = xPos(d.label);
              const y = yPos(d.yValue);
              return `${i === 0 ? "M" : "L"} ${x} ${y}`;
            })
            .join(" ");
          return (
            <g key={`line-${si}`}>
              <path d={pathData} stroke={color} strokeWidth={2} fill="none" />
              {points.map((d, i) => {
                const x = xPos(d.label);
                const y = yPos(d.yValue);
                return <circle key={`dot-${si}-${i}`} cx={x} cy={y} r={3} fill={color} />;
              })}
            </g>
          );
        })
      ) : (
        // 柱状图：每个系列在 X 轴标签两侧偏移显示
        labels.map((label, li) => {
          const x = xPos(label);
          const seriesCount = seriesList.length;
          const barWidth = Math.min(14, (innerW / Math.max(labels.length, 1)) * 0.25);
          const totalWidth = barWidth * seriesCount + (seriesCount - 1) * 2;
          const startX = x - totalWidth / 2;
          return (
            <g key={`bar-${li}`}>
              {seriesList.map((series, si) => {
                const color = CHART_COLORS[si % CHART_COLORS.length];
                const point = validData.find((d) => d.label === label && d.series === series);
                if (!point) return null;
                const barX = startX + si * (barWidth + 2);
                const y = yPos(point.yValue);
                const barH = M.top + innerH - y;
                return (
                  <rect
                    key={`barrect-${li}-${si}`}
                    x={barX}
                    y={y}
                    width={barWidth}
                    height={Math.max(barH, 0)}
                    fill={color}
                    rx={2}
                  />
                );
              })}
            </g>
          );
        })
      )}
    </svg>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  // 实验弹窗
  const [showExpModal, setShowExpModal] = useState(false);
  const [expForm, setExpForm] = useState({
    title: "",
    objective: "",
    methods: "",
    reagents: "",
    conditions: "",
    results: "",
    conclusion: "",
  });
  const [expSaving, setExpSaving] = useState(false);

  // 图片上传
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 里程碑弹窗
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDate, setNewMilestoneDate] = useState("");

  // 展开的实验 ID
  const [expandedExp, setExpandedExp] = useState<string | null>(null);

  // 图片预览
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 阶段切换
  const [showPhaseMenu, setShowPhaseMenu] = useState(false);

  // 标签管理
  const [showTagInput, setShowTagInput] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");

  // 实验模板
  const [templates, setTemplates] = useState<ExperimentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  // 实验关联笔记
  const [expNotes, setExpNotes] = useState<Record<string, KnowledgeNote[]>>({});

  // 实验数据图表
  const [expDataPoints, setExpDataPoints] = useState<ExpDataPoint[]>([]);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [showDataEditor, setShowDataEditor] = useState(false);
  const [expChartData, setExpChartData] = useState<Record<string, ExpDataPoint[]>>({});

  // 有效数据点 & 统计
  const validDataPoints = useMemo(
    () =>
      expDataPoints.filter(
        (d) =>
          d.label.trim() &&
          !isNaN(parseFloat(d.xValue)) &&
          !isNaN(parseFloat(d.yValue)),
      ),
    [expDataPoints],
  );

  const statsBySeries = useMemo(() => {
    const groups: Record<string, number[]> = {};
    for (const r of validDataPoints) {
      const s = r.series?.trim() || "默认";
      if (!groups[s]) groups[s] = [];
      groups[s].push(parseFloat(r.yValue));
    }
    return Object.entries(groups).map(([series, ys]) => {
      const n = ys.length;
      const mean = ys.reduce((a, b) => a + b, 0) / n;
      const variance = ys.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
      const std = Math.sqrt(variance);
      return {
        series,
        n,
        mean,
        std,
        min: Math.min(...ys),
        max: Math.max(...ys),
      };
    });
  }, [validDataPoints]);

  const exportExperimentCSV = () => {
    if (validDataPoints.length === 0) {
      toast.error("暂无可导出的数据");
      return;
    }
    const header = "标签,X值,Y值,系列\n";
    const body = validDataPoints
      .map((r) => `${r.label},${r.xValue},${r.yValue},${r.series || "默认"}`)
      .join("\n");
    const blob = new Blob(["﻿" + header + body], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `实验数据_${project?.name || "experiment"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV 已导出");
  };

  useEffect(() => {
    loadProject();
    loadTemplates();
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Not found");
      setProject(await res.json());
    } catch {
      toast.error("加载项目失败");
    }
    setLoading(false);
  };

  // 加载实验模板
  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/experiment-templates");
      if (res.ok) setTemplates(await res.json());
    } catch { /* ignore */ }
  };

  // 应用模板到表单
  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    // 解析 reagents JSON → 文本格式
    let reagentsText = "";
    if (tpl.reagents) {
      try {
        const items = JSON.parse(tpl.reagents);
        reagentsText = (items as any[]).map((r: any) => `${r.name || ""},${r.purity || ""},${r.amount || ""}`).join("\n");
      } catch { /* ignore */ }
    }

    // 解析 conditions JSON → 文本格式
    let conditionsText = "";
    if (tpl.conditions) {
      try {
        const items = JSON.parse(tpl.conditions);
        conditionsText = Object.entries(items as Record<string, string>)
          .map(([k, v]) => `${k}:${v}`)
          .join("\n");
      } catch { /* ignore */ }
    }

    setExpForm({
      title: tpl.name,
      objective: tpl.objective || "",
      methods: tpl.methods || "",
      reagents: reagentsText,
      conditions: conditionsText,
      results: "",
      conclusion: "",
    });
  };

  // 保存当前表单为模板
  const saveAsTemplate = async () => {
    if (!newTemplateName.trim()) return;
    try {
      // 解析试剂文本 → JSON
      let reagentsJson = null;
      if (expForm.reagents.trim()) {
        const items = expForm.reagents.split("\n").filter(Boolean).map((line) => {
          const parts = line.split(",").map((s) => s.trim());
          return { name: parts[0] || "", purity: parts[1] || "", amount: parts[2] || "" };
        });
        reagentsJson = JSON.stringify(items);
      }

      // 解析条件文本 → JSON
      let conditionsJson = null;
      if (expForm.conditions.trim()) {
        const items: Record<string, string> = {};
        expForm.conditions.split("\n").filter(Boolean).forEach((line) => {
          const [k, ...v] = line.split(":").map((s) => s.trim());
          if (k) items[k] = v.join(":") || "";
        });
        conditionsJson = JSON.stringify(items);
      }

      const res = await fetch("/api/experiment-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          category: "自定义",
          description: null,
          objective: expForm.objective || null,
          methods: expForm.methods || null,
          reagents: reagentsJson,
          conditions: conditionsJson,
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      toast.success(`模板「${newTemplateName.trim()}」已保存`);
      setNewTemplateName("");
      setShowSaveTemplateInput(false);
      loadTemplates();
    } catch {
      toast.error("保存模板失败");
    }
  };

  // 删除自定义模板
  const deleteTemplate = async (templateId: string) => {
    if (!confirm("确定删除此模板？")) return;
    try {
      await fetch(`/api/experiment-templates/${templateId}`, { method: "DELETE" });
      toast.success("模板已删除");
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId("");
      }
      loadTemplates();
    } catch {
      toast.error("删除失败");
    }
  };

  // 加载实验关联笔记
  const loadExperimentNotes = async (expId: string) => {
    if (expNotes[expId]) return;
    try {
      const res = await fetch(`/api/knowledge/by-ref?type=experiment&id=${expId}`);
      if (res.ok) {
        const notes = await res.json();
        setExpNotes((prev) => ({ ...prev, [expId]: notes }));
      } else {
        setExpNotes((prev) => ({ ...prev, [expId]: [] }));
      }
    } catch {
      setExpNotes((prev) => ({ ...prev, [expId]: [] }));
    }
  };

  // 加载实验数据
  const loadExperimentData = async (expId: string) => {
    if (expChartData[expId]) {
      setExpDataPoints(expChartData[expId]);
      return;
    }
    try {
      const res = await fetch(`/api/experiments/${expId}/data`);
      if (res.ok) {
        const result = await res.json();
        const points: ExpDataPoint[] = (result.data || []).map((d: any) => ({
          id: d.id,
          label: d.label,
          xValue: String(d.xValue),
          yValue: String(d.yValue),
          series: d.series || "",
        }));
        setExpDataPoints(points);
        setExpChartData((prev) => ({ ...prev, [expId]: points }));
      } else {
        setExpDataPoints([]);
        setExpChartData((prev) => ({ ...prev, [expId]: [] }));
      }
    } catch {
      setExpDataPoints([]);
    }
  };

  // 保存实验数据
  const saveExperimentData = async (expId: string) => {
    const dataPoints = expDataPoints
      .filter((d) => d.label.trim() && !isNaN(parseFloat(d.xValue)) && !isNaN(parseFloat(d.yValue)))
      .map((d) => ({
        label: d.label.trim(),
        xValue: parseFloat(d.xValue),
        yValue: parseFloat(d.yValue),
        series: d.series.trim() || "默认",
      }));
    try {
      const res = await fetch(`/api/experiments/${expId}/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataPoints }),
      });
      if (res.ok) {
        const result = await res.json();
        const points: ExpDataPoint[] = (result.data || []).map((d: any) => ({
          id: d.id,
          label: d.label,
          xValue: String(d.xValue),
          yValue: String(d.yValue),
          series: d.series || "",
        }));
        setExpChartData((prev) => ({ ...prev, [expId]: points }));
        setExpDataPoints(points);
        toast.success("数据已保存");
      }
    } catch {
      toast.error("保存失败");
    }
  };

  // 图片上传处理
  const handleImageUpload = async (file: File) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("不支持的文件类型，仅支持 PNG/JPEG/WEBP/GIF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("文件大小不能超过 10MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "上传失败");
      }
      const data = await res.json();
      setUploadedImages(prev => [...prev, data.filePath]);
      toast.success("图片已上传");
    } catch (err: any) {
      toast.error(err.message || "上传失败");
    }
    setUploading(false);
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // 拖拽上传
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleImageUpload);
  };

  // 切换里程碑
  const toggleMilestone = async (m: Milestone) => {
    try {
      await fetch(`/api/milestones/${m.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !m.completed }),
      });
      loadProject();
    } catch {
      toast.error("更新失败");
    }
  };

  // 创建里程碑
  const createMilestone = async () => {
    if (!newMilestoneTitle.trim()) return;
    try {
      await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          title: newMilestoneTitle,
          dueDate: newMilestoneDate || null,
        }),
      });
      toast.success("里程碑已创建");
      setShowMilestoneModal(false);
      setNewMilestoneTitle("");
      setNewMilestoneDate("");
      loadProject();
    } catch {
      toast.error("创建失败");
    }
  };

  // 创建实验
  const createExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expForm.title.trim()) return;
    setExpSaving(true);
    try {
      // 解析试剂 JSON
      let reagentsJson = null;
      if (expForm.reagents.trim()) {
        const items = expForm.reagents.split("\n").filter(Boolean).map((line) => {
          const parts = line.split(",").map((s) => s.trim());
          return { name: parts[0] || "", purity: parts[1] || "", amount: parts[2] || "" };
        });
        reagentsJson = items;
      }

      // 解析条件 JSON
      let conditionsJson = null;
      if (expForm.conditions.trim()) {
        const items: Record<string, string> = {};
        expForm.conditions.split("\n").filter(Boolean).forEach((line) => {
          const [k, ...v] = line.split(":").map((s) => s.trim());
          if (k) items[k] = v.join(":") || "";
        });
        conditionsJson = items;
      }

      await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          title: expForm.title,
          objective: expForm.objective,
          methods: expForm.methods,
          reagents: reagentsJson,
          conditions: conditionsJson,
          results: expForm.results,
          conclusion: expForm.conclusion,
          images: uploadedImages.length > 0 ? uploadedImages : null,
        }),
      });
      toast.success("实验记录已创建");
      setShowExpModal(false);
      setExpForm({ title: "", objective: "", methods: "", reagents: "", conditions: "", results: "", conclusion: "" });
      setUploadedImages([]);
      loadProject();
    } catch {
      toast.error("创建失败");
    }
    setExpSaving(false);
  };

  // 更新实验状态
  const updateExperimentStatus = async (expId: string, newStatus: string) => {
    try {
      await fetch(`/api/experiments/${expId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success("状态已更新");
      loadProject();
    } catch {
      toast.error("更新失败");
    }
  };

  // 添加实验标签
  const addExperimentTag = async (expId: string, currentTags: string[]) => {
    if (!newTag.trim()) return;
    const updatedTags = [...currentTags, newTag.trim()];
    try {
      await fetch(`/api/experiments/${expId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      toast.success("标签已添加");
      setNewTag("");
      setShowTagInput(null);
      loadProject();
    } catch {
      toast.error("添加失败");
    }
  };

  // 移除实验标签
  const removeExperimentTag = async (expId: string, currentTags: string[], tagToRemove: string) => {
    const updatedTags = currentTags.filter((t) => t !== tagToRemove);
    try {
      await fetch(`/api/experiments/${expId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      loadProject();
    } catch {
      toast.error("移除失败");
    }
  };

  // 切换项目阶段
  const updateProjectPhase = async (newPhase: string) => {
    setShowPhaseMenu(false);
    try {
      await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: newPhase }),
      });
      toast.success(`阶段已切换为「${PHASE_LABELS[newPhase]}」`);
      loadProject();
    } catch {
      toast.error("切换失败");
    }
  };

  // 删除实验
  const deleteExperiment = async (expId: string) => {
    if (!confirm("确定删除此实验记录？")) return;
    try {
      await fetch(`/api/experiments/${expId}`, { method: "DELETE" });
      toast.success("实验已删除");
      loadProject();
    } catch {
      toast.error("删除失败");
    }
  };

  // 解析字段
  const parseJSON = (str: string | null) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  };

  // 解析标签
  const parseTags = (str: string | null): string[] => {
    if (!str) return [];
    try { return JSON.parse(str); } catch { return []; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <FlaskConical className="h-12 w-12 mb-3 opacity-30" />
        <p>项目不存在</p>
        <Link href="/projects" className="mt-2 text-sm text-primary hover:underline">返回列表</Link>
      </div>
    );
  }

  const expStatusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    in_progress: "bg-orange-100 text-orange-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-600",
  };

  const expStatusLabels: Record<string, string> = {
    draft: "草稿",
    in_progress: "进行中",
    completed: "已完成",
    failed: "失败",
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* 返回 */}
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 返回项目列表
      </Link>

      {/* 项目头部 */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-semibold">{project.name}</h1>
              {/* 阶段切换下拉 */}
              <div className="relative">
                <button
                  onClick={() => setShowPhaseMenu(!showPhaseMenu)}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${PHASE_COLORS[project.phase]} hover:opacity-80 transition-opacity`}
                >
                  {PHASE_LABELS[project.phase]}
                  <ChevronsUpDown className="h-3 w-3" />
                </button>
                {showPhaseMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPhaseMenu(false)} />
                    <div className="absolute top-full mt-1 left-0 z-20 bg-background rounded-lg border shadow-lg py-1 w-36">
                      {PHASE_ORDER.map((phase) => (
                        <button
                          key={phase}
                          onClick={() => updateProjectPhase(phase)}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2 ${
                            project.phase === phase ? "font-medium" : ""
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${
                            phase === "preparation" ? "bg-blue-400" :
                            phase === "experiment" ? "bg-amber-400" :
                            phase === "writing" ? "bg-violet-400" : "bg-green-400"
                          }`} />
                          {PHASE_LABELS[phase]}
                          {project.phase === phase && (
                            <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={async () => {
                if (!confirm("确定删除此项目？")) return;
                await fetch(`/api/projects/${id}`, { method: "DELETE" });
                toast.success("项目已删除");
                router.push("/projects");
              }}
              className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 进度条 */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">总体进度</span>
            <span className="font-medium">{project.progress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        {/* 快速统计 */}
        <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {project.milestones.filter((m) => m.completed).length}/{project.milestones.length} 里程碑
          </span>
          <span className="flex items-center gap-1">
            <FlaskConical className="h-3 w-3" />
            {project.experiments.length} 实验
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {project.papers.length} 文献
          </span>
          {project.startDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(project.startDate)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧: 里程碑 + 实验 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 里程碑时间线 */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">
                里程碑 ({project.milestones.filter((m) => m.completed).length}/{project.milestones.length})
              </h2>
              <button
                onClick={() => setShowMilestoneModal(true)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> 添加
              </button>
            </div>

            {project.milestones.length === 0 ? (
              <p className="text-center py-6 text-xs text-muted-foreground">暂无里程碑</p>
            ) : (
              <div className="relative pl-6">
                {/* 竖线 */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-muted" />
                <div className="space-y-4">
                  {project.milestones.map((m) => (
                    <div key={m.id} className="relative flex items-start gap-3">
                      {/* 圆点 */}
                      <button
                        onClick={() => toggleMilestone(m)}
                        className={`absolute -left-[22px] top-0.5 p-0.5 rounded-full transition-colors ${
                          m.completed ? "text-green-500" : "text-muted-foreground hover:text-foreground"
                        }`}
                        title={m.completed ? "标记为未完成" : "标记为已完成"}
                      >
                        {m.completed ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${m.completed ? "line-through text-muted-foreground" : ""}`}>
                          {m.title}
                        </p>
                        {m.dueDate && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatDate(m.dueDate)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 实验记录 */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">实验记录 ({project.experiments.length})</h2>
              <button
                onClick={() => setShowExpModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" /> 新建实验
              </button>
            </div>

            {project.experiments.length === 0 ? (
              <p className="text-center py-6 text-xs text-muted-foreground">暂无实验记录</p>
            ) : (
              <div className="space-y-2">
                {project.experiments.map((exp) => {
                  const reagents = parseJSON(exp.reagents) as any[] | null;
                  const conditions = parseJSON(exp.conditions) as Record<string, string> | null;
                  const expImages = parseJSON(exp.images) as string[] | null;
                  const expTags = parseTags(exp.tags);
                  const isExp = expandedExp === exp.id;
                  const dataTable = parseDataTable(exp.results || "");

                  return (
                    <div key={exp.id} className="rounded-lg border overflow-hidden">
                      {/* 标题行 */}
                      <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors">
                        <button
                          onClick={() => {
                            const newExpanded = isExp ? null : exp.id;
                            setExpandedExp(newExpanded);
                            if (newExpanded) {
                              if (!expNotes[newExpanded]) loadExperimentNotes(newExpanded);
                              loadExperimentData(newExpanded);
                            }
                          }}
                          className="p-0.5 text-muted-foreground shrink-0"
                        >
                          {isExp ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{exp.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(exp.createdAt)}</p>
                        </div>

                        {/* 状态切换下拉 */}
                        <div className="relative">
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              // 循环切换
                              const statuses = ["draft", "in_progress", "completed", "failed"];
                              const next = statuses[(statuses.indexOf(exp.status) + 1) % statuses.length];
                              updateExperimentStatus(exp.id, next);
                            }}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${expStatusColors[exp.status]} hover:opacity-80 transition-opacity`}
                            title="点击切换状态"
                          >
                            {expStatusLabels[exp.status]}
                          </button>
                        </div>

                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            deleteExperiment(exp.id);
                          }}
                          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* 展开详情 */}
                      {isExp && (
                        <div className="px-4 pb-4 pt-1 border-t space-y-3">
                          {/* 标签 */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                            {expTags.map((tag) => {
                              const color = getTagColor(tag);
                              return (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium group"
                                  style={{ backgroundColor: `${color}15`, color }}
                                >
                                  {tag}
                                  <button
                                    onClick={() => removeExperimentTag(exp.id, expTags, tag)}
                                    className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              );
                            })}
                            {showTagInput === exp.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  value={newTag}
                                  onChange={(e) => setNewTag(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") addExperimentTag(exp.id, expTags);
                                    if (e.key === "Escape") { setShowTagInput(null); setNewTag(""); }
                                  }}
                                  placeholder="标签名"
                                  className="h-6 w-20 px-1.5 rounded border border-input bg-background text-[10px] focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                <button
                                  onClick={() => addExperimentTag(exp.id, expTags)}
                                  className="p-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowTagInput(exp.id)}
                                className="inline-flex items-center justify-center w-5 h-5 rounded border border-dashed border-muted-foreground/30 text-muted-foreground/50 hover:text-muted-foreground hover:border-muted-foreground/50 transition-colors"
                              >
                                <Plus className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>

                          {exp.objective && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">实验目的</p>
                              <p className="text-sm">{exp.objective}</p>
                            </div>
                          )}
                          {reagents && reagents.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">试剂</p>
                              <div className="flex flex-wrap gap-1.5">
                                {reagents.map((r: any, i: number) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">
                                    {r.name} {r.purity && `(${r.purity})`} {r.amount && `· ${r.amount}`}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {conditions && Object.keys(conditions).length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">实验条件</p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(conditions).map(([k, v]) => (
                                  <span key={k} className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-xs">
                                    {k}: {v}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {exp.methods && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">实验方法</p>
                              <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground bg-muted/30 rounded p-2 max-h-40 overflow-y-auto">
                                {exp.methods}
                              </pre>
                            </div>
                          )}
                          {exp.results && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">实验结果</p>
                              {dataTable.type !== "none" ? (
                                <div className="overflow-x-auto rounded border">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-muted/50">
                                        {dataTable.headers.map((h, i) => (
                                          <th key={i} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap border-b">
                                            {h}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dataTable.rows.map((row, ri) => (
                                        <tr key={ri} className="hover:bg-muted/20 border-b last:border-0">
                                          {row.map((cell, ci) => (
                                            <td key={ci} className="px-2 py-1 whitespace-nowrap">
                                              {cell}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground bg-muted/30 rounded p-2 max-h-40 overflow-y-auto">
                                  {exp.results}
                                </pre>
                              )}
                            </div>
                          )}
                          {exp.conclusion && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">结论</p>
                              <p className="text-sm">{exp.conclusion}</p>
                            </div>
                          )}

                          {/* 实验图片 */}
                          {expImages && expImages.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                                实验图片 ({expImages.length})
                              </p>
                              <div className="grid grid-cols-4 gap-2">
                                {expImages.map((img, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setPreviewImage(img)}
                                    className="aspect-square rounded-lg border overflow-hidden hover:border-primary/50 hover:shadow-sm transition-all bg-muted/30"
                                  >
                                    <img
                                      src={img}
                                      alt={`实验图片 ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 数据图表 */}
                          <div className="pt-2 border-t">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <BarChart3 className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground">
                                  数据图表
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setChartType("line")}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                    chartType === "line"
                                      ? "bg-primary/10 text-primary"
                                      : "text-muted-foreground hover:bg-muted/30"
                                  }`}
                                >
                                  <TrendingUp className="h-3 w-3" /> 折线图
                                </button>
                                <button
                                  onClick={() => setChartType("bar")}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                    chartType === "bar"
                                      ? "bg-primary/10 text-primary"
                                      : "text-muted-foreground hover:bg-muted/30"
                                  }`}
                                >
                                  <BarChart3 className="h-3 w-3" /> 柱状图
                                </button>
                                <button
                                  onClick={() => setShowDataEditor(!showDataEditor)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                    showDataEditor
                                      ? "bg-primary/10 text-primary"
                                      : "text-muted-foreground hover:bg-muted/30"
                                  }`}
                                >
                                  <LineChart className="h-3 w-3" /> 数据编辑
                                </button>
                                <button
                                  onClick={exportExperimentCSV}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
                                  title="导出 CSV"
                                >
                                  <Download className="h-3 w-3" /> 导出
                                </button>
                              </div>
                            </div>

                            {/* SVG 图表 */}
                            {expDataPoints.filter((d) => d.label.trim() && !isNaN(parseFloat(d.xValue)) && !isNaN(parseFloat(d.yValue))).length > 0 ? (
                              <div className="bg-muted/10 rounded-lg p-2 overflow-x-auto">
                                {renderExpChart(expDataPoints, chartType)}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground/50 text-center py-4">
                                暂无数据，请点击"数据编辑"添加数据点
                              </p>
                            )}

                            {/* 统计摘要 */}
                            {statsBySeries.length > 0 && (
                              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {statsBySeries.map((s) => (
                                  <div key={s.series} className="rounded-lg border bg-background p-2">
                                    <div className="text-[10px] text-muted-foreground truncate" title={s.series}>
                                      {s.series}
                                    </div>
                                    <div className="text-xs font-medium mt-0.5">
                                      均值 {s.mean.toFixed(3)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                      标准差 {s.std.toFixed(3)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                      n={s.n} · {s.min.toFixed(2)}~{s.max.toFixed(2)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 数据编辑器 */}
                            {showDataEditor && (
                              <div className="mt-2 space-y-2">
                                <div className="overflow-x-auto rounded border">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-muted/50">
                                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b">标签 (Label)</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b">X 值</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b">Y 值</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b">系列 (Series)</th>
                                        <th className="px-2 py-1.5 border-b w-8"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {expDataPoints.map((row, ri) => (
                                        <tr key={ri} className="border-b last:border-0">
                                          <td className="px-2 py-1">
                                            <input
                                              value={row.label}
                                              onChange={(e) => {
                                                const updated = [...expDataPoints];
                                                updated[ri] = { ...row, label: e.target.value };
                                                setExpDataPoints(updated);
                                              }}
                                              placeholder="样品A"
                                              className="w-full h-7 px-1.5 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                            />
                                          </td>
                                          <td className="px-2 py-1">
                                            <input
                                              value={row.xValue}
                                              onChange={(e) => {
                                                const updated = [...expDataPoints];
                                                updated[ri] = { ...row, xValue: e.target.value };
                                                setExpDataPoints(updated);
                                              }}
                                              placeholder="1.0"
                                              type="number"
                                              step="any"
                                              className="w-full h-7 px-1.5 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                            />
                                          </td>
                                          <td className="px-2 py-1">
                                            <input
                                              value={row.yValue}
                                              onChange={(e) => {
                                                const updated = [...expDataPoints];
                                                updated[ri] = { ...row, yValue: e.target.value };
                                                setExpDataPoints(updated);
                                              }}
                                              placeholder="2.5"
                                              type="number"
                                              step="any"
                                              className="w-full h-7 px-1.5 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                            />
                                          </td>
                                          <td className="px-2 py-1">
                                            <input
                                              value={row.series}
                                              onChange={(e) => {
                                                const updated = [...expDataPoints];
                                                updated[ri] = { ...row, series: e.target.value };
                                                setExpDataPoints(updated);
                                              }}
                                              placeholder="实验组"
                                              className="w-full h-7 px-1.5 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                            />
                                          </td>
                                          <td className="px-1 py-1 text-center">
                                            <button
                                              onClick={() => {
                                                setExpDataPoints(expDataPoints.filter((_, i) => i !== ri));
                                              }}
                                              className="p-0.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="flex items-center justify-between">
                                  <button
                                    onClick={() => {
                                      setExpDataPoints([...expDataPoints, { label: "", xValue: "", yValue: "", series: "" }]);
                                    }}
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <Plus className="h-3.5 w-3.5" /> 添加行
                                  </button>
                                  <button
                                    onClick={() => saveExperimentData(exp.id)}
                                    className="inline-flex items-center gap-1 px-3 h-7 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90"
                                  >
                                    <Save className="h-3 w-3" /> 保存数据
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 关联笔记 */}
                          <div className="pt-2 border-t">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Brain className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">
                                关联笔记 ({expNotes[exp.id]?.length ?? 0})
                              </span>
                            </div>
                            {!expNotes[exp.id] ? (
                              <p className="text-xs text-muted-foreground/50">加载中...</p>
                            ) : expNotes[exp.id].length === 0 ? (
                              <p className="text-xs text-muted-foreground/50">暂无关联笔记</p>
                            ) : (
                              <div className="space-y-1">
                                {expNotes[exp.id].map((note) => (
                                  <Link
                                    key={note.id}
                                    href={`/knowledge/${note.id}`}
                                    className="flex items-center gap-2 py-0.5 text-xs hover:bg-muted/30 rounded px-1 -mx-1 transition-colors"
                                  >
                                    <span className="flex-1 truncate hover:text-primary transition-colors">{note.title}</span>
                                    {note.category && (
                                      <span className="inline-flex px-1 py-0.5 rounded bg-muted text-[10px] text-muted-foreground shrink-0">
                                        {note.category}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                      {formatDate(note.updatedAt)}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧: 关联文献 + 任务 */}
        <div className="space-y-6">
          {/* 关联文献 */}
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3">关联文献</h2>
            {project.papers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">暂无关联文献</p>
            ) : (
              <div className="space-y-2">
                {project.papers.map((pp) => {
                  const p = pp.paper;
                  const authors = (() => {
                    try { return JSON.parse(p.authors).slice(0, 2).join(", "); } catch { return p.authors; }
                  })();
                  return (
                    <Link
                      key={p.id}
                      href={`/papers/${p.id}`}
                      className="block p-2.5 rounded-lg border hover:border-primary/30 hover:bg-muted/20 transition-colors"
                    >
                      <p className="text-xs font-medium line-clamp-2">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {authors} · {p.journal && `${p.journal}, `}{p.year}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* 任务 */}
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3">
              待办任务 ({project.tasks.length})
            </h2>
            {project.tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">暂无任务</p>
            ) : (
              <div className="space-y-2">
                {project.tasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/20">
                    <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs line-clamp-2">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLORS[t.priority]}`}>
                          {t.priority === "urgent" ? "紧急" : t.priority === "high" ? "高" : t.priority === "medium" ? "中" : "低"}
                        </span>
                        {t.dueDate && (
                          <span className="text-[10px] text-muted-foreground">{formatDate(t.dueDate)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新建实验弹窗 */}
      {showExpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl shadow-xl border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-background z-10">
              <h3 className="text-base font-semibold">新建实验记录</h3>
              <button onClick={() => { setShowExpModal(false); setUploadedImages([]); setSelectedTemplateId(""); setShowSaveTemplateInput(false); setNewTemplateName(""); }} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={createExperiment} className="p-5 space-y-4">
              {/* 选择模板 */}
              <div className="p-4 rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/20">
                <div className="flex items-center gap-2 mb-2">
                  <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">选择模板</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => applyTemplate(e.target.value)}
                    className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">-- 不使用模板 --</option>
                    {(() => {
                      const groups: Record<string, ExperimentTemplate[]> = {};
                      templates.forEach((tpl) => {
                        const cat = tpl.category || "其他";
                        if (!groups[cat]) groups[cat] = [];
                        groups[cat].push(tpl);
                      });
                      const catOrder = ["水质", "土壤", "大气", "微生物", "有机物", "自定义"];
                      return catOrder.map((cat) => {
                        const items = groups[cat];
                        if (!items || items.length === 0) return null;
                        return (
                          <optgroup key={cat} label={cat}>
                            {items.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.name}{tpl.isBuiltin ? " (内置)" : ""}
                              </option>
                            ))}
                          </optgroup>
                        );
                      });
                    })()}
                  </select>
                  {selectedTemplateId && !templates.find((t) => t.id === selectedTemplateId)?.isBuiltin && (
                    <button
                      type="button"
                      onClick={() => deleteTemplate(selectedTemplateId)}
                      className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 shrink-0"
                      title="删除模板"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">实验标题 *</label>
                <input
                  required
                  value={expForm.title}
                  onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
                  placeholder="例如: 土壤微塑料提取方法对比实验"
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium">实验目的</label>
                <textarea
                  rows={3}
                  value={expForm.objective}
                  onChange={(e) => setExpForm({ ...expForm, objective: e.target.value })}
                  placeholder="描述实验目的和研究问题"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">试剂/材料</label>
                  <textarea
                    rows={4}
                    value={expForm.reagents}
                    onChange={(e) => setExpForm({ ...expForm, reagents: e.target.value })}
                    placeholder="每行一个: 名称,纯度,用量&#10;NaCl,AR,500g&#10;H₂O₂,30%,100mL"
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">实验条件</label>
                  <textarea
                    rows={4}
                    value={expForm.conditions}
                    onChange={(e) => setExpForm({ ...expForm, conditions: e.target.value })}
                    placeholder="每行一个: 参数:值&#10;温度:25°C&#10;pH:7.0&#10;时间:120min"
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">实验方法</label>
                <textarea
                  rows={5}
                  value={expForm.methods}
                  onChange={(e) => setExpForm({ ...expForm, methods: e.target.value })}
                  placeholder="描述实验步骤和方法(Markdown)"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium">实验结果</label>
                <textarea
                  rows={5}
                  value={expForm.results}
                  onChange={(e) => setExpForm({ ...expForm, results: e.target.value })}
                  placeholder="记录实验数据和观察结果&#10;支持表格格式:&#10;样品名称	浓度	吸光度&#10;Sample1	0.1	0.523&#10;Sample2	0.2	0.891"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium">结论</label>
                <textarea
                  rows={3}
                  value={expForm.conclusion}
                  onChange={(e) => setExpForm({ ...expForm, conclusion: e.target.value })}
                  placeholder="总结实验结论和下一步计划"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {/* 图片上传区域 */}
              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <ImagePlus className="h-3.5 w-3.5" />
                  实验图片
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    uploading ? "border-primary/30 bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40"
                  }`}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">上传中...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        拖拽图片到此处，或
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-primary hover:underline mx-1"
                        >
                          点击上传
                        </button>
                      </p>
                      <p className="text-[10px] text-muted-foreground">支持 PNG/JPEG/WEBP/GIF，单文件不超过 10MB</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files) Array.from(files).forEach(handleImageUpload);
                          e.target.value = "";
                        }}
                        multiple
                      />
                    </div>
                  )}
                </div>

                {/* 已上传预览 */}
                {uploadedImages.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {uploadedImages.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg border overflow-hidden group">
                        <img src={img} alt={`预览 ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 保存为模板 */}
              <div className="pt-2 border-t">
                {showSaveTemplateInput ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="输入模板名称"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveAsTemplate(); }
                        if (e.key === "Escape") { setShowSaveTemplateInput(false); setNewTemplateName(""); }
                      }}
                      className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={saveAsTemplate}
                      disabled={!newTemplateName.trim()}
                      className="inline-flex items-center gap-1 px-3 h-9 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" /> 保存
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowSaveTemplateInput(false); setNewTemplateName(""); }}
                      className="p-2 rounded-lg hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSaveTemplateInput(true)}
                    disabled={!expForm.title.trim()}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <FileText className="h-3.5 w-3.5" /> 保存为模板
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowExpModal(false); setUploadedImages([]); setSelectedTemplateId(""); setShowSaveTemplateInput(false); setNewTemplateName(""); }}
                  className="px-4 h-9 text-sm rounded-lg border hover:bg-muted"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={expSaving || !expForm.title.trim()}
                  className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {expSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新建里程碑弹窗 */}
      {showMilestoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl shadow-xl border w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-base font-semibold">添加里程碑</h3>
              <button onClick={() => setShowMilestoneModal(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium">标题 *</label>
                <input
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  placeholder="例如: 完成文献调研与综述"
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium">截止日期</label>
                <input
                  type="date"
                  value={newMilestoneDate}
                  onChange={(e) => setNewMilestoneDate(e.target.value)}
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowMilestoneModal(false)} className="px-4 h-9 text-sm rounded-lg border hover:bg-muted">
                  取消
                </button>
                <button
                  onClick={createMilestone}
                  disabled={!newMilestoneTitle.trim()}
                  className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={previewImage}
              alt="预览"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 p-1 rounded-full bg-background border shadow hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
