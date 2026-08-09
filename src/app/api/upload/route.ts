import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未提供文件" }, { status: 400 });
    }

    // 验证文件类型
    const imageTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    const pdfType = "application/pdf";
    const isPdf = file.type === pdfType || file.name.toLowerCase().endsWith(".pdf");
    const isImage = imageTypes.includes(file.type);

    if (!isImage && !isPdf) {
      return NextResponse.json({ error: "不支持的文件类型，仅支持 PNG/JPEG/WEBP/GIF/PDF" }, { status: 400 });
    }

    // 验证文件大小 (图片 10MB, PDF 50MB)
    const maxSize = isPdf ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: `文件大小不能超过 ${isPdf ? 50 : 10}MB` }, { status: 400 });
    }

    // 确保 uploads 目录存在
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // 生成唯一文件名
    const ext = path.extname(file.name) || ".png";
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, fileName);

    // 写入文件
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    return NextResponse.json({
      fileName,
      filePath: `/uploads/${fileName}`,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("上传文件失败:", error);
    return NextResponse.json({ error: "上传文件失败" }, { status: 500 });
  }
}
