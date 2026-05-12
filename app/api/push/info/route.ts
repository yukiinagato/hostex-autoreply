import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getVapidPublicKey, listSubscriptionsForUser } from "@/lib/push";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const publicKey = getVapidPublicKey();
  const subs = publicKey ? listSubscriptionsForUser(user.id) : [];
  return NextResponse.json({
    vapidPublicKey: publicKey,
    configured: !!publicKey,
    subscriptionCount: subs.length,
  });
}
