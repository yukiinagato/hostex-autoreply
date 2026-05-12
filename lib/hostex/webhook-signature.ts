import crypto from "node:crypto";
import { getDb } from "@/lib/db/client";

/**
 * Hostex webhook authentication — "learn on first request" model.
 *
 * Per docs:
 *   "When your service receives a webhook request, it will include a
 *    Hostex-Webhook-Secret-Token in the request headers. This token is unique
 *    to each webhook URL and will remain constant. It is imperative to record
 *    this token and verify its consistency with each incoming request."
 *
 * So Hostex generates the token; the dashboard does not display it. Our flow:
 *   1. First request: persist the header value into settings.hostex_webhook_secret.
 *   2. Subsequent requests: timing-safe compare against the persisted value.
 *
 * To re-bind to a new token (e.g. you re-created the webhook in the dashboard),
 * clear the field via /api/settings or directly: `update settings set hostex_webhook_secret = null`.
 */
export function verifyWebhook(req: { headers: Headers }):
  | { ok: true; learned?: boolean }
  | { ok: false; reason: string } {
  const provided = req.headers.get("hostex-webhook-secret-token") ?? "";
  if (!provided) return { ok: false, reason: "missing token header" };

  const db = getDb();
  const row = db.prepare("select hostex_webhook_secret from settings where id = 1").get() as
    | { hostex_webhook_secret: string | null }
    | undefined;
  const stored = row?.hostex_webhook_secret ?? null;

  if (!stored) {
    // First time — record it.
    db.prepare("update settings set hostex_webhook_secret = ?, updated_at = ? where id = 1").run(
      provided,
      new Date().toISOString(),
    );
    return { ok: true, learned: true };
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return { ok: false, reason: "token mismatch" };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: "token mismatch" };
  return { ok: true };
}
