"use client";

import { useState, useEffect, useCallback } from "react";

export default function ClipperPage() {
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "err">(
    "idle"
  );
  const [paperCount, setPaperCount] = useState<number | null>(null);
  const [serverUrl, setServerUrl] = useState("http://localhost:3000");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [browser, setBrowser] = useState<"chrome" | "edge">("chrome");

  // 按当前浏览器 UA 自动切到对应安装说明
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) setBrowser("edge");
  }, []);

  // 生成小书签 href（把 JS 内容编码进 URL）
  const bookmarkletHref = typeof window !== "undefined" ? (() => {
    try {
      // 开发环境：直接引用源文件
      return "/clipper/bookmarklet.js";
    } catch {
      return "#";
    }
  })() : "#";

  const testConnection = useCallback(async () => {
    setStatus("checking");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["X-Api-Key"] = apiKey;

      const res = await fetch(`${serverUrl.replace(/\/+$/, "")}/api/papers/clip`, {
        headers,
      });

      if (res.status === 401) {
        setStatus("err");
        return;
      }
      if (!res.ok) {
        setStatus("err");
        return;
      }
      const data = await res.json();
      setPaperCount(data.paperCount ?? null);
      setStatus("ok");
    } catch {
      setStatus("err");
    }
  }, [serverUrl, apiKey]);

  useEffect(() => {
    testConnection();
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold">文献剪藏工具</h1>
        <p className="text-muted-foreground mt-1">
          在知网、PubMed、Google Scholar 等学术网站浏览时，一键将论文元数据存入你的文献库。
          无需复制粘贴 DOI。
        </p>
      </div>

      {/* 连通性状态 */}
      <section
        className={`rounded-lg border p-4 flex items-center gap-3 ${
          status === "ok"
            ? "border-green-200 bg-green-50"
            : status === "err"
            ? "border-red-200 bg-red-50"
            : "border-yellow-200 bg-yellow-50"
        }`}
      >
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            status === "ok"
              ? "bg-green-500"
              : status === "err"
              ? "bg-red-500"
              : "bg-yellow-500 animate-pulse"
          }`}
        />
        <span className="text-sm">
          {status === "checking" && "正在连接工作台…"}
          {status === "ok" &&
            `已连接 · 文献库现有 ${paperCount ?? 0} 篇`}
          {status === "err" && (
            <span>
              无法连接{" "}
              <code className="text-xs bg-muted px-1 rounded">{serverUrl}</code>，
              请确认工作台已启动
            </span>
          )}
          {status === "idle" && "尚未检测"}
        </span>
        <button
          onClick={testConnection}
          className="ml-auto text-xs text-primary hover:underline shrink-0"
        >
          重新检测
        </button>
      </section>

      {/* 方式一：浏览器扩展 */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          🧩 方式一：浏览器扩展（推荐）
        </h2>
        <p className="text-sm text-muted-foreground">
          功能最完整：悬浮按钮、Google Scholar 逐条收录、快捷键 Alt+S、保存后角标提示、
          后台通知。不受页面 CORS 限制。
        </p>

        {/* 浏览器切换 */}
        <div className="inline-flex rounded-lg border bg-muted/40 p-1 gap-1">
          {([
            { key: "chrome", label: "Chrome" },
            { key: "edge", label: "Edge" },
          ] as const).map((b) => (
            <button
              key={b.key}
              onClick={() => setBrowser(b.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                browser === b.key
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <ol className="text-sm space-y-3 list-decimal list-inside text-muted-foreground">
          <li>
            打开 {browser === "edge" ? "Edge" : "Chrome"}，地址栏输入{" "}
            <code className="bg-muted px-1 rounded text-xs">
              {browser === "edge" ? "edge://extensions" : "chrome://extensions"}
            </code>
          </li>
          <li>
            开启{browser === "edge" ? "左下角" : "右上角"}「开发人员模式 / 开发者模式」
          </li>
          <li>点击「加载解压缩的扩展 / 加载已解压的扩展程序」</li>
          <li>
            选择项目目录下的{" "}
            <code className="bg-muted px-1 rounded text-xs">extension</code> 文件夹
          </li>
          <li>
            首次安装会自动打开设置页，确认服务地址为{" "}
            <code className="bg-muted px-1 rounded text-xs">{serverUrl}</code>
          </li>
        </ol>

        {browser === "edge" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1">
            <p className="font-medium">Edge 说明</p>
            <p>
              Edge 与 Chrome 同为 Chromium 内核，扩展代码完全通用，无需任何改动。
              区别仅在于「开发人员模式」开关位于扩展页<strong>左侧边栏下方</strong>，而非右上角。
            </p>
            <p>
              若快捷键 Alt+S 无响应，到{" "}
              <code className="bg-white/60 px-1 rounded">edge://extensions/shortcuts</code>{" "}
              手动设置。
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <span className="text-sm text-muted-foreground">支持站点：</span>
          <div className="flex flex-wrap gap-1.5">
            {[
              "知网",
              "万方",
              "PubMed",
              "Google Scholar",
              "arXiv",
              "ScienceDirect",
              "Springer",
              "Wiley",
              "Nature",
              "IEEE",
              "ACM",
              "Semantic Scholar",
            ].map((s) => (
              <span
                key={s}
                className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 方式二：小书签 */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          🔖 方式二：小书签（无需安装）
        </h2>
        <p className="text-sm text-muted-foreground">
          把下面的按钮拖到书签栏即可使用。在论文详情页点击书签，弹出面板预览并保存。
          需要工作台正在运行（依赖 CORS 跨域）。
        </p>

        <a
          href={bookmarkletHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium text-sm shadow-md hover:shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all cursor-grab active:cursor-grabbing select-none"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(
              "text/plain",
              `javascript:(function(){${document.querySelector('script[type="text/gwb-bookmarklet"]')?.textContent || ""}})();`
            );
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          存入文献库 ← 拖到书签栏
        </a>

        <p className="text-xs text-muted-foreground">
          💡 提示：如果拖拽不生效，右键按钮 →「添加到书签」，然后把地址栏内容替换为完整的
          javascript: 代码（见下方）。
        </p>

        {/* 备用：显示 JS 源码供手动复制 */}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            手动安装方法（点击展开）
          </summary>
          <div className="mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-48">
            <ol className="space-y-2 list-decimal list-inside">
              <li>新建一个书签，名称随意填（如「存入文献库」）</li>
              <li>把地址栏的内容全部删除</li>
              <li>粘贴以下代码作为地址：</li>
            </ol>
            <pre className="mt-2 p-2 bg-white rounded border text-[10px] leading-relaxed whitespace-pre-wrap break-all font-mono text-gray-600">
              {/* 实际使用时需要把 JS 内联到这里；开发阶段先给个占位 */}
              {`javascript:void(document.body.appendChild(Object.assign(document.createElement('script'),{src:'/clipper/bookmarklet.js',type:'text/javascript'})))`}
            </pre>
          </div>
        </details>
      </section>

      {/* 高级配置 */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">⚙️ 高级配置</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">工作台地址</span>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://localhost:3000"
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">访问密钥（可选）</span>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="未设置则留空"
                className="w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              仅当服务端设置了环境变量 CLIPPER_TOKEN 时才需填写
            </p>
          </label>
        </div>

        <div className="pt-2 border-t space-y-3">
          <h3 className="text-sm font-medium">如何启用密钥校验？</h3>
          <div className="bg-muted rounded-lg p-4 font-mono text-xs space-y-2">
            <p># 在项目根目录创建 .env 文件</p>
            <p>
              <span className="text-green-700">CLIPPER_TOKEN</span>=
              <span className="text-purple-700">你自定义的密钥字符串</span>
            </p>
            <p className="text-muted-foreground pt-1">
              # 重启 dev server 后生效。扩展和小书签的设置里填写同样的密钥即可。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
