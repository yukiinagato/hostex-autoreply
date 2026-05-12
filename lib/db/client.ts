import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const file = process.env.DB_PATH ?? path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const instance = new Database(file);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");

  const schemaPath = path.join(process.cwd(), "lib", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  instance.exec(schema);

  // Lightweight idempotent migrations for already-existing DBs.
  runMigrations(instance);

  db = instance;
  return db;
}

function runMigrations(d: Database.Database) {
  const settingsCols = d.prepare("pragma table_info(settings)").all() as { name: string }[];
  if (!settingsCols.some((c) => c.name === "hostex_webhook_secret")) {
    d.exec("alter table settings add column hostex_webhook_secret text");
  }
  const convCols = d.prepare("pragma table_info(conversations)").all() as { name: string }[];
  const ensure = (col: string, def: string) => {
    if (!convCols.some((c) => c.name === col)) d.exec(`alter table conversations add column ${col} ${def}`);
  };
  ensure("channel_type", "text");
  ensure("check_in_date", "text");
  ensure("check_out_date", "text");

  const draftCols = d.prepare("pragma table_info(drafts)").all() as { name: string }[];
  const ensureDraft = (col: string, def: string) => {
    if (!draftCols.some((c) => c.name === col)) d.exec(`alter table drafts add column ${col} ${def}`);
  };
  ensureDraft("primary_translation_zh", "text");
  ensureDraft("alternative_translation_zh", "text");
  ensureDraft("compose_prompt", "text");

  const propCols = d.prepare("pragma table_info(properties)").all() as { name: string }[];
  if (!propCols.some((c) => c.name === "custom_context")) {
    d.exec("alter table properties add column custom_context text");
  }
}

export function newId(): string {
  // Simple UUID v4-ish (16 random bytes hex). crypto.randomUUID also works.
  return crypto.randomUUID();
}
