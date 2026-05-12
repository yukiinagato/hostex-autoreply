import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Settings } from "@/lib/db/types";

/**
 * Detect whether a piece of text is "mostly non-Chinese" — i.e. needs a
 * translation_zh shown to the host. We compare CJK Han characters against
 * other unicode letters; punctuation / digits / whitespace ignored.
 */
export function isMostlyNonChinese(text: string): boolean {
  let han = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x20000 && cp <= 0x2a6df) ||
      (cp >= 0x2a700 && cp <= 0x2b73f) ||
      (cp >= 0x2b740 && cp <= 0x2b81f)
    ) {
      han++;
    } else if (/\p{L}/u.test(ch)) {
      other++;
    }
  }
  if (han + other === 0) return false;
  return han / (han + other) < 0.3; // <30% Han chars → treat as non-Chinese
}

/**
 * Translate one or more strings to Simplified Chinese in a single LLM call.
 * Uses the same provider already configured in settings.
 */
export async function translateToChinese(
  texts: string[],
  settings: Pick<Settings, "llm_provider" | "anthropic_model" | "openai_model">,
): Promise<string[]> {
  if (texts.length === 0) return [];
  const system =
    "You are a professional translator. Translate each provided string into faithful Simplified Chinese. Match the tone (polite, casual, formal). Do not add commentary, do not wrap in quotes. Return STRICT JSON: {\"translations\": [\"<zh1>\", \"<zh2>\", ...]} with one entry per input in the same order.";
  const user = JSON.stringify({ inputs: texts });

  if (settings.llm_provider === "openai") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await client.chat.completions.create({
      model: settings.openai_model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? "";
    return parseTranslations(raw, texts.length);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: settings.anthropic_model,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });
  const raw = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseTranslations(raw, texts.length);
}

function parseTranslations(raw: string, expected: number): string[] {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("translator did not return JSON");
  const parsed = JSON.parse(m[0]) as { translations?: unknown };
  const arr = Array.isArray(parsed.translations) ? parsed.translations : [];
  const out = arr.map((v) => (typeof v === "string" ? v : ""));
  while (out.length < expected) out.push("");
  return out.slice(0, expected);
}
