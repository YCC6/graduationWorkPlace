"use client";

import { useState } from "react";
import {
  Download,
  Upload,
  Database,
  ShieldCheck,
  Loader2,
  HardDrive,
} from "lucide-react";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const [restoring, setRestoring] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("恢复备份将按 ID 覆盖现有数据（相同 ID 会被更新）。确定继续？")) {
      e.target.value = "";
      return;
    }
    setRestoring(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.tables) throw new Error("缺少 tables 字段");
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`恢复成功，共写入 ${data.restored} 条记录`);
        // 触发全局刷新
        window.dispatchEvent(new Event("counts-changed"));
      } else {
        throw new Error(data.error || "恢复失败");
      }
    } catch (err: any) {
      toast.error("恢复失败：" + (err.message || "文件格式错误"));
    } finally {
      setRestoring(false);
      e.target.value = "";
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">设置 / 数据管理</h1>
      </div>

      {/* 数据备份 */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">本地备份</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          所有数据保存在本地 SQLite 数据库。定期导出备份文件，可防止文件损坏、换电脑或误删导致的数据丢失。备份文件为 JSON 格式，包含全部表数据。
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <a
            href="/api/backup"
            download
            className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Download className="h-4 w-4" />
            下载备份
          </a>

          <label className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg border text-sm font-medium cursor-pointer hover:bg-muted transition-colors">
            <Upload className="h-4 w-4" />
            {restoring ? "恢复中..." : "恢复备份"}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleRestore}
              disabled={restoring}
            />
          </label>
          {restoring && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-3">
          <HardDrive className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            提示：建议将备份文件保存到云盘或另一块磁盘。恢复时系统会按记录 ID 进行 upsert，重复 ID 将以备份内容覆盖，安全幂等。
          </span>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="rounded-xl border bg-card p-5 space-y-2">
        <h2 className="text-sm font-semibold">关于本工作台</h2>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>文献管理支持 DOI 导入、知网 GB/T 7714 题录智能粘贴、PDF 批注与全文检索。</li>
          <li>写作工坊支持章节拖拽、内联引用（@插入文献）、参考文献自动生成与导出。</li>
          <li>研究项目支持实验模板、数据图表、统计摘要与 CSV 导出。</li>
          <li>日历视图聚合任务截止、项目里程碑与项目起止日期。</li>
        </ul>
      </div>
    </div>
  );
}
