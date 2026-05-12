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

  return (
    <div className="h-full border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-y-auto p-3 space-y-2 overscroll-contain">
      {messages.length === 0 && (
        <p className="text-xs text-neutral-500">暂无消息。</p>
      )}
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.sender === "host" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] sm:max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
              m.sender === "host"
                ? "bg-blue-600 text-white"
                : m.sender === "system"
                ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-600"
                : "bg-neutral-100 dark:bg-neutral-800"
            }`}
          >
            {m.content}
            <div className="mt-1 text-[10px] opacity-60">
              {senderLabel(m.sender)}
              {m.sent_via ? ` · ${viaLabel(m.sent_via)}` : ""}
              {" · "}
              {new Date(m.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function senderLabel(s: Message["sender"]): string {
  return s === "guest" ? "客户" : s === "host" ? "房东" : "系统";
}

function viaLabel(v: NonNullable<Message["sent_via"]>): string {
  return v === "ai-auto" ? "AI 自动" : v === "ai-manual" ? "AI 起草" : "Hostex";
}
