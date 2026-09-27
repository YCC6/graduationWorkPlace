import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 聚合所有带日期的实体，供日历 / 时间轴视图使用
export async function GET() {
  try {
    const [tasks, milestones, projects] = await Promise.all([
      // 任务：截止日期
      prisma.task.findMany({
        where: { dueDate: { not: null } },
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          dueDate: true,
          project: { select: { id: true, name: true } },
        },
      }),
      // 项目里程碑：截止日期
      prisma.milestone.findMany({
        where: { dueDate: { not: null } },
        select: {
          id: true,
          title: true,
          dueDate: true,
          completed: true,
          project: { select: { id: true, name: true } },
        },
      }),
      // 研究项目：开始 / 结束日期
      prisma.project.findMany({
        where: { OR: [{ startDate: { not: null } }, { endDate: { not: null } }] },
        select: { id: true, name: true, startDate: true, endDate: true, status: true },
      }),
    ]);

    const events: Array<{
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
    }> = [];

    // 课程：按周次生成每周发生事件
    const courses = await prisma.course.findMany();
    for (const c of courses) {
      const sem = c.semesterStart;
      if (!sem) continue;
      const sw = c.startWeek ?? 1;
      const ew = c.endWeek ?? 18;
      for (let w = sw; w <= ew; w++) {
        const d = new Date(sem);
        d.setDate(d.getDate() + (w - 1) * 7 + (c.dayOfWeek - 1));
        const dateStr = d.toISOString().slice(0, 10);
        events.push({
          id: `course-${c.id}-${w}`,
          title: c.name,
          date: dateStr,
          type: "course",
          subtitle: `${c.period ?? ""} ${c.sectionStart}-${c.sectionEnd}节${c.room ? " @ " + c.room : ""}`,
          teacher: c.teacher ?? undefined,
          url: "/calendar",
        });
      }
    }

    for (const t of tasks) {
      if (t.dueDate) {
        events.push({
          id: `task-${t.id}`,
          title: t.title,
          date: t.dueDate.toISOString().slice(0, 10),
          type: "task",
          priority: t.priority,
          status: t.status,
          projectId: t.project?.id,
          projectName: t.project?.name,
          url: "/tasks",
        });
      }
    }

    for (const m of milestones) {
      if (m.dueDate) {
        events.push({
          id: `milestone-${m.id}`,
          title: m.title,
          date: m.dueDate.toISOString().slice(0, 10),
          type: "milestone",
          completed: m.completed,
          projectId: m.project?.id,
          projectName: m.project?.name,
          url: m.project?.id ? `/projects/${m.project.id}` : "/projects",
        });
      }
    }

    for (const p of projects) {
      if (p.startDate) {
        events.push({
          id: `pstart-${p.id}`,
          title: `启动：${p.name}`,
          date: p.startDate.toISOString().slice(0, 10),
          type: "project-start",
          status: p.status,
          projectId: p.id,
          projectName: p.name,
          url: `/projects/${p.id}`,
        });
      }
      if (p.endDate) {
        events.push({
          id: `pend-${p.id}`,
          title: `结题：${p.name}`,
          date: p.endDate.toISOString().slice(0, 10),
          type: "project-end",
          status: p.status,
          projectId: p.id,
          projectName: p.name,
          url: `/projects/${p.id}`,
        });
      }
    }

    // 按日期升序
    events.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ events });
  } catch (error) {
    console.error("获取日历事件失败:", error);
    return NextResponse.json({ events: [] }, { status: 200 });
  }
}
