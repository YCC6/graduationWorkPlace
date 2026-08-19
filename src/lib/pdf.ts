import fs from "fs";
import path from "path";
import { getUploadsDir } from "./storage";

// pdf-parse 1.1.1 的入口会误跑内置测试并读取示例 PDF，
// 直接引 lib 子路径可规避；该库仅在 Node 运行时（route handler）使用。
// @ts-ignore - 子路径无类型声明
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const MAX_CHARS = 5_000_000; // 与 papers/[id]/content 接口保持一致

/**
 * 从已上传的 PDF 中提取纯文本（服务端，基于 pdf-parse）。
 * @param relativePath 形如 "/uploads/xxx.pdf"
 * @returns 提取到的文本；文件不存在或提取失败时返回 null
 */
export async function extractPdfText(
  relativePath: string,
): Promise<string | null> {
  try {
    let abs: string;
    if (relativePath.startsWith("/api/uploads/")) {
      // 新格式：/api/uploads/xxx.pdf → 真实上传目录（可能位于持久卷）
      const name = relativePath.replace(/^\/api\/uploads\//, "");
      abs = path.join(getUploadsDir(), name);
    } else {
      // 旧格式兼容：/uploads/xxx.pdf → public/uploads
      abs = path.join(process.cwd(), "public", relativePath.replace(/^\/+/, ""));
    }
    if (!fs.existsSync(abs)) return null;
    const buf = fs.readFileSync(abs);
    // pdf-parse 在 Node 下返回 { text, numpages, ... }
    const result = await pdfParse(buf);
    const text = (result?.text || "").replace(/\u0000/g, "").trim();
    if (!text) return null;
    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  } catch (err) {
    console.error("PDF 文本提取失败:", err);
    return null;
  }
}
