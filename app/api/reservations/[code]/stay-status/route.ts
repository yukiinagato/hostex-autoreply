import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { updateStayStatus } from "@/lib/hostex/stay-status";

export const runtime = "nodejs";

const Body = z.object({
  stay_status: z.enum(["checkin_pending", "in_house", "stay_completed"]),
});

export async function PUT(req: Request, ctx: { params: Promise<{ code: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { code } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await updateStayStatus(code, parsed.data.stay_status);
    return NextResponse.json({ ok: true, stay_status: parsed.data.stay_status });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    const body = (err as { body?: unknown })?.body ?? String(err);
    return NextResponse.json({ error: body }, { status });
  }
}
