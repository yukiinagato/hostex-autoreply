/**
 * One-shot: pull properties from Hostex into the Supabase `properties` table.
 * Usage: npx tsx --env-file=.env.local scripts/sync-properties.ts
 */
import { listProperties } from "../lib/hostex/properties";
import { upsertProperty } from "../lib/db/queries";

async function main() {
  const props = await listProperties();
  console.log(`Fetched ${props.length} properties`);
  for (const p of props) {
    await upsertProperty({
      hostex_id: String(p.id),
      name: (p.name ?? p.title ?? null) as string | null,
      details_json: p as Record<string, unknown>,
    });
    console.log(`✓ ${p.id} ${p.name ?? p.title ?? ""}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
