"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchHitRow, type SearchHit } from "./SearchHitRow";

const PREVIEW_LIMIT = 10;

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=${PREVIEW_LIMIT}`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          setHits(j.hits as SearchHit[]);
          setTotal(j.total ?? 0);
          setActiveIndex(0);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function navigate(hit: SearchHit) {
    onClose();
    router.push(hit.href);
  }
  function gotoFullSearch() {
    onClose();
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      // If user has highlighted a hit → go there. Otherwise → full results page.
      const hit = hits[activeIndex];
      if (hit) { e.preventDefault(); navigate(hit); }
      else if (q.trim()) { e.preventDefault(); gotoFullSearch(); }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[80dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
          <span className="text-neutral-500">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="搜索房源、客人、订单号、电话、消息内容…"
            className="flex-1 bg-transparent outline-none text-sm py-1"
          />
          <span className="text-[10px] text-neutral-400">Esc 关闭</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {q.trim() === "" ? (
            <Hint />
          ) : loading && hits.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-500">搜索中…</div>
          ) : hits.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-500">没有匹配的结果</div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {hits.map((hit, i) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <SearchHitRow
                    hit={hit}
                    active={i === activeIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={onClose}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-500 flex items-center gap-3">
          <span>↑↓ 移动</span>
          <span>↵ 打开</span>
          {total > hits.length && (
            <Link
              href={`/search?q=${encodeURIComponent(q.trim())}`}
              onClick={onClose}
              className="ml-auto text-blue-600 hover:underline"
            >
              查看全部 {total} 条结果 →
            </Link>
          )}
          {total > 0 && total <= hits.length && (
            <span className="ml-auto">{total} 个结果</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Hint() {
  return (
    <div className="p-4 text-xs text-neutral-500 space-y-2">
      <p>可以搜索：</p>
      <ul className="space-y-1 list-disc list-inside">
        <li>房源名 / 房源地址 / 房源备注</li>
        <li>客人姓名 / 电话 / 邮箱</li>
        <li>订单号 / 渠道 / 入住日期</li>
        <li>最近 60 天的对话内容</li>
      </ul>
      <p className="pt-1 text-[11px] text-neutral-400">支持空格分隔多个关键词，全部命中才会返回。回车跳转到完整搜索结果页。</p>
    </div>
  );
}
