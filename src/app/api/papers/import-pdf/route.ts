import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { getUploadsDir, publicUploadUrl } from "@/lib/storage";
import { PY_UTF8_ENV, decodeProcessOutput } from "@/lib/subprocess";

// 定位用于抽取 PDF 元数据的 Python（需装有 pypdf + pdfplumber）。
// 优先使用环境变量，其次回退到本机托管的 venv，最后尝试系统 python。
function findPython(): string {
  const env = process.env.PDF_META_PYTHON;
  const candidates = [
    env,
    "C:/Users/天堂之路/.workbuddy/binaries/python/envs/default/Scripts/python.exe",
    "C:/Users/天堂之路/.workbuddy/binaries/python/versions/3.13.12/python.exe",
    "python3",
    "python",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "python";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "未提供文件" }, { status: 400 });
    }

    const uploadsDir = getUploadsDir();
    if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });

    // 1) 落盘每个 PDF
    const saved: Array<{
      originalName: string;
      savedPath: string;
      fileName: string;
      filePath: string;
      fileSize: number;
    }> = [];
    for (const file of files) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) continue;
      const ext = path.extname(file.name) || ".pdf";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
      const savedPath = path.join(uploadsDir, fileName);
      await writeFile(savedPath, Buffer.from(await file.arrayBuffer()));
      saved.push({
        originalName: file.name,
        savedPath,
        fileName,
        filePath: publicUploadUrl(fileName),
        fileSize: file.size,
      });
    }

    if (saved.length === 0) {
      return NextResponse.json({ error: "仅支持 PDF 文件" }, { status: 400 });
    }

    // 2) 调用本地解析脚本一次性抽取全部元数据
    const script = path.join(process.cwd(), "scripts", "parse_pdf_meta.py");
    const py = findPython();
    const r = spawnSync(py, [script, ...saved.map((s) => s.savedPath)], {
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
      // 强制 Python 使用 UTF-8 标准流：Windows 下子进程默认走 GBK 代码页，
      // 摘要里的中文/特殊字符（如 U+2212）会乱码或触发 UnicodeEncodeError。
      env: { ...process.env, ...PY_UTF8_ENV },
    });

    // 不设 encoding，取 Buffer 自行解码：内含 gb18030 兜底重解码，杜绝 U+FFFD 乱码
    const stdout = decodeProcessOutput(r.stdout as Buffer);
    const stderr = decodeProcessOutput(r.stderr as Buffer);

    let parsed: any[] = [];
    if (r.error || r.status !== 0 || !stdout.trim()) {
      console.error("PDF 元数据解析失败:", r.error?.message || stderr.slice(0, 500));
    } else {
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        console.error("解析脚本输出非 JSON:", stdout.slice(0, 300));
      }
    }

    // 3) 合并落盘信息与解析结果（按数组顺序一一对应）
    const items = saved.map((s, i) => {
      const m = parsed[i] || {};
      return {
        originalName: s.originalName,
        fileName: s.fileName,
        filePath: s.filePath,
        fileSize: s.fileSize,
        title: m.title || null,
        authors: m.authors || [],
        journal: m.journal || null,
        year: m.year || null,
        volume: m.volume || null,
        issue: m.issue || null,
        pages: m.pages || null,
        doi: m.doi || null,
        abstract: m.abstract || null,
        error: m.error || null,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("批量导入 PDF 失败:", error);
    return NextResponse.json({ error: "批量导入 PDF 失败" }, { status: 500 });
  }
}
