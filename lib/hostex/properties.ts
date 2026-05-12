import { hostex } from "./client";

export type HostexProperty = {
  id: string | number;
  name?: string;
  title?: string;
  [k: string]: unknown;
};

type ListPropertiesResp = {
  data?: { properties?: HostexProperty[]; total?: number } | HostexProperty[];
  properties?: HostexProperty[];
  total?: number;
};

function extractList(resp: ListPropertiesResp): HostexProperty[] {
  if (Array.isArray(resp?.data)) return resp.data as HostexProperty[];
  const inData = (resp?.data as { properties?: HostexProperty[] } | undefined)?.properties;
  return inData ?? resp?.properties ?? [];
}

export async function listProperties(): Promise<HostexProperty[]> {
  // Hostex paginates with offset/limit. Limit caps at 100. Walk pages until
  // we get a short page back.
  const PAGE = 100;
  const all: HostexProperty[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const resp = await hostex<ListPropertiesResp>("/properties", {
      query: { offset, limit: PAGE },
    });
    const page = extractList(resp);
    all.push(...page);
    if (page.length < PAGE) break;
    if (offset > 10_000) break; // safety
  }
  return all;
}

/** Format property details into a compact LLM context block. */
export function formatPropertyContext(p: HostexProperty | null): string {
  if (!p) return "(no property context available)";
  const name = (p.name ?? p.title ?? `Property ${p.id}`) as string;
  const interesting = [
    "address",
    "city",
    "country",
    "check_in_time",
    "check_out_time",
    "max_guests",
    "bedrooms",
    "bathrooms",
    "wifi_name",
    "wifi_password",
    "house_rules",
    "amenities",
    "description",
    "cancellation_policy",
    "self_check_in",
  ];
  const lines: string[] = [`# Property: ${name} (id=${p.id})`];
  for (const key of interesting) {
    const v = (p as Record<string, unknown>)[key];
    if (v == null || v === "") continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    lines.push(`- ${key}: ${s.length > 500 ? s.slice(0, 500) + "…" : s}`);
  }
  return lines.join("\n");
}
