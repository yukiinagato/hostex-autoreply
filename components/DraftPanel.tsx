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
    <div className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="font-medium">AI 草稿</h2>
        {draft.model_used && <span className="text-xs text-neutral-500">{draft.model_used}</span>}
        <div className="ml-auto flex items-center gap-2">
          {draft.auto_send_at && (
            <>
              <CountdownRing deadline={draft.auto_send_at} totalSeconds={countdownSeconds} />
              <button
                onClick={cancelCountdown}
                className="text-xs underline text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                取消自动发送
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {(["primary", "alternative"] as const).map((k) => {
          const active = choice === k;
          const stance = k === "primary" ? draft.primary_stance : draft.alternative_stance;
          const text = k === "primary" ? draft.primary_text : draft.alternative_text;
          const translation = (k === "primary" ? draft.primary_translation_zh : draft.alternative_translation_zh)?.trim();
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                // Switch active candidate. If user was editing, drop the edit
                // (it was for the previous candidate).
                patch({ edit_choice: k, edit_draft_id: null, edit_text: "" });
              }}
              className={`text-left rounded border p-3 text-sm transition ${
                active
                  ? "border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/50 dark:bg-blue-950/30"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-400"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide font-medium text-neutral-500 mb-1">
                {k === "primary" ? "A" : "B"}{stance ? ` · ${stance}` : ""}
              </div>
              <div className="whitespace-pre-wrap">{text}</div>
              {translation && (
                <div className="mt-2 pt-2 border-t border-dashed border-neutral-300 dark:border-neutral-700">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-0.5">
                    中文翻译（仅供内部预览，不会发送）
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap">
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
            onChange={(e) =>
              patch({ edit_draft_id: draft.id, edit_text: e.target.value })
            }
            rows={4}
            className="w-full text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              const baseText = choice === "primary" ? draft.primary_text : draft.alternative_text;
              patch({ edit_draft_id: draft.id, edit_text: baseText });
            }}
            className="text-xs underline text-neutral-600 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            发送前编辑
          </button>
        )}
      </div>

      {pendingImage && (
        <div className="flex items-start gap-2 rounded border border-neutral-200 dark:border-neutral-800 p-2 bg-neutral-50 dark:bg-neutral-950/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.dataUrl} alt="预览" className="w-20 h-20 object-cover rounded shrink-0" />
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate">{pendingImage.name}</div>
            <div className="text-neutral-500">{Math.round(pendingImage.size / 1024)} KB</div>
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
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded px-3 py-1.5"
        >
          {busy ? "发送中…" : "发送"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="text-sm rounded px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
            e.target.value = ""; // allow re-selecting same file
            if (f) void onFilePicked(f);
          }}
        />
        <button
          disabled={busy}
          onClick={() => patchDraft({ dismiss: true }).catch((e) => setError(String(e)))}
          className="text-sm rounded px-3 py-1.5 border border-neutral-300 dark:border-neutral-700"
        >
          忽略
        </button>
      </div>

      <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800">
        <label className="text-xs text-neutral-500 block mb-1">基于额外提示重新生成（可选）</label>
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
            className="flex-1 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
          />
          <button
            disabled={busy}
            onClick={regenerate}
            className="text-sm rounded px-3 py-1.5 border border-neutral-300 dark:border-neutral-700"
          >
            重新生成
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
