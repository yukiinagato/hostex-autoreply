import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getConversation, getDraft, insertMessage, updateDraft } from "@/lib/db/queries";
import { sendMessage } from "@/lib/hostex/conversations";

export const runtime = "nodejs";

const Body = z.object({
  text: z.string().min(1).max(4000),
  source: z.enum(["primary", "alternative", "edited", "auto"]).default("edited"),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  // Append the host's personal suffix (set in /settings/users → my profile)
  // on a new line if it's non-empty. Auto-sent messages go through the cron
  // path and don't carry a user identity, so they skip this.
  const suffix = user.message_suffix.trim();
  const text = suffix ? `${parsed.data.text.trimEnd()}\n${suffix}` : parsed.data.text;

  const hostexResp = await sendMessage(conv.hostex_id, { text });
  console.log("[send] hostex response:", JSON.stringify(hostexResp).slice(0, 300));

  await insertMessage({
    conversation_id: conv.id,
    sender: "host",
    content: text,
    sent_via: parsed.data.source === "auto" ? "ai-auto" : "ai-manual",
  });
  const updated = await updateDraft(draft.id, { status: "sent", auto_send_at: null });

  return NextResponse.json({ ok: true, draft: updated });
}
