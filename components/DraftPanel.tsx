"use client";
import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/db/types";
import CountdownRing from "./CountdownRing";
import ComposePanel from "./ComposePanel";
import { useDraftState } from "./useDraftState";

type Choice = "primary" | "alternative";

export default function DraftPanel({
  conversationId,
  initialDraft,
  countdownSeconds,
  autoMode,
}: {
  conversationId: string;
  initialDraft: Draft | null;
  countdownSeconds: number;
  autoMode: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local-only state: a pending image attached to the next Send.
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; name: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSendFiredRef = useRef(false);

  const { state, patch } = useDraftState(conversationId);

  // Synced "active candidate". Default primary if synced state has no choice.
  const choice: Choice = state.edit_choice;
  const guidance = state.regen_guidance;

  // editing & draftText derive from synced state. We're considered "editing"
  // when the synced state's edit_draft_id matches the current draft.
  const editing = !!draft && state.edit_draft_id === draft.id;
  const draftText = editing
    ? state.edit_text
    : (draft ? (choice === "primary" ? draft.primary_text : draft.alternative_text) : "");

  // When the active draft changes (regenerate, new ai-auto, etc.), the previous
  // edit no longer applies; the synced edit_draft_id is preserved on the server
  // until the host explicitly continues the edit on the new draft, so we just
  // render naturally based on that.
  useEffect(() => {
    autoSendFiredRef.current = false;
  }, [draft?.id]);

  // SSE subscription for draft changes (auto-reconnect).
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    const open = () => {
      if (cancelled) return;
      es = new EventSource(`/api/events?conversationId=${encodeURIComponent(conversationId)}`);
      es.addEventListener("draft", (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data) as Draft;
          if (d.status === "pending") setDraft(d);
          else setDraft((cur) => (cur && cur.id === d.id ? null : cur));
        } catch { /* ignore */ }
      });
      es.addEventListener("error", () => {
        es?.close();
        if (!cancelled) setTimeout(open, 2_000);
      });
    };
    open();
    return () => { cancelled = true; es?.close(); };
  }, [conversationId]);

  // Client-side auto-send safety net.
  useEffect(() => {
    if (!draft?.auto_send_at || draft.status !== "pending") return;
    const dl = new Date(draft.auto_send_at).getTime();
    const t = setInterval(() => {
      if (autoSendFiredRef.current) return;
      if (Date.now() >= dl) {
        autoSendFiredRef.current = true;
        void send("auto", draft.primary_text);
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id, draft?.auto_send_at]);

  async function patchDraft(p: Record<string, unknown>) {
    if (!draft) return;
    const r = await fetch(`/api/drafts/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!r.ok) throw new Error(`patch failed: ${r.status}`);
    const json = await r.json();
    setDraft(json.draft as Draft);
  }

  async function cancelCountdown() {
    setError(null);
    try { await patchDraft({ cancel_countdown: true }); }
    catch (e) { setError(String(e)); }
  }

  async function send(source: "primary" | "alternative" | "edited" | "auto", textOverride?: string) {
    if (!draft) return;
    setBusy(true); setError(null);
    try {
      const text = textOverride ?? (editing ? draftText : (choice === "primary" ? draft.primary_text : draft.alternative_text));
      const body: Record<string, unknown> = { text, source };
      if (pendingImage) body.image = pendingImage.dataUrl;
      const r = await fetch(`/api/drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`send failed: ${(await r.text()).slice(0, 200)}`);
      // Clear any in-progress edit / guidance — they applied to a draft that
      // is now sent and gone.
      patch({ edit_draft_id: null, edit_text: "", regen_guidance: "" });
      setPendingImage(null);
      setDraft(null);
    } catch (e) {
      setError(String(e));
      autoSendFiredRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(file: File) {
    setError(null);
    if (file.size > 15 * 1024 * 1024) {
      setError("图片过大（>15MB），请压缩后再发。");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("仅支持图片文件。");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error ?? new Error("read failed"));
      r.readAsDataURL(file);
    });
    setPendingImage({ dataUrl, name: file.name, size: file.size });
  }

  async function regenerate() {
    if (!draft) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/drafts/${draft.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guidance: guidance || undefined,
          selected_choice: choice,
        }),
      });
      if (!r.ok) throw new Error(`regenerate failed: ${(await r.text()).slice(0, 200)}`);
      const json = await r.json();
      setDraft(json.draft as Draft);
      // The previous draft's edit + guidance no longer apply.
      patch({ edit_draft_id: null, edit_text: "", regen_guidance: "" });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return (
      <ComposePanel
        conversationId={conversationId}
        countdownHint={autoMode ? `全自动发送模式已开启（倒数 ${countdownSeconds} 秒）` : undefined}
      />
    );
  }

  return (
    <div
      className="border rounded-lg border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3 shadow-sm"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-3">
        <h2 className="font-medium flex items-center gap-1.5">
          <span className="text-base">✨</span>
          <span>AI 草稿</span>
        </h2>
        {draft.model_used && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 tabular-nums">
            {draft.model_used}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {draft.auto_send_at && (
            <>
              <CountdownRing deadline={draft.auto_send_at} totalSeconds={countdownSeconds} />
              <button
                onClick={cancelCountdown}
                className="text-xs underline decoration-dotted underline-offset-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                取消自动发送
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {(["primary", "alternative"] as const).map((k) => {
          const active = choice === k;
          const stance = k === "primary" ? draft.primary_stance : draft.alternative_stance;
          const text = k === "primary" ? draft.primary_text : draft.alternative_text;
          const translation = (k === "primary" ? draft.primary_translation_zh : draft.alternative_translation_zh)?.trim();
          return (
            <button
              key={k}
              type="button"
              onClick={() => patch({ edit_choice: k, edit_draft_id: null, edit_text: "" })}
              className={`relative text-left rounded-lg border p-3 text-sm transition-all
                ${active
                  ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 shadow-sm ring-1 ring-blue-500/20"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-700/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/30"}`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold transition
                    ${active ? "bg-blue-600 text-white" : "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"}`}
                >
                  {k === "primary" ? "A" : "B"}
                </span>
                {stance && (
                  <span className="text-[10px] tracking-wide text-neutral-500 dark:text-neutral-400">
                    {stance}
                  </span>
                )}
                {active && (
                  <span className="ml-auto text-[10px] text-blue-600 dark:text-blue-400 font-medium">✓ 已选</span>
                )}
              </div>
              <div className="whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-200 leading-relaxed">
                {text}
              </div>
              {translation && (
                <div className="mt-2 pt-2 border-t border-dashed border-neutral-300 dark:border-neutral-700">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-0.5">
                    中文翻译（仅本地预览）
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap break-words leading-relaxed">
                    {translation}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div>
        {editing ? (
          <textarea
            value={draftText}
            onChange={(e) => patch({ edit_draft_id: draft.id, edit_text: e.target.value })}
            rows={4}
            className="input resize-y"
            placeholder="在这里编辑后发送…"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              const baseText = choice === "primary" ? draft.primary_text : draft.alternative_text;
              patch({ edit_draft_id: draft.id, edit_text: baseText });
            }}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 inline-flex items-center gap-1"
          >
            <span>✎</span>
            <span className="underline decoration-dotted underline-offset-2">发送前编辑</span>
          </button>
        )}
      </div>

      {pendingImage && (
        <div className="flex items-start gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-2 bg-neutral-50 dark:bg-neutral-950/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.dataUrl} alt="预览" className="w-20 h-20 object-cover rounded shrink-0" />
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate font-medium">{pendingImage.name}</div>
            <div className="text-neutral-500 tabular-nums">{Math.round(pendingImage.size / 1024)} KB</div>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="mt-1 text-[11px] text-red-600 hover:underline"
            >
              移除图片
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => send(editing ? "edited" : choice)}
          className="btn-primary"
        >
          {busy && <span className="spinner" aria-hidden />}
          {busy ? "发送中" : "发送"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary"
        >
          📎 图片
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFilePicked(f);
          }}
        />
        <button
          disabled={busy}
          onClick={() => patchDraft({ dismiss: true }).catch((e) => setError(String(e)))}
          className="btn-secondary ml-auto"
        >
          忽略
        </button>
      </div>

      <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <label className="text-xs text-neutral-500 block mb-1.5">基于额外提示重新生成（可选）</label>
        <div className="flex gap-2">
          <input
            value={guidance}
            onChange={(e) => patch({ regen_guidance: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) {
                e.preventDefault();
                void regenerate();
              }
            }}
            placeholder="例如：可以加收 1000 日元提供 14 点入住"
            className="input flex-1"
          />
          <button disabled={busy} onClick={regenerate} className="btn-secondary shrink-0">
            {busy && <span className="spinner" aria-hidden />}
            重新生成
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300 break-words">
          {error}
        </div>
      )}
    </div>
  );
}
