import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import fs from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { PY_UTF8_ENV, decodeProcessOutput } from "@/lib/subprocess";

// 解析脚本依赖的 Python（含 python-docx + pywin32，用于 .doc->.docx 转换）。
// 默认指向本机 WorkBuddy 托管 venv；可通过环境变量 COURSE_PARSER_PYTHON 覆盖。
function resolvePython(): string {
  const env = process.env.COURSE_PARSER_PYTHON;
  if (env && existsSync(env)) return env;
  const candidates = [
    "C:/Users/天堂之路/.workbuddy/binaries/python/envs/default/Scripts/python.exe",
    "python3",
    "python",
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "python";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "未收到文件" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name || ".docx").toLowerCase() || ".docx";
    const tmp = path.join(os.tmpdir(), `schedule_${Date.now()}${ext}`);
    await fs.writeFile(tmp, buf);

    const py = resolvePython();
    const script = path.join(process.cwd(), "scripts", "parse_schedule.py");
    const res = spawnSync(py, [script, tmp], {
      timeout: 120000,
      // 关键：强制子进程以 UTF-8 输出，避免 Windows ANSI 代码页(cp936)导致中文乱码
      // 关键：强制子进程以 UTF-8 输出（PY_UTF8_ENV 放最后，确保覆盖外部环境变量）
      env: { ...process.env, ...PY_UTF8_ENV },
    });
    await fs.unlink(tmp).catch(() => {});

    if (res.error) {
      return NextResponse.json(
        { error: `解析器启动失败（请确认本机已安装 Word 且 Python 环境含 python-docx/pywin32）: ${res.error.message}` },
        { status: 500 }
      );
    }
    if (res.status !== 0) {
      const errText = decodeProcessOutput(res.stderr as Buffer);
      return NextResponse.json(
        { error: `解析失败: ${errText.slice(0, 300) || "未知错误"}` },
        { status: 500 }
      );
    }
    const stdout = decodeProcessOutput(res.stdout as Buffer);
    let data: unknown;
    try {
      data = JSON.parse(stdout);
    } catch {
      return NextResponse.json({ error: `解析结果无法解析: ${stdout.slice(0, 200)}` }, { status: 500 });
    }
    // 脚本自身返回的 error（如"未找到表格"）也以 400 语义透出，便于前端提示
    if (data && typeof data === "object" && "error" in data) {
      return NextResponse.json(data, { status: 422 });
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("课程导入失败:", e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
