import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, format: "full" | "short" | "relative" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  
  if (format === "relative") {
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return d.toLocaleDateString("zh-CN");
  }

  if (format === "short") {
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }

  return d.toLocaleDateString("zh-CN", { 
    year: "numeric", 
    month: "long", 
    day: "numeric" 
  });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "unread":
      return "text-orange-500 bg-orange-50";
    case "reading":
      return "text-blue-500 bg-blue-50";
    case "read":
      return "text-green-500 bg-green-50";
    case "starred":
      return "text-yellow-500 bg-yellow-50";
    default:
      return "text-gray-500 bg-gray-50";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "unread":
      return "待读";
    case "reading":
      return "在读";
    case "read":
      return "已读";
    case "starred":
      return "星标";
    default:
      return status;
  }
}
