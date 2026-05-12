"use client";
import { useEffect, useState } from "react";

type Info = { vapidPublicKey: string | null; configured: boolean; subscriptionCount: number };

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Std);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

export default function PushSubscribeCard() {
  const [info, setInfo] = useState<Info | null>(null);
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [subEndpoint, setSubEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Detect support + load info + current subscription (if any) on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    fetch("/api/push/info", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setInfo(j as Info))
      .catch(() => { /* ignore */ });
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (sub) setSubEndpoint(sub.endpoint); })
      .catch(() => { /* sw not registered yet */ });
  }, []);

  async function enable() {
    setBusy(true); setError(null); setMsg(null);
    try {
      if (!info?.vapidPublicKey) throw new Error("服务器还没配置 VAPID keys");
      // Register the service worker
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      // Ask for permission (must be from a user gesture on iOS)
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") throw new Error("没有获得通知权限");
      // Subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(info.vapidPublicKey),
      });
      const json = sub.toJSON();
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!r.ok) throw new Error(await r.text());
      setSubEndpoint(json.endpoint ?? null);
      setMsg("已开启。");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setError(null); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubEndpoint(null);
      setMsg("已关闭。");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const j = await r.json();
      setMsg(`已发送测试推送：sent=${j.sent}, pruned=${j.pruned}, failed=${j.failed}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const enabled = !!subEndpoint && permission === "granted";

  return (
    <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="text-sm font-medium">消息推送</div>
        <div className="text-[11px] text-neutral-500">
          收到客人新消息时，向你这台设备推送系统通知。
        </div>
      </header>
      <div className="p-3 space-y-2 text-xs">
        {!supported ? (
          <p className="text-neutral-500">
            当前浏览器不支持 Web Push。iOS 上请先把网站「加入主画面」用 PWA 模式打开（iOS 16.4+）。
          </p>
        ) : info && !info.configured ? (
          <p className="text-amber-700 dark:text-amber-300">
            服务器还没配置 VAPID keys。管理员请在终端运行
            <code className="mx-1 bg-neutral-100 dark:bg-neutral-800 px-1 rounded">pnpm exec web-push generate-vapid-keys</code>
            ，把输出写到 .env.local 的 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY，重启服务后再回来。
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={enabled ? "text-green-600" : "text-neutral-500"}>
                状态：{enabled ? "✓ 已开启" : "未开启"}
              </span>
              {permission === "denied" && (
                <span className="text-red-600">
                  浏览器通知权限被拒绝，需要到系统设置里手动允许。
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!enabled ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={enable}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-3 py-1.5"
                >
                  {busy ? "启用中…" : "开启推送"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendTest}
                    className="rounded px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    发测试通知
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={disable}
                    className="rounded px-3 py-1.5 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto"
                  >
                    关闭推送
                  </button>
                </>
              )}
            </div>
            {msg && <p className="text-neutral-500">{msg}</p>}
            {error && <p className="text-red-600 break-all">{error}</p>}
            <p className="text-[10px] text-neutral-400 pt-1">
              iOS 用户：必须用「加入主画面」打开本应用（不能用 Safari 直接访问的页面），才能开启推送。Mac/Windows
              桌面浏览器直接开启即可。
            </p>
          </>
        )}
      </div>
    </section>
  );
}
