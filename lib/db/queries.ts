import { getDb, newId } from "./client";
import { emitConversationDraftChanged, emitConversationsChanged, emitDraftChanged, emitMessageInserted } from "@/lib/events";
import type { Conversation, ConversationDraft, ConversationListItem, Draft, Message, Property, Settings } from "./types";

// ----- row mappers (SQLite stores booleans as 0/1, json as text) -----

type SettingsRow = Omit<Settings, "auto_mode"> & { auto_mode: number };
type ConversationRow = Omit<Conversation, "unread"> & { unread: number };
type PropertyRow = Omit<Property, "details_json"> & { details_json: string };

const toSettings = (r: SettingsRow): Settings => ({ ...r, auto_mode: !!r.auto_mode });
const toConversation = (r: ConversationRow): Conversation => ({ ...r, unread: !!r.unread });
const toProperty = (r: PropertyRow): Property => ({ ...r, details_json: JSON.parse(r.details_json) });

// ----- settings -----

export async function getSettings(): Promise<Settings> {
  const row = getDb().prepare("select * from settings where id = 1").get() as SettingsRow;
  return toSettings(row);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const allowed: (keyof Settings)[] = [
    "hostex_token", "hostex_webhook_secret", "llm_provider", "anthropic_model", "openai_model",
    "auto_mode", "countdown_seconds", "system_prompt",
  ];
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    fields.push(`${k} = ?`);
    const v = patch[k];
    values.push(typeof v === "boolean" ? (v ? 1 : 0) : (v as unknown));
  }
  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  if (fields.length === 1) return getSettings();
  getDb().prepare(`update settings set ${fields.join(", ")} where id = 1`).run(...values);
  return getSettings();
}

// ----- conversations -----

export async function listConversations(): Promise<ConversationListItem[]> {
  const rows = getDb()
    .prepare(
      `select c.*,
              p.name as property_name,
              lm.content   as last_msg_content,
              lm.sender    as last_msg_sender,
              lm.sent_via  as last_msg_sent_via,
              lm.created_at as last_msg_at
       from conversations c
       left join properties p on p.hostex_id = c.property_hostex_id
       left join messages lm on lm.id = (
         select id from messages
         where conversation_id = c.id and sender != 'system'
         order by created_at desc
         limit 1
       )
       order by (coalesce(lm.created_at, c.last_message_at) is null),
                coalesce(lm.created_at, c.last_message_at) desc
       limit 200`,
    )
    .all() as Array<ConversationRow & {
      property_name: string | null;
      last_msg_content: string | null;
      last_msg_sender: "guest" | "host" | "system" | null;
      last_msg_sent_via: "hostex" | "ai-auto" | "ai-manual" | null;
      last_msg_at: string | null;
    }>;
  return rows.map((r) => ({
    ...toConversation(r),
    property_name: r.property_name,
    last_msg_content: r.last_msg_content,
    last_msg_sender: r.last_msg_sender,
    last_msg_sent_via: r.last_msg_sent_via,
    last_msg_at: r.last_msg_at,
  }));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const row = getDb().prepare("select * from conversations where id = ?").get(id) as ConversationRow | undefined;
  return row ? toConversation(row) : null;
}

export async function getConversationByHostexId(hostexId: string): Promise<Conversation | null> {
  const row = getDb().prepare("select * from conversations where hostex_id = ?").get(hostexId) as ConversationRow | undefined;
  return row ? toConversation(row) : null;
}

export async function upsertConversation(c: {
  hostex_id: string;
  guest_name?: string | null;
  property_hostex_id?: string | null;
  reservation_hostex_id?: string | null;
  channel_type?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  last_message_at?: string | null;
  unread?: boolean;
}): Promise<Conversation> {
  const db = getDb();
  const existing = db.prepare("select * from conversations where hostex_id = ?").get(c.hostex_id) as ConversationRow | undefined;
  if (existing) {
    db.prepare(
      `update conversations set
        guest_name = coalesce(?, guest_name),
        property_hostex_id = coalesce(?, property_hostex_id),
        reservation_hostex_id = coalesce(?, reservation_hostex_id),
        channel_type = coalesce(?, channel_type),
        check_in_date = coalesce(?, check_in_date),
        check_out_date = coalesce(?, check_out_date),
        last_message_at = coalesce(?, last_message_at),
        unread = coalesce(?, unread)
       where hostex_id = ?`,
    ).run(
      c.guest_name ?? null,
      c.property_hostex_id ?? null,
      c.reservation_hostex_id ?? null,
      c.channel_type ?? null,
      c.check_in_date ?? null,
      c.check_out_date ?? null,
      c.last_message_at ?? null,
      c.unread === undefined ? null : (c.unread ? 1 : 0),
      c.hostex_id,
    );
  } else {
    db.prepare(
      `insert into conversations
        (id, hostex_id, guest_name, property_hostex_id, reservation_hostex_id,
         channel_type, check_in_date, check_out_date, last_message_at, unread)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      c.hostex_id,
      c.guest_name ?? null,
      c.property_hostex_id ?? null,
      c.reservation_hostex_id ?? null,
      c.channel_type ?? null,
      c.check_in_date ?? null,
      c.check_out_date ?? null,
      c.last_message_at ?? null,
      c.unread ? 1 : 0,
    );
  }
  emitConversationsChanged();
  const final = db.prepare("select * from conversations where hostex_id = ?").get(c.hostex_id) as ConversationRow;
  return toConversation(final);
}

// ----- messages -----

/** Mark a single conversation as read (last_read_at = now). */
export async function markConversationRead(conversationId: string): Promise<void> {
  const now = new Date().toISOString();
  const db = getDb();
  db.prepare("update conversations set last_read_at = ? where id = ?").run(now, conversationId);
  emitConversationsChanged();
}

/**
 * Bulk mark every conversation as read. Sets last_read_at = now for any
 * conversation whose most-recent non-system message is newer than the
 * current last_read_at (or never read). Returns the count affected.
 */
export async function markAllConversationsRead(): Promise<number> {
  const now = new Date().toISOString();
  const db = getDb();
  const r = db
    .prepare(
      `update conversations
       set last_read_at = ?
       where exists (
         select 1 from messages m
         where m.conversation_id = conversations.id
           and m.sender != 'system'
           and (conversations.last_read_at is null or m.created_at > conversations.last_read_at)
       )`,
    )
    .run(now);
  if (r.changes > 0) emitConversationsChanged();
  return r.changes;
}

export async function listMessages(conversationId: string, limit = 50): Promise<Message[]> {
  // Get the LATEST `limit` messages (descending), then reorder ascending so
  // callers see them in chronological order.
  const rows = getDb()
    .prepare(
      `select * from (
         select * from messages
         where conversation_id = ?
         order by created_at desc
         limit ?
       ) order by created_at asc`,
    )
    .all(conversationId, limit) as Message[];
  return rows;
}

export async function insertMessage(m: {
  conversation_id: string;
  hostex_msg_id?: string | null;
  sender: Message["sender"];
  content: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  sent_via?: Message["sent_via"];
  created_at?: string;
}): Promise<Message> {
  const db = getDb();
  if (m.hostex_msg_id) {
    const existing = db.prepare("select * from messages where hostex_msg_id = ?").get(m.hostex_msg_id) as Message | undefined;
    if (existing) return existing;
  }
  const id = newId();
  const created = m.created_at ?? new Date().toISOString();
  db.prepare(
    `insert into messages
       (id, conversation_id, hostex_msg_id, sender, content, attachment_url, attachment_type, sent_via, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    m.conversation_id,
    m.hostex_msg_id ?? null,
    m.sender,
    m.content,
    m.attachment_url ?? null,
    m.attachment_type ?? null,
    m.sent_via ?? null,
    created,
  );
  const row = db.prepare("select * from messages where id = ?").get(id) as Message;
  emitMessageInserted(m.conversation_id, row);
  emitConversationsChanged();
  return row;
}

// ----- drafts -----

export async function getPendingDraft(conversationId: string): Promise<Draft | null> {
  const row = getDb()
    .prepare("select * from drafts where conversation_id = ? and status = 'pending'")
    .get(conversationId) as Draft | undefined;
  return row ?? null;
}

export async function getDraft(id: string): Promise<Draft | null> {
  const row = getDb().prepare("select * from drafts where id = ?").get(id) as Draft | undefined;
  return row ?? null;
}

export async function insertDraft(d: Omit<Draft, "id" | "created_at" | "status"> & { status?: Draft["status"] }): Promise<Draft> {
  const db = getDb();
  const id = newId();
  db.prepare(
    `insert into drafts
      (id, conversation_id, trigger_message_id, primary_text, alternative_text,
       primary_stance, alternative_stance,
       primary_translation_zh, alternative_translation_zh,
       compose_prompt,
       status, auto_send_at, model_used)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    d.conversation_id,
    d.trigger_message_id,
    d.primary_text,
    d.alternative_text,
    d.primary_stance,
    d.alternative_stance,
    d.primary_translation_zh,
    d.alternative_translation_zh,
    d.compose_prompt,
    d.status ?? "pending",
    d.auto_send_at,
    d.model_used,
  );
  const row = db.prepare("select * from drafts where id = ?").get(id) as Draft;
  emitDraftChanged(d.conversation_id, row);
  return row;
}

export async function updateDraft(id: string, patch: Partial<Draft>): Promise<Draft> {
  const db = getDb();
  const allowed: (keyof Draft)[] = [
    "primary_text", "alternative_text", "primary_stance", "alternative_stance",
    "primary_translation_zh", "alternative_translation_zh",
    "status", "auto_send_at", "model_used",
  ];
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    fields.push(`${k} = ?`);
    values.push(patch[k] as unknown);
  }
  if (fields.length > 0) {
    values.push(id);
    db.prepare(`update drafts set ${fields.join(", ")} where id = ?`).run(...values);
  }
  const row = db.prepare("select * from drafts where id = ?").get(id) as Draft;
  emitDraftChanged(row.conversation_id, row);
  return row;
}

export async function findExpiredAutoSendDrafts(): Promise<Draft[]> {
  const now = new Date().toISOString();
  return getDb()
    .prepare(
      `select * from drafts
       where status = 'pending' and auto_send_at is not null and auto_send_at <= ?
       limit 20`,
    )
    .all(now) as Draft[];
}

// ----- properties -----

export async function getPropertyByHostexId(hostexId: string): Promise<Property | null> {
  const row = getDb().prepare("select * from properties where hostex_id = ?").get(hostexId) as PropertyRow | undefined;
  return row ? toProperty(row) : null;
}

export async function listAllProperties(): Promise<Property[]> {
  const rows = getDb()
    .prepare("select * from properties order by name asc, hostex_id asc")
    .all() as PropertyRow[];
  return rows.map(toProperty);
}

export async function updatePropertyCustomContext(hostexId: string, value: string | null): Promise<Property | null> {
  const db = getDb();
  db.prepare(
    "update properties set custom_context = ?, updated_at = ? where hostex_id = ?",
  ).run(value, new Date().toISOString(), hostexId);
  return getPropertyByHostexId(hostexId);
}

// ----- conversation_drafts (in-progress UI input state) -----

const EMPTY_DRAFT_STATE = (id: string): ConversationDraft => ({
  conversation_id: id,
  compose_prompt: "",
  preset_label: "",
  preset_input: "",
  edit_draft_id: null,
  edit_text: "",
  edit_choice: "primary",
  regen_guidance: "",
  updated_at: new Date().toISOString(),
});

export async function getConversationDraft(conversationId: string): Promise<ConversationDraft> {
  const row = getDb()
    .prepare("select * from conversation_drafts where conversation_id = ?")
    .get(conversationId) as ConversationDraft | undefined;
  return row ?? EMPTY_DRAFT_STATE(conversationId);
}

const ALLOWED_DRAFT_FIELDS: ReadonlyArray<keyof ConversationDraft> = [
  "compose_prompt",
  "preset_label",
  "preset_input",
  "edit_draft_id",
  "edit_text",
  "edit_choice",
  "regen_guidance",
];

export async function patchConversationDraft(
  conversationId: string,
  patch: Partial<ConversationDraft>,
): Promise<ConversationDraft> {
  const db = getDb();
  // Make sure a row exists
  db.prepare(
    `insert into conversation_drafts (conversation_id) values (?)
     on conflict(conversation_id) do nothing`,
  ).run(conversationId);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const k of ALLOWED_DRAFT_FIELDS) {
    if (patch[k] === undefined) continue;
    fields.push(`${k} = ?`);
    values.push(patch[k] as unknown);
  }
  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(conversationId);
  db.prepare(
    `update conversation_drafts set ${fields.join(", ")} where conversation_id = ?`,
  ).run(...values);

  const row = db
    .prepare("select * from conversation_drafts where conversation_id = ?")
    .get(conversationId) as ConversationDraft;
  emitConversationDraftChanged(conversationId, row);
  return row;
}

// ----- properties -----

export async function upsertProperty(p: {
  hostex_id: string;
  name?: string | null;
  details_json: Record<string, unknown>;
}): Promise<Property> {
  const db = getDb();
  const json = JSON.stringify(p.details_json);
  const updatedAt = new Date().toISOString();
  const existing = db.prepare("select id from properties where hostex_id = ?").get(p.hostex_id) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      "update properties set name = ?, details_json = ?, updated_at = ? where hostex_id = ?",
    ).run(p.name ?? null, json, updatedAt, p.hostex_id);
  } else {
    db.prepare(
      "insert into properties (id, hostex_id, name, details_json, updated_at) values (?, ?, ?, ?, ?)",
    ).run(newId(), p.hostex_id, p.name ?? null, json, updatedAt);
  }
  const row = db.prepare("select * from properties where hostex_id = ?").get(p.hostex_id) as PropertyRow;
  return toProperty(row);
}
