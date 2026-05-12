import Link from "next/link";
import { listAllProperties } from "@/lib/db/queries";
import PropertyContextEditor from "@/components/PropertyContextEditor";

export const dynamic = "force-dynamic";

export default async function PropertiesSettingsPage() {
  const properties = await listAllProperties();
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-lg font-semibold">房源备注</h1>
          <Link href="/settings" className="text-xs text-blue-600 hover:underline ml-auto">
            ← 返回设置
          </Link>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          为每个房源单独添加备注（停车场详情、门禁说明、特殊设施…）。当对话匹配到该房源时，备注会作为权威信息加入到 AI
          的房源上下文中，与从 Hostex 同步的字段同时使用。
        </p>

        {properties.length === 0 ? (
          <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 text-sm text-neutral-500">
            尚未同步任何房源。请先运行：
            <pre className="mt-2 text-xs bg-neutral-50 dark:bg-neutral-950 rounded p-2 border border-neutral-200 dark:border-neutral-800">pnpm sync-properties</pre>
          </div>
        ) : (
          <div className="space-y-3">
            {properties.map((p) => (
              <PropertyContextEditor key={p.hostex_id} property={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
