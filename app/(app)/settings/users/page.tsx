import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listUsers } from "@/lib/db/users";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!me.is_admin) redirect("/settings");
  const users = listUsers();
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">用户管理</h1>
          <Link href="/settings" className="text-xs text-blue-600 hover:underline ml-auto">
            ← 返回设置
          </Link>
        </div>
        <p className="text-xs text-neutral-500">
          创建额外的用户共享这个工作台。每个用户可独立设置「消息后缀」，发送消息时会自动以新行追加在内容末尾（例如签名 / 工号）。
        </p>
        <UsersAdmin initial={users} meId={me.id} />
      </div>
    </div>
  );
}
