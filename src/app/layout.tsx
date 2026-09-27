import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GradWorkbench - 研究生工作台",
  description: "面向环境科学方向研究生的综合研究工作台",
};

// 个人应用不需要静态预渲染：页面都读了 SQLite，构建时若静态生成会因连不上数据库而失败，
// 也会把页面固化成本地那份空数据。统一改为按请求渲染（SSR）。
export const dynamic = "force-dynamic";

// 在 hydration 前根据 localStorage / 系统偏好给 <html> 加 dark 类，消除首屏白闪
const themeInitScript = `(function(){try{var k='gradworkbench:theme';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning：防闪脚本会在 hydration 前给 <html> 加 dark 类，
    // 该属性只抑制这一层的属性差异告警，是主题脚本的标准做法。
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.17/dist/katex.min.css"
          integrity="sha384-MlJdn/WNKDGXHQHDht0GTgMRXwBWmnh/G8ywQ2kqksCogLE5a1Bl2JHtVr1lBJdR"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              fontSize: "14px",
              borderRadius: "8px",
            },
          }}
        />
      </body>
    </html>
  );
}
