"use client";
import { useState } from "react";
import type { User } from "@/lib/db/types";

export default function MyProfileCard({ initial }: { initial: User }) {
  const [suffix, setSuffix] = useState(initial.message_suffix);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null); setMsg(null);
    const patch: Record<string, unknown> = {};
    if (suffix !== initial.message_suffix) patch.message_suffix = suffix;
    if (password.length > 0) {
      if (password.length < 6) { setError("密码至少 6 位"); setBusy(false); return; }
      patch.password = password;
    }
    if (Object.keys(patch).length === 0) {
      setMsg("没有改动");
      setBusy(false);
      return;
    }
    const r = await fetch(`/api/users/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (r.ok) {
      setMsg("已保存");
      setPassword("");
    } else {
      const t = await r.text();
      setError(t.slice(0, 200));
    }
    setBusy(false);
  }

  const inputCss = "w-full text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1.5";

  return (
    <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="text-sm font-medium">
          我的账号
          {initial.is_admin && <span className="ml-1 text-[10px] text-neutral-500">👑 管理员</span>}
        </div>
        <div className="text-[11px] text-neutral-500">{initial.username}</div>
      </header>
      <div className="p-3 space-y-3 text-xs">
        <label className="flex flex-col gap-1">
          <span>消息后缀（发送时追加在新行）</span>
          <textarea
            rows={2}
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
            placeholder="例如：— Mai（花溪居客服）"
            className={inputCss + " font-mono"}
          />
          <span className="text-[10px] text-neutral-500">留空则不追加。</span>
        </label>
        <label className="flex flex-col gap-1">
          <span>修改密码（留空则不变）</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
            autoComplete="new-password"
            className={inputCss}
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-3 py-1.5 text-xs"
          >
            {busy ? "保存中…" : "保存"}
          </button>
          {msg && <span className="text-[11px] text-neutral-500">{msg}</span>}
          {error && <span className="text-[11px] text-red-600">{error}</span>}
        </div>
      </div>
    </section>
  );
}
