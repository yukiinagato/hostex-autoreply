# Hostex Auto-Reply

AI-assisted reply tool for [Hostex](https://hostex.io) short-term-rental conversations. Runs entirely on your own machine — SQLite for storage, in-process Server-Sent Events for live updates, no external database, no cloud dependency.

> [!WARNING]
> This is a single-tenant self-hosted tool. It stores guest conversations, names, phone numbers and email addresses in a local SQLite file. Don't expose the dev server to the public internet without putting a real reverse proxy + TLS in front of it, and never commit `data/` or `.env.local`.

## What it does

You connect it to your Hostex account via the Open API + webhooks. When a guest sends a message:

1. The webhook receiver upserts the conversation and the new message into local SQLite.
2. An LLM (Claude or GPT) reads the conversation history, the property facts, the current reservation, and your house rules / system prompt, and drafts **two candidate replies that take meaningfully different approaches** (e.g. accommodate vs. decline, answer directly vs. ask a clarifying question, walk-through vs. point to the check-in guide).
3. You review the two candidates, optionally edit, and send. The selected reply goes back to the guest via the Hostex API.
4. Optional **full-auto mode**: a configurable countdown auto-sends candidate A unless you cancel / edit / regenerate within the window.

It also lets you compose proactive messages with AI help (e.g. "we want to send a maintenance person to the room, get the guest's consent" → 7 preset scenarios including one that asks you for the reason inline → AI drafts two options).

## Features

- **Dual-candidate generation** with different *directions* (not just tone) — accommodate vs. decline, direct vs. ask-back, etc.
- **Bilingual preview** — for non-Chinese replies, a `中文翻译` is generated for your eyes only and is never sent to the guest.
- **Per-property notes** — `/settings/properties` lets you add free-text overrides (parking instructions, wifi quirks, neighborhood tips) that the AI uses as authoritative facts for that specific listing.
- **Property booking calendar** — collapsible sidebar widget per conversation, plus a full-screen multi-month view; bookings render as bands across days; click a band to see guest / nights / channel / host remarks.
- **Back-to-back warning** — if a guest brings up "early check-in" or "late check-out" and the prior/next night already has another booking, a banner highlights the conflict before you reply.
- **Stay-status quick-update** — flip `checkin_pending` / `in_house` / `stay_completed` from the conversation sidebar.
- **Fuzzy search** (⌘K / Ctrl+K) across properties, conversations, reservations and the last 60 days of message content. Filters out bookkeeping noise (`Source:`, `Channel:` etc.). Standalone `/search` page with pagination + per-type counts.
- **Property detail page** (`/properties/[hostex_id]`) — facts, host notes, calendar, recent reservations, linked conversations.
- **Mobile-friendly** — single-pane on phones with a back button, two-pane on desktop, independent scroll for thread / draft / info panels.
- **Telegram-style synced input drafts** — what you type in the compose / edit / regenerate boxes is persisted server-side and SSE-synced. Reload the page or open the same conversation on another device and your in-progress text is still there.
- **Hot data + cold storage in one place** — every reservation seen in the past 30 days / next 90 days is cached locally so search, calendar and the property page work instantly. Background cron prunes cache rows older than 60 days.
- **Local data export** — one click in Settings downloads the entire SQLite file (for migration) or a structured JSON dump (for cross-tool backup).
- **Provider-agnostic LLM** — switch between Anthropic Claude and OpenAI GPT in Settings. The model list is pulled live from each provider's `/models` endpoint.
- **Anthropic prompt caching** — system + property block use `cache_control: ephemeral` so repeated calls within 5 minutes pay only a cache-read.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS
- SQLite via `better-sqlite3` — single file at `./data/app.db`
- Server-Sent Events for realtime UI (no extra broker)
- `@anthropic-ai/sdk` and/or `openai`
- Hostex Open API + webhooks, with a polling fallback cron

Everything runs in a single Node process. No external DB, no Redis, no queue.

## Setup

```bash
git clone <this-repo> hostex-autoreply
cd hostex-autoreply
cp .env.example .env.local        # fill in the required values (see below)
pnpm install                       # or npm install
pnpm dev                           # or npm run dev
```

Visit http://localhost:3000 and sign in with `APP_PASSWORD`. The SQLite file and schema are created automatically on first request (file lives at `./data/app.db`; override with `DB_PATH`).

### Environment variables

See `.env.example`. The required ones:

| Variable | Purpose |
|---|---|
| `HOSTEX_ACCESS_TOKEN` | from hostex.io/app/api/open-api |
| `HOSTEX_API_BASE` | usually `https://api.hostex.io/v3` |
| `ANTHROPIC_API_KEY` | set this and/or… |
| `OPENAI_API_KEY` | …this, depending on the provider you want to use |
| `APP_PASSWORD` | login gate for the web UI |
| `CRON_SECRET` | shared secret for the cron endpoints |
| `DB_PATH` | optional, defaults to `./data/app.db` |

No `HOSTEX_WEBHOOK_SECRET` env var is needed — Hostex sends a per-URL token in the `Hostex-Webhook-Secret-Token` header; the app records it on the first request and verifies subsequent ones against the stored value.

### Pull property data

```bash
pnpm sync-properties
```

Walks `/properties` from Hostex (paginated) into the local `properties` table. Re-run any time listings change. There's also a cron route at `GET /api/cron/sync-properties?secret=$CRON_SECRET` you can schedule daily.

### Webhook setup

Hostex doesn't expose a public API for webhook registration — you add it in the dashboard:

1. Expose `/api/hostex/webhook` to the public internet. For dev: `ngrok http 3000` and use the HTTPS URL.
2. https://hostex.io/app/api/open-api → Webhooks → **+ Add new**.
3. URL: `https://your-public-host/api/hostex/webhook`. Subscribe to at least `message_created`.
4. Hostex generates and sends a per-URL secret token in the header of every request. The app captures it on first request (look for `[webhook] learned secret token from first request` in dev logs). Subsequent requests are timing-safe compared.

To re-bind to a new token (e.g. you re-created the webhook):

```bash
sqlite3 data/app.db "update settings set hostex_webhook_secret = null where id = 1;"
```

### Polling fallback / auto-send sweeper

`GET /api/cron/poll?secret=$CRON_SECRET` does three jobs:

- **Sweep:** sends any pending draft whose `auto_send_at` has passed (full-auto mode).
- **Poll:** pulls recent conversations from Hostex and ingests messages missed by the webhook.
- **Reservations sync:** every ~30 min, fires a background pull of `[today-30d, today+90d]` reservations per property and prunes rows >60 days past check-out.

Hit it every 5–10 seconds. For local-only setups:

```bash
# in a separate terminal, while `pnpm dev` is running
while true; do
  curl -s "http://localhost:3000/api/cron/poll?secret=$CRON_SECRET" > /dev/null
  sleep 5
done
```

The DraftPanel UI also fires the auto-send client-side as a backup, so a missed cron tick won't break the countdown when the tab is open.

## Verifying end-to-end

1. `pnpm dev` and `ngrok http 3000` in another terminal.
2. Register the webhook in the Hostex dashboard.
3. Send yourself a guest message via Hostex. Within seconds:
   - Conversation appears in the inbox (auto-refreshed via SSE).
   - Two AI candidate replies appear in the draft panel.
   - In full-auto mode, the countdown ring runs; click anywhere to cancel / edit / regenerate.
4. Click Send → the reply hits Hostex (`POST /v3/conversations/{id}` with `{ message: ... }`) and the guest sees it.

## Migrating to a new machine

In Settings there's a "数据导出 / Data export" section:

1. Click **Download SQLite database (.db)** to grab the entire DB file.
2. On the new machine: stop the server, replace `data/app.db` with the downloaded file, start the server.

The schema migration in `lib/db/client.ts` is idempotent — opening the file on a newer code revision adds any new columns automatically without touching your data.

## File map

```
app/
  (app)/                Authenticated routes (with shared sidebar + header)
    page.tsx            Inbox empty state
    conversations/[id]  Thread, draft panel, info panel
    properties/[id]     Property detail page with calendar + recent reservations
    settings/           Mode / model / system prompt
    settings/properties Per-property note editor
    search/             Paginated search results page
  api/                  Route handlers (webhook, drafts, cron, settings, events,
                        conversations, properties, search, calendar, admin/export, …)
  login/                Single-password gate
components/             Sidebar, Thread, DraftPanel, ComposePanel, InfoPanel,
                        CountdownRing, Calendar, SearchModal, SearchPageInput,
                        BackToBackWarning, ExportCard, SettingsForm, …
lib/
  hostex/               Hostex API client + helpers, webhook signature, sync,
                        calendar, reservations
  llm/                  Provider abstraction (Anthropic, OpenAI), prompts,
                        list-models, translate (fallback Chinese translation)
  db/
    schema.sql          Authoritative schema (auto-applied on first DB open)
    client.ts           better-sqlite3 singleton + idempotent migrations
    queries.ts          Typed query helpers
    reservations-cache.ts Local reservation cache + adjacency lookup
    search.ts           Cross-entity fuzzy search
    export.ts           DB checkpoint + JSON dump for migration
    types.ts            Shared TypeScript types
  events.ts             In-process SSE event bus
  draft-engine.ts       Build LLM context + create/replace pending draft
  context-loader.ts     Single source of truth for "all data about a conversation"
  auth.ts               Password cookie
scripts/                sync-properties one-shot
data/                   SQLite DB (created on first run, gitignored)
```

## Caveats and known gotchas

- The SSE event bus is in-process. Works perfectly on a single Node worker. If you fork to multiple workers, swap `lib/events.ts` for Redis pub/sub or similar.
- Hostex's webhook payload schema isn't fully documented publicly — the receiver handles the shape observed in practice (a thin notification with `conversation_id` + `message_id`; we then `GET /v3/conversations/{id}` for the body).
- Hostex's `/v3/reservations` filter caps at ~180 days per call; the calendar fetcher chunks longer ranges into 150-day windows and dedupes.
- The LLM is instructed to return strict JSON. We retry once on parse failure; a hard failure surfaces in the API response and the draft is not created.
- Passport / ID photos uploaded by guests are not exposed in the Hostex reservation API — only `id_type` and `id_number` text fields. To view photos, follow the `check_in_guide_url` in the reservation panel.

## License

MIT. See [LICENSE](LICENSE).
