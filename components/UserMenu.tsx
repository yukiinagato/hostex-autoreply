"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/db/types";

export default function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = user.username.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
      >
        <span
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-semibold
            ${user.is_admin
              ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
              : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200"}`}
          aria-hidden
        >
          {initials}
        </span>
        <span className="hidden sm:inline text-xs text-neutral-600 dark:text-neutral-400 max-w-[8rem] truncate">
          {user.username}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-neutral-400">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-52 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden z-50"
        >
          <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
            <div className="text-sm font-medium flex items-center gap-1.5">
              {user.is_admin && <span title="管理员">👑</span>}
              <span className="truncate">{user.username}</span>
            </div>
            <div className="text-[10px] text-neutral-500">
              {user.is_admin ? "管理员" : "成员"}
            </div>
          </div>
          <ul className="py-1 text-sm">
            <li>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
              >
                <span aria-hidden>⚙</span> 设置
              </Link>
            </li>
            {user.is_admin && (
              <li>
                <Link
                  href="/settings/users"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                >
                  <span aria-hidden>👥</span> 用户管理
                </Link>
              </li>
            )}
            <li className="border-t border-neutral-100 dark:border-neutral-800 mt-1 pt-1">
              <form method="post" action="/api/auth/logout">
                <button
                  type="submit"
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <span aria-hidden>↗</span> 退出登录
                </button>
              </form>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
