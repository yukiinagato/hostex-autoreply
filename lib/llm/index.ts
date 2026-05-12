import type { Settings } from "@/lib/db/types";
import { generateAnthropic } from "./anthropic";
import { generateOpenAI } from "./openai";
import type { DualReply, LlmContext } from "./prompts";

export type { DualReply, LlmContext } from "./prompts";

export async function generateDualReplies(
  ctx: LlmContext,
  settings: Pick<Settings, "llm_provider" | "anthropic_model" | "openai_model">,
): Promise<{ reply: DualReply; modelUsed: string }> {
  const provider = settings.llm_provider;

  // One retry on parse failure (model occasionally adds prose around JSON).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (provider === "openai") {
        return await generateOpenAI(ctx, settings.openai_model);
      }
      return await generateAnthropic(ctx, settings.anthropic_model);
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("unreachable");
}
