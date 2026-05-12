import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getConversation, getDraft, insertMessage, updateDraft } from "@/lib/db/queries";
import { sendMessage } from "@/lib/hostex/conversations";

export const runtime = "nodejs";

const Body = z.object({
  text: z.string().min(1).max(4000),
  source: z.enum(["primary", "alternative", "edited", "auto"]).default("edited"),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const draft = await getDraft(id);
  if (!draft) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  if (draft.status !== "pending") {
    return NextResponse.json({ error: "draft not pending", status: draft.status }, { status: 409 });
  }
  const conv = await getConversation(draft.conversation_id);
  if (!conv) return NextResponse.json({ error: "conversation gone" }, { status: 404 });

  // 1. Send to Hostex
  const hostexResp = await sendMessage(conv.hostex_id, { text: parsed.data.text });
  console.log("[send] hostex response:", JSON.stringify(hostexResp).slice(0, 300));

  // 2. Persist sent message + mark draft sent (do both even if Hostex echoes via webhook;
  //    `hostex_msg_id` upsert keeps things idempotent.)
  await insertMessage({
    conversation_id: conv.id,
    sender: "host",
    content: parsed.data.text,
    sent_via: parsed.data.source === "auto" ? "ai-auto" : "ai-manual",
  });
  const updated = await updateDraft(draft.id, { status: "sent", auto_send_at: null });

  return NextResponse.json({ ok: true, draft: updated });
}
