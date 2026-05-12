import { getPendingDraft, getSettings, insertDraft, updateDraft } from "@/lib/db/queries";
import { generateDualReplies, type LlmContext } from "@/lib/llm";
import { isMostlyNonChinese, translateToChinese } from "@/lib/llm/translate";
import { loadConversationContext } from "@/lib/context-loader";
import type { Draft } from "@/lib/db/types";

/** Generate a draft for a conversation. Replaces any existing pending draft. */
export async function generateDraftFor(
  conversationId: string,
  opts: {
    guidance?: string;
    composePrompt?: string;
    previousDraft?: { text: string; stance: string | null };
  } = {},
): Promise<Draft> {
  const settings = await getSettings();
  const ctx = await loadConversationContext(conversationId);
  if (!ctx) throw new Error(`conversation ${conversationId} not found`);

  const lastGuest = [...ctx.messages].reverse().find((m) => m.sender === "guest");
  // In compose mode there's no triggering guest message.
  const triggerMessageId = opts.composePrompt ? null : (lastGuest?.id ?? null);

  const llmCtx: LlmContext = {
    systemPrompt: settings.system_prompt,
    propertyBlock: ctx.propertyBlock,
    reservationBlock: ctx.reservationBlock,
    history: ctx.messages,
    guidance: opts.guidance,
    composePrompt: opts.composePrompt,
    previousDraft: opts.previousDraft,
  };

  const { reply, modelUsed } = await generateDualReplies(llmCtx, settings);

  // Backfill missing translations. The model often forgets to fill
  // translation_zh for non-Chinese replies despite the prompt rule, so we
  // detect that case and run a single follow-up translation call.
  await backfillTranslations(reply, settings);

  const existing = await getPendingDraft(conversationId);
  if (existing) {
    await updateDraft(existing.id, { status: "dismissed", auto_send_at: null });
  }

  const autoSendAt = settings.auto_mode
    ? new Date(Date.now() + settings.countdown_seconds * 1000).toISOString()
    : null;

  return insertDraft({
    conversation_id: conversationId,
    trigger_message_id: triggerMessageId,
    primary_text: reply.primary.text,
    primary_stance: reply.primary.stance || null,
    primary_translation_zh: reply.primary.translation_zh || null,
    alternative_text: reply.alternative.text,
    alternative_stance: reply.alternative.stance || null,
    alternative_translation_zh: reply.alternative.translation_zh || null,
    compose_prompt: opts.composePrompt ?? null,
    auto_send_at: autoSendAt,
    model_used: modelUsed,
  });
}

async function backfillTranslations(
  reply: { primary: { text: string; translation_zh: string }; alternative: { text: string; translation_zh: string } },
  settings: { llm_provider: "anthropic" | "openai"; anthropic_model: string; openai_model: string },
): Promise<void> {
  const needs: Array<"primary" | "alternative"> = [];
  for (const k of ["primary", "alternative"] as const) {
    const c = reply[k];
    if (isMostlyNonChinese(c.text) && !c.translation_zh.trim()) needs.push(k);
  }
  if (needs.length === 0) return;
  try {
    const translations = await translateToChinese(needs.map((k) => reply[k].text), settings);
    needs.forEach((k, i) => {
      reply[k].translation_zh = translations[i] ?? "";
    });
  } catch (err) {
    console.error("[draft-engine] translation backfill failed", err);
    // Leave the empty translations as-is rather than failing the whole draft.
  }
}
