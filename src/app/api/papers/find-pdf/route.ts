import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { findOaPdf, isCompletePdf } from "@/lib/oa-pdf";
import { normalizeDoi } from "@/lib/metadata";
import { getUploadsDir, publicUploadUrl } from "@/lib/storage";

// 下载耗时波动极大：同一篇 1MB 的 arXiv PDF 实测一次 1.2 秒、一次 64.7 秒。
// 超时给太小只会得到「魔数正确但尾部截断」的残件，比直接失败更难排查。
const DOWNLOAD_TIMEOUT = 110_000;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

export const maxDuration = 150;

/**
 * 由 DOI / 标题自动查找开放获取 PDF 并落盘。
 * 成功返回的字段与 /api/upload 对齐，前端可直接塞进建档表单。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const doi = normalizeDoi(body?.doi) ?? null;
    const title = typeof body?.title === "string" ? body.title.trim() : null;

    if (!doi && !title) {
      return NextResponse.json(
        { error: "请至少提供 DOI 或标题" },
        { status: 400 },
      );
    }

    // 1. 探源
    const hit = await findOaPdf({ doi, title });
    if (!hit) {
      return NextResponse.json({
        found: false,
        reason:
          "未找到开放获取版本。该文献可能属于订阅制期刊或中文数据库，请手动上传 PDF。",
      });
    }

    // 2. 下载
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
    let buf: Buffer;
    try {
      const res = await fetch(hit.url, {
        headers: { "User-Agent": "GradWorkbench/1.0 (research)" },
        signal: controller.signal,
        redirect: "follow",
      });
      if (!res.ok) {
        return NextResponse.json({
          found: false,
          reason: `PDF 直链返回 ${res.status}，来源 ${hit.source}`,
          pdfUrl: hit.url,
        });
      }
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_PDF_BYTES) {
        return NextResponse.json({
          found: false,
          reason: "PDF 超过 50MB 上限，请手动下载",
          pdfUrl: hit.url,
        });
      }
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return NextResponse.json({
        found: false,
        reason: aborted
          ? "下载超时（超过 110 秒），可点击直链手动下载后上传"
          : "下载失败，可点击直链手动下载后上传",
        pdfUrl: hit.url,
      });
    } finally {
      clearTimeout(timer);
    }

    // 3. 完整性校验 —— 截断的残件绝不能入库，否则后续全文提取必炸
    if (!isCompletePdf(buf)) {
      return NextResponse.json({
        found: false,
        reason: "下载到的文件不是完整 PDF（可能被中途截断），请手动下载",
        pdfUrl: hit.url,
      });
    }
    if (buf.length > MAX_PDF_BYTES) {
      return NextResponse.json({
        found: false,
        reason: "PDF 超过 50MB 上限",
        pdfUrl: hit.url,
      });
    }

    // 4. 落盘，命名规则与 /api/upload 保持一致（持久卷感知）
    const uploadsDir = getUploadsDir();
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.pdf`;
    await writeFile(path.join(uploadsDir, fileName), buf);

    return NextResponse.json({
      found: true,
      fileName,
      filePath: publicUploadUrl(fileName),
      fileSize: buf.length,
      source: hit.source,
      pdfUrl: hit.url,
      matchedTitle: hit.matchedTitle,
    });
  } catch (error) {
    console.error("自动查找 PDF 失败:", error);
    return NextResponse.json(
      { error: "自动查找 PDF 失败" },
      { status: 500 },
    );
  }
}
