import Link from "next/link";
import { getSettings } from "@/lib/db/queries";
import SettingsForm from "@/components/SettingsForm";
import ExportCard from "@/components/ExportCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">设置</h1>
          <Link href="/settings/properties" className="text-xs text-blue-600 hover:underline ml-auto">
            房源备注 →
          </Link>
        </div>
        <SettingsForm initial={settings} />
        <ExportCard />
      </div>
    </div>
  );
}
