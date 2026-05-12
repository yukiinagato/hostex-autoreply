"use client";
import { useEffect, useState } from "react";
import type { Message } from "@/lib/db/types";
import type { CachedReservation } from "@/lib/db/reservations-cache";

const EARLY_PATTERNS = [
  /提前入住/i,
  /提早入住/i,
  /早入住/i,
  /提前到/i,
  /早一?点[到入]/i,
  /提前.{0,4}小时/i,
  /提前\d+/i,
  /early[- ]?check[- ]?in/i,
  /earlier check[- ]?in/i,
  /アーリーチェック/i,
  /早めにチェック/i,
];

const LATE_PATTERNS = [
  /延迟退房/i,
  /延后退房/i,
  /推迟退房/i,
  /晚一?点退/i,
  /晚退房/i,
  /延后.{0,4}小时/i,
  /晚\d+点退/i,
  /late[- ]?check[- ]?out/i,
  /later check[- ]?out/i,
  /レイトチェック/i,
  /遅めにチェック/i,
];

function detectTopic(messages: Message[]): { early: boolean; late: boolean } {
  const recent = messages.filter((m) => m.sender !== "system").slice(-12);
  let early = false, late = false;
  for (const m of recent) {
    if (!early && EARLY_PATTERNS.some((p) => p.test(m.content))) early = true;
    if (!late && LATE_PATTERNS.some((p) => p.test(m.content))) late = true;
    if (early && late) break;
  }
  return { early, late };
}

export default function BackToBackWarning({
  conversationId,
  initialMessages,
  previous,
  next,
  currentCheckIn,
  currentCheckOut,
}: {
  conversationId: string;
  initialMessages: Message[];
  previous: CachedReservation | null;
  next: CachedReservation | null;
  currentCheckIn: string | null;
  currentCheckOut: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);

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
        if (!cancelled) setTimeout(open, 2000);
      });
    };
    open();
    return () => { cancelled = true; es?.close(); };
  }, [conversationId]);

  // Don't render anything if neither side is adjacent.
  if (!previous && !next) return null;

  const { early, late } = detectTopic(messages);
  // Only flag a side that is actually relevant to the topic the guest raised.
  const showPrevious = previous && early;
  const showNext = next && late;
  if (!showPrevious && !showNext) return null;

  return (
    <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-base leading-none">⚠</span>
        <span className="font-medium text-amber-900 dark:text-amber-200">注意：相邻日期已有其他订单</span>
      </div>

      {showPrevious && previous && (
        <Row
          tone="early"
          previousOrNext="previous"
          adj={previous}
          subjectDate={currentCheckIn}
        />
      )}

      {showNext && next && (
        <Row
          tone="late"
          previousOrNext="next"
          adj={next}
          subjectDate={currentCheckOut}
        />
      )}

      <p className="text-[11px] text-amber-800 dark:text-amber-300">
        提前入住或延迟退房可能影响清洁衔接和下一组客人入住，回复前请先确认。
      </p>
    </div>
  );
}

function Row({
  tone,
  previousOrNext,
  adj,
  subjectDate,
}: {
  tone: "early" | "late";
  previousOrNext: "previous" | "next";
  adj: CachedReservation;
  subjectDate: string | null;
}) {
  const guestName = adj.guest_name ?? adj.reservation_code;
  const channel = adj.channel_type ?? "";
  const desc =
    previousOrNext === "previous"
      ? `客人提到「提前入住」。${subjectDate ?? ""}当天上午有上一组客人 ${guestName} 退房（${adj.check_in_date} → ${adj.check_out_date}${channel ? " · " + channel : ""}）。`
      : `客人提到「延迟退房」。${subjectDate ?? ""}当天有下一组客人 ${guestName} 入住（${adj.check_in_date} → ${adj.check_out_date}${channel ? " · " + channel : ""}）。`;
  return (
    <div className="text-amber-900 dark:text-amber-200 leading-relaxed">
      <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5 align-middle" />
      {desc}
    </div>
  );
}
