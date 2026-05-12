import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { isAuthenticated } from "@/lib/auth";
import { checkpointWal, exportToJson, getDbFilePath } from "@/lib/db/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function GET(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "db").toLowerCase();
  const stamp = todayStamp();

  if (format === "json") {
    try {
      const dump = exportToJson();
      return new Response(JSON.stringify(dump, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="hostex-autoreply-${stamp}.json"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  if (format === "db") {
    try {
      checkpointWal();
      const filePath = getDbFilePath();
      const buf = await fs.readFile(filePath);
      // Convert to a fresh ArrayBuffer slice so Response handles it as binary.
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return new Response(ab, {
        headers: {
          "Content-Type": "application/x-sqlite3",
          "Content-Disposition": `attachment; filename="hostex-autoreply-${stamp}.db"`,
          "Cache-Control": "no-store",
          "Content-Length": String(buf.byteLength),
        },
      });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `unsupported format: ${format}` }, { status: 400 });
}
