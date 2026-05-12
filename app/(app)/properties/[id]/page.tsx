import Link from "next/link";
import { notFound } from "next/navigation";
import { getPropertyByHostexId } from "@/lib/db/queries";
import { listCachedReservationsForProperty } from "@/lib/db/reservations-cache";
import { getDb } from "@/lib/db/client";
import { CalendarSection } from "@/components/Calendar";

export const dynamic = "force-dynamic";

const INTERESTING_KEYS: Array<{ key: string; label: string }> = [
  { key: "address", label: "地址" },
  { key: "city", label: "城市" },
  { key: "country", label: "国家" },
  { key: "check_in_time", label: "入住时间" },
  { key: "check_out_time", label: "退房时间" },
  { key: "max_guests", label: "最多入住" },
  { key: "bedrooms", label: "卧室数" },
  { key: "bathrooms", label: "浴室数" },
  { key: "wifi_name", label: "Wi-Fi 名称" },
  { key: "wifi_password", label: "Wi-Fi 密码" },
];

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: hostexId } = await params;
  const property = await getPropertyByHostexId(hostexId);
  if (!property) notFound();

  const reservations = listCachedReservationsForProperty(hostexId, 50);

  // Find conversations linked to this property for cross-navigation.
  const conversations = getDb()
    .prepare(
      `select id, hostex_id, guest_name, last_message_at
       from conversations
       where property_hostex_id = ?
       order by last_message_at desc nulls last
       limit 20`,
    )
    .all(hostexId) as Array<{
      id: string;
      hostex_id: string;
      guest_name: string | null;
      last_message_at: string | null;
    }>;

  const details = property.details_json as Record<string, unknown>;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <header>
          <h1 className="text-lg font-semibold break-words">{property.name ?? hostexId}</h1>
          <p className="text-xs text-neutral-500 break-all">编号 {hostexId}</p>
        </header>

        <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 text-sm font-medium">基本资料</header>
          <div className="p-3">
            <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-xs">
              {INTERESTING_KEYS.map(({ key, label }) => {
                const v = details[key];
                if (v == null || v === "") return null;
                return (
                  <div key={key} className="contents">
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="break-words">{typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v)}</dd>
                  </div>
                );
              })}
            </dl>
            {property.custom_context && (
              <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">房源备注</div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">{property.custom_context}</pre>
              </div>
            )}
          </div>
        </section>

        <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
          <CalendarSection propertyId={hostexId} anchorDate={today} />
        </section>

        <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 text-sm font-medium flex items-baseline gap-2">
            <span>近期订单</span>
            <span className="text-xs text-neutral-500">{reservations.length}</span>
          </header>
          {reservations.length === 0 ? (
            <p className="p-3 text-xs text-neutral-500">暂无缓存订单。后台会定期同步最近 30 天 ~ 未来 90 天的预订。</p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {reservations.map((r) => (
                <li
                  key={r.reservation_code}
                  id={r.reservation_code}
                  className="px-3 py-2 text-xs flex flex-wrap items-baseline gap-x-3 gap-y-1"
                >
                  <span className="font-medium">{r.guest_name ?? r.reservation_code}</span>
                  <span className="text-neutral-500">{r.check_in_date} → {r.check_out_date}</span>
                  {r.channel_type && (
                    <span className="px-1 py-px rounded bg-neutral-100 dark:bg-neutral-800 text-[10px]">
                      {r.channel_type}
                    </span>
                  )}
                  {r.stay_status && <span className="text-neutral-500">{r.stay_status}</span>}
                  {r.guest_phone && <span className="text-neutral-500">📞 {r.guest_phone}</span>}
                  <span className="ml-auto text-[10px] text-neutral-400">#{r.reservation_code}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {conversations.length > 0 && (
          <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 text-sm font-medium flex items-baseline gap-2">
              <span>相关对话</span>
              <span className="text-xs text-neutral-500">{conversations.length}</span>
            </header>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/conversations/${c.id}`}
                    className="block px-3 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50 flex items-baseline gap-3"
                  >
                    <span className="font-medium truncate">{c.guest_name ?? c.hostex_id}</span>
                    <span className="ml-auto text-[10px] text-neutral-500">
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleString("zh-CN") : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
