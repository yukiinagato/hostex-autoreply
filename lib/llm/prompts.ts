import type { Message } from "@/lib/db/types";

export type LlmContext = {
  systemPrompt: string;
  propertyBlock: string;
  reservationBlock: string;
  history: Message[];
  guidance?: string;
  /** When set, switches into proactive compose mode: the host wants to start
   *  a new outbound message about the topic in this string instead of replying
   *  to the latest guest message. */
  composePrompt?: string;
  /** When regenerating, this is the candidate the host was looking at before
   *  asking for a revision. The new generation should use it as a baseline. */
  previousDraft?: { text: string; stance: string | null };
};

export const DUAL_REPLY_INSTRUCTION = `You will be given (a) facts about the property and reservation, (b) the conversation transcript, and (c) the single guest message to reply to.

Produce TWO candidate replies that take MEANINGFULLY DIFFERENT APPROACHES to the same guest message. The point is to give the host two distinct directions to choose between, not two phrasings of the same answer.

Context handling:
- The guest's latest message is often a continuation, follow-up, or pushback to the immediately preceding turn(s). Always interpret it in light of the most recent ~3 turns. Pronouns, ellipses ("我入境要填", "对", "可以吗"), and short replies almost always refer to the topic of the previous turn.
- If the guest pushes back after the host declined or deflected, candidates should engage with the underlying need rather than ask "what do you mean?". Asking for clarification is acceptable ONLY when the recent transcript genuinely does not disambiguate.
- Do not drag in stale topics from far earlier in the transcript.

What counts as "different direction" (pick whichever distinction is most useful for this specific message — do not force one axis):
- Different strategy: answer directly with facts vs. ask a clarifying question first; provide info inline vs. point to the check-in guide / link; act now vs. defer to host confirmation.
- Different framing: address the literal question vs. address the underlying need behind it.
- Different scope: minimal reply to just this message vs. proactive reply that also covers a likely follow-up.
- Different offering: option A vs. option B (e.g. "free luggage hold until 15:00" vs. "paid early check-in at ¥1000/h").
- Different commitment: confirm what we can do vs. acknowledge and say we'll check with the host first.
- For yes/no-style requests where it genuinely applies, "accommodate vs. politely decline" is still a valid choice — but only when both are realistic responses given the property facts and rules. Do not produce a strawman decline (or accept) just to fill the second slot.

Both candidates MUST:
- Be factually consistent with the property facts and reservation data. Do not invent.
- Address the latest guest message specifically.
- Be replies the host would plausibly send. Neither slot is a throwaway.
- Respect all rules in the system prompt above (no emoji, language matching, etc.).

Avoid:
- Two replies that differ only in tone, length, politeness level, or word choice.
- Two replies that say the same thing with synonyms.
- A "decoy" candidate (decline / accept) that is obviously wrong given the rules — if only one direction is valid, both candidates can take that direction but should still differ in framing/scope/strategy.

Use a SHORT stance label naming the direction. 2–8 characters, Chinese preferred (since the host UI is Chinese). Examples: "直接回答", "反问澄清", "提供选项A", "提供选项B", "立即确认", "房东再核", "走入住链接", "内联说明", "现在解决", "记录稍后跟进".

Hard rules:
- Reply in the same language the guest used in the latest message.
- Use property/reservation facts above when relevant. Do NOT invent facts. If a fact is not in section (a) or (b), say you'll check and get back, do not fabricate.
- Keep each reply under ~120 words.
- Output STRICT JSON, no prose, no markdown fences, in exactly this shape:
{
  "primary":     { "stance": "<short label>", "text": "<reply text>", "translation_zh": "<Chinese translation, or empty string>" },
  "alternative": { "stance": "<short label>", "text": "<reply text>", "translation_zh": "<Chinese translation, or empty string>" }
}
- "text" is what gets sent to the guest. Do NOT put the Chinese translation inside "text".
- "translation_zh" is REQUIRED. Rules — apply them mechanically, do not skip:
    1. If "text" contains ANY non-Chinese script (English, Japanese kana, Korean, Arabic, etc.), "translation_zh" MUST be a faithful Chinese translation of the entire "text". Even a single English sentence requires a Chinese translation.
    2. "translation_zh" may be the empty string "" ONLY when "text" is written 100% in Chinese characters and CJK punctuation.
    3. Before emitting the JSON, re-read each candidate's "text". If it is not pure Chinese, verify "translation_zh" is non-empty. If you wrote "" by mistake, fix it.
    4. The translation is shown only to the host for internal review and is never sent to the guest, so translate naturally — same meaning, same tone, no commentary, no quotes around it.`;

export function buildSystemBlock(ctx: LlmContext): string {
  return [
    ctx.systemPrompt.trim(),
    "",
    "## (a) Property facts",
    ctx.propertyBlock,
    "",
    "## (a) Current reservation",
    ctx.reservationBlock,
    "",
    "## Instructions",
    DUAL_REPLY_INSTRUCTION,
  ].join("\n");
}

/**
 * Build a single user turn that contains:
 *   (b) the formatted transcript (filtering out system noise)
 *   (c) the latest guest message to reply to (called out explicitly)
 *   optional: host guidance for regenerate
 *
 * This avoids the "model gets confused by old topics in alternating user/
 * assistant turns" failure mode, and guarantees the conversation ends with a
 * `user` message (Anthropic requirement).
 */
export function buildHistoryMessages(ctx: LlmContext): Array<{ role: "user" | "assistant"; content: string }> {
  const usable = ctx.history.filter((m) => m.sender !== "system" && m.content.trim() !== "");
  const lastGuest = [...usable].reverse().find((m) => m.sender === "guest");

  // Cap at the last 16 messages — enough for multi-turn pronouns and pushback
  // to make sense, while still avoiding the failure mode where 30+ messages
  // let the model fixate on whatever historical topic is most frequent.
  const trimmed = usable.slice(-16);

  const transcriptLines = trimmed.map((m) => {
    const who = m.sender === "host" ? "HOST" : "GUEST";
    const ts = new Date(m.created_at).toISOString().replace("T", " ").slice(0, 19);
    return `[${ts}] ${who}: ${m.content}`;
  });

  const sections: string[] = [];
  sections.push("## (b) Conversation transcript");
  sections.push(transcriptLines.length ? transcriptLines.join("\n") : "(no prior messages)");
  sections.push("");

  if (ctx.composePrompt) {
    // Proactive compose mode: host wants to initiate a message about a topic.
    sections.push("## (c) Compose mode — host wants to proactively send a new message");
    sections.push("The host (the property manager) is initiating a new outbound message rather than replying to the guest. The host's instruction for what to write:");
    sections.push(`"""${ctx.composePrompt}"""`);
    sections.push("");
    sections.push(
      "Produce two candidate outbound messages that carry out this instruction. They should:",
    );
    sections.push("- Be addressed to the guest in this conversation (use property/reservation context).");
    sections.push("- Read naturally as host-initiated, not as a reply to anything the guest said.");
    sections.push("- Same dual-direction rules apply (different framing/strategy/tone for the two candidates).");
    sections.push("- Same hard rules: language matching the guest's, no emoji, no fabricated facts.");
  } else {
    sections.push("## (c) Latest guest message to reply to");
    if (lastGuest) {
      sections.push(`"""${lastGuest.content}"""`);
    } else {
      sections.push(
        "(no guest message — draft a polite proactive follow-up appropriate to the transcript)",
      );
    }
    sections.push("");
    sections.push(
      "Important: the latest guest message above may be a short follow-up to the immediately preceding turn (pronouns, ellipses, pushback). Resolve references using the last few turns of the transcript before deciding what to say. Only ask for clarification when the transcript truly does not disambiguate the intent.",
    );
  }

  if (ctx.previousDraft) {
    sections.push("");
    sections.push("## Previous AI-generated draft (host wants to revise this)");
    if (ctx.previousDraft.stance) {
      sections.push(`The host was looking at the candidate labeled "${ctx.previousDraft.stance}":`);
    } else {
      sections.push("The host was looking at this candidate:");
    }
    sections.push(`"""${ctx.previousDraft.text}"""`);
    sections.push("");
    sections.push(
      "Use this previous draft as the baseline. Keep what was good about it; change what the host's revision request asks to change. Do not regress to a different topic. The two new candidates should both improve on this baseline along different axes.",
    );
  }

  if (ctx.guidance) {
    sections.push("");
    sections.push("## Host's revision request");
    sections.push(ctx.guidance);
  }
  sections.push("");
  sections.push(
    "Now produce the JSON object described in the system prompt — no prose, no markdown.",
  );

  return [{ role: "user", content: sections.join("\n") }];
}

export type Candidate = { stance: string; text: string; translation_zh: string };
export type DualReply = { primary: Candidate; alternative: Candidate };

export function parseDualReply(raw: string): DualReply {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM did not return JSON");
  const parsed = JSON.parse(match[0]);
  const norm = (v: unknown): Candidate => {
    if (typeof v === "string") return { stance: "", text: v, translation_zh: "" };
    const o = (v ?? {}) as Record<string, unknown>;
    return {
      stance: typeof o.stance === "string" ? o.stance : "",
      text: typeof o.text === "string" ? o.text : "",
      translation_zh: typeof o.translation_zh === "string" ? o.translation_zh : "",
    };
  };
  const primary = norm(parsed.primary);
  const alternative = norm(parsed.alternative);
  if (!primary.text || !alternative.text) throw new Error("LLM JSON missing text fields");
  return { primary, alternative };
}
