import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, requireAdmin } from "@/lib/auth";
import { createUser, getUserByUsername, listUsers } from "@/lib/db/users";

export const runtime = "nodejs";

export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Non-admins see only themselves so they can read their own suffix.
  const users = me.is_admin ? listUsers() : listUsers().filter((u) => u.id === me.id);
  return NextResponse.json({ users, me });
}

const CreateBody = z.object({
  username: z.string().min(1).max(64).regex(/^[\w.-]+$/, "用户名只能包含字母、数字、下划线、点和连字符"),
  password: z.string().min(6).max(200),
  message_suffix: z.string().max(2000).optional(),
  is_admin: z.boolean().optional(),
});

export async function POST(req: Request) {
  try { await requireAdmin(); } catch (r) { return r as Response; }
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (getUserByUsername(parsed.data.username)) {
    return NextResponse.json({ error: "username taken" }, { status: 409 });
  }
  const u = createUser(parsed.data);
  return NextResponse.json({ user: u });
}
