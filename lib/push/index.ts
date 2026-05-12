import webpush from "web-push";
import { getDb } from "@/lib/db/client";

export type PushSubscription = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
};

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function configured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subj = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subj, pub, priv);
  return true;
}

export function saveSubscription(input: {
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
}): PushSubscription {
  const db = getDb();
  db.prepare(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values (?, ?, ?, ?, ?)
     on conflict(endpoint) do update set
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent`,
  ).run(input.user_id, input.endpoint, input.p256dh, input.auth, input.user_agent ?? null);
  return db
    .prepare("select * from push_subscriptions where endpoint = ?")
    .get(input.endpoint) as PushSubscription;
}

export function deleteSubscription(endpoint: string): void {
  getDb().prepare("delete from push_subscriptions where endpoint = ?").run(endpoint);
}

export function listSubscriptionsForUser(userId: number): PushSubscription[] {
  return getDb()
    .prepare("select * from push_subscriptions where user_id = ?")
    .all(userId) as PushSubscription[];
}

export function listAllSubscriptions(): PushSubscription[] {
  return getDb().prepare("select * from push_subscriptions").all() as PushSubscription[];
}

export type PushPayload = {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
  /** Optional small image URL shown alongside the notification. */
  icon?: string;
};

/**
 * Broadcast a push to every saved subscription. Subscriptions that come back
 * 404/410 (gone) are pruned automatically. Failures elsewhere are logged but
 * don't throw so a single dead phone doesn't kill the batch.
 */
export async function broadcastPush(payload: PushPayload): Promise<{ sent: number; pruned: number; failed: number }> {
  if (!configured()) return { sent: 0, pruned: 0, failed: 0 };
  return sendToList(listAllSubscriptions(), payload);
}

export async function pushToUser(userId: number, payload: PushPayload) {
  if (!configured()) return { sent: 0, pruned: 0, failed: 0 };
  return sendToList(listSubscriptionsForUser(userId), payload);
}

async function sendToList(subs: PushSubscription[], payload: PushPayload) {
  let sent = 0, pruned = 0, failed = 0;
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          // Gone — subscription expired or user removed
          deleteSubscription(s.endpoint);
          pruned++;
        } else {
          console.error("[push] failed", s.endpoint, status, err);
          failed++;
        }
      }
    }),
  );
  return { sent, pruned, failed };
}
