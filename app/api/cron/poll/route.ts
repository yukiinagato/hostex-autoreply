import { NextResponse } from "next/server";
import { findExpiredAutoSendDrafts, getConversation, insertMessage, updateDraft, upsertConversation } from "@/lib/db/queries";
import { listConversations as hostexListConversations, normalizeMessage, sendMessage, getConversation as hostexGetConversation } from "@/lib/hostex/conversations";
import { generateDraftFor } from "@/lib/draft-engine";
import { syncRecentReservationsForAllProperties } from "@/lib/hostex/reservations-sync";

// In-memory throttle so we don't run the heavy reservations sync on every cron tick.
let lastReservationsSyncAt = 0;
const RESERVATIONS_SYNC_INTERVAL_MS = 30 * 60_000; // 30 min

export const runtime = "nodejs";

/**
 * Combined cron job:
 *   - Sweeper: send any pending draft whose auto_send_at has passed.
 *   - Poller: pull recent conversations from Hostex and ingest unseen messages
 *             as a fallback for missed webhooks.
 *
 * Trigger every ~5–30s (Vercel Cron, GitHub Actions, or a local timer).
 * Auth: pass `?secret=<CRON_SECRET>` or `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const url = new URL(req.url);
    const fromQuery = url.searchParams.get("secret");
    const fromHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (fromQuery !== expected && fromHeader !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const sweepResult = await sweepAutoSend();
  const pollResult = await pollHostex().catch((err) => ({ error: String(err) }));

  // Throttled background reservations sync to keep the search index fresh.
  let reservationsResult: unknown = { skipped: true };
  if (Date.now() - lastReservationsSyncAt > RESERVATIONS_SYNC_INTERVAL_MS) {
    lastReservationsSyncAt = Date.now();
    // fire-and-forget; the sync can take many seconds for hosts with lots of properties
    void syncRecentReservationsForAllProperties()
      .then((r) => console.log("[cron] reservations sync done", r))
      .catch((err) => console.error("[cron] reservations sync failed", err));
    reservationsResult = { started: true };
  }

  return NextResponse.json({ ok: true, sweep: sweepResult, poll: pollResult, reservations: reservationsResult });
}

async function sweepAutoSend() {
  const due = await findExpiredAutoSendDrafts();
  let sent = 0;
  let failed = 0;
  for (const draft of due) {
    try {
      const conv = await getConversation(draft.conversation_id);
      if (!conv) {
        await updateDraft(draft.id, { status: "dismissed", auto_send_at: null });
        continue;
      }
      await sendMessage(conv.hostex_id, { text: draft.primary_text });
      await insertMessage({
        conversation_id: conv.id,
        sender: "host",
        content: draft.primary_text,
        sent_via: "ai-auto",
      });
      await updateDraft(draft.id, { status: "sent", auto_send_at: null });
      sent++;
    } catch (err) {
      console.error("[cron] auto-send failed", draft.id, err);
      failed++;
    }
  }
  return { dueCount: due.length, sent, failed };
}

async function pollHostex() {
  // Pull a small window of recent conversations and ingest any new guest msgs.
  const list = await hostexListConversations({ limit: 30 });
  let newDrafts = 0;
  for (const c of list) {
    const hostexId = String(c.id);
    const conv = await upsertConversation({
      hostex_id: hostexId,
      guest_name: c.guest_name ?? null,
      property_hostex_id:
        c.property_id != null ? String(c.property_id) :
        c.listing_id != null ? String(c.listing_id) : null,
      reservation_hostex_id: c.reservation_id != null ? String(c.reservation_id) : null,
      last_message_at: c.last_message_at ?? null,
    });

    // Fetch detail for messages we haven't seen.
    const detail = await hostexGetConversation(hostexId);
    const msgs = detail?.messages ?? [];
    let triggered = false;
    for (const m of msgs) {
      const n = normalizeMessage(m);
      if (!n.content) continue;
      const inserted = await insertMessage({
        conversation_id: conv.id,
        hostex_msg_id: n.hostex_msg_id,
        sender: n.sender,
        content: n.content,
        sent_via: "hostex",
        created_at: n.created_at,
      });
      // crude heuristic: if upsert created a "new" guest message in the last 5 min,
      // mark as triggered. (We can't tell from upsert if it was new without comparing
      // timestamps; treat anything within 5 minutes as fresh.)
      const age = Date.now() - new Date(inserted.created_at).getTime();
      if (n.sender === "guest" && age < 5 * 60 * 1000) triggered = true;
    }
    if (triggered) {
      try {
        await generateDraftFor(conv.id);
        newDrafts++;
      } catch (err) {
        console.error("[poll] draft gen failed", conv.id, err);
      }
    }
  }
  return { conversations: list.length, newDrafts };
}
