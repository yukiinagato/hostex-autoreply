import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { listAllProperties } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const properties = await listAllProperties();
  return NextResponse.json({ properties });
}
