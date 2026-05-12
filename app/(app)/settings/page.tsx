import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/db/queries";
import SettingsForm from "@/components/SettingsForm";
import ExportCard from "@/components/ExportCard";
import MyProfileCard from "@/components/MyProfileCard";
import PushSubscribeCard from "@/components/PushSubscribeCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await currentUser();
  if (!me) redirect("/login");
  const settings = await getSettings();
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold">设置</h1>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <Link href="/settings/properties" className="text-blue-600 hover:underline">
              房源备注 →
            </Link>
            {me.is_admin && (
              <Link href="/settings/users" className="text-blue-600 hover:underline">
                用户管理 →
              </Link>
            )}
          </div>
        </div>
        <MyProfileCard initial={me} />
        <PushSubscribeCard />
        <SettingsForm initial={settings} />
        <ExportCard />
      </div>
    </div>
  );
}
