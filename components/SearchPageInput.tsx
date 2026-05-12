"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchPageInput({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();

  // Keep input in sync if URL changes (e.g. user navigates back/forward).
  useEffect(() => { setQ(initialQuery); }, [initialQuery]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 border rounded border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5"
    >
      <span className="text-neutral-500 text-sm">🔍</span>
      <input
        autoFocus={!initialQuery}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="输入关键词，回车搜索"
        className="flex-1 bg-transparent outline-none text-sm"
      />
      {q && (
        <button
          type="button"
          onClick={() => { setQ(""); router.push("/search"); }}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          清除
        </button>
      )}
      <button
        type="submit"
        className="text-xs rounded px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white"
      >
        搜索
      </button>
    </form>
  );
}
