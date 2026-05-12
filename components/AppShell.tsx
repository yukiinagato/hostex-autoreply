"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import UserMenu from "./UserMenu";
import type { ConversationListItem, User } from "@/lib/db/types";

export default function AppShell({
  conversations,
  user,
  children,
}: {
  conversations: ConversationListItem[];
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const isInbox = pathname === "/";
  const isSettings = pathname.startsWith("/settings");

  // Header subtitle for mobile (so the user knows where they are)
  let title = "收件箱";
  if (isSettings) title = "设置";
  else if (pathname.startsWith("/conversations/")) title = "对话详情";
  else if (pathname.startsWith("/properties/")) title = "房源详情";
  else if (pathname.startsWith("/search")) title = "搜索";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Top bar — safe-area-top so the notch / Dynamic Island doesn't sit on
          top of the buttons when running as a standalone PWA. */}
      <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 px-3 flex items-center gap-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur pwa-safe-top pwa-safe-left pwa-safe-right" style={{ minHeight: 48 }}>
        {/* Back arrow on mobile when not on inbox */}
        {!isInbox && (
          <Link
            href="/"
            aria-label="返回收件箱"
            className="lg:hidden -ml-1 p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
        )}
        <Link href="/" className="font-semibold text-sm sm:text-base truncate">
          Hostex 自动回复
        </Link>
        <span className="lg:hidden text-xs text-neutral-500 truncate">· {title}</span>
        <nav className="ml-auto flex items-center gap-2 sm:gap-4 text-sm">
          <Link
            href="/"
            className={`px-2 py-1 rounded transition hover:bg-neutral-100 dark:hover:bg-neutral-800
              ${isInbox ? "font-medium text-neutral-900 dark:text-neutral-50" : "text-neutral-600 dark:text-neutral-400"}`}
          >
            收件箱
          </Link>
          <UserMenu user={user} />
        </nav>
      </header>

      {/* Two-pane on desktop, single-pane on mobile.
          Only side insets — bottom inset is handled per-component so the
          home indicator can float over content (iMessage-style) instead of
          leaving a black strip. */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[18rem_1fr] pwa-safe-left pwa-safe-right">
        {/* Sidebar: always on lg+; on mobile only when on inbox */}
        <div className={`${isInbox ? "block" : "hidden"} lg:block min-h-0 overflow-hidden`}>
          <Sidebar initial={conversations} />
        </div>
        {/* Main: always on lg+; on mobile hidden when on inbox.
            We do NOT set overflow-y-auto here so individual pages can choose
            to either scroll the whole pane (settings) or use a fixed-height
            layout with internal scrolling columns (conversation page on desktop). */}
        <div className={`${isInbox ? "hidden lg:block" : "block"} min-h-0 bg-neutral-50 dark:bg-neutral-950`}>
          {children}
        </div>
      </div>
    </div>
  );
}
