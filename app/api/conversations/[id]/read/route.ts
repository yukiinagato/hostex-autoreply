import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getConversation, markConversationRead } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  await markConversationRead(id);
  return NextResponse.json({ ok: true });
}
