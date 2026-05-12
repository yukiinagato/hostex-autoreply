import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { deleteUser, getUserById, updateUser } from "@/lib/db/users";

export const runtime = "nodejs";

const PatchBody = z.object({
  username: z.string().min(1).max(64).regex(/^[\w.-]+$/).optional(),
  password: z.string().min(6).max(200).optional(),
  message_suffix: z.string().max(2000).optional(),
  is_admin: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const target = getUserById(id);
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const isSelf = me.id === id;
  if (!me.is_admin && !isSelf) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Non-admins editing themselves: only allow message_suffix and password.
  if (!me.is_admin) {
    if (parsed.data.username !== undefined || parsed.data.is_admin !== undefined) {
      return NextResponse.json({ error: "forbidden field" }, { status: 403 });
    }
  } else {
    // An admin must not demote themselves if they're the last admin.
    if (isSelf && parsed.data.is_admin === false) {
      // Quick check is handled in updateUser path indirectly; we surface a 400 here.
      return NextResponse.json({ error: "不能取消自己的管理员身份" }, { status: 400 });
    }
  }

  const updated = updateUser(id, parsed.data);
  return NextResponse.json({ user: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (id === me.id) {
    return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
  }
  try {
    deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
