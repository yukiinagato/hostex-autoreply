import { getDb } from "./client";
import type { HostexReservation } from "@/lib/hostex/reservations";

export type CachedReservation = {
  reservation_code: string;
  property_hostex_id: string | null;
  channel_type: string | null;
  status: string | null;
  stay_status: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  data_json: string;
  fetched_at: string;
};

export function upsertReservationCache(r: HostexReservation): void {
  const o = r as HostexReservation & {
    custom_channel?: { name?: string };
    stay_status?: string;
    guest_name?: string;
    guest_phone?: string;
    guest_email?: string;
  };
  const code = o.reservation_code;
  if (!code) return;
  const db = getDb();
  db.prepare(
    `insert into reservations_cache
       (reservation_code, property_hostex_id, channel_type, status, stay_status,
        guest_name, guest_phone, guest_email, check_in_date, check_out_date,
        data_json, fetched_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(reservation_code) do update set
       property_hostex_id = excluded.property_hostex_id,
       channel_type       = excluded.channel_type,
       status             = excluded.status,
       stay_status        = excluded.stay_status,
       guest_name         = excluded.guest_name,
       guest_phone        = excluded.guest_phone,
       guest_email        = excluded.guest_email,
       check_in_date      = excluded.check_in_date,
       check_out_date     = excluded.check_out_date,
       data_json          = excluded.data_json,
       fetched_at         = excluded.fetched_at`,
  ).run(
    code,
    o.property_id != null ? String(o.property_id) : null,
    o.custom_channel?.name ?? o.channel_type ?? null,
    o.status ?? null,
    o.stay_status ?? null,
    o.guest_name ?? null,
    o.guest_phone ?? null,
    o.guest_email ?? null,
    o.check_in_date ?? null,
    o.check_out_date ?? null,
    JSON.stringify(o),
    new Date().toISOString(),
  );
}

/** Delete cache entries whose check_out_date is older than `daysOld` days. */
export function purgeOldReservations(daysOld = 60): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const cutoffYmd = cutoff.toISOString().slice(0, 10);
  const res = getDb()
    .prepare(
      `delete from reservations_cache
       where check_out_date is not null and check_out_date < ?`,
    )
    .run(cutoffYmd);
  return res.changes;
}

export function getCachedReservation(code: string): CachedReservation | null {
  const row = getDb()
    .prepare("select * from reservations_cache where reservation_code = ?")
    .get(code) as CachedReservation | undefined;
  return row ?? null;
}

export function listCachedReservationsForProperty(
  propertyHostexId: string,
  limit = 50,
): CachedReservation[] {
  return getDb()
    .prepare(
      `select * from reservations_cache
       where property_hostex_id = ?
       order by check_in_date desc
       limit ?`,
    )
    .all(propertyHostexId, limit) as CachedReservation[];
}

/**
 * Find reservations adjacent to a given stay window for the same property.
 *   - `previous`: another booking whose check-out lands on `checkInDate`
 *     (someone leaving the morning the new guest wants to arrive earlier).
 *   - `next`: another booking whose check-in lands on `checkOutDate`
 *     (someone arriving the day this guest wants to leave later).
 *
 * Excludes cancelled / denied / timeout reservations and `excludeCode` (the
 * conversation's own reservation, when known).
 */
export function findAdjacentReservations(
  propertyHostexId: string,
  checkInDate: string | null,
  checkOutDate: string | null,
  excludeCode: string | null = null,
): { previous: CachedReservation | null; next: CachedReservation | null } {
  const db = getDb();
  const exclude = (r: CachedReservation): boolean => {
    if (excludeCode && r.reservation_code === excludeCode) return true;
    const status = (r.status ?? "").toLowerCase();
    if (status === "cancelled" || status === "denied" || status === "timeout") return true;
    return false;
  };

  let previous: CachedReservation | null = null;
  if (checkInDate) {
    const rows = db
      .prepare(
        `select * from reservations_cache
         where property_hostex_id = ? and check_out_date = ?
         order by check_in_date desc`,
      )
      .all(propertyHostexId, checkInDate) as CachedReservation[];
    previous = rows.find((r) => !exclude(r)) ?? null;
  }

  let next: CachedReservation | null = null;
  if (checkOutDate) {
    const rows = db
      .prepare(
        `select * from reservations_cache
         where property_hostex_id = ? and check_in_date = ?
         order by check_in_date asc`,
      )
      .all(propertyHostexId, checkOutDate) as CachedReservation[];
    next = rows.find((r) => !exclude(r)) ?? null;
  }

  return { previous, next };
}
