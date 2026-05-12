import { hostex } from "./client";
import { invalidateReservationCache } from "./reservations";

export type StayStatus = "checkin_pending" | "in_house" | "stay_completed";

export const STAY_STATUS_OPTIONS: Array<{ value: StayStatus; label: string }> = [
  { value: "checkin_pending", label: "待入住" },
  { value: "in_house", label: "已入住" },
  { value: "stay_completed", label: "已退房" },
];

/**
 * PUT /v3/reservations/{stay_code}/stay_status
 * Body: { stay_status }
 *
 * After success we invalidate the in-process reservation cache so the next
 * page render reads fresh data from Hostex.
 */
export async function updateStayStatus(stayCode: string, status: StayStatus) {
  const res = await hostex(`/reservations/${encodeURIComponent(stayCode)}/stay_status`, {
    method: "PUT",
    body: { stay_status: status },
  });
  invalidateReservationCache(stayCode);
  return res;
}
