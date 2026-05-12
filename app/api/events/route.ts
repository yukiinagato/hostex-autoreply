import { events } from "@/lib/events";
import type { ConversationDraft, Draft, Message } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE stream.
 *   GET /api/events                          -> { type: "conversations" } pings
 *   GET /api/events?conversationId=<id>      -> message + draft events for that conversation
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };

      send("hello", { ok: true });
      const heartbeat = setInterval(() => {
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch { /* closed */ }
      }, 25_000);

      const onMessage = (m: Message) => send("message", m);
      const onDraft = (d: Draft) => send("draft", d);
      const onConvDraft = (s: ConversationDraft) => send("convdraft", s);
      const onConversations = () => send("conversations", { at: new Date().toISOString() });

      if (conversationId) {
        events.onTyped(`message:${conversationId}`, onMessage);
        events.onTyped(`draft:${conversationId}`, onDraft);
        events.onTyped(`convdraft:${conversationId}`, onConvDraft);
      }
      events.onTyped("conversations", onConversations);

      const close = () => {
        clearInterval(heartbeat);
        if (conversationId) {
          events.offTyped(`message:${conversationId}`, onMessage);
          events.offTyped(`draft:${conversationId}`, onDraft);
          events.offTyped(`convdraft:${conversationId}`, onConvDraft);
        }
        events.offTyped("conversations", onConversations);
        try { controller.close(); } catch { /* already */ }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
