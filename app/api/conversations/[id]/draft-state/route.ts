import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getConversation, getConversationDraft, patchConversationDraft } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  const state = await getConversationDraft(id);
  return NextResponse.json({ state });
}

const Patch = z.object({
  compose_prompt: z.string().max(4000).optional(),
  preset_label: z.string().max(80).optional(),
  preset_input: z.string().max(2000).optional(),
  edit_draft_id: z.string().max(64).nullable().optional(),
  edit_text: z.string().max(8000).optional(),
  edit_choice: z.enum(["primary", "alternative"]).optional(),
  regen_guidance: z.string().max(2000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const state = await patchConversationDraft(id, parsed.data);
  return NextResponse.json({ state });
}
