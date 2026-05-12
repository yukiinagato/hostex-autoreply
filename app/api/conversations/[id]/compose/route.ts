import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getConversation } from "@/lib/db/queries";
import { generateDraftFor } from "@/lib/draft-engine";

export const runtime = "nodejs";

const Body = z.object({
  prompt: z.string().min(1).max(2000),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const draft = await generateDraftFor(conv.id, { composePrompt: parsed.data.prompt });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
