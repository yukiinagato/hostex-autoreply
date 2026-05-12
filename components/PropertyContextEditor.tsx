"use client";
import { useState } from "react";
import type { Property } from "@/lib/db/types";

export default function PropertyContextEditor({ property }: { property: Property }) {
  const [value, setValue] = useState(property.custom_context ?? "");
  const [saved, setSaved] = useState<string | null>(property.custom_context ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== (saved ?? "");

  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/properties/${encodeURIComponent(property.hostex_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_context: value }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setSaved(json.property?.custom_context ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setValue(saved ?? "");
    setError(null);
  }

  // Pull a few interesting bits from details_json for header context.
  const details = property.details_json as Record<string, unknown>;
  const address = typeof details.address === "string" ? details.address : null;

  return (
    <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-baseline gap-2">
        <div className="font-medium text-sm truncate">{property.name ?? property.hostex_id}</div>
        <div className="text-[11px] text-neutral-500 truncate">#{property.hostex_id}</div>
        {address && (
          <div className="text-[11px] text-neutral-400 truncate ml-auto" title={address}>{address}</div>
        )}
      </header>
      <div className="p-3 space-y-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          placeholder="例如：停车场在房源东侧，每晚 1500 日元，需提前告知车牌；垃圾房在地下一层；附近 7-11 步行 3 分钟……"
          className="w-full text-xs font-mono leading-relaxed rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-2"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs rounded px-3 py-1.5"
          >
            {busy ? "保存中…" : "保存"}
          </button>
          {dirty && !busy && (
            <button
              type="button"
              onClick={reset}
              className="text-xs rounded px-3 py-1.5 border border-neutral-300 dark:border-neutral-700"
            >
              撤销
            </button>
          )}
          {!dirty && saved && (
            <span className="text-[11px] text-neutral-500">已保存 · {value.length} 字</span>
          )}
          {error && <span className="text-[11px] text-red-600">{error}</span>}
        </div>
      </div>
    </section>
  );
}
