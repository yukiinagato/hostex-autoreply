"use client";
import { useEffect, useState } from "react";

export default function CountdownRing({
  deadline,
  totalSeconds,
}: {
  deadline: string | null;
  totalSeconds: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [deadline]);

  if (!deadline) return null;
  const remainMs = Math.max(0, new Date(deadline).getTime() - now);
  const remainSec = Math.ceil(remainMs / 1000);
  const frac = Math.max(0, Math.min(1, remainMs / (totalSeconds * 1000)));

  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = c * frac;

  return (
    <div className="relative w-12 h-12 shrink-0" aria-label={`${remainSec} 秒后自动发送`}>
      <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
        <circle cx="22" cy="22" r={r} className="stroke-neutral-300 dark:stroke-neutral-700" strokeWidth="3" fill="none" />
        <circle
          cx="22"
          cy="22"
          r={r}
          className="stroke-blue-500 transition-[stroke-dasharray] duration-100"
          strokeWidth="3"
          fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-xs font-medium">
        {remainSec}
      </div>
    </div>
  );
}
