"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  LayoutDashboard,
  BookOpen,
  FlaskConical,
  Brain,
  CheckSquare,
  FileText,
  CalendarDays,
  Bookmark,
  Settings,
  Search,
  Beaker,
  GitBranch,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarNavItem,
  SidebarSection,
} from "@/components/ui/Sidebar";
import { SidebarProvider, useSidebar } from "@/components/ui/SidebarContext";
import { cn } from "@/lib/utils";

type Counts = { papers?: number; projects?: number; tasks?: number };

type SearchResultItem = {
  type: "paper" | "note" | "project" | "experiment" | "task";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  highlight: string;
  matchIn?: "title" | "abstract" | "keywords" | "content";
};

const TYPE_CONFIG: Record<
  SearchResultItem["type"],
  { icon: LucideIcon; label: string }
> = {
  paper: { icon: BookOpen, label: "文献" },
  note: { icon: Brain, label: "知识笔记" },
  project: { icon: FlaskConical, label: "研究项目" },
  experiment: { icon: Beaker, label: "实验记录" },
  task: { icon: CheckSquare, label: "待办任务" },
};

function HighlightText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${keyword})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/60 text-foreground rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SidebarProvider>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const isHomePage = pathname === "/";
  const [counts, setCounts] = useState<Counts>({});

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/counts");
      if (res.ok) setCounts(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchCounts();
    const handler = () => fetchCounts();
    window.addEventListener("counts-changed", handler);
    return () => window.removeEventListener("counts-changed", handler);
  }, [fetchCounts]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(searchQuery.trim())}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  // Scroll selected item into view
  useEffect(() => {
    if (!scrollRef.current || !isSearchOpen) return;
    const el = scrollRef.current.querySelector('[data-selected="true"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, isSearchOpen]);

  // Group results by type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResultItem[]> = {};
    for (const item of searchResults) {
      if (!groups[item.type]) groups[item.type] = [];
      groups[item.type].push(item);
    }
    return groups;
  }, [searchResults]);

  // Map item id → flat index for keyboard navigation
  const flatIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    searchResults.forEach((item, idx) => map.set(item.id, idx));
    return map;
  }, [searchResults]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = searchResults[selectedIndex];
      if (item) {
        router.push(item.url);
        setIsSearchOpen(false);
        setSearchQuery("");
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsSearchOpen(false);
      inputRef.current?.blur();
    }
  };

  const navItems = [
    {
      section: "概览",
      items: [
        { href: "/", icon: LayoutDashboard, label: "仪表盘" },
        { href: "/papers", icon: BookOpen, label: "文献管理", badge: counts.papers },
        { href: "/projects", icon: FlaskConical, label: "研究项目", badge: counts.projects },
        { href: "/knowledge", icon: Brain, label: "知识笔记" },
        { href: "/knowledge/graph", icon: GitBranch, label: "知识图谱" },
      ],
    },
    {
      section: "效率",
      items: [
        { href: "/tasks", icon: CheckSquare, label: "任务中心", badge: counts.tasks },
        { href: "/calendar", icon: CalendarDays, label: "日历", badge: undefined },
        { href: "/writing", icon: FileText, label: "写作工坊" },
        { href: "/clipper", icon: Bookmark, label: "文献剪藏" },
        { href: "/settings", icon: Settings, label: "设置" },
      ],
    },
  ];

  const showPanel = isSearchOpen && (searchQuery.trim().length > 0 || isSearching);

  return (
    <div className="flex min-h-screen">
      {/* 侧边栏 */}
      <Sidebar collapsed={collapsed}>
        <SidebarHeader>
          <div className="flex items-center gap-2 w-full">
            <button
              onClick={toggle}
              title={collapsed ? "展开侧边栏" : "收起侧边栏"}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary shrink-0 hover:bg-primary/90 transition-colors"
            >
              <Beaker className="h-4 w-4 text-primary-foreground" />
            </button>
            {!collapsed && (
              <Link
                href="/"
                className="flex items-center gap-2.5 text-sm font-semibold text-sidebar-foreground"
              >
                GradWorkbench
              </Link>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          {navItems.map((group) => (
            <SidebarSection key={group.section} title={group.section} collapsed={collapsed}>
              {group.items.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  badge={item.badge}
                  collapsed={collapsed}
                />
              ))}
            </SidebarSection>
          ))}
        </SidebarContent>

        <SidebarFooter>
          {!collapsed && (
            <div className="text-[11px] text-muted-foreground px-3">
              <p>环境科学方向 · 研究生工作台</p>
              <p className="mt-0.5">Phase 4 · 写作工坊</p>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      {/* 主内容区 */}
      <div
        className={cn(
          "flex-1 flex flex-col min-h-screen transition-[margin] duration-200",
          collapsed ? "ml-16" : "ml-56"
        )}
      >
        {/* 顶部栏 */}
        <header className="sticky top-0 z-30 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-6 gap-4">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="搜索文献、笔记、实验... (Ctrl+K)"
              className="w-full h-9 pl-9 pr-9 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}

            {/* 搜索结果下拉面板 */}
            {showPanel && (
              <>
                {/* 遮罩层 */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsSearchOpen(false)}
                />
                {/* 结果面板 */}
                <div className="absolute top-11 left-0 right-0 z-50 rounded-md border bg-popover shadow-lg overflow-hidden">
                  <div ref={scrollRef} className="max-h-96 overflow-y-auto">
                    {isSearching ? (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        搜索中...
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        未找到相关结果
                      </div>
                    ) : (
                      Object.entries(groupedResults).map(
                        ([type, items], groupIdx) => {
                          const config =
                            TYPE_CONFIG[type as SearchResultItem["type"]];
                          const Icon = config.icon;
                          return (
                            <div key={type}>
                              {groupIdx > 0 && (
                                <div className="border-t" />
                              )}
                              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50">
                                {config.label} ({items.length})
                              </div>
                              {items.map((item) => {
                                const flatIdx = flatIndexMap.get(item.id) ?? 0;
                                const isSelected = flatIdx === selectedIndex;
                                return (
                                  <Link
                                    key={item.id}
                                    href={item.url}
                                    data-selected={isSelected ? "true" : undefined}
                                    onClick={() => {
                                      setIsSearchOpen(false);
                                      setSearchQuery("");
                                      inputRef.current?.blur();
                                    }}
                                    className={`flex items-start gap-3 px-3 py-2 text-sm cursor-pointer transition-colors ${
                                      isSelected
                                        ? "bg-accent"
                                        : "hover:bg-accent/50"
                                    }`}
                                    onMouseEnter={() => setSelectedIndex(flatIdx)}
                                  >
                                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium truncate flex items-center gap-1.5">
                                        {item.title}
                                        {item.type === "paper" && item.matchIn === "content" && (
                                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-normal">
                                            正文
                                          </span>
                                        )}
                                        {item.type === "paper" && item.matchIn === "abstract" && (
                                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-normal">
                                            摘要
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        {item.subtitle}
                                      </div>
                                      {item.highlight && (
                                        <div className="text-xs text-muted-foreground/80 mt-0.5 truncate">
                                          <HighlightText
                                            text={item.highlight}
                                            keyword={searchQuery.trim()}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          );
                        },
                      )
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            学习中
          </div>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
