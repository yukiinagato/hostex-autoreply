"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ConversationListItem } from "@/lib/db/types";
import SearchModal from "./SearchModal";

export default function Sidebar({ initial }: { initial: ConversationListItem[] }) {
  const [conversations, setConversations] = useState<ConversationListItem[]>(initial);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const esRef = useRef<EventSource | null>(null);

  // Cmd/Ctrl + K opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const r = await fetch("/api/conversations", { cache: "no-store" });
      if (r.ok && !cancelled) {
        const json = await r.json();
        setConversations(json.conversations as ConversationListItem[]);
      }
    };

    const open = () => {
      if (cancelled) return;
      const es = new EventSource("/api/events");
      esRef.current = es;
      es.addEventListener("conversations", () => { void refresh(); });
      es.addEventListener("error", () => {
        es.close();
        if (!cancelled) setTimeout(open, 2_000);
      });
    };
    open();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) open();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(refresh, 30_000);

    return () => {
      cancelled = true;
      esRef.current?.close();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
    };
  }, []);

  return (
    <>
    {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    <aside className="h-full border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex-1 flex items-center gap-2 text-left text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-500"
          title="搜索（⌘/Ctrl + K）"
        >
          <span>🔍</span>
          <span className="truncate">搜索</span>
          <span className="ml-auto text-[10px] text-neutral-400 hidden sm:inline">⌘K</span>
        </button>
        <span className="text-[10px] text-neutral-400">{conversations.length}</span>
      </div>
      <ul className="flex-1 overflow-y-auto overscroll-contain divide-y divide-neutral-100 dark:divide-neutral-800/70">
        {conversations.length === 0 ? (
          <li className="p-6 text-center text-xs text-neutral-500">
            <div className="text-2xl mb-1">💬</div>
            <div>暂无对话</div>
            <div className="mt-1 text-[10px] text-neutral-400">客人发来新消息后会出现在这里</div>
          </li>
        ) : (
          conversations.map((c) => {
            const href = `/conversations/${c.id}`;
            const active = pathname === href;
            const dateRange = formatDateRange(c.check_in_date, c.check_out_date);
            const isUnread = c.last_msg_sender === "guest";
            const senderInfo = describeSender(c.last_msg_sender, c.last_msg_sent_via);
            return (
              <li key={c.id}>
                <Link
                  href={href}
                  className={`relative block px-3 py-2.5 transition-colors min-h-[3.25rem]
                    ${active
                      ? "bg-blue-50/70 dark:bg-blue-950/30"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40 active:bg-neutral-100 dark:active:bg-neutral-800/60"}`}
                >
                  {active && (
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" aria-hidden />
                  )}
                  {/* Row 1: guest name + last activity */}
                  <div className="flex items-baseline gap-2">
                    {isUnread && (
                      <span
                        className="unread-dot inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0"
                        aria-label="未读"
                      />
                    )}
                    <span
                      className={`text-sm truncate flex-1 ${isUnread ? "font-semibold text-neutral-900 dark:text-neutral-50" : "font-medium text-neutral-700 dark:text-neutral-300"}`}
                    >
                      {c.guest_name ?? "（暂无姓名）"}
                    </span>
                    {(c.last_msg_at || c.last_message_at) && (
                      <span className="text-[10px] text-neutral-400 shrink-0 tabular-nums">
                        {timeAgo((c.last_msg_at ?? c.last_message_at)!)}
                      </span>
                    )}
                  </div>

                  {/* Row 2: last-message preview */}
                  {c.last_msg_content ? (
                    <div className="flex items-start gap-1.5 mt-1 min-w-0">
                      <span
                        className="text-[11px] shrink-0 leading-[1.3]"
                        title={senderInfo.tooltip}
                        aria-hidden
                      >
                        {senderInfo.icon}
                      </span>
                      <span
                        className={`text-xs truncate min-w-0
                          ${isUnread ? "text-neutral-800 dark:text-neutral-200" : "text-neutral-500 dark:text-neutral-400"}`}
                      >
                        {c.last_msg_content}
                      </span>
                    </div>
                  ) : null}

                  {/* Row 3: property + channel + dates collapsed onto one line */}
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-500 mt-1 min-w-0">
                    <span className="truncate flex-1" title={c.property_name ?? c.property_hostex_id ?? "未关联房源"}>
                      🏠 {c.property_name ?? c.property_hostex_id ?? "未关联房源"}
                    </span>
                    {c.channel_type && (
                      <span className="shrink-0 px-1 py-px rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] text-neutral-600 dark:text-neutral-400">
                        {prettyChannel(c.channel_type)}
                      </span>
                    )}
                  </div>
                  {dateRange && (
                    <div className="text-[10px] text-neutral-400 mt-0.5 tabular-nums">
                      📅 {dateRange}
                    </div>
                  )}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </aside>
    </>
  );
}

function describeSender(
  sender: "guest" | "host" | "system" | null,
  via: "hostex" | "ai-auto" | "ai-manual" | null,
): { icon: string; tooltip: string } {
  if (sender === "guest") return { icon: "💬", tooltip: "客户最新消息，待回复" };
  if (sender === "host") {
    if (via === "ai-auto") return { icon: "🤖", tooltip: "AI 倒数自动发送" };
    if (via === "ai-manual") return { icon: "✓", tooltip: "已回复（AI 起草，人工审核后发送）" };
    if (via === "hostex") return { icon: "↗", tooltip: "从 Hostex 后台直接发送（非此工具）" };
    return { icon: "✓", tooltip: "已由房东发送" };
  }
  return { icon: "·", tooltip: "系统消息" };
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function formatDateRange(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  const fmt = (s: string | null) => (s ? s.slice(5).replace("-", "/") : "?");
  return `${fmt(a)} → ${fmt(b)}`;
}

function prettyChannel(c: string): string {
  const map: Record<string, string> = {
    airbnb: "Airbnb",
    booking_site: "Booking",
    expedia: "Expedia",
    agoda: "Agoda",
    vrbo: "Vrbo",
    direct: "Direct",
  };
  return map[c.toLowerCase()] ?? c;
}
