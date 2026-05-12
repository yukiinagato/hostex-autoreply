import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { listConversations } from "@/lib/db/queries";
import { kickStaleConversationSync } from "@/lib/hostex/background-sync";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conversations = await listConversations();
  // Fire-and-forget: backfill missing metadata for any stale conversations.
  // Each completed sync emits a "conversations" SSE event so the client auto-
  // refreshes once data is in.
  kickStaleConversationSync();
  return NextResponse.json({ conversations });
}
