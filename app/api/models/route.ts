import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { listAnthropicModels, listOpenAIModels } from "@/lib/llm/list-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [anthropic, openai] = await Promise.all([listAnthropicModels(), listOpenAIModels()]);
  return NextResponse.json({ anthropic, openai });
}
