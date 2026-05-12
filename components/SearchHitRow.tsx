"use client";
import Link from "next/link";
import type { ReactNode } from "react";

export type SearchHitType = "property" | "conversation" | "reservation" | "message";

export type SearchHit = {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  href: string;
  meta?: Record<string, string | number | null>;
  score: number;
};

export const TYPE_LABEL: Record<SearchHitType, string> = {
  property: "房源",
  conversation: "对话",
  reservation: "订单",
  message: "消息",
};

export const TYPE_ICON: Record<SearchHitType, string> = {
  property: "🏠",
  conversation: "💬",
  reservation: "📅",
  message: "✉",
};

export function SearchHitRow({
  hit,
  active,
  onMouseEnter,
  onClick,
  rightSlot,
}: {
  hit: SearchHit;
  active?: boolean;
  onMouseEnter?: () => void;
  onClick?: () => void;
  rightSlot?: ReactNode;
}) {
  return (
    <Link
      href={hit.href}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex items-start gap-3 px-3 py-2.5 ${active ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"}`}
    >
      <div className="text-base shrink-0 mt-0.5">{TYPE_ICON[hit.type]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium truncate">{hit.title}</span>
          <span className="text-[10px] text-neutral-500 shrink-0">{TYPE_LABEL[hit.type]}</span>
        </div>
        {hit.subtitle && (
          <div className="text-[11px] text-neutral-500 truncate">{hit.subtitle}</div>
        )}
        {hit.snippet && (
          <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5 line-clamp-2">
            {hit.snippet}
          </div>
        )}
        {hit.meta?.phone && (
          <div className="text-[11px] text-neutral-500">📞 {hit.meta.phone}</div>
        )}
      </div>
      {rightSlot}
    </Link>
  );
}
