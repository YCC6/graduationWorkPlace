# 研究生工作台 · GradWorkbench

面向研究生的个人科研效率工作台。基于 **Next.js 14 + TypeScript + Tailwind CSS + Prisma (SQLite)** 构建，开箱即用、数据全部本地存储。

## ✨ 功能模块

- **📚 文献管理**：智能粘贴导入（知网 GB/T 7714 题录 / BibTeX 自动解析）、PDF 上传与全文检索、PDF 内嵌批注、标签管理、批量操作、文献推荐
- **🔬 研究项目**：实验记录 CRUD、实验图片上传、数据表格与图表可视化（折线 / 柱状）、数据 CSV 导出与统计、实验模板
- **🧠 知识笔记**：双链引用（`ref:`）、自动关联、知识图谱（显式 + 隐式关联）
- **✅ 任务中心**：任务 CRUD、优先级、截止日期、番茄钟
- **📝 写作工坊**：章节拖拽排序、内联引用、HTML 导出、GB/T 7714 引用列表自动生成
- **🔍 全局搜索**：`Ctrl+K` 跨 5 个模块检索（含 PDF 正文命中）
- **📅 日历**：月视图聚合任务截止日与项目里程碑
- **💾 本地备份**：全量 JSON 导出 / 一键恢复

## 🛠 技术栈

Next.js 14（App Router） · TypeScript · Tailwind CSS · Prisma · SQLite

## 🚀 本地部署

```bash
# 1. 克隆仓库
git clone <你的仓库地址>
cd grad-workbench

# 2. 安装依赖
npm install

# 3. 生成 Prisma 客户端并建库
npx prisma generate
npx prisma db push

# 4. 启动开发服务器
npm run dev
```

浏览器打开 http://localhost:3000 即可使用。

可选——填充一份示例数据：

```bash
npm run prisma:seed
```

### 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run prisma:generate` | 重新生成 Prisma 客户端 |
| `npm run prisma:push` | 同步数据模型到数据库 |
| `npm run prisma:seed` | 写入示例数据 |

## 📁 目录结构

```
src/
  app/
    (main)/        # 主布局页面：仪表盘 / 文献 / 项目 / 笔记 / 任务 / 写作 / 日历 / 设置
    api/           # 后端 API 路由
  components/      # 通用组件与布局
  lib/             # 工具与 Prisma 客户端
prisma/
  schema.prisma    # 数据模型
  seed.ts          # 示例数据
```

## ⚠️ 数据说明

仓库**不包含** `prisma/dev.db`（你的个人研究数据）与 `uploads/`（上传的 PDF / 实验图片）。
首次运行 `npx prisma db push` 会自动创建一个**空数据库**，你可以从零开始使用，或执行 `npm run prisma:seed` 导入示例数据。

## 📄 许可证

MIT
