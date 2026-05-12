import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { search } from "@/lib/db/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(100, Math.max(5, Number(url.searchParams.get("limit") ?? 30)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  if (!q) {
    return NextResponse.json({ hits: [], total: 0, countsByType: { property: 0, reservation: 0, conversation: 0, message: 0 } });
  }
  try {
    const result = search(q, { limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
