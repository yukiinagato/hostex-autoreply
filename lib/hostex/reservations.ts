import { hostex } from "./client";

export type HostexReservation = {
  id?: string | number;
  reservation_code?: string;
  channel_id?: string;
  channel_type?: string;
  property_id?: string | number;
  status?: string;
  booked_at?: string;
  check_in_date?: string;
  check_out_date?: string;
  guests?: number;
  number_of_guests?: number;
  total_price?: number | string;
  currency?: string;
  guest?: { name?: string; phone?: string; email?: string };
  [k: string]: unknown;
};

type ListReservationsResp = {
  data?: { reservations?: HostexReservation[] } | HostexReservation[];
  reservations?: HostexReservation[];
};

function extractList(resp: ListReservationsResp): HostexReservation[] {
  if (Array.isArray(resp?.data)) return resp.data as HostexReservation[];
  const inData = (resp?.data as { reservations?: HostexReservation[] } | undefined)?.reservations;
  return inData ?? resp?.reservations ?? [];
}

// In-memory cache for reservation lookups. Reservations rarely change in the
// span of a few minutes, and we hit this on every conversation page render.
type CacheEntry = { at: number; data: HostexReservation | null };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

/** Fetch a single reservation by its Hostex reservation_code. Cached for 5 min. */
export async function getReservation(code: string | number): Promise<HostexReservation | null> {
  const key = String(code);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  try {
    const resp = await hostex<ListReservationsResp>("/reservations", {
      query: { reservation_code: key, limit: 1 },
    });
    const data = extractList(resp)[0] ?? null;
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error("[hostex] getReservation failed", err);
    // Cache the null briefly too — avoids hammering on errors during a switch.
    cache.set(key, { at: Date.now(), data: null });
    return null;
  }
}

/** Manually invalidate a reservation in the cache (e.g. after a status update). */
export function invalidateReservationCache(code?: string | number) {
  if (code === undefined) cache.clear();
  else cache.delete(String(code));
}

export function formatReservationContext(r: HostexReservation | null): string {
  if (!r) return "(no active reservation context)";
  const o = r as Record<string, unknown> & {
    custom_channel?: { name?: string };
    stay_status?: string;
    number_of_adults?: number;
    number_of_children?: number;
    number_of_infants?: number;
    number_of_pets?: number;
    guest_name?: string;
    guest_phone?: string;
    guest_email?: string;
    guests?: Array<Record<string, unknown>>;
    additional_fees?: Array<{ name?: string; currency?: string; amount?: number }>;
    rates?: { total_rate?: { currency?: string; amount?: number } };
    check_in_details?: {
      arrival_at?: { hour?: number; minute?: number } | null;
      departure_at?: { hour?: number; minute?: number } | null;
      lock_code?: string | null;
      lock_code_visible_after?: string | null;
      check_in_guide_url?: string | null;
    };
    channel_remarks?: string | null;
    remarks?: string | null;
  };

  const lines = [`# Reservation ${o.reservation_code ?? o.id ?? "(unknown)"}`];
  const push = (label: string, value: unknown) => {
    if (value == null || value === "") return;
    const s = typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
    lines.push(`- ${label}: ${s}`);
  };

  push("channel", o.custom_channel?.name ?? o.channel_type ?? o.channel_id);
  push("status", [o.status, o.stay_status].filter(Boolean).join(" / "));
  push("check_in_date", o.check_in_date);
  push("check_out_date", o.check_out_date);

  const ppl: string[] = [];
  if (o.number_of_adults != null) ppl.push(`${o.number_of_adults} adult(s)`);
  if (o.number_of_children) ppl.push(`${o.number_of_children} child`);
  if (o.number_of_infants) ppl.push(`${o.number_of_infants} infant`);
  if (o.number_of_pets) ppl.push(`${o.number_of_pets} pet`);
  if (ppl.length === 0 && o.number_of_guests != null) ppl.push(`${o.number_of_guests} guest(s)`);
  if (ppl.length > 0) push("guests", ppl.join(", "));

  if (o.rates?.total_rate?.amount != null) {
    push("total_price", `${o.rates.total_rate.currency ?? ""} ${o.rates.total_rate.amount}`.trim());
  }
  if (o.additional_fees?.length) {
    push(
      "additional_fees",
      o.additional_fees.map((f) => `${f.name ?? "fee"} ${f.currency ?? ""}${f.amount ?? ""}`).join(" / "),
    );
  }
  push("booker_name", o.guest_name);
  push("booker_phone", o.guest_phone);
  push("booker_email", o.guest_email);

  if (Array.isArray(o.guests) && o.guests.length > 0) {
    const list = o.guests.map((g, i) => {
      const parts = [`#${i + 1}`];
      if (g.name) parts.push(String(g.name));
      if (g.country) parts.push(`(${g.country})`);
      if (g.is_booker) parts.push("[booker]");
      if (g.id_type || g.id_number) parts.push(`${g.id_type ?? "id"}=${g.id_number ?? ""}`);
      return parts.join(" ");
    }).join(" / ");
    push("guest_list", list);
  }

  const ci = o.check_in_details;
  if (ci) {
    if (ci.arrival_at?.hour != null) push("expected_arrival", fmtHm(ci.arrival_at));
    if (ci.departure_at?.hour != null) push("expected_departure", fmtHm(ci.departure_at));
    if (ci.lock_code) push("lock_code", ci.lock_code);
    if (ci.lock_code_visible_after) push("lock_code_visible_after", ci.lock_code_visible_after);
    if (ci.check_in_guide_url) push("check_in_guide_url", ci.check_in_guide_url);
  }

  push("booked_at", o.booked_at);
  if (o.remarks?.trim()) push("host_remarks", o.remarks.trim());
  if (o.channel_remarks?.trim()) push("channel_remarks", o.channel_remarks.trim().slice(0, 800));

  return lines.join("\n");
}

function fmtHm(t: { hour?: number; minute?: number }): string {
  return `${String(t.hour ?? 0).padStart(2, "0")}:${String(t.minute ?? 0).padStart(2, "0")}`;
}
