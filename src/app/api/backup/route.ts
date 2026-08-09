import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// 全量导出所有数据表为 JSON（用于本地备份 / 防丢）
export async function GET() {
  try {
    const [
      papers,
      tags,
      paperTagRelations,
      citations,
      paperNotes,
      pdfAnnotations,
      projects,
      milestones,
      experiments,
      experimentRefs,
      experimentData,
      projectPapers,
      experimentTemplates,
      knowledgeNotes,
      knowledgeTags,
      knowledgeNoteTags,
      tasks,
      documents,
      chapters,
      writingGoals,
      versions,
      activities,
    ] = await Promise.all([
      prisma.paper.findMany(),
      prisma.tag.findMany(),
      prisma.paperTagRelation.findMany(),
      prisma.citation.findMany(),
      prisma.paperNote.findMany(),
      prisma.pdfAnnotation.findMany(),
      prisma.project.findMany(),
      prisma.milestone.findMany(),
      prisma.experiment.findMany(),
      prisma.experimentRef.findMany(),
      prisma.experimentData.findMany(),
      prisma.projectPaper.findMany(),
      prisma.experimentTemplate.findMany(),
      prisma.knowledgeNote.findMany(),
      prisma.knowledgeTag.findMany(),
      prisma.knowledgeNoteTag.findMany(),
      prisma.task.findMany(),
      prisma.document.findMany(),
      prisma.chapter.findMany(),
      prisma.writingGoal.findMany(),
      prisma.version.findMany(),
      prisma.activity.findMany(),
    ]);

    const backup = {
      __meta: {
        app: "GradWorkbench",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        note: "全量数据备份，可通过 /api/backup (POST) 恢复",
      },
      tables: {
        papers,
        tags,
        paperTagRelations,
        citations,
        paperNotes,
        pdfAnnotations,
        projects,
        milestones,
        experiments,
        experimentRefs,
        experimentData,
        projectPapers,
        experimentTemplates,
        knowledgeNotes,
        knowledgeTags,
        knowledgeNoteTags,
        tasks,
        documents,
        chapters,
        writingGoals,
        versions,
        activities,
      },
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="gradworkbench-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("备份导出失败:", error);
    return NextResponse.json({ error: "备份导出失败" }, { status: 500 });
  }
}

// 从备份 JSON 恢复（按 id upsert，安全幂等）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tables = body?.tables;
    if (!tables || typeof tables !== "object") {
      return NextResponse.json({ error: "无效的备份文件" }, { status: 400 });
    }

    const upsertMap: Record<string, (rows: any[]) => Promise<void>> = {
      tags: async (rows) => {
        for (const r of rows)
          await prisma.tag.upsert({
            where: { id: r.id },
            create: r,
            update: { name: r.name, color: r.color },
          });
      },
      papers: async (rows) => {
        for (const r of rows)
          await prisma.paper.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      paperTagRelations: async (rows) => {
        for (const r of rows)
          await prisma.paperTagRelation.upsert({
            where: { id: r.id },
            create: r,
            update: {},
          });
      },
      citations: async (rows) => {
        for (const r of rows)
          await prisma.citation.upsert({
            where: { id: r.id },
            create: r,
            update: { content: r.content, style: r.style },
          });
      },
      paperNotes: async (rows) => {
        for (const r of rows)
          await prisma.paperNote.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      pdfAnnotations: async (rows) => {
        for (const r of rows)
          await prisma.pdfAnnotation.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      projects: async (rows) => {
        for (const r of rows)
          await prisma.project.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      milestones: async (rows) => {
        for (const r of rows)
          await prisma.milestone.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      experiments: async (rows) => {
        for (const r of rows)
          await prisma.experiment.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      experimentRefs: async (rows) => {
        for (const r of rows)
          await prisma.experimentRef.upsert({
            where: { id: r.id },
            create: r,
            update: {},
          });
      },
      experimentData: async (rows) => {
        for (const r of rows)
          await prisma.experimentData.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      projectPapers: async (rows) => {
        for (const r of rows)
          await prisma.projectPaper.upsert({
            where: { id: r.id },
            create: r,
            update: {},
          });
      },
      experimentTemplates: async (rows) => {
        for (const r of rows)
          await prisma.experimentTemplate.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      knowledgeTags: async (rows) => {
        for (const r of rows)
          await prisma.knowledgeTag.upsert({
            where: { id: r.id },
            create: r,
            update: { name: r.name },
          });
      },
      knowledgeNotes: async (rows) => {
        for (const r of rows)
          await prisma.knowledgeNote.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      knowledgeNoteTags: async (rows) => {
        for (const r of rows)
          await prisma.knowledgeNoteTag.upsert({
            where: { id: r.id },
            create: r,
            update: {},
          });
      },
      tasks: async (rows) => {
        for (const r of rows)
          await prisma.task.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      documents: async (rows) => {
        for (const r of rows)
          await prisma.document.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      chapters: async (rows) => {
        for (const r of rows)
          await prisma.chapter.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      writingGoals: async (rows) => {
        for (const r of rows)
          await prisma.writingGoal.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      versions: async (rows) => {
        for (const r of rows)
          await prisma.version.upsert({
            where: { id: r.id },
            create: r,
            update: r,
          });
      },
      activities: async (rows) => {
        for (const r of rows)
          await prisma.activity.upsert({
            where: { id: r.id },
            create: r,
            update: {},
          });
      },
    };

    let restored = 0;
    for (const [key, fn] of Object.entries(upsertMap)) {
      const rows = tables[key];
      if (Array.isArray(rows) && rows.length > 0) {
        await fn(rows);
        restored += rows.length;
      }
    }

    return NextResponse.json({ success: true, restored });
  } catch (error) {
    console.error("恢复备份失败:", error);
    return NextResponse.json({ error: "恢复备份失败" }, { status: 500 });
  }
}
