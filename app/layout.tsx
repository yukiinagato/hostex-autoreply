import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Hostex 自动回复",
  description: "Hostex 客服 AI 协助回复工具",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      {/* h-dvh handles iOS/Android browser chrome correctly so the layout
          never exceeds the visible viewport. */}
      <body className="h-dvh flex flex-col overflow-hidden">
        {children}
      </body>
    </html>
  );
}
