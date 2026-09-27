import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractPdfText } from "@/lib/pdf";

// 存储 PDF 提取的全文（用于全文检索）；body.build=true 时由服务端直接提取并保存
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();

    // 建索引模式：服务端读取 PDF 抽取正文并落库
    if (body.build === true) {
      const paper = await prisma.paper.findUnique({
        where: { id: params.id },
        select: { filePath: true, content: true },
      });
      if (!paper?.filePath) {
        return NextResponse.json({ error: "该文献没有可提取的 PDF 文件" }, { status: 400 });
      }
      // 已有正文则直接复用，避免重复抽取
      let text = paper.content && paper.content.trim() ? paper.content : null;
      if (!text) {
        text = await extractPdfText(paper.filePath);
      }
      if (!text) {
        return NextResponse.json(
          { error: "未能从 PDF 中提取到正文，可能是扫描件或加密文档" },
          { status: 422 },
        );
      }
      await prisma.paper.update({
        where: { id: params.id },
        data: { content: text.slice(0, 5_000_000) },
      });
      return NextResponse.json({ ok: true, length: text.length, built: true });
    }

    const content =
      typeof body.content === "string" ? body.content.slice(0, 5_000_000) : "";
    await prisma.paper.update({
      where: { id: params.id },
      data: { content },
    });
    return NextResponse.json({ ok: true, length: content.length });
  } catch (error) {
    console.error("保存全文失败:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
