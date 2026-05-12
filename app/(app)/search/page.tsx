import Link from "next/link";
import { search } from "@/lib/db/search";
import { SearchHitRow } from "@/components/SearchHitRow";
import SearchPageInput from "@/components/SearchPageInput";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PER_PAGE;

  const result = q ? search(q, { limit: PER_PAGE, offset }) : { hits: [], total: 0, countsByType: { property: 0, reservation: 0, conversation: 0, message: 0 } };
  const totalPages = Math.max(1, Math.ceil(result.total / PER_PAGE));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <header className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold">搜索结果</h1>
            {q && (
              <span className="text-xs text-neutral-500">
                关键词：<span className="font-mono">{q}</span>
              </span>
            )}
          </div>
          <SearchPageInput initialQuery={q} />
          {q && (
            <div className="text-xs text-neutral-500 flex flex-wrap gap-x-3 gap-y-1">
              <span>共 {result.total} 条</span>
              <CountBadge label="🏠 房源" n={result.countsByType.property} />
              <CountBadge label="📅 订单" n={result.countsByType.reservation} />
              <CountBadge label="💬 对话" n={result.countsByType.conversation} />
              <CountBadge label="✉ 消息" n={result.countsByType.message} />
            </div>
          )}
        </header>

        {!q ? (
          <p className="text-sm text-neutral-500 py-12 text-center">在上方输入关键词开始搜索。</p>
        ) : result.hits.length === 0 ? (
          <p className="text-sm text-neutral-500 py-12 text-center">没有匹配的结果。</p>
        ) : (
          <>
            <div className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {result.hits.map((hit) => (
                  <li key={`${hit.type}-${hit.id}`}>
                    <SearchHitRow hit={hit} />
                  </li>
                ))}
              </ul>
            </div>

            {totalPages > 1 && (
              <Pager q={q} page={page} totalPages={totalPages} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CountBadge({ label, n }: { label: string; n: number }) {
  if (n === 0) return null;
  return (
    <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[11px]">
      {label} {n}
    </span>
  );
}

function Pager({ q, page, totalPages }: { q: string; page: number; totalPages: number }) {
  const buildHref = (p: number) => `/search?q=${encodeURIComponent(q)}&page=${p}`;
  const pages = pageList(page, totalPages);
  return (
    <nav className="flex items-center justify-center gap-1 text-xs flex-wrap">
      <PagerLink href={page > 1 ? buildHref(page - 1) : null} label="‹ 上一页" />
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} className="px-2 text-neutral-400">…</span>
        ) : (
          <PagerLink
            key={p}
            href={buildHref(p)}
            label={String(p)}
            active={p === page}
          />
        ),
      )}
      <PagerLink href={page < totalPages ? buildHref(page + 1) : null} label="下一页 ›" />
    </nav>
  );
}

function PagerLink({ href, label, active }: { href: string | null; label: string; active?: boolean }) {
  if (!href) {
    return <span className="px-2 py-1 text-neutral-400">{label}</span>;
  }
  return (
    <Link
      href={href}
      className={`px-2 py-1 rounded border ${
        active
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
          : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
    </Link>
  );
}

function pageList(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("ellipsis");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("ellipsis");
  out.push(total);
  return out;
}
