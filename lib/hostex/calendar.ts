import { hostex } from "./client";
import type { HostexReservation } from "./reservations";

type ListResp = {
  data?: { reservations?: HostexReservation[] } | HostexReservation[];
  reservations?: HostexReservation[];
};

function extract(resp: ListResp): HostexReservation[] {
  if (Array.isArray(resp?.data)) return resp.data as HostexReservation[];
  const inData = (resp?.data as { reservations?: HostexReservation[] } | undefined)?.reservations;
  return inData ?? resp?.reservations ?? [];
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const CHUNK_DAYS = 150;

async function fetchOneChunk(
  propertyId: string | number,
  startCheckIn: string,
  endCheckIn: string,
): Promise<HostexReservation[]> {
  const all: HostexReservation[] = [];
  const PAGE = 100;
  for (let offset = 0; ; offset += PAGE) {
    const resp = await hostex<ListResp>("/reservations", {
      query: {
        property_id: propertyId,
        // Use the same-pair filter; mixed pairs (start_check_out + end_check_in)
        // appear to silently return empty on some Hostex tenants.
        start_check_in_date: startCheckIn,
        end_check_in_date: endCheckIn,
        limit: PAGE,
        offset,
      },
    });
    const page = extract(resp);
    if (process.env.HOSTEX_DEBUG && offset === 0) {
      console.log(
        `[calendar] property=${propertyId} ${startCheckIn}→${endCheckIn} page0: ${page.length} reservations`,
      );
    }
    all.push(...page);
    if (page.length < PAGE) break;
    if (offset > 5_000) break;
  }
  return all;
}

/**
 * Fetch all reservations for a property whose stay overlaps [start, end].
 *
 * Strategy:
 *   - Use the `start_check_in_date` / `end_check_in_date` filter pair, which
 *     is the canonical way to narrow reservation queries on Hostex.
 *   - Extend the lower bound by 365 days to catch reservations that started
 *     before [start, end] but are still ongoing during it. After fetching, we
 *     filter client-side by actual overlap.
 *   - Hostex caps each request to roughly 180 days, so we chunk the wider
 *     query window into 150-day segments and dedupe by reservation_code.
 */
export async function getReservationsForRange(
  propertyId: string | number,
  start: string,
  end: string,
): Promise<HostexReservation[]> {
  const startD = parseYmd(start);
  const endD = parseYmd(end);
  if (startD > endD) return [];

  // Extend lower bound to catch long stays already in progress.
  const lowerBound = addDays(startD, -365);

  const dedupe = new Map<string, HostexReservation>();
  let cursor = lowerBound;
  while (cursor <= endD) {
    const stopAt = addDays(cursor, CHUNK_DAYS - 1) > endD ? endD : addDays(cursor, CHUNK_DAYS - 1);
    const items = await fetchOneChunk(propertyId, ymd(cursor), ymd(stopAt));
    for (const r of items) {
      const key = String((r as Record<string, unknown>).reservation_code ?? r.id ?? Math.random());
      if (!dedupe.has(key)) dedupe.set(key, r);
    }
    cursor = addDays(stopAt, 1);
  }

  // Client-side overlap filter so we don't return year-old reservations that
  // happen to be in the lookback window.
  const out: HostexReservation[] = [];
  for (const r of dedupe.values()) {
    if (!r.check_in_date || !r.check_out_date) continue;
    const cin = parseYmd(r.check_in_date);
    const cout = parseYmd(r.check_out_date);
    // A stay [cin, cout) overlaps [startD, endD] iff cin <= endD AND cout > startD.
    if (cin <= endD && cout > startD) out.push(r);
  }
  if (process.env.HOSTEX_DEBUG) {
    console.log(
      `[calendar] property=${propertyId} window ${start}→${end}: ${out.length} after overlap filter (raw ${dedupe.size})`,
    );
  }
  return out;
}
