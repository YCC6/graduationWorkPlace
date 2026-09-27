/**
 * Node 派生 Python 子进程的统一工具。
 *
 * 背景（本项目踩过的坑，务必理解）：
 * Windows 上 Python 子进程 stdout 在被管道重定向时使用 ANSI 代码页(cp936/GBK)，
 * 而 Node 侧若按 UTF-8 解码，中文会全部变成 U+FFFD(�)。
 * 典型症状：教室「徽文楼507」显示成「¥507」
 * （GBK 下「楼」= 字节 C2 A5，恰好是合法 UTF-8，解码即 ¥）。
 *
 * 因此规定：所有 Python 调用点必须
 *   1) 传入 PY_UTF8_ENV 强制子进程以 UTF-8 输出；
 *   2) 不要把 spawnSync 的 encoding 设为 "utf-8"，改为拿到 Buffer 后用
 *      decodeProcessOutput() 解码（内含 gb18030 兜底重解码）。
 *
 * 完整的排查与修复方法见技能 `windows-python-stdout-encoding`。
 */

/** 强制 Python 子进程使用 UTF-8 标准流的环境变量。 */
export const PY_UTF8_ENV: Record<string, string> = {
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
};

/**
 * 把子进程输出的字节解码为字符串。
 * 优先按 UTF-8 解码；若结果含替换字符 U+FFFD，则尝试按 gb18030(GBK 超集) 重解码，
 * 仅当重解码后不再有替换字符时才采信，避免误伤。
 */
export function decodeProcessOutput(
  buf: Buffer | string | null | undefined,
): string {
  if (!buf) return "";
  if (typeof buf === "string") return buf;
  const utf8 = buf.toString("utf-8");
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    const gbk = new TextDecoder("gb18030").decode(buf);
    if (!gbk.includes("\uFFFD")) return gbk;
  } catch {
    /* 运行时不支持 gb18030，忽略 */
  }
  return utf8;
}
