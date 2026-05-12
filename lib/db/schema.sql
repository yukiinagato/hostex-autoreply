-- SQLite schema for hostex-autoreply. Auto-applied on first DB open.

-- Host users. Each one logs in with a username + password and may have an
-- optional message_suffix that is appended (on a new line) to every message
-- they send manually. The very first user — auto-created from the APP_PASSWORD
-- env on a fresh DB — gets is_admin=1; admins can CRUD other users.
create table if not exists users (
  id integer primary key autoincrement,
  username text unique not null,
  password_hash text not null,
  message_suffix text not null default '',
  is_admin integer not null default 0,
  created_at text not null default (datetime('now'))
);

-- Web Push subscriptions per user. The browser hands us an endpoint + key
-- pair which we relay back via the standard Web Push protocol when there's
-- a new guest message.
create table if not exists push_subscriptions (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at text not null default (datetime('now'))
);
create index if not exists push_user_idx on push_subscriptions(user_id);

-- Server-side sessions keyed by a random token stored in the host's cookie.
create table if not exists sessions (
  token text primary key,
  user_id integer not null references users(id) on delete cascade,
  expires_at text not null,
  created_at text not null default (datetime('now'))
);

create index if not exists sessions_user_idx on sessions(user_id);
create index if not exists sessions_expires_idx on sessions(expires_at);

create table if not exists settings (
  id integer primary key check (id = 1),
  hostex_token text,
  hostex_webhook_secret text,
  llm_provider text not null default 'anthropic' check (llm_provider in ('anthropic','openai')),
  anthropic_model text not null default 'claude-sonnet-4-6',
  openai_model text not null default 'gpt-4o',
  auto_mode integer not null default 0,
  countdown_seconds integer not null default 15 check (countdown_seconds between 3 and 600),
  system_prompt text not null default 'You are a polite, concise short-term-rental host assistant. Reply in the same language the guest used.',
  updated_at text not null default (datetime('now'))
);

insert or ignore into settings (id) values (1);

create table if not exists properties (
  id text primary key,
  hostex_id text unique not null,
  name text,
  details_json text not null,
  custom_context text,
  updated_at text not null default (datetime('now'))
);

create table if not exists conversations (
  id text primary key,
  hostex_id text unique not null,
  guest_name text,
  property_hostex_id text,
  reservation_hostex_id text,
  channel_type text,
  check_in_date text,
  check_out_date text,
  last_message_at text,
  -- ISO timestamp the host last "read" this conversation. A conversation is
  -- considered unread when the latest non-system message arrived after this.
  last_read_at text,
  unread integer not null default 0,
  created_at text not null default (datetime('now'))
);

create index if not exists conversations_last_msg_idx on conversations(last_message_at desc);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  hostex_msg_id text unique,
  sender text not null check (sender in ('guest','host','system')),
  content text not null,
  attachment_url text,
  attachment_type text,
  sent_via text check (sent_via in ('hostex','ai-auto','ai-manual')),
  created_at text not null default (datetime('now'))
);

create index if not exists messages_conv_idx on messages(conversation_id, created_at);

create table if not exists drafts (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  trigger_message_id text references messages(id) on delete set null,
  primary_text text not null,
  alternative_text text not null,
  primary_stance text,
  alternative_stance text,
  primary_translation_zh text,
  alternative_translation_zh text,
  compose_prompt text,
  status text not null default 'pending' check (status in ('pending','sent','dismissed')),
  auto_send_at text,
  model_used text,
  created_at text not null default (datetime('now'))
);

create unique index if not exists drafts_one_pending_per_conv
  on drafts(conversation_id) where status = 'pending';

create index if not exists drafts_pending_idx
  on drafts(auto_send_at) where status = 'pending' and auto_send_at is not null;

-- Local cache of Hostex reservations, used to power local search (guest name,
-- phone, reservation code, etc.) without hitting Hostex API on every query.
-- Refreshed periodically by the cron job; rows older than ~60 days past
-- check_out are purged.
create table if not exists reservations_cache (
  reservation_code text primary key,
  property_hostex_id text,
  channel_type text,
  status text,
  stay_status text,
  guest_name text,
  guest_phone text,
  guest_email text,
  check_in_date text,
  check_out_date text,
  data_json text not null,
  fetched_at text not null default (datetime('now'))
);
create index if not exists reservations_cache_property_idx
  on reservations_cache(property_hostex_id, check_in_date);
create index if not exists reservations_cache_dates_idx
  on reservations_cache(check_out_date);
create index if not exists reservations_cache_guest_idx
  on reservations_cache(guest_name);

-- Per-conversation in-progress UI input state (Telegram-style synced drafts).
-- Each row tracks whatever the host is typing across the various input boxes;
-- changes are PATCHed with debounce and broadcast via SSE so other open tabs
-- / devices stay in sync.
create table if not exists conversation_drafts (
  conversation_id text primary key references conversations(id) on delete cascade,
  compose_prompt text not null default '',     -- ComposePanel main textarea
  preset_label text not null default '',       -- active "requires input" preset
  preset_input text not null default '',       -- value typed for that preset
  edit_draft_id text,                          -- which AI draft the edit_text applies to
  edit_text text not null default '',          -- in-progress edit of the chosen candidate
  edit_choice text not null default 'primary', -- which candidate the host had selected
  regen_guidance text not null default '',     -- regenerate input box
  updated_at text not null default (datetime('now'))
);
