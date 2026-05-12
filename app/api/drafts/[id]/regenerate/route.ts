import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getDraft } from "@/lib/db/queries";
import { generateDraftFor } from "@/lib/draft-engine";

export const runtime = "nodejs";

const Body = z.object({
  guidance: z.string().max(1000).optional(),
  selected_choice: z.enum(["primary", "alternative"]).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const draft = await getDraft(id);
  if (!draft) return NextResponse.json({ error: "draft not found" }, { status: 404 });

  // Carry over the original compose intent (if any) and the candidate the host
  // was looking at, so the LLM can revise that specific baseline rather than
  // starting from scratch and possibly drifting off-topic.
  const choice = parsed.data.selected_choice ?? "primary";
  const prevText = choice === "alternative" ? draft.alternative_text : draft.primary_text;
  const prevStance = choice === "alternative" ? draft.alternative_stance : draft.primary_stance;

  const fresh = await generateDraftFor(draft.conversation_id, {
    guidance: parsed.data.guidance,
    composePrompt: draft.compose_prompt ?? undefined,
    previousDraft: { text: prevText, stance: prevStance },
  });
  return NextResponse.json({ draft: fresh });
}
