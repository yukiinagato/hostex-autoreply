import { NextResponse } from "next/server";
import { listProperties } from "@/lib/hostex/properties";
import { upsertProperty } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const url = new URL(req.url);
    const fromQuery = url.searchParams.get("secret");
    const fromHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (fromQuery !== expected && fromHeader !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const props = await listProperties();
  for (const p of props) {
    await upsertProperty({
      hostex_id: String(p.id),
      name: (p.name ?? p.title ?? null) as string | null,
      details_json: p as Record<string, unknown>,
    });
  }
  return NextResponse.json({ ok: true, count: props.length });
}
