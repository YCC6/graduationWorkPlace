import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始播种演示数据...");

  // 清除旧数据
  await prisma.activity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.experimentRef.deleteMany();
  await prisma.experiment.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.projectPaper.deleteMany();
  await prisma.project.deleteMany();
  await prisma.citation.deleteMany();
  await prisma.paperTagRelation.deleteMany();
  await prisma.paperNote.deleteMany();
  await prisma.paper.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.knowledgeNoteTag.deleteMany();
  await prisma.knowledgeNote.deleteMany();
  await prisma.knowledgeTag.deleteMany();

  // 创建标签
  const tagMicroplastics = await prisma.tag.create({ data: { name: "微塑料", color: "#EF4444" } });
  const tagHeavyMetal = await prisma.tag.create({ data: { name: "重金属", color: "#F97316" } });const tagWaterQuality = await prisma.tag.create({ data: { name: "水质", color: "#3B82F6" } });
  const tagSoil = await prisma.tag.create({ data: { name: "土壤", color: "#84CC16" } });
  const tagAdsorption = await prisma.tag.create({ data: { name: "吸附", color: "#8B5CF6" } });
  const tagAdvancedOxidation = await prisma.tag.create({ data: { name: "高级氧化", color: "#EC4899" } });
  const tagEcoTox = await prisma.tag.create({ data: { name: "生态毒理", color: "#14B8A6" } });
  const tagNewPollutant = await prisma.tag.create({ data: { name: "新污染物", color: "#6366F1" } });
  const tagReview = await prisma.tag.create({ data: { name: "综述", color: "#A855F7" } });
  const tagCarbonNeutral = await prisma.tag.create({ data: { name: "碳中和", color: "#22C55E" } });

  // 创建文献
  const paper1 = await prisma.paper.create({
    data: {
      title: "Microplastics in freshwater systems: A review of the occurrence, fate, and ecological risks",
      authors: JSON.stringify(["Wang J.", "Liu X.", "Li Y."]),
      journal: "Environmental Pollution",
      year: 2024,
      volume: "342",
      pages: "123-145",
      doi: "10.1016/j.envpol.2024.123456",
      abstract: "This review comprehensively analyzes the occurrence, distribution, and fate of microplastics in freshwater ecosystems. We discuss the sources, transport mechanisms, and ecological risks associated with microplastics contamination. Special attention is given to the interaction between microplastics and other pollutants, as well as their potential trophic transfer in aquatic food webs.",
      keywords: JSON.stringify(["微塑料", "淡水系统", "生态风险", "综述"]),
      status: "read",
      rating: 5,
    },
  });

  const paper2 = await prisma.paper.create({
    data: {
      title: "Adsorption of heavy metals by biochar derived from agricultural waste: Mechanisms and applications",
      authors: JSON.stringify(["Chen H.", "Zhang M.", "Wang R."]),
      journal: "Journal of Hazardous Materials",
      year: 2024,
      volume: "465",
      pages: "133-150",
      doi: "10.1016/j.jhazmat.2024.133010",
      abstract: "Biochar has emerged as a promising adsorbent for heavy metal removal from contaminated water and soil. This study reviews the preparation methods, modification strategies, and adsorption mechanisms of biochar derived from various agricultural wastes.",
      keywords: JSON.stringify(["生物炭", "重金属", "吸附", "农业废弃物"]),
      status: "reading",
      rating: 4,
    },
  });

  const paper3 = await prisma.paper.create({
    data: {
      title: "Advanced oxidation processes for emerging contaminants removal: Current status and future perspectives",
      authors: JSON.stringify(["Li W.", "Zhang T.", "Sun H."]),
      journal: "Water Research",
      year: 2025,
      volume: "258",
      pages: "121-138",
      doi: "10.1016/j.watres.2025.121010",
      abstract: "Advanced oxidation processes (AOPs) have shown great potential for the degradation of emerging contaminants in water and wastewater. This review evaluates various AOPs including photocatalysis, Fenton-based processes, ozonation, and persulfate activation.",
      keywords: JSON.stringify(["高级氧化", "新污染物", "水处理"]),
      status: "unread",
    },
  });

  const paper4 = await prisma.paper.create({
    data: {
      title: "Spatial distribution and risk assessment of heavy metals in agricultural soils near industrial zones",
      authors: JSON.stringify(["Zhao L.", "Wang F.", "Chen X.", "Liu Z."]),
      journal: "Science of The Total Environment",
      year: 2024,
      volume: "912",
      pages: "169-185",
      doi: "10.1016/j.scitotenv.2024.169420",
      abstract: "This study investigates the spatial distribution of eight heavy metals in agricultural soils surrounding three major industrial zones. Geo-accumulation index and potential ecological risk index were used to assess contamination levels and ecological risks.",
      keywords: JSON.stringify(["重金属", "土壤污染", "风险评估", "空间分布"]),
      status: "read",
      rating: 4,
    },
  });

  const paper5 = await prisma.paper.create({
    data: {
      title: "Microplastic ingestion by aquatic organisms: A meta-analysis of global studies",
      authors: JSON.stringify(["Yang Q.", "Huang Y.", "Gao B."]),
      journal: "Environmental Science & Technology",
      year: 2024,
      volume: "58",
      issue: "15",
      pages: "6542-6558",
      doi: "10.1021/acs.est.4c00210",
      abstract: "We conducted a comprehensive meta-analysis of 487 studies on microplastic ingestion by aquatic organisms across 58 countries. Fish and bivalves showed the highest microplastic ingestion rates.",
      keywords: JSON.stringify(["微塑料", "水生生物", "摄食", "Meta分析", "生态毒理"]),
      status: "reading",
    },
  });

  const paper6 = await prisma.paper.create({
    data: {
      title: "国家地表水环境质量标准",
      authors: JSON.stringify([]),
      journal: "中华人民共和国国家标准",
      year: 2023,
      doi: null,
      abstract: "本标准规定了地表水环境质量标准、监测方法和评价方法。",
      keywords: JSON.stringify(["国家标准", "地表水", "环境质量"]),
      status: "read",
      standardType: "GB",
      standardNumber: "GB 3838-2023",
    },
  });

  const paper7 = await prisma.paper.create({
    data: {
      title: "Carbon neutrality in wastewater treatment: A critical review of technologies and roadmaps",
      authors: JSON.stringify(["Xu J.", "Li M.", "Zhang W."]),
      journal: "Chemical Engineering Journal",
      year: 2025,
      volume: "503",
      pages: "157-178",
      doi: "10.1016/j.cej.2025.157001",
      abstract: "Achieving carbon neutrality in wastewater treatment plants is crucial for sustainable water management. This review critically assesses technologies including energy recovery, process optimization, and renewable energy integration.",
      keywords: JSON.stringify(["碳中和", "污水处理", "能源回收"]),
      status: "unread",
    },
  });

  const paper8 = await prisma.paper.create({
    data: {
      title: "Photocatalytic degradation of tetracycline using g-C3N4/TiO2 composite under visible light",
      authors: JSON.stringify(["Wang F.", "Chen Y.", "Liu H."]),
      journal: "Applied Catalysis B: Environmental",
      year: 2024,
      volume: "340",
      pages: "123-141",
      doi: "10.1016/j.apcatb.2024.123001",
      abstract: "A novel g-C3N4/TiO2 heterojunction photocatalyst was synthesized for the degradation of tetracycline antibiotics under visible light. The composite achieved 95.2% removal efficiency within 120 minutes.",
      keywords: JSON.stringify(["光催化", "四环素", "可见光", "g-C3N4"]),
      status: "starred",
      rating: 5,
    },
  });

  // 关联标签
  await prisma.paperTagRelation.createMany({
    data: [
      { paperId: paper1.id, tagId: tagMicroplastics.id },
      { paperId: paper1.id, tagId: tagEcoTox.id },
      { paperId: paper1.id, tagId: tagReview.id },
      { paperId: paper2.id, tagId: tagHeavyMetal.id },
      { paperId: paper2.id, tagId: tagAdsorption.id },
      { paperId: paper3.id, tagId: tagAdvancedOxidation.id },
      { paperId: paper3.id, tagId: tagNewPollutant.id },
      { paperId: paper3.id, tagId: tagReview.id },
      { paperId: paper4.id, tagId: tagHeavyMetal.id },
      { paperId: paper4.id, tagId: tagSoil.id },
      { paperId: paper5.id, tagId: tagMicroplastics.id },
      { paperId: paper5.id, tagId: tagEcoTox.id },
      { paperId: paper6.id, tagId: tagWaterQuality.id },
      { paperId: paper7.id, tagId: tagCarbonNeutral.id },
      { paperId: paper7.id, tagId: tagReview.id },
      { paperId: paper8.id, tagId: tagAdvancedOxidation.id },
      { paperId: paper8.id, tagId: tagNewPollutant.id },
    ],
  });

  // 创建笔记
  await prisma.paperNote.createMany({
    data: [
      {
        paperId: paper1.id,
        content: `## 核心发现\n\n- 全球淡水系统中微塑料的浓度范围为 $10^{-3}$ 至 $10^6$ items/m³\n- 主要形态：纤维 > 碎片 > 薄膜 > 颗粒\n- PP和PE是最常见的聚合物类型\n\n## 生态风险\n\n1. **物理影响**：堵塞消化道、影响摄食\n2. **化学风险**：添加剂释放和污染物载体效应\n3. **生物累积**：可在食物链中传递\n\n## 研究空白\n\n- 纳米塑料的检测方法\n- 长期低浓度暴露效应\n- 不同环境条件下的风化机制`,
        isPrivate: true,
      },
      {
        paperId: paper2.id,
        content: `## 关键数据\n\n| 原料 | 热解温度 | BET比表面积 | Cd吸附量 |\n|------|---------|------------|--------|\n| 稻壳 | 500°C | 245 m²/g | 68.9 mg/g |\n| 玉米秸秆 | 700°C | 389 m²/g | 112.3 mg/g |\n\n## 机理总结\n\n1. 离子交换（主要）\n2. 表面络合\n3. π-π相互作用\n4. 沉淀作用\n\n> 碱改性可提高吸附容量 2-3 倍`,
        isPrivate: true,
      },
      {
        paperId: paper8.id,
        content: `## 实验参数\n\n- 催化剂用量：0.5 g/L\n- TC初始浓度：20 mg/L\n- 光源：300W 氙灯 (λ > 420 nm)\n- pH = 7.0\n\n## 关键结果\n\n- 去除率：95.2% (120 min)\n- 矿化率：68.5%\n- 主要活性物种：•O₂⁻ > h⁺ > •OH\n- 5次循环后活性保持 89%\n\n## 对本研究启发\n\n可参考 g-C₃N₄ 基复合材料的制备方法，应用于我们研究的磺胺类抗生素降解`,
        isPrivate: true,
      },
    ],
  });

  // 创建研究项目
  const project1 = await prisma.project.create({
    data: {
      name: "微塑料在土壤-作物系统中的迁移与生态效应",
      description: "研究不同粒径微塑料在典型农业土壤中的迁移规律及其对作物生长的毒性效应",
      status: "active",
      phase: "experiment",
      progress: 65,
      startDate: new Date("2025-09-01"),
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: "生物炭改性及其对水中抗生素的吸附去除研究",
      description: "制备并表征不同改性生物炭，评估其对磺胺类抗生素的吸附性能和机理",
      status: "active",
      phase: "preparation",
      progress: 40,
      startDate: new Date("2025-12-01"),
    },
  });

  const project3 = await prisma.project.create({
    data: {
      name: "河湖沉积物中重金属污染特征与生态风险评估",
      description: "对本地主要河湖沉积物进行采样分析，建立重金属污染基线并评估生态风险",
      status: "active",
      phase: "writing",
      progress: 15,
      startDate: new Date("2024-03-01"),
    },
  });

  // 项目文献关联
  await prisma.projectPaper.createMany({
    data: [
      { projectId: project1.id, paperId: paper1.id },
      { projectId: project1.id, paperId: paper5.id },
      { projectId: project2.id, paperId: paper2.id },
      { projectId: project3.id, paperId: paper4.id },
    ],
  });

  // 里程碑
  await prisma.milestone.createMany({
    data: [
      { projectId: project1.id, title: "完成文献调研与综述", dueDate: new Date("2025-10-15"), completed: true },
      { projectId: project1.id, title: "土壤微塑料提取方法建立", dueDate: new Date("2025-12-31"), completed: true },
      { projectId: project1.id, title: "盆栽实验设计与启动", dueDate: new Date("2026-03-15"), completed: true },
      { projectId: project1.id, title: "植物生理指标测定", dueDate: new Date("2026-06-30"), completed: false },
      { projectId: project1.id, title: "数据分析与论文撰写", dueDate: new Date("2026-10-31"), completed: false },
      { projectId: project2.id, title: "生物炭制备条件优化", dueDate: new Date("2026-03-31"), completed: false },
      { projectId: project2.id, title: "吸附动力学与等温线实验", dueDate: new Date("2026-07-31"), completed: false },
      { projectId: project3.id, title: "采样方案设计", dueDate: new Date("2024-05-01"), completed: true },
      { projectId: project3.id, title: "野外采样与预处理", dueDate: new Date("2024-09-30"), completed: true },
    ],
  });

  // 实验记录
  await prisma.experiment.create({
    data: {
      projectId: project1.id,
      title: "土壤微塑料提取方法对比实验",
      objective: "比较密度分离法和油提法对土壤中微塑料的提取效率",
      methods: "## 方法\n\n1. 取100g烘干过筛土壤样品\n2. 分别采用NaCl (1.2g/cm³)和NaI (1.8g/cm³)密度分离\n3. 油提法采用蓖麻油\n4. 每种方法3个平行\n\n## 提取后处理\n\n- H₂O₂消解有机质\n- 0.45μm滤膜过滤\n- 体视显微镜计数",
      reagents: JSON.stringify([{ name: "NaCl", purity: "AR", amount: "500g" }, { name: "NaI", purity: "AR", amount: "200g" }, { name: "H₂O₂", purity: "30%", amount: "100mL" }]),
      conditions: JSON.stringify({ temperature: "25°C", duration: "24h", replicates: 3 }),
      results: "## 结果\n\n| 方法 | PP回收率 | PE回收率 | PET回收率 |\n|------|---------|---------|----------|\n| NaCl分离 | 62.3% | 58.7% | 72.1% |\n| NaI分离 | 89.5% | 87.2% | 91.3% |\n| 油提法 | 94.2% | 92.8% | 95.6% |\n\n**结论**：油提法效率最高，但操作较复杂；NaI法是性价比最佳选择。",
      status: "completed",
    },
  });

  // 知识笔记
  const note1 = await prisma.knowledgeNote.create({
    data: {
      title: "微塑料分析方法综述",
      content: `# 微塑料分析方法\n\n## 采样\n\n- **水样**：拖网 (333μm) 或大体积过滤\n- **沉积物**：抓斗或柱状采样器\n- **生物样**：解剖分离或碱消解\n\n## 提取\n\n1. 密度分离 (NaCl/NaI/ZnCl₂)\n2. 消解 (H₂O₂/KOH/酶)\n3. 过滤\n\n## 鉴定\n\n- 体视显微镜 → 初步筛选\n- μ-FTIR / Raman → 聚合物鉴定\n- Py-GC/MS → 定量分析\n- SEM-EDS → 表面形貌与元素\n\n## 相关文献\n\n- [[微塑料在淡水生态系统中的分布]]\n- [[纳米塑料对水生生物的毒性效应]]`,
      category: "方法学",
      links: JSON.stringify(["微塑料在淡水生态系统中的分布", "纳米塑料对水生生物的毒性效应", "微塑料在土壤-作物系统中的迁移"]),
    },
  });

  const note2 = await prisma.knowledgeNote.create({
    data: {
      title: "高级氧化技术降解有机污染物机理",
      content: `# 高级氧化技术（AOPs）机理\n\n## 主要AOP类型\n\n| 类型 | 活性物种 | 氧化电位(V) | 适用范围 |\n|------|---------|------------|----------|\n| Fenton | •OH | 2.80 | 酸性条件 |\n| 光催化 | •OH, •O₂⁻, h⁺ | — | 广谱 |\n| 过硫酸盐活化 | SO₄•⁻ | 2.60 | 中性偏碱 |\n| 臭氧氧化 | •OH, O₃ | 2.07 | 广谱 |\n| 电化学 | •OH | 2.80 | 含盐废水 |\n\n## 关键参数\n\n- 催化剂用量\n- 氧化剂浓度\n- pH值\n- 温度\n- 共存物质（DOM、阴离子）\n\n## 参考文献\n\n- [[g-C₃N₄基光催化降解]]\n- [[重金属吸附材料]]`,
      category: "理论知识",
      links: JSON.stringify(["g-C₃N₄基光催化降解", "重金属吸附材料"]),
    },
  });

  const note3 = await prisma.knowledgeNote.create({
    data: {
      title: "生物炭制备与改性方法",
      content: `# 生物炭制备\n\n## 原料来源\n\n- 农业废弃物：稻壳、玉米秸秆、椰子壳\n- 林业残余：木屑、树皮\n- 市政污泥\n\n## 热解条件\n\n| 温度范围 | 产物特性 |\n|---------|--------|\n| 300-400°C | 低比表面积，含氧官能团丰富 |\n| 500-600°C | 中等比表面积，芳香化程度增加 |\n| 700-800°C | 高比表面积，高度芳香化 |\n\n## 改性方法\n\n1. **酸改性**：H₃PO₄, HNO₃ → 增加酸性官能团\n2. **碱改性**：KOH, NaOH → 增大比表面积\n3. **金属负载**：Fe, Mn, Mg → 增强吸附选择性\n4. **球磨**：机械力化学改性\n\n## 相关研究\n\n- [[生物炭对水中抗生素的吸附]]\n- [[重金属污染特征与生态风险]]`,
      category: "方法学",
      links: JSON.stringify(["生物炭对水中抗生素的吸附", "重金属污染特征与生态风险"]),
    },
  });

  const note4 = await prisma.knowledgeNote.create({
    data: {
      title: "环境样品前处理技术",
      content: `# 环境样品前处理\n\n## 水样\n\n- 固相萃取 (SPE)：HLB、C18、MCX 柱\n- 液液萃取 (LLE)：二氯甲烷、正己烷\n- 顶空/吹扫捕集 (VOCs)\n\n## 土壤/沉积物\n\n- 索氏提取\n- 超声辅助提取 (UAE)\n- 加速溶剂萃取 (ASE)\n- QuEChERS 方法\n\n## 生物样品\n\n- 凝胶渗透色谱 (GPC)\n- 冷冻干燥 + 研磨\n- 碱消解法\n\n## 关键质控\n\n- 替代物回收率 70-130%\n- 方法空白\n- 基质加标\n- 平行样 RSD < 20%`,
      category: "实验笔记",
      links: JSON.stringify(["微塑料在淡水生态系统中的分布"]),
    },
  });

  const note5 = await prisma.knowledgeNote.create({
    data: {
      title: "研究思路：微塑料-抗生素复合污染",
      content: `# 研究思路\n\n## 科学问题\n微塑料与抗生素在环境中共存时是否存在协同毒性效应？\n\n## 假设\n微塑料作为载体增强抗生素的生物可利用性\n\n## 实验设计\n\n1. **吸附实验**：不同粒径MPs对抗生素的吸附动力学\n2. **解吸实验**：模拟胃肠液条件下抗生素释放\n3. **生物实验**：斑马鱼暴露实验，检测生物标志物\n4. **机理分析**：FTIR、XPS、分子模拟\n\n## 创新点\n- 首次系统研究老化的环境MPs\n- 多组学联合分析毒性机制\n\n## 参考文献\n\n- [[微塑料在淡水生态系统中的分布]]\n- [[纳米塑料对水生生物的毒性效应]]`,
      category: "研究思路",
      links: JSON.stringify(["微塑料在淡水生态系统中的分布", "纳米塑料对水生生物的毒性效应"]),
    },
  });

  const ktagMethod = await prisma.knowledgeTag.create({ data: { name: "方法学" } });
  const ktagMechanism = await prisma.knowledgeTag.create({ data: { name: "机理" } });
  const ktagExperiment = await prisma.knowledgeTag.create({ data: { name: "实验技术" } });
  const ktagReview = await prisma.knowledgeTag.create({ data: { name: "综述" } });

  await prisma.knowledgeNoteTag.createMany({
    data: [
      { noteId: note1.id, tagId: ktagMethod.id },
      { noteId: note1.id, tagId: ktagReview.id },
      { noteId: note2.id, tagId: ktagMechanism.id },
      { noteId: note3.id, tagId: ktagMethod.id },
      { noteId: note3.id, tagId: ktagExperiment.id },
      { noteId: note4.id, tagId: ktagExperiment.id },
      { noteId: note5.id, tagId: ktagReview.id },
      { noteId: note5.id, tagId: ktagMechanism.id },
    ],
  });

  // 任务
  await prisma.task.createMany({
    data: [
      { title: "完成微塑料迁移综述初稿", priority: "high", status: "todo", dueDate: new Date("2026-08-15"), projectId: project1.id },
      { title: "吸附实验预实验", priority: "high", status: "in_progress", dueDate: new Date("2026-08-10"), projectId: project2.id },
      { title: "组会PPT准备", priority: "medium", status: "todo", dueDate: new Date("2026-08-12") },
      { title: "处理沉积物SEM样品", priority: "medium", status: "todo", dueDate: new Date("2026-08-16"), projectId: project3.id },
      { title: "读Advanced oxidation综述", priority: "low", status: "todo", dueDate: new Date("2026-08-20") },
      { title: "校准pH计和天平", priority: "low", status: "done", pomodoroCount: 2, pomodoroMinutes: 50 },
      { title: "修改实验方案第3节", priority: "high", status: "in_progress", dueDate: new Date("2026-08-09"), projectId: project2.id },
    ],
  });

  // 写作文档
  const doc1 = await prisma.document.create({
    data: {
      title: "微塑料在土壤-作物系统中的迁移规律与生态效应",
      type: "paper",
      status: "writing",
      description: "研究不同粒径微塑料在典型农业土壤中的迁移及其对作物生长的毒性效应",
      targetWordCount: 8000,
      projectId: project1.id,
    },
  });

  const ch1_1 = await prisma.chapter.create({
    data: { documentId: doc1.id, title: "引言", content: `## 研究背景\n\n微塑料污染已成为全球性环境问题。据估计，每年有超过 1100 万吨塑料进入海洋环境，而陆地土壤中的微塑料含量可能比海洋高出 4-23 倍。\n\n农业土壤是微塑料的重要汇，主要来源包括：\n\n1. 农膜残留降解\n2. 有机肥和污泥施用\n3. 大气沉降\n4. 灌溉水输入\n\n## 研究意义\n\n微塑料在土壤-作物系统中的迁移直接关系到食品安全和人体健康。已有研究表明，微塑料可通过根系吸收进入植物体内，影响作物生长和品质。然而，不同粒径微塑料的迁移规律和毒性机制仍不清楚。\n\n## 科学问题\n\n本研究拟解决以下科学问题：\n\n- 不同粒径微塑料在土壤中的迁移规律\n- 微塑料对作物生长的影响机制\n- 微塑料从土壤到作物的转运路径\n\n## 参考文献\n\n[Li et al., 2023](ref:${paper1.id})  \n[Wang et al., 2024](ref:${paper5.id})`, order: 0, wordCount: 386 },
  });

  const ch1_2 = await prisma.chapter.create({
    data: { documentId: doc1.id, title: "材料与方法", content: `## 实验材料\n\n### 微塑料\n\n- 聚苯乙烯 (PS) 微球：0.1 μm, 1 μm, 10 μm\n- 聚乙烯 (PE) 颗粒：50 μm, 200 μm\n- 荧光标记：尼罗红染色\n\n### 土壤\n\n- 采集自校园实验田表层 (0-20 cm)\n- 基本理化性质：pH 6.8, 有机质 2.3%, 阳离子交换量 15.2 cmol/kg\n\n### 作物\n\n- 小麦 (Triticum aestivum L.)\n- 生菜 (Lactuca sativa L.)\n\n## 实验设计\n\n### 盆栽实验\n\n1. 每盆装土 500g\n2. 微塑料添加量：0 (对照), 0.1%, 0.5%, 1% (w/w)\n3. 每种处理 5 个重复\n4. 生长周期：60 天\n5. 环境条件：温度 25/20°C (昼/夜), 光照 16h/8h\n\n### 分析方法\n\n- 显微观察：荧光显微镜\n- SEM-EDS：表面形貌\n- ICP-MS：元素分析\n- 统计：SPSS 26.0, ANOVA + Duncan 多重比较`, order: 1, wordCount: 388 },
  });

  const ch1_3 = await prisma.chapter.create({
    data: { documentId: doc1.id, title: "结果与讨论", content: `## 结果\n\n### 微塑料在土壤中的分布\n\n实验结果表明，不同粒径微塑料在土壤中呈现不同的迁移特征。\n\n| 粒径 | 0-5cm浓度 | 5-10cm浓度 | 10-15cm浓度 |\n|------|----------|-----------|------------|\n| 0.1μm | 95.2% | 4.8% | 未检出 |\n| 1μm | 87.6% | 11.3% | 1.1% |\n| 10μm | 92.1% | 7.9% | 未检出 |\n| 50μm | 98.5% | 1.5% | 未检出 |\n| 200μm | 99.8% | 0.2% | 未检出 |\n\n$$v = k \\cdot d^{2} \\cdot \\frac{(\\rho_s - \\rho_f)g}{18\\eta}$$\n\n其中 $v$ 为沉降速度，$d$ 为粒径，$\\rho_s$ 和 $\\rho_f$ 分别为颗粒和流体密度。\n\n### 作物生长影响\n\n添加 1% 微塑料处理组的作物生物量显著降低 (p < 0.05)：\n\n- 小麦地上部生物量降低 23.5%\n- 根系生物量降低 31.2%\n\n## 讨论\n\n微塑料对作物的影响可能通过以下机制：\n\n1. **物理堵塞**：微塑料吸附于根系表面，影响水分和养分吸收\n2. **氧化胁迫**：ROS 积累导致细胞膜损伤\n3. **营养竞争**：微塑料改变土壤微生物群落结构\n\n与已有研究 [Yang et al., 2024](ref:${paper5.id}) 相比，本研究发现纳米塑料 (0.1 μm) 更容易穿透土壤层进入深层。`, order: 2, wordCount: 313 },
  });

  const ch1_4 = await prisma.chapter.create({
    data: { documentId: doc1.id, title: "结论", content: `## 主要结论\n\n1. 微塑料在土壤中的迁移受粒径显著影响，纳米级 (100 nm) 微塑料具有更强的迁移性\n2. 1% 微塑料添加量可导致作物生物量显著降低\n3. 微塑料对作物的毒性机制涉及物理、化学和生物学多个层面\n\n## 创新点\n\n- 首次系统比较了 5 种不同粒径微塑料的土壤迁移行为\n- 建立了微塑料粒径-迁移性定量关系\n\n## 展望\n\n- 需要进一步研究环境老化微塑料的行为\n- 长期田间实验验证\n- 微塑料-其他污染物复合效应\n\n## 参考文献\n\n[Heavy metals in agricultural soils](ref:${paper4.id})  \n[Microplastics in freshwater systems](ref:${paper1.id})`, order: 3, wordCount: 220 },
  });

  // 版本快照
  await prisma.version.create({
    data: {
      documentId: doc1.id,
      versionName: "v1 - 初稿完成",
      content: JSON.stringify([ch1_1, ch1_2, ch1_3, ch1_4]),
      wordCount: 1307,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    },
  });

  // 写作目标
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const d2 = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);
  const d3 = new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);
  const d4 = new Date(Date.now() - 86400000 * 4).toISOString().slice(0, 10);
  const d5 = new Date(Date.now() - 86400000 * 5).toISOString().slice(0, 10);
  const d6 = new Date(Date.now() - 86400000 * 6).toISOString().slice(0, 10);

  await prisma.writingGoal.createMany({
    data: [
      { type: "daily", targetWords: 500, achievedWords: 320, date: today },
      { type: "daily", targetWords: 500, achievedWords: 485, date: yesterday },
      { type: "daily", targetWords: 500, achievedWords: 512, date: d2 },
      { type: "daily", targetWords: 500, achievedWords: 230, date: d3 },
      { type: "daily", targetWords: 500, achievedWords: 680, date: d4 },
      { type: "daily", targetWords: 400, achievedWords: 395, date: d5 },
      { type: "daily", targetWords: 400, achievedWords: 120, date: d6 },
    ],
  });

  // 活动日志
  const activities = await Promise.all([
    prisma.activity.create({ data: { type: "paper_added", title: "添加了文献", detail: `"${paper8.title.substring(0, 30)}..."`, targetId: paper8.id, createdAt: new Date(Date.now() - 1000 * 60 * 30) } }),
    prisma.activity.create({ data: { type: "task_completed", title: "完成了任务", detail: "校准pH计和天平", createdAt: new Date(Date.now() - 1000 * 60 * 60) } }),
    prisma.activity.create({ data: { type: "paper_read", title: "标记了文献为已读", detail: `"${paper1.title.substring(0, 30)}..."`, targetId: paper1.id, createdAt: new Date(Date.now() - 1000 * 60 * 120) } }),
    prisma.activity.create({ data: { type: "experiment_created", title: "完成了实验", detail: "土壤微塑料提取方法对比实验", targetId: project1.id, createdAt: new Date(Date.now() - 1000 * 60 * 180) } }),
    prisma.activity.create({ data: { type: "note_created", title: "创建了知识笔记", detail: `"${note1.title}"`, targetId: note1.id, createdAt: new Date(Date.now() - 1000 * 60 * 300) } }),
    prisma.activity.create({ data: { type: "paper_added", title: "添加了文献", detail: `"${paper3.title.substring(0, 30)}..."`, targetId: paper3.id, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8) } }),
    prisma.activity.create({ data: { type: "task_completed", title: "完成了任务", detail: "文献调研20篇", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) } }),
    prisma.activity.create({ data: { type: "paper_added", title: "添加了文献", detail: `"${paper6.title}"`, targetId: paper6.id, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) } }),
  ]);

  console.log(`✅ 播种完成！
  - 文献: 8 篇
  - 标签: 10 个
  - 笔记: 3 条
  - 项目: 3 个
  - 里程碑: 9 个
  - 实验: 1 个
  - 知识笔记: 5 篇
  - 知识标签: 4 个
  - 任务: 7 个
  - 写作文档: 1 篇 (4章+1版本)
  - 写作目标: 7 天
  - 活动: 8 条`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
