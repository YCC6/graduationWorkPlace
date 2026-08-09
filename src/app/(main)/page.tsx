"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BookOpen,
  FlaskConical,
  Brain,
  CheckSquare,
  TrendingUp,
  Plus,
  ArrowRight,
  Clock,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface DashboardData {
  stats: {
    totalPapers: number;
    unreadPapers: number;
    readingPapers: number;
    readPapers: number;
    totalNotes: number;
    totalKnowledgeNotes: number;
    totalProjects: number;
    activeTasks: number;
    recentPapers: number;
  };
  activities: Array<{
    id: string;
    type: string;
    title: string;
    detail: string | null;
    createdAt: string;
  }>;
  upcomingTasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate: string | null;
    project?: { name: string } | null;
  }>;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-50",
  high: "text-orange-600 bg-orange-50",
  medium: "text-blue-600 bg-blue-50",
  low: "text-gray-500 bg-gray-100",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-32" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, activities, upcomingTasks } = data;

  const statCards = [
    {
      label: "文献总量",
      value: stats.totalPapers,
      sub: `待读 ${stats.unreadPapers} · 在读 ${stats.readingPapers}`,
      icon: BookOpen,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/papers",
      quickAction: { label: "添加文献", href: "/papers?action=new" },
    },
    {
      label: "研究项目",
      value: stats.totalProjects,
      sub: `${stats.recentPapers} 篇本周新增文献`,
      icon: FlaskConical,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: "/projects",
      quickAction: { label: "新建项目", href: "/projects?action=new" },
    },
    {
      label: "知识笔记",
      value: stats.totalKnowledgeNotes,
      sub: `${stats.totalNotes} 篇文献笔记`,
      icon: Brain,
      color: "text-violet-600",
      bg: "bg-violet-50",
      href: "/knowledge",
      quickAction: { label: "写笔记", href: "/knowledge?action=new" },
    },
    {
      label: "待办任务",
      value: stats.activeTasks,
      sub: "个进行中",
      icon: CheckSquare,
      color: "text-orange-600",
      bg: "bg-orange-50",
      href: "/tasks",
      quickAction: { label: "添加任务", href: "/tasks?action=new" },
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-0.5">欢迎回来，今日研究进度概览</p>
        </div>
        <Link
          href="/papers?action=new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          添加文献
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group relative rounded-xl border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <TrendingUp className="h-4 w-4 text-muted-foreground/50" />
            </div>
            <div className="text-3xl font-bold text-foreground">{card.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{card.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{card.sub}</div>
            {card.quickAction && (
              <div className="mt-3 pt-3 border-t flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <span>{card.quickAction.label}</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* 两栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 近期动态 */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">近期动态</h3>
          </div>
          <div className="divide-y">
            {activities.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                暂无活动记录
              </div>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{activity.title}</span>
                      {activity.detail && (
                        <span className="text-muted-foreground"> {activity.detail}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(activity.createdAt, "relative")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 近期任务 */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">近期任务</h3>
            <Link href="/tasks" className="text-xs text-primary hover:underline">
              查看全部
            </Link>
          </div>
          <div className="divide-y">
            {upcomingTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                暂无待办任务
              </div>
            ) : (
              upcomingTasks.map((task) => (
                <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{task.title}</p>
                    {task.project && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {task.project.name}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      PRIORITY_COLORS[task.priority] || ""
                    }`}
                  >
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                  {task.dueDate && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(task.dueDate, "short")}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
