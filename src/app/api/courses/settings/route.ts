import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SECTION_TIMES,
  SECTION_TIMES_KEY,
  normalizeSectionTimes,
} from "@/lib/scheduleTimes";

/** 读取课表作息时间（未设置过则返回默认值） */
export async function GET() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SECTION_TIMES_KEY } });
    let sectionTimes = DEFAULT_SECTION_TIMES;
    let isDefault = true;
    if (row?.value) {
      try {
        sectionTimes = normalizeSectionTimes(JSON.parse(row.value));
        isDefault = false;
      } catch {
        /* 存量数据损坏则回退默认值 */
      }
    }
    return NextResponse.json({ sectionTimes, isDefault });
  } catch (e) {
    console.error("读取作息时间失败:", e);
    return NextResponse.json({ sectionTimes: DEFAULT_SECTION_TIMES, isDefault: true });
  }
}

/** 保存课表作息时间 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sectionTimes = normalizeSectionTimes(body?.sectionTimes);
    const value = JSON.stringify(sectionTimes);
    await prisma.appSetting.upsert({
      where: { key: SECTION_TIMES_KEY },
      create: { key: SECTION_TIMES_KEY, value },
      update: { value },
    });
    return NextResponse.json({ ok: true, sectionTimes });
  } catch (e) {
    console.error("保存作息时间失败:", e);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
