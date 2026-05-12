import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getDraft, updateDraft } from "@/lib/db/queries";

export const runtime = "nodejs";

const Patch = z.object({
  primary_text: z.string().max(4000).optional(),
  alternative_text: z.string().max(4000).optional(),
  cancel_countdown: z.boolean().optional(),
  dismiss: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const draft = await getDraft(id);
  if (!draft) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  if (draft.status !== "pending") {
    return NextResponse.json({ error: "draft not pending" }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.primary_text !== undefined) patch.primary_text = parsed.data.primary_text;
  if (parsed.data.alternative_text !== undefined) patch.alternative_text = parsed.data.alternative_text;
  if (parsed.data.cancel_countdown) patch.auto_send_at = null;
  if (parsed.data.dismiss) {
    patch.status = "dismissed";
    patch.auto_send_at = null;
  }

  const updated = await updateDraft(id, patch);
  return NextResponse.json({ draft: updated });
}
