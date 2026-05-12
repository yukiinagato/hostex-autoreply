import { listAllProperties } from "@/lib/db/queries";
import { purgeOldReservations, upsertReservationCache } from "@/lib/db/reservations-cache";
import { getReservationsForRange } from "./calendar";

/**
 * For each known property, pull reservations in [today-30d, today+90d] and
 * upsert into the local cache. Then purge entries older than 60 days past
 * check-out.
 *
 * Throttled with small delays so we don't hammer Hostex when running on a
 * tight cron interval.
 */
export async function syncRecentReservationsForAllProperties(opts: {
  lookbackDays?: number;
  lookaheadDays?: number;
} = {}): Promise<{ properties: number; reservations: number; purged: number }> {
  const lookback = opts.lookbackDays ?? 30;
  const lookahead = opts.lookaheadDays ?? 90;

  const today = new Date();
  const start = new Date(today); start.setDate(today.getDate() - lookback);
  const end = new Date(today); end.setDate(today.getDate() + lookahead);
  const startYmd = start.toISOString().slice(0, 10);
  const endYmd = end.toISOString().slice(0, 10);

  const properties = await listAllProperties();
  let totalReservations = 0;

  for (const p of properties) {
    try {
      const list = await getReservationsForRange(p.hostex_id, startYmd, endYmd);
      for (const r of list) upsertReservationCache(r);
      totalReservations += list.length;
    } catch (err) {
      console.error("[reservations-sync] failed for property", p.hostex_id, err);
    }
    // small breath to avoid bursts
    await new Promise((r) => setTimeout(r, 100));
  }

  const purged = purgeOldReservations(60);
  return { properties: properties.length, reservations: totalReservations, purged };
}
