"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Conversation, Property } from "@/lib/db/types";
import type { HostexReservation } from "@/lib/hostex/reservations";
import { STAY_STATUS_OPTIONS, type StayStatus } from "@/lib/hostex/stay-status";
import { CalendarSection } from "./Calendar";

type Props = {
  conversation: Conversation;
  property: Property | null;
  reservation: HostexReservation | null;
  systemContextPreview: string;
};

const INTERESTING_PROPERTY_KEYS: Array<{ key: string; label: string }> = [
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
  { key: "self_check_in", label: "自助入住" },
  { key: "cancellation_policy", label: "取消政策" },
];

// ----- Hostex shapes (typed minimally; unknown fields fall through) -----

type Money = { currency?: string; amount?: number };
type CheckInDetails = {
  arrival_at?: { hour?: number; minute?: number } | null;
  departure_at?: { hour?: number; minute?: number } | null;
  lock_code?: string | null;
  lock_code_visible_after?: string | null;
  deposit?: number | null;
  check_in_guide_url?: string | null;
};
type Guest = {
  id?: number | string;
  name?: string;
  phone?: string;
  email?: string;
  country?: string;
  gender?: string | null;
  id_type?: string | null;
  id_number?: string | null;
  is_booker?: boolean;
};

export default function InfoPanel({ conversation, property, reservation, systemContextPreview }: Props) {
  const r = reservation as (HostexReservation & {
    stay_code?: string;
    stay_status?: string;
    custom_channel?: { id?: number; name?: string };
    check_in_details?: CheckInDetails;
    guests?: Guest[];
    additional_fees?: Array<{ name?: string; currency?: string; amount?: number }>;
    number_of_adults?: number;
    number_of_children?: number;
    number_of_infants?: number;
    number_of_pets?: number;
    rates?: {
      total_rate?: Money;
      total_commission?: Money;
      rate?: Money;
      commission?: Money;
      details?: Array<{ type?: string; description?: string; currency?: string; amount?: number }>;
    };
    remarks?: string | null;
    channel_remarks?: string | null;
  }) | null;

  const inquiryFallback: Array<{ label: string; value: string }> = [];
  if (!r) {
    if (conversation.channel_type) inquiryFallback.push({ label: "渠道", value: conversation.channel_type });
    if (conversation.check_in_date) inquiryFallback.push({ label: "入住", value: conversation.check_in_date });
    if (conversation.check_out_date) inquiryFallback.push({ label: "退房", value: conversation.check_out_date });
  }

  return (
    <div className="space-y-4">
      <Card title={property?.name ?? "房源"} subtitle={property ? `编号：${property.hostex_id}` : "未关联房源"}>
        {property ? (
          <KvList rows={extractKv(property.details_json, INTERESTING_PROPERTY_KEYS)} />
        ) : (
          <Empty>
            尚未缓存房源资料，请先运行 <code>pnpm sync-properties</code> 同步。
          </Empty>
        )}
      </Card>

      <Card
        title={r ? "订单" : "咨询"}
        subtitle={
          r
            ? `订单号：${r.reservation_code ?? r.id}`
            : conversation.reservation_hostex_id
            ? `订单号：${conversation.reservation_hostex_id}（拉取失败）`
            : "尚未下单"
        }
      >
        {r ? (
          <div className="space-y-3">
            <KvList rows={buildBookingRows(r)} />

            {(r.reservation_code || r.stay_code) && (
              <Section title="">
                <StayStatusSelector
                  stayCode={String(r.stay_code ?? r.reservation_code)}
                  current={r.stay_status}
                />
              </Section>
            )}

            {r.check_in_details && hasAnyCheckInValue(r.check_in_details) && (
              <Section title="入住信息">
                <KvList rows={buildCheckInRows(r.check_in_details)} />
                {r.check_in_details.check_in_guide_url && (
                  <div className="mt-2">
                    <CopyLink url={r.check_in_details.check_in_guide_url} label="登记链接" />
                  </div>
                )}
              </Section>
            )}

            {Array.isArray(r.guests) && r.guests.length > 0 && (
              <Section title={`客人 (${r.guests.length})`}>
                <GuestList guests={r.guests} />
              </Section>
            )}

            {(r.rates?.total_rate || (r.additional_fees?.length ?? 0) > 0) && (
              <Section title="价格明细">
                <RateBreakdown
                  total={r.rates?.total_rate}
                  commission={r.rates?.total_commission ?? r.rates?.commission}
                  details={r.rates?.details}
                  additionalFees={r.additional_fees}
                />
              </Section>
            )}

            {(r.channel_remarks?.trim() || r.remarks?.trim()) && (
              <Disclosure label="平台备注 / 房东备注">
                {r.remarks?.trim() && (
                  <RemarkBlock title="房东备注" text={r.remarks} />
                )}
                {r.channel_remarks?.trim() && (
                  <RemarkBlock title="平台备注" text={r.channel_remarks} />
                )}
              </Disclosure>
            )}

            <Disclosure label="原始 JSON（供调试）">
              <pre className="text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-neutral-600 dark:text-neutral-400 max-h-72 overflow-y-auto bg-neutral-50 dark:bg-neutral-950 rounded p-2 border border-neutral-200 dark:border-neutral-800">
                {JSON.stringify(r, null, 2)}
              </pre>
            </Disclosure>
          </div>
        ) : inquiryFallback.length > 0 ? (
          <KvList rows={inquiryFallback} />
        ) : (
          <Empty>该对话暂无订单或咨询信息。</Empty>
        )}
      </Card>

      {(conversation.property_hostex_id ?? r?.property_id) && (
        <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
          <CalendarSection
            propertyId={String(conversation.property_hostex_id ?? r?.property_id)}
            anchorDate={
              r?.check_in_date ??
              conversation.check_in_date ??
              new Date().toISOString().slice(0, 10)
            }
            currentReservationCode={r?.reservation_code ?? null}
          />
        </section>
      )}

      <Card title="AI 上下文" subtitle="即 AI 实际看到的房源 / 订单数据">
        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-neutral-600 dark:text-neutral-300 max-h-72 overflow-y-auto">
          {systemContextPreview}
        </pre>
      </Card>
    </div>
  );
}

// ----- Row builders -----

function buildBookingRows(r: NonNullable<ReturnType<typeof asReservation>>): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const channel = r.custom_channel?.name ?? r.channel_type;
  if (channel) rows.push({ label: "渠道", value: channel });
  if (r.status) rows.push({ label: "预订状态", value: r.status });
  if (r.check_in_date) rows.push({ label: "入住", value: r.check_in_date });
  if (r.check_out_date) rows.push({ label: "退房", value: r.check_out_date });
  const ppl = formatPeople(r);
  if (ppl) rows.push({ label: "人数", value: ppl });
  if (r.booked_at) rows.push({ label: "预订时间", value: formatDateTime(r.booked_at) });
  if (r.guest_name) rows.push({ label: "预订人", value: r.guest_name });
  return rows;
}

function StayStatusSelector({
  stayCode,
  current,
}: {
  stayCode: string;
  current: string | null | undefined;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<string>(current ?? "");
  const [error, setError] = useState<string | null>(null);

  // Whether `current` is one of the three editable states.
  const isKnown = STAY_STATUS_OPTIONS.some((o) => o.value === value);

  async function update(next: StayStatus) {
    if (next === value || busy) return;
    setBusy(true); setError(null);
    const prev = value;
    setValue(next); // optimistic
    try {
      const r = await fetch(`/api/reservations/${encodeURIComponent(stayCode)}/stay-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stay_status: next }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(txt.slice(0, 200) || `HTTP ${r.status}`);
      }
      // Refresh the server component so InfoPanel re-reads via context-loader
      // and the AI-context preview reflects the new status too.
      router.refresh();
    } catch (e) {
      setError(String(e));
      setValue(prev); // rollback
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">入住状态</div>
      <div className="flex gap-1 flex-wrap">
        {STAY_STATUS_OPTIONS.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              onClick={() => update(o.value)}
              className={`text-xs px-2 py-1 rounded border transition ${
                active
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              } disabled:opacity-50`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {!isKnown && value && (
        <div className="text-[11px] text-amber-600">当前状态：{translateStayStatus(value)}（不在可改列表）</div>
      )}
      {busy && <div className="text-[11px] text-neutral-500">更新中…</div>}
      {error && <div className="text-[11px] text-red-600 break-all">{error}</div>}
    </div>
  );
}

function buildCheckInRows(c: CheckInDetails): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (c.arrival_at && (c.arrival_at.hour != null)) {
    rows.push({ label: "预计到达", value: formatHHMM(c.arrival_at) });
  }
  if (c.departure_at && (c.departure_at.hour != null)) {
    rows.push({ label: "预计离开", value: formatHHMM(c.departure_at) });
  }
  if (c.lock_code) rows.push({ label: "门锁密码", value: c.lock_code });
  if (c.lock_code_visible_after) rows.push({ label: "密码可见", value: `${c.lock_code_visible_after} 起` });
  if (c.deposit != null) rows.push({ label: "押金", value: String(c.deposit) });
  return rows;
}

function GuestList({ guests }: { guests: Guest[] }) {
  return (
    <ul className="space-y-2">
      {guests.map((g, i) => (
        <li key={g.id ?? i} className="text-xs space-y-0.5">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="font-medium">{g.name ?? `客人 ${i + 1}`}</span>
            {g.country && (
              <span className="text-[10px] px-1 py-px rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                {g.country}
              </span>
            )}
            {g.is_booker && (
              <span className="text-[10px] px-1 py-px rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                预订人
              </span>
            )}
          </div>
          {g.phone && <div className="text-neutral-500">📞 {g.phone}</div>}
          {g.email && <div className="text-neutral-500 truncate" title={g.email}>✉ {g.email}</div>}
          {(g.id_type || g.id_number) && (
            <div className="text-neutral-500">
              证件：{g.id_type ?? "?"} {g.id_number ?? ""}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function RateBreakdown({
  total, commission, details, additionalFees,
}: {
  total?: Money;
  commission?: Money;
  details?: Array<{ type?: string; description?: string; currency?: string; amount?: number }>;
  additionalFees?: Array<{ name?: string; currency?: string; amount?: number }>;
}) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs">
      {total && (
        <>
          <dt className="text-neutral-500">总价</dt>
          <dd className="font-medium">{formatMoney(total)}</dd>
        </>
      )}
      {commission && (
        <>
          <dt className="text-neutral-500">平台佣金</dt>
          <dd className="text-neutral-700 dark:text-neutral-300">{formatMoney(commission)}</dd>
        </>
      )}
      {details?.map((d, i) => (
        <div key={i} className="contents">
          <dt className="text-neutral-500 truncate" title={d.description}>{d.description ?? d.type}</dt>
          <dd>{formatMoney({ currency: d.currency, amount: d.amount })}</dd>
        </div>
      ))}
      {additionalFees?.map((f, i) => (
        <div key={`af${i}`} className="contents">
          <dt className="text-neutral-500 truncate">{f.name ?? "附加费"}</dt>
          <dd>{formatMoney({ currency: f.currency, amount: f.amount })}</dd>
        </div>
      ))}
    </dl>
  );
}

function RemarkBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-xs">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">{title}</div>
      <pre className="whitespace-pre-wrap font-sans text-neutral-700 dark:text-neutral-300 leading-relaxed">{text}</pre>
    </div>
  );
}

// ----- Generic UI -----

function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* ignore */ }
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline truncate min-w-0 flex-1"
          title={url}
        >
          {url}
        </a>
        <button
          type="button"
          onClick={copy}
          className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-2">
      {title && <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">{title}</div>}
      {children}
    </div>
  );
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs text-neutral-500 hover:underline"
      >
        <span>{label}</span>
        <span>{open ? "收起 ▲" : "展开 ▼"}</span>
      </button>
      {open && <div className="mt-2 space-y-3">{children}</div>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="border rounded border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <header className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="text-sm font-medium">{title}</div>
        {subtitle && <div className="text-[11px] text-neutral-500 break-all">{subtitle}</div>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-500">{children}</p>;
}

function KvList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) return <Empty>暂无可用字段。</Empty>;
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-neutral-500">{r.label}</dt>
          <dd className="text-neutral-800 dark:text-neutral-200 break-words" title={r.value}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function extractKv(
  src: Record<string, unknown>,
  spec: Array<{ key: string | number | symbol; label: string }>,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const { key, label } of spec) {
    const v = src[key as string];
    if (v == null || v === "") continue;
    rows.push({ label, value: typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v) });
  }
  return rows;
}

// ----- Helpers -----

function asReservation(r: HostexReservation): HostexReservation & {
  stay_status?: string;
  custom_channel?: { name?: string };
  number_of_adults?: number;
  number_of_children?: number;
  number_of_infants?: number;
  number_of_pets?: number;
  guest_name?: string;
} { return r as never; }

function hasAnyCheckInValue(c: CheckInDetails): boolean {
  return !!(c.arrival_at?.hour != null || c.departure_at?.hour != null || c.lock_code || c.check_in_guide_url || c.deposit != null);
}

function formatHHMM(t: { hour?: number; minute?: number }): string {
  const h = String(t.hour ?? 0).padStart(2, "0");
  const m = String(t.minute ?? 0).padStart(2, "0");
  return `${h}:${m}`;
}

function formatPeople(r: ReturnType<typeof asReservation>): string {
  const parts: string[] = [];
  if (r.number_of_adults != null) parts.push(`${r.number_of_adults} 成人`);
  if (r.number_of_children) parts.push(`${r.number_of_children} 儿童`);
  if (r.number_of_infants) parts.push(`${r.number_of_infants} 婴儿`);
  if (r.number_of_pets) parts.push(`${r.number_of_pets} 宠物`);
  if (parts.length === 0 && r.number_of_guests != null) return `${r.number_of_guests} 人`;
  if (parts.length > 0 && r.number_of_guests != null) {
    return `${r.number_of_guests} 人 (${parts.join("、")})`;
  }
  return parts.join("、");
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatMoney(m?: Money): string {
  if (!m || m.amount == null) return "-";
  const cur = m.currency ?? "";
  return `${cur} ${m.amount.toLocaleString("en-US")}`.trim();
}

function translateStayStatus(s: string): string {
  const map: Record<string, string> = {
    pre_check_in: "未入住",
    in_house: "已入住",
    check_out: "已退房",
    cancelled: "已取消",
    no_show: "未到店",
  };
  return map[s] ?? s;
}
