import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface IncomingTurn {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  reasoning?: unknown;
  images?: unknown;
}

/** 把单条对话落库（创建或按 id 幂等更新） */
async function upsertTurn(paperId: string, m: IncomingTurn) {
  if (m.role !== "user" && m.role !== "assistant") return null;
  const content = typeof m.content === "string" ? m.content.slice(0, 60000) : "";
  const reasoning =
    typeof m.reasoning === "string" ? m.reasoning.slice(0, 60000) : null;

  // 图片只保留文件名，剥离 data URL，避免数据库体积膨胀
  let images: string | null = null;
  if (Array.isArray(m.images)) {
    images = JSON.stringify(
      m.images
        .slice(0, 12)
        .map((i) =>
          i && typeof i === "object" && "name" in i
            ? { name: String((i as { name?: unknown }).name ?? "image") }
            : { name: "image" },
        ),
    );
  }

  const data = { paperId, role: m.role, content, reasoning, images };
  const id = typeof m.id === "string" && m.id ? m.id : undefined;

  if (id) {
    return prisma.chatMessage.upsert({
      where: { id },
      create: { ...data, id },
      update: data,
    });
  }
  return prisma.chatMessage.create({ data });
}

// 读取某篇文献的全部 AI 对话（按时间升序）
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!paper) return NextResponse.json({ error: "文献不存在" }, { status: 404 });

    const rows = await prisma.chatMessage.findMany({
      where: { paperId: params.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        reasoning: r.reasoning ?? undefined,
        images: r.images ? JSON.parse(r.images) : undefined,
      })),
    });
  } catch (err) {
    console.error("读取对话历史失败:", err);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

// 批量写入（用户轮 + 助手轮）；按 id 幂等，重复提交不会重复插入
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const paper = await prisma.paper.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!paper) return NextResponse.json({ error: "文献不存在" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const list: IncomingTurn[] = Array.isArray(body.messages) ? body.messages : [];
    const created = [];
    for (const m of list) {
      const row = await upsertTurn(params.id, m);
      if (row) created.push({ id: row.id, role: row.role });
    }
    return NextResponse.json({ ok: true, created });
  } catch (err) {
    console.error("保存对话历史失败:", err);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}

// 清空某篇文献的全部对话
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.chatMessage.deleteMany({ where: { paperId: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("清空对话历史失败:", err);
    return NextResponse.json({ error: "清空失败" }, { status: 500 });
  }
}
