import { logout } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await logout();
  return new Response(null, { status: 303, headers: { Location: "/login" } });
}
