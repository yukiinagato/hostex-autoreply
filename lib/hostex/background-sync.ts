import { getDb } from "@/lib/db/client";
import { syncConversationFromHostex } from "@/lib/hostex/sync";

// Per-conversation debounce: don't refire the same sync more often than once
// every COOLDOWN_MS. Lives in-process; that's fine for our single-Node setup.
const lastFiredAt = new Map<string, number>();
const COOLDOWN_MS = 60_000;

const inflight = new Set<string>();

/**
 * Fire-and-forget background syncs for any conversation in the local DB that's
 * missing key metadata (guest_name, property, channel, or stay dates).
 *
 * Safe to call from request handlers — it returns immediately; syncs run in
 * the background. Each completed sync emits a `conversations` SSE event,
 * which causes the sidebar to refresh automatically.
 *
 * Also safe to call frequently — the cooldown map prevents re-syncing the
 * same conversation more than once per minute.
 */
export function kickStaleConversationSync(): void {
  let stale: { id: string; hostex_id: string }[];
  try {
    stale = getDb()
      .prepare(
        `select id, hostex_id from conversations
         where guest_name is null
            or property_hostex_id is null
            or channel_type is null
            or check_in_date is null
         order by (last_message_at is null), last_message_at desc
         limit 50`,
      )
      .all() as { id: string; hostex_id: string }[];
  } catch {
    return;
  }

  const now = Date.now();
  for (const c of stale) {
    if (inflight.has(c.hostex_id)) continue;
    if ((now - (lastFiredAt.get(c.hostex_id) ?? 0)) < COOLDOWN_MS) continue;
    lastFiredAt.set(c.hostex_id, now);
    inflight.add(c.hostex_id);
    void (async () => {
      try { await syncConversationFromHostex(c.hostex_id); }
      catch (err) { console.error("[bg-sync] failed for", c.hostex_id, err); }
      finally { inflight.delete(c.hostex_id); }
    })();
  }
}
