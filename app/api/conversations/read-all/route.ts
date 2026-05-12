import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { markAllConversationsRead } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function POST() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const updated = await markAllConversationsRead();
  return NextResponse.json({ ok: true, updated });
}
