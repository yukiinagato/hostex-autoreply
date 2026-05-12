import OpenAI from "openai";
import { buildHistoryMessages, buildSystemBlock, parseDualReply, type DualReply, type LlmContext } from "./prompts";

export async function generateOpenAI(
  ctx: LlmContext,
  model: string,
): Promise<{ reply: DualReply; modelUsed: string }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const system = buildSystemBlock(ctx);
  const messages = buildHistoryMessages(ctx);

  const resp = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const text = resp.choices[0]?.message?.content ?? "";
  const reply = parseDualReply(text);
  return { reply, modelUsed: `openai:${model}` };
}
