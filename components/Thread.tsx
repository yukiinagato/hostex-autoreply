"use client";
import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/db/types";

export default function Thread({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    const open = () => {
      if (cancelled) return;
      es = new EventSource(`/api/events?conversationId=${encodeURIComponent(conversationId)}`);
      es.addEventListener("message", (e) => {
        try {
          const m = JSON.parse((e as MessageEvent).data) as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        } catch { /* ignore */ }
      });
      es.addEventListener("error", () => {
        es?.close();
        if (!cancelled) setTimeout(open, 2_000);
      });
    };
    open();
    return () => { cancelled = true; es?.close(); };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Group consecutive messages from the same sender so we only render the
  // sender/timestamp footer once per group.
  const groups = groupMessages(messages);

  return (
    <div
      ref={scrollContainerRef}
      className="h-full border rounded-lg border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-y-auto p-3 sm:p-4 space-y-3 overscroll-contain"
    >
      {messages.length === 0 && (
        <div className="h-full grid place-items-center text-center text-xs text-neutral-400">
          <div>
            <div className="text-2xl mb-1">💬</div>
            <div>暂无消息</div>
          </div>
        </div>
      )}

      {groups.map((group, gi) => {
        const isHost = group[0].sender === "host";
        const isSystem = group[0].sender === "system";
        const last = group[group.length - 1];
        return (
          <div
            key={`g${gi}`}
            className={`flex ${isHost ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[85%] sm:max-w-[70%] min-w-0 space-y-1`}>
              {group.map((m, mi) => (
                <Bubble
                  key={m.id}
                  m={m}
                  position={
                    group.length === 1 ? "only" :
                    mi === 0 ? "start" :
                    mi === group.length - 1 ? "end" : "middle"
                  }
                  isHost={isHost}
                  isSystem={isSystem}
                />
              ))}
              <div className={`flex items-center gap-1.5 px-1 text-[10px] text-neutral-400 ${isHost ? "justify-end" : "justify-start"}`}>
                <span>{senderLabel(last.sender)}</span>
                {last.sent_via && <span>· {viaLabel(last.sent_via)}</span>}
                <span>· {fmtTime(last.created_at)}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function Bubble({
  m,
  position,
  isHost,
  isSystem,
}: {
  m: Message;
  position: "only" | "start" | "middle" | "end";
  isHost: boolean;
  isSystem: boolean;
}) {
  // Asymmetric rounded corners so a group of stacked bubbles reads as one.
  const roundedClasses = (() => {
    const base = "rounded-2xl";
    if (position === "only") return base;
    if (isHost) {
      if (position === "start") return `${base} rounded-br-md`;
      if (position === "middle") return `${base} rounded-br-md rounded-tr-md`;
      if (position === "end") return `${base} rounded-tr-md`;
    } else {
      if (position === "start") return `${base} rounded-bl-md`;
      if (position === "middle") return `${base} rounded-bl-md rounded-tl-md`;
      if (position === "end") return `${base} rounded-tl-md`;
    }
    return base;
  })();

  const colorClasses = isSystem
    ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-[11px] italic"
    : isHost
    ? "bg-blue-600 text-white"
    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100";

  return (
    <div
      className={`${roundedClasses} ${colorClasses} px-3 py-2 text-sm whitespace-pre-wrap break-words leading-relaxed shadow-sm`}
    >
      {m.attachment_url && (
        <a
          href={m.attachment_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-1 -mx-1 -mt-1"
          aria-label="打开图片"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.attachment_url}
            alt={m.content || "图片"}
            loading="lazy"
            className="max-w-full max-h-72 rounded-xl object-cover bg-black/5"
          />
        </a>
      )}
      {m.content}
    </div>
  );
}

function groupMessages(msgs: Message[]): Message[][] {
  const groups: Message[][] = [];
  let cur: Message[] | null = null;
  let lastTs = 0;
  for (const m of msgs) {
    const t = new Date(m.created_at).getTime();
    const gap = lastTs ? t - lastTs : 0;
    // Start a new group when sender changes OR when there's a >5min gap.
    if (!cur || cur[cur.length - 1].sender !== m.sender || gap > 5 * 60_000) {
      cur = [m];
      groups.push(cur);
    } else {
      cur.push(m);
    }
    lastTs = t;
  }
  return groups;
}

function senderLabel(s: Message["sender"]): string {
  return s === "guest" ? "客户" : s === "host" ? "我方" : "系统";
}

function viaLabel(v: NonNullable<Message["sent_via"]>): string {
  return v === "ai-auto" ? "AI 自动" : v === "ai-manual" ? "AI 起草" : "Hostex";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
