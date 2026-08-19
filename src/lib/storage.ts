import path from "path";

/**
 * 上传文件落盘目录。
 * - 本地/Electron 桌面版：不设置 UPLOAD_DIR 时，回退到 Next 的 public/uploads（兼容既有逻辑）。
 * - 云部署（Railway/Render 等）：通过 UPLOAD_DIR 指向持久卷（如 /data/uploads），
 *   这样重新部署不会丢失用户上传的 PDF / 图片。
 */
export function getUploadsDir(): string {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  return path.join(process.cwd(), "public", "uploads");
}

/** 生成对外可访问的上传文件 URL（始终走 /api/uploads 接口，便于跨环境持久化）。 */
export function publicUploadUrl(fileName: string): string {
  return `/api/uploads/${fileName}`;
}
