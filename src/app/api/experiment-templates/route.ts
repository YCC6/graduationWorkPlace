import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 环境科学实验模板（内置）
const BUILTIN_TEMPLATES = [
  {
    name: "水质分析 - 常规指标测定",
    category: "水质",
    description: "pH、溶解氧、COD、氨氮、总磷等常规水质指标测定",
    objective: "测定水样中常规理化指标，评估水体质量状况",
    methods: "1. 采样：按照 HJ/T 91 采样规范采集水样\n2. pH 测定：使用 pH 计（GB/T 6920）\n3. 溶解氧：碘量法（HJ 505）\n4. COD：重铬酸钾法（HJ 828）\n5. 氨氮：纳氏试剂分光光度法（HJ 535）\n6. 总磷：钼酸铵分光光度法（GB/T 11893）",
    reagents: JSON.stringify([
      { name: "重铬酸钾", purity: "AR", amount: "0.2500mol/L" },
      { name: "硫酸亚铁铵", purity: "AR", amount: "0.1mol/L" },
      { name: "硫酸银", purity: "AR", amount: "22g/L" },
      { name: "纳氏试剂", purity: "AR", amount: "100mL" },
      { name: "钼酸铵", purity: "AR", amount: "26g/L" },
      { name: "抗坏血酸", purity: "AR", amount: "100g/L" },
    ]),
    conditions: JSON.stringify({
      "温度": "25±2°C",
      "pH范围": "6.5-8.5",
      "消解时间": "120min",
      "消解温度": "170°C",
    }),
  },
  {
    name: "土壤重金属测定",
    category: "土壤",
    description: "土壤中 Cu、Pb、Zn、Cd、Cr 等重金属含量测定",
    objective: "测定土壤样品中重金属元素含量，评估土壤污染状况",
    methods: "1. 样品前处理：风干研磨过 100 目筛\n2. 消解：HNO₃-HF-HClO₄ 三酸消解（GB/T 17141）\n3. 测定：原子吸收分光光度法/ICP-MS\n4. 质控：平行样 + 空白 + 标准物质",
    reagents: JSON.stringify([
      { name: "硝酸", purity: "GR", amount: "500mL" },
      { name: "氢氟酸", purity: "GR", amount: "200mL" },
      { name: "高氯酸", purity: "GR", amount: "100mL" },
      { name: "标准溶液", purity: "1000mg/L", amount: "50mL×5" },
    ]),
    conditions: JSON.stringify({
      "消解温度": "180°C",
      "消解时间": "240min",
      "仪器": "AAS / ICP-MS",
      "检测限": "0.01mg/kg",
    }),
  },
  {
    name: "大气颗粒物采样",
    category: "大气",
    description: "PM2.5/PM10 中流量采样与称重分析",
    objective: "采集大气颗粒物样品并测定质量浓度",
    methods: "1. 采样前滤膜恒重：25°C，50% RH，48h\n2. 采样：中流量采样器，100L/min，24h\n3. 采样后滤膜恒重：同上条件\n4. 称重：万分之一天平\n5. 计算：浓度 = (m₂-m₁) / V",
    reagents: JSON.stringify([
      { name: "玻璃纤维滤膜", purity: "-", amount: "90mm × 3" },
      { name: "硅胶干燥剂", purity: "-", amount: "500g" },
    ]),
    conditions: JSON.stringify({
      "采样流量": "100L/min",
      "采样时间": "24h",
      "恒重温度": "25°C",
      "恒重湿度": "50% RH",
    }),
  },
  {
    name: "微生物计数 - 平板计数法",
    category: "微生物",
    description: "水/土壤样品中菌落总数测定",
    objective: "测定样品中活菌总数，评估微生物污染水平",
    methods: "1. 样品稀释：10倍梯度稀释至 10⁻⁷\n2. 倾注法：取 1mL 稀释液 + 15mL 营养琼脂（45°C）\n3. 培养：37°C，48h\n4. 计数：选择 30-300 菌落的平板",
    reagents: JSON.stringify([
      { name: "营养琼脂", purity: "BR", amount: "33g/L" },
      { name: "生理盐水", purity: "0.85%", amount: "500mL" },
      { name: "NaCl", purity: "AR", amount: "8.5g" },
    ]),
    conditions: JSON.stringify({
      "培养温度": "37°C",
      "培养时间": "48h",
      "pH": "7.2-7.4",
      "稀释梯度": "10⁻¹ ~ 10⁻⁷",
    }),
  },
  {
    name: "有机物提取 - 液液萃取",
    category: "有机物",
    description: "水样中半挥发性有机物液液萃取前处理",
    objective: "从水样中萃取半挥发性有机物供 GC-MS 分析",
    methods: "1. 水样调节：用 HCl 调 pH < 2\n2. 萃取：1000mL 水样 + 60mL DCM × 3次\n3. 干燥：无水硫酸钠\n4. 浓缩：K-D 浓缩器浓缩至 1mL\n5. 净化：硅胶柱净化（如需要）",
    reagents: JSON.stringify([
      { name: "二氯甲烷", purity: "色谱纯", amount: "200mL" },
      { name: "无水硫酸钠", purity: "AR", amount: "50g" },
      { name: "盐酸", purity: "GR", amount: "50mL" },
      { name: "硅胶", purity: "100-200目", amount: "20g" },
    ]),
    conditions: JSON.stringify({
      "萃取pH": "< 2",
      "萃取次数": "3次",
      "浓缩体积": "1mL",
      "萃取温度": "室温",
    }),
  },
  {
    name: "土壤含水量测定",
    category: "土壤",
    description: "烘干法测定土壤含水率",
    objective: "测定土壤样品的含水率",
    methods: "1. 称量铝盒重量 (m₀)\n2. 取样约 10g 放入铝盒，称量 (m₁)\n3. 105°C 烘干 8h 至恒重\n4. 干燥器冷却后称量 (m₂)\n5. 计算：含水率 = (m₁-m₂)/(m₂-m₀) × 100%",
    reagents: JSON.stringify([
      { name: "铝盒", purity: "-", amount: "5个" },
    ]),
    conditions: JSON.stringify({
      "烘干温度": "105°C",
      "烘干时间": "8h",
      "冷却方式": "干燥器",
    }),
  },
];

// 初始化内置模板
async function ensureBuiltinTemplates() {
  for (const tpl of BUILTIN_TEMPLATES) {
    const existing = await prisma.experimentTemplate.findFirst({
      where: { name: tpl.name, isBuiltin: true },
    });
    if (!existing) {
      await prisma.experimentTemplate.create({
        data: { ...tpl, isBuiltin: true },
      });
    }
  }
}

export async function GET() {
  try {
    await ensureBuiltinTemplates();
    const templates = await prisma.experimentTemplate.findMany({
      orderBy: [{ isBuiltin: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json(templates);
  } catch (error) {
    console.error("获取实验模板失败:", error);
    return NextResponse.json({ error: "获取模板失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const template = await prisma.experimentTemplate.create({
      data: {
        name: body.name,
        category: body.category || "自定义",
        description: body.description || null,
        objective: body.objective || null,
        methods: body.methods || null,
        reagents: body.reagents || null,
        conditions: body.conditions || null,
        isBuiltin: false,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("创建实验模板失败:", error);
    return NextResponse.json({ error: "创建模板失败" }, { status: 500 });
  }
}
