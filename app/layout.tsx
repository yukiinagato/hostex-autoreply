import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Hostex 自动回复",
  description: "Hostex 客服 AI 协助回复工具",
  applicationName: "Hostex 自动回复",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hostex 回复",
    statusBarStyle: "black-translucent",
  },
  // Hint to Safari that this site behaves well as a standalone app.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Edge-to-edge: lets the app paint under the notch / home indicator so we
  // can add safe-area padding ourselves where it matters.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
