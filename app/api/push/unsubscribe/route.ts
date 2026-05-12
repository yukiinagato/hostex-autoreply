import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { deleteSubscription } from "@/lib/push";

export const runtime = "nodejs";

const Body = z.object({ endpoint: z.string().url() });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  deleteSubscription(parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
