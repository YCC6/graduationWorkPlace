"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FlaskConical, Plus, Clock, CheckCircle2, Loader2, X, ChevronsUpDown } from "lucide-react";
import toast from "react-hot-toast";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  phase: string;
  progress: number;
  startDate: string | null;
  _count: { milestones: number; experiments: number; papers: number };
}

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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPhase, setFormPhase] = useState("preparation");
  const [submitting, setSubmitting] = useState(false);

  // 阶段切换弹窗
  const [phaseMenuProjectId, setPhaseMenuProjectId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, description: formDesc, phase: formPhase }),
      });
      if (res.ok) {
        toast.success("项目已创建");
        setShowNewModal(false);
        setFormName("");
        setFormDesc("");
        fetch("/api/projects").then((r) => r.json()).then(setProjects);
        window.dispatchEvent(new Event("counts-changed"));
      } else {
        toast.error("创建失败");
      }
    } catch {
      toast.error("创建失败");
    }
    setSubmitting(false);
  };

  const updateProjectPhase = async (projectId: string, newPhase: string) => {
    setPhaseMenuProjectId(null);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: newPhase }),
      });
      toast.success(`阶段已切换为「${PHASE_LABELS[newPhase]}」`);
      // 更新本地状态
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, phase: newPhase } : p))
      );
    } catch {
      toast.error("切换失败");
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">研究项目</h1>
          <p className="text-sm text-muted-foreground mt-0.5">共 {projects.length} 个项目</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新建项目
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border rounded-xl">
          <FlaskConical className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm">暂无研究项目</p>
          <button onClick={() => setShowNewModal(true)} className="mt-2 text-sm text-primary hover:underline">
            创建第一个项目
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all relative group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-amber-50">
                  <FlaskConical className="h-5 w-5 text-amber-600" />
                </div>
                {/* 阶段标签（可点击切换） */}
                <div className="relative">
                  <button
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setPhaseMenuProjectId(phaseMenuProjectId === project.id ? null : project.id);
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${PHASE_COLORS[project.phase]} hover:opacity-80 transition-opacity cursor-pointer`}
                    title="点击切换阶段"
                  >
                    {PHASE_LABELS[project.phase]}
                    <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                  </button>
                  {phaseMenuProjectId === project.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setPhaseMenuProjectId(null)} />
                      <div className="absolute top-full right-0 mt-1 z-20 bg-background rounded-lg border shadow-lg py-1 w-32">
                        {PHASE_ORDER.map((phase) => (
                          <button
                            key={phase}
                            onClick={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              updateProjectPhase(project.id, phase);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2 ${
                              project.phase === phase ? "font-medium bg-muted/50" : ""
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${
                              phase === "preparation" ? "bg-blue-400" :
                              phase === "experiment" ? "bg-amber-400" :
                              phase === "writing" ? "bg-violet-400" : "bg-green-400"
                            }`} />
                            {PHASE_LABELS[phase]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <Link href={`/projects/${project.id}`} className="block">
                <h3 className="text-sm font-semibold mb-1.5 line-clamp-2 hover:text-primary transition-colors">{project.name}</h3>
              </Link>
              {project.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
              )}

              {/* 进度条 */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">进展</span>
                  <span className="font-medium">{project.progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>

              {/* 统计 */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {project._count.milestones} 里程碑
                </span>
                <span className="flex items-center gap-1">
                  <FlaskConical className="h-3 w-3" />
                  {project._count.experiments} 实验
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建项目弹窗 */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewModal(false)}>
          <div className="bg-background rounded-xl shadow-xl border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-base font-semibold">新建研究项目</h3>
              <button onClick={() => setShowNewModal(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={createProject} className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium">项目名称 *</label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如: 微塑料在水生食物链中的迁移"
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium">项目阶段</label>
                <select
                  value={formPhase}
                  onChange={(e) => setFormPhase(e.target.value)}
                  className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="preparation">准备阶段</option>
                  <option value="experiment">实验阶段</option>
                  <option value="writing">写作阶段</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">描述（可选）</label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="简要描述研究背景和目标"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNewModal(false)} className="px-4 h-9 text-sm rounded-lg border hover:bg-muted">
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formName.trim()}
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
