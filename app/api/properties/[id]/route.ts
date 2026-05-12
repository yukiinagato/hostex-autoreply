import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getPropertyByHostexId, updatePropertyCustomContext } from "@/lib/db/queries";

export const runtime = "nodejs";

const Patch = z.object({
  custom_context: z.string().max(8000).nullable(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: hostexId } = await ctx.params;
  const existing = await getPropertyByHostexId(hostexId);
  if (!existing) return NextResponse.json({ error: "property not found" }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const value = parsed.data.custom_context?.trim() ? parsed.data.custom_context : null;
  const updated = await updatePropertyCustomContext(hostexId, value);
  return NextResponse.json({ property: updated });
}
