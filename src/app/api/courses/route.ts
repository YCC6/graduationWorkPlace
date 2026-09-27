import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type InCourse = {
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

export async function GET() {
  try {
    const courses = await prisma.course.findMany({ orderBy: [{ dayOfWeek: "asc" }, { sectionStart: "asc" }] });
    return NextResponse.json({ courses });
  } catch (e) {
    console.error("获取课程失败:", e);
    return NextResponse.json({ courses: [] }, { status: 200 });
  }
}

// 保存一次导入的课程：用新集合整体替换旧课程，并写入学期起始日（第1周周一）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const list: InCourse[] = Array.isArray(body.courses) ? body.courses : [];
    const semesterStart = body.semesterStart ? new Date(body.semesterStart) : null;
    const semesterEnd = body.semesterEnd ? new Date(body.semesterEnd) : null;

    await prisma.$transaction([
      prisma.course.deleteMany({}),
      prisma.course.createMany({
        data: list.map((c) => ({
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
          semesterStart,
          semesterEnd,
        })),
      }),
    ]);
    return NextResponse.json({ ok: true, count: list.length });
  } catch (e) {
    console.error("保存课程失败:", e);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
