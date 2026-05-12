import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/hostex/webhook-signature";
import { syncConversationFromHostex } from "@/lib/hostex/sync";
import { generateDraftFor } from "@/lib/draft-engine";

export const runtime = "nodejs";

/**
 * Hostex webhook receiver.
 *
 * Payload is a thin notification: { event, conversation_id, message_id, timestamp }.
 * We must ack within 3s, so the actual work runs in the background.
 */
export async function POST(req: Request) {
  const v = verifyWebhook({ headers: req.headers });
  if (!v.ok) {
    console.warn("[webhook] rejected:", v.reason);
    return NextResponse.json({ error: v.reason }, { status: 401 });
  }
  if (v.learned) console.log("[webhook] learned secret token from first request");

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  void handleEvent(payload).catch((err) => console.error("[webhook] processing failed", err));
  return NextResponse.json({ ok: true });
}

type WebhookPayload = {
  event?: string;
  conversation_id?: string | number;
  message_id?: string | number;
  reservation_id?: string | number;
  timestamp?: string;
};

async function handleEvent(payload: WebhookPayload) {
  const eventType = payload.event ?? "";
  console.log("[webhook] event:", eventType, "conv:", payload.conversation_id, "msg:", payload.message_id);
  if (eventType !== "message_created") return;

  if (payload.conversation_id == null) {
    console.warn("[webhook] missing conversation_id");
    return;
  }

  const result = await syncConversationFromHostex(payload.conversation_id);
  if (!result) {
    console.warn("[webhook] sync returned null (404 or empty?)");
    return;
  }
  if (result.newGuestMessage) {
    try { await generateDraftFor(result.conversation.id); }
    catch (err) { console.error("[webhook] draft generation failed", err); }
  } else {
    console.log("[webhook] no new guest message → no draft");
  }
}
