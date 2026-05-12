"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/db/types";

export default function UsersAdmin({ initial, meId }: { initial: User[]; meId: number }) {
  const [users, setUsers] = useState<User[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function refresh() {
    const r = await fetch("/api/users", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setUsers(j.users as User[]);
    }
  }

  async function createUser(form: { username: string; password: string; suffix: string; admin: boolean }) {
    setError(null);
    const r = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username.trim(),
        password: form.password,
        message_suffix: form.suffix,
        is_admin: form.admin,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      setError(t.slice(0, 200));
      return false;
    }
    await refresh();
    return true;
  }

  async function patchUser(id: number, patch: Partial<User> & { password?: string }) {
    setError(null);
    const r = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const t = await r.text();
      setError(t.slice(0, 200));
      return false;
    }
    await refresh();
    return true;
  }

  async function deleteUser(id: number) {
    if (!confirm("确认删除该用户？此操作不可撤销。")) return;
    setError(null);
    const r = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const t = await r.text();
      setError(t.slice(0, 200));
      return;
    }
    await refresh();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-2 text-xs text-red-700 dark:text-red-300 break-all">
          {error}
        </div>
      )}
      {users.map((u) => (
        <UserRow key={u.id} user={u} isMe={u.id === meId} onPatch={(p) => patchUser(u.id, p)} onDelete={() => deleteUser(u.id)} />
      ))}
      <CreateForm onCreate={createUser} />
    </div>
  );
}

function UserRow({
  user,
  isMe,
  onPatch,
  onDelete,
}: {
  user: User;
  isMe: boolean;
  onPatch: (p: Partial<User> & { password?: string }) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [suffix, setSuffix] = useState(user.message_suffix);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const inputCss = "w-full text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1.5";

  return (
    <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-baseline gap-2">
        <div className="font-medium text-sm">
          {user.is_admin && <span className="mr-1">👑</span>}
          {user.username}
          {isMe && <span className="ml-1 text-[10px] text-neutral-500">（你自己）</span>}
        </div>
        <div className="text-[11px] text-neutral-500 ml-auto">
          创建于 {new Date(user.created_at).toLocaleDateString("zh-CN")}
        </div>
      </header>
      <div className="p-3 space-y-2 text-xs">
        <label className="flex flex-col gap-1">
          <span>消息后缀（每次发送时追加在新行）</span>
          <textarea
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
            rows={2}
            placeholder="例如：— Mai（花溪居客服）"
            className={inputCss + " font-mono"}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>新密码（留空则不修改）</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
            autoComplete="new-password"
            className={inputCss}
          />
        </label>

        <div className="flex items-center gap-2 flex-wrap">
          {!isMe && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={user.is_admin}
                onChange={(e) => onPatch({ is_admin: e.target.checked })}
              />
              <span>管理员</span>
            </label>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const patch: Partial<User> & { password?: string } = {};
              if (suffix !== user.message_suffix) patch.message_suffix = suffix;
              if (password.length > 0) patch.password = password;
              if (Object.keys(patch).length > 0) {
                const ok = await onPatch(patch);
                if (ok) setPassword("");
              }
              setBusy(false);
            }}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-3 py-1 text-xs"
          >
            {busy ? "保存中…" : "保存"}
          </button>
          {!isMe && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs rounded px-3 py-1 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function CreateForm({
  onCreate,
}: {
  onCreate: (f: { username: string; password: string; suffix: string; admin: boolean }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [suffix, setSuffix] = useState("");
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-sm rounded border border-dashed border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 py-3 text-neutral-500"
      >
        + 新增用户
      </button>
    );
  }

  const inputCss = "w-full text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1.5";

  return (
    <section className="border rounded border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="font-medium text-sm">新增用户</div>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-base text-neutral-500">×</button>
      </div>
      <label className="text-xs flex flex-col gap-1">
        <span>用户名</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCss} autoComplete="off" />
      </label>
      <label className="text-xs flex flex-col gap-1">
        <span>密码（至少 6 位）</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCss} autoComplete="new-password" />
      </label>
      <label className="text-xs flex flex-col gap-1">
        <span>消息后缀（可选）</span>
        <textarea rows={2} value={suffix} onChange={(e) => setSuffix(e.target.value)} className={inputCss + " font-mono"} />
      </label>
      <label className="text-xs flex items-center gap-1.5">
        <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
        <span>设为管理员</span>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !username.trim() || password.length < 6}
          onClick={async () => {
            setBusy(true);
            const ok = await onCreate({ username, password, suffix, admin });
            setBusy(false);
            if (ok) {
              setUsername(""); setPassword(""); setSuffix(""); setAdmin(false);
              setOpen(false);
            }
          }}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-3 py-1.5 text-xs"
        >
          {busy ? "创建中…" : "创建"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs rounded px-3 py-1.5 border border-neutral-300 dark:border-neutral-700">
          取消
        </button>
      </div>
    </section>
  );
}
