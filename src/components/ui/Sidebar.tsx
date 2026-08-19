import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export function SidebarNavItem({
  href,
  icon: Icon,
  label,
  badge,
  collapsed,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
        collapsed && "justify-center px-0",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive
          ? "bg-sidebar-accent text-sidebar-primary font-medium"
          : "text-sidebar-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-medium rounded-full bg-primary text-primary-foreground">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function SidebarSection({
  title,
  children,
  collapsed,
}: {
  title?: string;
  children: React.ReactNode;
  collapsed?: boolean;
}) {
  return (
    <div className="px-3 py-2">
      {title && !collapsed && (
        <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      )}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function Sidebar({
  children,
  collapsed,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
}) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar flex flex-col transition-[width] duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border shrink-0">
      {children}
    </div>
  );
}

export function SidebarContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
      {children}
    </div>
  );
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-sidebar-border px-3 py-3 shrink-0">
      {children}
    </div>
  );
}
