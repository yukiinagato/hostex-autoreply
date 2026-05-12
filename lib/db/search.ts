import { getDb } from "./client";

export type SearchHitType = "property" | "conversation" | "reservation" | "message";

export type SearchHit = {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  href: string;
  meta?: Record<string, string | number | null>;
  score: number;
};

export type SearchResult = {
  hits: SearchHit[];
  total: number;
  countsByType: Record<SearchHitType, number>;
};

/**
 * Cross-entity fuzzy search. Splits the query by whitespace; every term must
 * appear (case-insensitive, substring) in the searchable fields (AND across
 * terms).
 *
 * Excludes system / bookkeeping messages ("Source:" / "Channel:" / etc.) from
 * the message hits.
 */
export function search(
  rawQuery: string,
  opts: { limit?: number; offset?: number } = {},
): SearchResult {
  const q = rawQuery.trim();
  if (!q) return empty();
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (terms.length === 0) return empty();

  const all: SearchHit[] = [];
  all.push(...searchProperties(terms));
  all.push(...searchReservations(terms));
  all.push(...searchConversations(terms));
  all.push(...searchMessages(terms));
  all.sort((a, b) => b.score - a.score);

  const counts: Record<SearchHitType, number> = {
    property: 0, reservation: 0, conversation: 0, message: 0,
  };
  for (const h of all) counts[h.type]++;

  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.max(1, Math.min(200, opts.limit ?? 30));
  return { hits: all.slice(offset, offset + limit), total: all.length, countsByType: counts };
}

function empty(): SearchResult {
  return { hits: [], total: 0, countsByType: { property: 0, reservation: 0, conversation: 0, message: 0 } };
}

function termsMatch(haystack: string, terms: string[]): { matched: boolean; matches: number } {
  const h = haystack.toLowerCase();
  let matches = 0;
  for (const t of terms) if (h.includes(t.toLowerCase())) matches++;
  return { matched: matches === terms.length, matches };
}

function snippetAround(text: string, terms: string[], window = 60): string {
  const lc = text.toLowerCase();
  let earliest = -1;
  for (const t of terms) {
    const i = lc.indexOf(t.toLowerCase());
    if (i >= 0 && (earliest < 0 || i < earliest)) earliest = i;
  }
  if (earliest < 0) return text.slice(0, window * 2);
  const start = Math.max(0, earliest - window);
  const end = Math.min(text.length, earliest + window);
  let s = text.slice(start, end).replace(/\s+/g, " ");
  if (start > 0) s = "…" + s;
  if (end < text.length) s = s + "…";
  return s;
}

function searchProperties(terms: string[]): SearchHit[] {
  const rows = getDb()
    .prepare(
      `select id, hostex_id, name, details_json, custom_context from properties limit 1000`,
    )
    .all() as Array<{
      id: string;
      hostex_id: string;
      name: string | null;
      details_json: string;
      custom_context: string | null;
    }>;
  const out: SearchHit[] = [];
  for (const p of rows) {
    let details: Record<string, unknown> = {};
    try { details = JSON.parse(p.details_json); } catch {}
    const address = typeof details.address === "string" ? details.address : "";
    const city = typeof details.city === "string" ? details.city : "";
    const haystack = [p.name ?? "", p.hostex_id, address, city, p.custom_context ?? ""].join(" \n ");
    const m = termsMatch(haystack, terms);
    if (!m.matched) continue;
    let score = m.matches * 10;
    if (p.name && termsMatch(p.name, terms).matches > 0) score += 50;
    out.push({
      type: "property",
      id: p.hostex_id,
      title: p.name ?? `房源 ${p.hostex_id}`,
      subtitle: [city, address].filter(Boolean).join(" · ") || `编号 ${p.hostex_id}`,
      href: `/properties/${encodeURIComponent(p.hostex_id)}`,
      score,
    });
  }
  return out;
}

function searchReservations(terms: string[]): SearchHit[] {
  const rows = getDb()
    .prepare(
      `select rc.*, p.name as property_name
       from reservations_cache rc
       left join properties p on p.hostex_id = rc.property_hostex_id
       where rc.check_out_date is null
          or rc.check_out_date >= date('now', '-60 days')
       order by rc.check_in_date desc
       limit 5000`,
    )
    .all() as Array<{
      reservation_code: string;
      property_hostex_id: string | null;
      property_name: string | null;
      channel_type: string | null;
      status: string | null;
      stay_status: string | null;
      guest_name: string | null;
      guest_phone: string | null;
      guest_email: string | null;
      check_in_date: string | null;
      check_out_date: string | null;
    }>;
  const out: SearchHit[] = [];
  for (const r of rows) {
    const haystack = [
      r.reservation_code,
      r.guest_name ?? "",
      r.guest_phone ?? "",
      r.guest_email ?? "",
      r.channel_type ?? "",
      r.property_name ?? "",
      r.property_hostex_id ?? "",
      r.check_in_date ?? "",
      r.check_out_date ?? "",
    ].join(" \n ");
    const m = termsMatch(haystack, terms);
    if (!m.matched) continue;
    let score = m.matches * 12;
    if (r.guest_name && termsMatch(r.guest_name, terms).matches > 0) score += 40;
    if (termsMatch(r.reservation_code, terms).matches > 0) score += 30;
    out.push({
      type: "reservation",
      id: r.reservation_code,
      title: r.guest_name ?? r.reservation_code,
      subtitle: [
        r.property_name ?? r.property_hostex_id,
        r.check_in_date && r.check_out_date ? `${r.check_in_date} → ${r.check_out_date}` : "",
        r.channel_type,
      ].filter(Boolean).join(" · "),
      href: r.property_hostex_id
        ? `/properties/${encodeURIComponent(r.property_hostex_id)}#${r.reservation_code}`
        : `/`,
      meta: {
        phone: r.guest_phone,
        email: r.guest_email,
        status: r.status,
      },
      score,
    });
  }
  return out;
}

function searchConversations(terms: string[]): SearchHit[] {
  const rows = getDb()
    .prepare(
      `select c.id, c.hostex_id, c.guest_name, c.channel_type,
              c.check_in_date, c.check_out_date, c.reservation_hostex_id,
              p.name as property_name
       from conversations c
       left join properties p on p.hostex_id = c.property_hostex_id
       order by c.last_message_at desc
       limit 2000`,
    )
    .all() as Array<{
      id: string;
      hostex_id: string;
      guest_name: string | null;
      channel_type: string | null;
      check_in_date: string | null;
      check_out_date: string | null;
      reservation_hostex_id: string | null;
      property_name: string | null;
    }>;
  const out: SearchHit[] = [];
  for (const c of rows) {
    const haystack = [
      c.hostex_id,
      c.guest_name ?? "",
      c.channel_type ?? "",
      c.property_name ?? "",
      c.reservation_hostex_id ?? "",
    ].join(" \n ");
    const m = termsMatch(haystack, terms);
    if (!m.matched) continue;
    const score = m.matches * 8;
    out.push({
      type: "conversation",
      id: c.id,
      title: c.guest_name ?? `对话 ${c.hostex_id}`,
      subtitle: [c.property_name, c.channel_type, c.check_in_date && c.check_out_date ? `${c.check_in_date} → ${c.check_out_date}` : ""]
        .filter(Boolean).join(" · "),
      href: `/conversations/${c.id}`,
      score,
    });
  }
  return out;
}

function searchMessages(terms: string[]): SearchHit[] {
  const db = getDb();
  const where = terms.map(() => "lower(content) like ?").join(" and ");
  const params = terms.map((t) => `%${t.toLowerCase()}%`);
  // Exclude system messages AND any bookkeeping/auto-injected metadata that
  // sneaked in as guest/host. Hostex sends single-line "Source: ..." /
  // "Channel: ..." rows; we filter both via sender flag and content prefix
  // for safety on older rows.
  const rows = db
    .prepare(
      `select m.id, m.conversation_id, m.sender, m.content, m.created_at,
              c.guest_name, c.hostex_id as conv_hostex_id, p.name as property_name
       from messages m
       join conversations c on c.id = m.conversation_id
       left join properties p on p.hostex_id = c.property_hostex_id
       where m.sender != 'system'
         and m.content not like 'Source:%'
         and m.content not like 'Channel:%'
         and m.content not like 'Inquiry_source:%'
         and m.content not like 'Origin:%'
         and m.created_at >= datetime('now', '-60 days')
         and ${where}
       order by m.created_at desc
       limit 500`,
    )
    .all(...params) as Array<{
      id: string;
      conversation_id: string;
      sender: string;
      content: string;
      created_at: string;
      guest_name: string | null;
      conv_hostex_id: string;
      property_name: string | null;
    }>;
  return rows.map((m) => ({
    type: "message" as const,
    id: m.id,
    title: `${m.sender === "guest" ? "客户" : "房东"} · ${m.guest_name ?? m.conv_hostex_id}`,
    subtitle: [m.property_name, new Date(m.created_at).toLocaleString("zh-CN")].filter(Boolean).join(" · "),
    snippet: snippetAround(m.content, terms),
    href: `/conversations/${m.conversation_id}`,
    score: terms.length * 5,
  }));
}
