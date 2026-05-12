import { getDb } from "@/lib/db/client";
import { insertMessage, upsertConversation } from "@/lib/db/queries";
import {
  getConversation as hostexGetConversation,
  normalizeMessage,
  type HostexConversation,
  type HostexMessage,
} from "@/lib/hostex/conversations";
import type { Conversation } from "@/lib/db/types";

/**
 * Pull the latest snapshot of a Hostex conversation and reconcile into local DB:
 *   - upsert conversation metadata (guest, property, channel, check-in/out)
 *   - ingest any messages not yet seen (dedupe by hostex_msg_id)
 *   - reconcile host echoes (local optimistic insert with hostex_msg_id=null
 *     gets its id attached instead of producing a duplicate)
 *
 * Returns the freshly-upserted conversation row plus a flag indicating whether
 * a NEW guest message arrived (which the caller may use to trigger draft gen).
 */
export async function syncConversationFromHostex(hostexConversationId: string | number): Promise<{
  conversation: Conversation;
  newGuestMessage: boolean;
} | null> {
  const detail = (await hostexGetConversation(hostexConversationId).catch(() => null)) as
    | (HostexConversation & Record<string, unknown>)
    | null;
  if (!detail) return null;

  const guest = (detail as Record<string, unknown>).guest as Record<string, unknown> | undefined;
  const activities = (detail as Record<string, unknown>).activities as Array<Record<string, unknown>> | undefined;
  const act = activities?.[0];
  const actProp = act?.property as Record<string, unknown> | undefined;

  const guestName =
    (typeof guest?.name === "string" && guest.name.trim() !== "" ? guest.name : null) ??
    (typeof detail.guest_name === "string" ? detail.guest_name : null);
  const channelType =
    (typeof detail.channel_type === "string" && detail.channel_type) || null;
  const propertyHostexId =
    actProp?.id != null ? String(actProp.id) :
    act?.listing_id != null ? String(act.listing_id) :
    null;
  const reservationCode =
    typeof act?.reservation_code === "string" && act.reservation_code !== ""
      ? act.reservation_code
      : null;
  const checkIn = typeof act?.check_in_date === "string" ? act.check_in_date : null;
  const checkOut = typeof act?.check_out_date === "string" ? act.check_out_date : null;

  // Pull messages array from common shapes.
  const msgs: HostexMessage[] =
    (detail.messages as HostexMessage[] | undefined) ??
    ((detail as Record<string, unknown>).message_list as HostexMessage[] | undefined) ??
    [];
  const lastMsgAt = msgs[0]?.created_at ?? msgs[msgs.length - 1]?.created_at ?? new Date().toISOString();

  // Diagnostic: surface any media-suggesting message whose attachment shape
  // we couldn't parse. Once we see a real one we can adjust normalizeMessage.
  for (const m of msgs) {
    const r = m as Record<string, unknown>;
    const isMedia =
      (typeof r.display_type === "string" && /image|video|audio|file|attach/i.test(r.display_type)) ||
      (r.attachment != null && r.attachment !== "");
    if (isMedia) {
      console.log("[sync] media message sample:", JSON.stringify(m).slice(0, 600));
    }
  }

  const conv = await upsertConversation({
    hostex_id: String(hostexConversationId),
    guest_name: guestName,
    property_hostex_id: propertyHostexId,
    reservation_hostex_id: reservationCode,
    channel_type: channelType,
    check_in_date: checkIn,
    check_out_date: checkOut,
    last_message_at: lastMsgAt,
    unread: true,
  });

  if (msgs.length === 0) return { conversation: conv, newGuestMessage: false };

  const db = getDb();
  const existingIds = new Set(
    (db
      .prepare(
        "select hostex_msg_id from messages where conversation_id = ? and hostex_msg_id is not null",
      )
      .all(conv.id) as { hostex_msg_id: string }[]
    ).map((r) => r.hostex_msg_id),
  );

  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  let newGuestMessage = false;
  for (const m of msgs) {
    const n = normalizeMessage(m);
    // Skip rows that have neither text nor an attachment.
    if (!n.content && !n.attachment_url) continue;
    if (n.hostex_msg_id && existingIds.has(n.hostex_msg_id)) continue;

    if (n.sender === "host" && n.hostex_msg_id) {
      const reconciled = db
        .prepare(
          `update messages set hostex_msg_id = ?
           where id = (
             select id from messages
             where conversation_id = ?
               and sender = 'host'
               and hostex_msg_id is null
               and content = ?
               and created_at >= ?
             order by created_at desc
             limit 1
           )`,
        )
        .run(n.hostex_msg_id, conv.id, n.content, fiveMinAgo);
      if (reconciled.changes > 0) continue;
    }

    await insertMessage({
      conversation_id: conv.id,
      hostex_msg_id: n.hostex_msg_id,
      sender: n.sender,
      content: n.content,
      attachment_url: n.attachment_url,
      attachment_type: n.attachment_type,
      sent_via: "hostex",
      created_at: n.created_at,
    });
    if (n.sender === "guest") newGuestMessage = true;
  }

  return { conversation: conv, newGuestMessage };
}
