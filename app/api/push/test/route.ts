import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { pushToUser } from "@/lib/push";

export const runtime = "nodejs";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await pushToUser(user.id, {
    title: "Hostex 自动回复",
    body: "这是一条测试推送。看到这条消息说明设置成功了。",
    tag: "test",
    url: "/",
  });
  return NextResponse.json({ ok: true, ...result });
}
