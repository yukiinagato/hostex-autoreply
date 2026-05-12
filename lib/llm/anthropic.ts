import Anthropic from "@anthropic-ai/sdk";
import { buildHistoryMessages, buildSystemBlock, parseDualReply, type DualReply, type LlmContext } from "./prompts";

export async function generateAnthropic(
  ctx: LlmContext,
  model: string,
): Promise<{ reply: DualReply; modelUsed: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = buildSystemBlock(ctx);
  const messages = buildHistoryMessages(ctx);

  if (process.env.LLM_DEBUG) {
    console.log("=== LLM REQUEST ===");
    console.log("--- system ---\n" + system);
    for (const m of messages) console.log(`--- ${m.role} ---\n` + m.content);
    console.log("=== END ===");
  }

  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const reply = parseDualReply(text);
  return { reply, modelUsed: `anthropic:${model}` };
}
