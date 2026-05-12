import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type ModelOption = { id: string; label: string };

type CacheEntry = { fetchedAt: number; data: ModelOption[] };
const cache = new Map<"anthropic" | "openai", CacheEntry>();
const TTL_MS = 10 * 60_000;

function fresh(p: "anthropic" | "openai"): ModelOption[] | null {
  const e = cache.get(p);
  if (!e) return null;
  if (Date.now() - e.fetchedAt > TTL_MS) return null;
  return e.data;
}

export async function listAnthropicModels(): Promise<ModelOption[]> {
  const cached = fresh("anthropic");
  if (cached) return cached;
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // SDK exposes client.models.list(); fall through to a fetch if not present.
    type ModelsResp = { data: Array<{ id: string; display_name?: string }> };
    const resp = (await (
      client as unknown as { models: { list: (args: { limit: number }) => Promise<ModelsResp> } }
    ).models.list({ limit: 1000 })) as ModelsResp;
    const list: ModelOption[] = resp.data.map((m) => ({
      id: m.id,
      label: m.display_name ?? m.id,
    }));
    cache.set("anthropic", { fetchedAt: Date.now(), data: list });
    return list;
  } catch (err) {
    console.error("[list-models] anthropic failed", err);
    return [];
  }
}

export async function listOpenAIModels(): Promise<ModelOption[]> {
  const cached = fresh("openai");
  if (cached) return cached;
  if (!process.env.OPENAI_API_KEY) return [];
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await client.models.list();
    // Keep only chat-capable models (gpt-* / o1-* / o3-* / o4-*).
    const list: ModelOption[] = resp.data
      .filter((m) => /^(gpt-|o[134]-|chatgpt-)/i.test(m.id))
      .filter((m) => !/-(audio|realtime|tts|whisper|embedding|dall-e|search|moderation|image|transcribe)/i.test(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, label: m.id }));
    cache.set("openai", { fetchedAt: Date.now(), data: list });
    return list;
  } catch (err) {
    console.error("[list-models] openai failed", err);
    return [];
  }
}
