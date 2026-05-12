import { hostex } from "./client";

// Hostex API field names follow their docs. Where the exact shape isn't
// guaranteed, we keep the raw payload around in `raw` for debugging.

export type HostexMessage = {
  id?: string | number;
  sender_role?: "guest" | "host" | "system" | string;
  sender?: string;
  content?: string;
  text?: string;
  message?: string;
  image_url?: string;
  created_at?: string;
  sent_at?: string;
  timestamp?: string | number;
  [k: string]: unknown;
};

export type HostexConversation = {
  id: string | number;
  guest_name?: string;
  property_id?: string | number;
  listing_id?: string | number;
  reservation_id?: string | number;
  last_message_at?: string;
  unread_count?: number;
  messages?: HostexMessage[];
  [k: string]: unknown;
};

export type ListConversationsResp = {
  data?: { conversations?: HostexConversation[] } | HostexConversation[];
  conversations?: HostexConversation[];
  [k: string]: unknown;
};

export async function listConversations(params: { offset?: number; limit?: number } = {}) {
  const resp = await hostex<ListConversationsResp>("/conversations", {
    query: { offset: params.offset ?? 0, limit: Math.min(params.limit ?? 50, 100) },
  });
  // normalize
  const fromData = Array.isArray(resp?.data)
    ? (resp.data as HostexConversation[])
    : (resp?.data as { conversations?: HostexConversation[] } | undefined)?.conversations;
  return fromData ?? resp?.conversations ?? [];
}

export type GetConversationResp = {
  data?: HostexConversation;
  conversation?: HostexConversation;
  [k: string]: unknown;
};

export async function getConversation(id: string | number) {
  const resp = await hostex<GetConversationResp>(`/conversations/${id}`);
  return resp?.data ?? resp?.conversation ?? (resp as unknown as HostexConversation);
}

export async function sendMessage(
  conversationId: string | number,
  message: { text?: string; jpegBase64?: string },
) {
  // Per Hostex docs: POST /v3/conversations/{conversation_id}
  // body: { message?: string, jpeg_base64?: string }
  const body: Record<string, string> = {};
  if (message.text) body.message = message.text;
  if (message.jpegBase64) body.jpeg_base64 = message.jpegBase64;
  return hostex(`/conversations/${conversationId}`, {
    method: "POST",
    body,
  });
}

export function normalizeMessage(m: HostexMessage): {
  hostex_msg_id: string | null;
  sender: "guest" | "host" | "system";
  content: string;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
} {
  const role = (m.sender_role ?? m.sender ?? "guest").toString().toLowerCase();
  let sender: "guest" | "host" | "system" =
    role === "host" || role === "owner" ? "host" : role === "system" ? "system" : "guest";
  const content = (m.content ?? m.text ?? m.message ?? "").toString();
  // Hostex injects metadata blobs as "guest" messages — most commonly
  // "Source: reservation_book" or similar single-line key/value strings.
  if (
    sender === "guest" &&
    /^(source|channel|inquiry_source|origin)\s*:\s*\S+\s*$/i.test(content.trim())
  ) {
    sender = "system";
  }
  // Pull out an attachment URL if present. Hostex's `attachment` field shape
  // observed so far: either null, a bare URL string, or `{url, type}` /
  // `{image_url}` / `{path}`. Be defensive about all of them.
  const att = m.attachment as unknown;
  let attachmentUrl: string | null = null;
  if (typeof att === "string" && /^https?:\/\//.test(att)) {
    attachmentUrl = att;
  } else if (att && typeof att === "object") {
    const obj = att as Record<string, unknown>;
    const candidate =
      (typeof obj.url === "string" && obj.url) ||
      (typeof obj.image_url === "string" && obj.image_url) ||
      (typeof obj.path === "string" && obj.path) ||
      (typeof obj.href === "string" && obj.href) ||
      "";
    if (candidate && /^https?:\/\//.test(candidate)) attachmentUrl = candidate;
  }
  const displayType =
    typeof (m as Record<string, unknown>).display_type === "string"
      ? ((m as Record<string, unknown>).display_type as string)
      : null;
  const ts = m.created_at ?? m.sent_at ?? (typeof m.timestamp === "number"
    ? new Date(m.timestamp * (m.timestamp > 1e12 ? 1 : 1000)).toISOString()
    : (m.timestamp as string | undefined)) ?? new Date().toISOString();
  return {
    hostex_msg_id: m.id != null ? String(m.id) : null,
    sender,
    content,
    attachment_url: attachmentUrl,
    attachment_type: displayType,
    created_at: typeof ts === "string" ? ts : new Date(ts).toISOString(),
  };
}
