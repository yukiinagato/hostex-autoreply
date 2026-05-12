"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationDraft } from "@/lib/db/types";

const EMPTY = (id: string): ConversationDraft => ({
  conversation_id: id,
  compose_prompt: "",
  preset_label: "",
  preset_input: "",
  edit_draft_id: null,
  edit_text: "",
  edit_choice: "primary",
  regen_guidance: "",
  updated_at: new Date(0).toISOString(),
});

/**
 * Telegram-style synced draft state for the conversation's input boxes.
 *
 * - Loads the persisted state on mount via GET /api/conversations/[id]/draft-state
 * - Subscribes to SSE `convdraft` events for cross-tab/-device sync
 * - Local mutations are applied immediately (responsive UI) and PATCHed to the
 *   server with a 400ms debounce
 * - Incoming SSE updates are ignored for ~2s after the latest local edit so we
 *   don't yank text out from under the user mid-typing; otherwise applied.
 */
export function useDraftState(conversationId: string) {
  const [state, setState] = useState<ConversationDraft>(() => EMPTY(conversationId));
  const [loaded, setLoaded] = useState(false);
  const lastLocalEditRef = useRef(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<Partial<ConversationDraft>>({});

  // Initial load
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conversations/${encodeURIComponent(conversationId)}/draft-state`, { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setState(j.state as ConversationDraft);
        setLoaded(true);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [conversationId]);

  // SSE subscription with auto-reconnect
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    const open = () => {
      if (cancelled) return;
      es = new EventSource(`/api/events?conversationId=${encodeURIComponent(conversationId)}`);
      es.addEventListener("convdraft", (e) => {
        try {
          const remote = JSON.parse((e as MessageEvent).data) as ConversationDraft;
          // Don't stomp the user mid-typing.
          if (Date.now() - lastLocalEditRef.current < 2000) return;
          setState(remote);
        } catch { /* ignore */ }
      });
      es.addEventListener("error", () => {
        es?.close();
        if (!cancelled) setTimeout(open, 2000);
      });
    };
    open();
    return () => { cancelled = true; es?.close(); };
  }, [conversationId]);

  const flush = useCallback(() => {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (Object.keys(patch).length === 0) return;
    void fetch(`/api/conversations/${encodeURIComponent(conversationId)}/draft-state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, [conversationId]);

  const patch = useCallback((p: Partial<ConversationDraft>) => {
    lastLocalEditRef.current = Date.now();
    setState((prev) => ({ ...prev, ...p }));
    pendingPatchRef.current = { ...pendingPatchRef.current, ...p };
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(flush, 400);
  }, [flush]);

  // Flush on unmount + visibility hidden so quick navigations don't drop input
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        flush();
      }
    };
  }, [flush]);

  return { state, patch, loaded };
}
