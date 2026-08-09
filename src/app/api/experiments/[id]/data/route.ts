import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 获取实验数据点（按 series 分组）
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const dataPoints = await prisma.experimentData.findMany({
      where: { experimentId: params.id },
      orderBy: { xValue: "asc" },
    });

    const seriesSet = [...new Set(dataPoints.map((d) => d.series || "默认"))];

    return NextResponse.json({
      data: dataPoints.map((d) => ({
        id: d.id,
        label: d.label,
        xValue: d.xValue,
        yValue: d.yValue,
        series: d.series || "默认",
      })),
      series: seriesSet,
    });
  } catch (error) {
    console.error("获取实验数据失败:", error);
    return NextResponse.json({ error: "获取实验数据失败" }, { status: 500 });
  }
}

// 批量替换数据点（先删除旧数据，再插入新数据）
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const dataPoints = body.dataPoints as Array<{
      label: string;
      xValue: number;
      yValue: number;
      series?: string;
    }>;

    if (!Array.isArray(dataPoints)) {
      return NextResponse.json({ error: "dataPoints 必须是数组" }, { status: 400 });
    }

    // 先删除旧数据
    await prisma.experimentData.deleteMany({
      where: { experimentId: params.id },
    });

    // 插入新数据
    if (dataPoints.length > 0) {
      await prisma.experimentData.createMany({
        data: dataPoints.map((d) => ({
          experimentId: params.id,
          label: d.label,
          xValue: d.xValue,
          yValue: d.yValue,
          series: d.series || null,
        })),
      });
    }

    // 返回最新数据
    const updated = await prisma.experimentData.findMany({
      where: { experimentId: params.id },
      orderBy: { xValue: "asc" },
    });

    const seriesSet = [...new Set(updated.map((d) => d.series || "默认"))];

    return NextResponse.json({
      data: updated.map((d) => ({
        id: d.id,
        label: d.label,
        xValue: d.xValue,
        yValue: d.yValue,
        series: d.series || "默认",
      })),
      series: seriesSet,
    });
  } catch (error) {
    console.error("保存实验数据失败:", error);
    return NextResponse.json({ error: "保存实验数据失败" }, { status: 500 });
  }
}
