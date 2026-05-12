import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/db/queries";

export const runtime = "nodejs";

const Patch = z.object({
  llm_provider: z.enum(["anthropic", "openai"]).optional(),
  anthropic_model: z.string().min(1).max(100).optional(),
  openai_model: z.string().min(1).max(100).optional(),
  auto_mode: z.boolean().optional(),
  countdown_seconds: z.number().int().min(3).max(600).optional(),
  system_prompt: z.string().max(4000).optional(),
});

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await getSettings();
  return NextResponse.json({ settings: s });
}

export async function PATCH(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updated = await updateSettings(parsed.data);
  return NextResponse.json({ settings: updated });
}
