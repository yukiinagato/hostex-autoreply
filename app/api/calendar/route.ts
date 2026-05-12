import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getReservationsForRange } from "@/lib/hostex/calendar";

export const runtime = "nodejs";

// In-process cache: key = propertyId|start|end, TTL 2 minutes.
type Cached = { at: number; data: unknown };
const cache = new Map<string, Cached>();
const TTL_MS = 2 * 60_000;

const Query = z.object({
  property_id: z.string().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    property_id: url.searchParams.get("property_id") ?? "",
    start: url.searchParams.get("start") ?? "",
    end: url.searchParams.get("end") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { property_id, start, end } = parsed.data;
  const key = `${property_id}|${start}|${end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data);
  }
  try {
    const reservations = await getReservationsForRange(property_id, start, end);
    const data = { reservations };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
