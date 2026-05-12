import path from "node:path";
import { getDb } from "./client";

/** Absolute path of the SQLite database file on disk. */
export function getDbFilePath(): string {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(process.cwd(), "data", "app.db");
}

/**
 * Ensure WAL contents are merged into the main DB file so a raw file read
 * reflects the latest committed state. Returns false on failure (call sites
 * should still try the read).
 */
export function checkpointWal(): boolean {
  try {
    getDb().pragma("wal_checkpoint(TRUNCATE)");
    return true;
  } catch (err) {
    console.error("[export] wal_checkpoint failed", err);
    return false;
  }
}

/**
 * Dump every user table to a JSON object suitable for transfer between hosts.
 *
 * - `data_json` columns (stored as TEXT) are parsed back to objects so the
 *   output is fully structured.
 * - Tables are listed in a stable order so diffs across exports stay readable.
 */
export function exportToJson(): {
  exported_at: string;
  schema_version: number;
  tables: Record<string, unknown[]>;
} {
  const db = getDb();
  const userVersion = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  const tables: Record<string, unknown[]> = {};
  const order: Array<{ name: string; jsonCols?: string[] }> = [
    { name: "settings" },
    { name: "properties", jsonCols: ["details_json"] },
    { name: "conversations" },
    { name: "messages" },
    { name: "drafts" },
    { name: "reservations_cache", jsonCols: ["data_json"] },
    { name: "conversation_drafts" },
  ];
  for (const { name, jsonCols } of order) {
    try {
      const rows = db.prepare(`select * from ${name}`).all() as Array<Record<string, unknown>>;
      if (jsonCols && jsonCols.length > 0) {
        for (const r of rows) {
          for (const c of jsonCols) {
            if (typeof r[c] === "string") {
              try { r[c] = JSON.parse(r[c] as string); } catch { /* leave as string */ }
            }
          }
        }
      }
      tables[name] = rows;
    } catch (err) {
      console.warn(`[export] skipping ${name}:`, err);
      tables[name] = [];
    }
  }
  return {
    exported_at: new Date().toISOString(),
    schema_version: userVersion,
    tables,
  };
}
