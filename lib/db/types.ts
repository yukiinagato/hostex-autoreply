export type User = {
  id: number;
  username: string;
  message_suffix: string;
  is_admin: boolean;
  created_at: string;
};

/** Internal-only — includes the hash; never expose to the client. */
export type UserWithHash = User & { password_hash: string };

export type Session = {
  token: string;
  user_id: number;
  expires_at: string;
  created_at: string;
};

export type Settings = {
  id: 1;
  hostex_token: string | null;
  hostex_webhook_secret: string | null;
  llm_provider: "anthropic" | "openai";
  anthropic_model: string;
  openai_model: string;
  auto_mode: boolean;
  countdown_seconds: number;
  system_prompt: string;
  updated_at: string;
};

export type Property = {
  id: string;
  hostex_id: string;
  name: string | null;
  details_json: Record<string, unknown>;
  /** Host-authored free-text context appended to the LLM property block. */
  custom_context: string | null;
  updated_at: string;
};

export type Conversation = {
  id: string;
  hostex_id: string;
  guest_name: string | null;
  property_hostex_id: string | null;
  reservation_hostex_id: string | null;
  channel_type: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  last_message_at: string | null;
  /** ISO timestamp; conversation is considered unread when the last non-system
   *  message's created_at is later than this value (or this is null). */
  last_read_at: string | null;
  unread: boolean;
  created_at: string;
};

/** Per-conversation in-progress UI input state. Synced server-side so that
 *  refreshing or switching devices doesn't lose typed input (Telegram style). */
export type ConversationDraft = {
  conversation_id: string;
  compose_prompt: string;
  preset_label: string;
  preset_input: string;
  edit_draft_id: string | null;
  edit_text: string;
  edit_choice: "primary" | "alternative";
  regen_guidance: string;
  updated_at: string;
};

/** Conversation joined with the cached property name and a preview of the
 *  latest non-system message, for sidebar display. */
export type ConversationListItem = Conversation & {
  property_name: string | null;
  last_msg_content: string | null;
  last_msg_sender: "guest" | "host" | "system" | null;
  last_msg_sent_via: "hostex" | "ai-auto" | "ai-manual" | null;
  last_msg_at: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  hostex_msg_id: string | null;
  sender: "guest" | "host" | "system";
  content: string;
  /** Optional image / file URL attached to this message. Hostex CDN URL for
   *  inbound messages; we don't currently store outbound attachments here. */
  attachment_url: string | null;
  /** Hostex's display_type hint when known: "Image", "Text", "Box"… */
  attachment_type: string | null;
  sent_via: "hostex" | "ai-auto" | "ai-manual" | null;
  created_at: string;
};

export type Draft = {
  id: string;
  conversation_id: string;
  trigger_message_id: string | null;
  primary_text: string;
  alternative_text: string;
  primary_stance: string | null;
  alternative_stance: string | null;
  /** Chinese translation of primary_text, for host review only. Null/empty when text is already Chinese. */
  primary_translation_zh: string | null;
  alternative_translation_zh: string | null;
  /** Original compose-mode prompt that produced this draft. Carried across
   *  regenerations so the LLM keeps the same intent. Null for normal replies
   *  to a guest message. */
  compose_prompt: string | null;
  status: "pending" | "sent" | "dismissed";
  auto_send_at: string | null;
  model_used: string | null;
  created_at: string;
};
