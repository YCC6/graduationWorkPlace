"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

const STORAGE_KEY = "gradworkbench:sidebar-collapsed";

type SidebarContextType = {
  collapsed: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  // 首帧固定 false：服务端与客户端首帧必须一致，才能通过 hydration 校验。
  // 若在 useState 初始化器里直接读 localStorage，服务端拿不到值（返回 false），
  // 客户端却可能读到 "1"（true），两边首帧不一致 → hydration 报错。
  const [collapsed, setCollapsed] = useState(false);
  const didMount = useRef(false);

  // 挂载后再从 localStorage 校准（此次更新发生在 hydration 之后，不会触发报错）
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        setCollapsed(true);
      }
    } catch {
      /* 忽略隐私模式等存储不可用场景 */
    }
  }, []);

  // 仅在用户主动切换时持久化（跳过挂载首帧，避免覆盖已存值）
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* 忽略隐私模式等存储不可用场景 */
    }
  }, [collapsed]);

  const toggle = () => setCollapsed((v) => !v);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
