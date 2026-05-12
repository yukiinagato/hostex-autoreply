import crypto from "node:crypto";
import { getDb } from "./client";
import type { Session, User, UserWithHash } from "./types";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ----- password hashing (scrypt, no extra deps) -----

const SCRYPT_KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
  return `s1$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored.startsWith("s1$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [, salt, expected] = parts;
  try {
    const test = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(test, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ----- row mapper -----

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  message_suffix: string;
  is_admin: number;
  created_at: string;
};

const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  message_suffix: r.message_suffix,
  is_admin: !!r.is_admin,
  created_at: r.created_at,
});

const toUserWithHash = (r: UserRow): UserWithHash => ({ ...toUser(r), password_hash: r.password_hash });

// ----- user CRUD -----

export function countUsers(): number {
  return (getDb().prepare("select count(*) as n from users").get() as { n: number }).n;
}

export function listUsers(): User[] {
  const rows = getDb().prepare("select * from users order by id asc").all() as UserRow[];
  return rows.map(toUser);
}

export function getUserById(id: number): User | null {
  const row = getDb().prepare("select * from users where id = ?").get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function getUserByUsername(username: string): UserWithHash | null {
  const row = getDb()
    .prepare("select * from users where username = ?")
    .get(username) as UserRow | undefined;
  return row ? toUserWithHash(row) : null;
}

export function createUser(input: {
  username: string;
  password: string;
  message_suffix?: string;
  is_admin?: boolean;
}): User {
  const hash = hashPassword(input.password);
  const info = getDb()
    .prepare(
      `insert into users (username, password_hash, message_suffix, is_admin)
       values (?, ?, ?, ?)`,
    )
    .run(
      input.username,
      hash,
      input.message_suffix ?? "",
      input.is_admin ? 1 : 0,
    );
  return getUserById(Number(info.lastInsertRowid))!;
}

export function updateUser(id: number, patch: {
  username?: string;
  password?: string;
  message_suffix?: string;
  is_admin?: boolean;
}): User {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.username !== undefined) {
    fields.push("username = ?");
    values.push(patch.username);
  }
  if (patch.password !== undefined) {
    fields.push("password_hash = ?");
    values.push(hashPassword(patch.password));
  }
  if (patch.message_suffix !== undefined) {
    fields.push("message_suffix = ?");
    values.push(patch.message_suffix);
  }
  if (patch.is_admin !== undefined) {
    fields.push("is_admin = ?");
    values.push(patch.is_admin ? 1 : 0);
  }
  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`update users set ${fields.join(", ")} where id = ?`).run(...values);
  }
  return getUserById(id)!;
}

export function deleteUser(id: number): void {
  // Refuse to delete the last remaining admin.
  const admins = (
    getDb().prepare("select count(*) as n from users where is_admin = 1").get() as { n: number }
  ).n;
  const target = getUserById(id);
  if (target?.is_admin && admins <= 1) {
    throw new Error("无法删除最后一个管理员");
  }
  getDb().prepare("delete from users where id = ?").run(id);
}

// ----- sessions -----

export function createSession(userId: number): Session {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  getDb()
    .prepare("insert into sessions (token, user_id, expires_at) values (?, ?, ?)")
    .run(token, userId, expires);
  return { token, user_id: userId, expires_at: expires, created_at: new Date().toISOString() };
}

export function getUserBySessionToken(token: string): User | null {
  const row = getDb()
    .prepare(
      `select u.*
       from sessions s join users u on u.id = s.user_id
       where s.token = ? and s.expires_at > ?`,
    )
    .get(token, new Date().toISOString()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function deleteSession(token: string): void {
  getDb().prepare("delete from sessions where token = ?").run(token);
}

export function pruneExpiredSessions(): number {
  const r = getDb()
    .prepare("delete from sessions where expires_at <= ?")
    .run(new Date().toISOString());
  return r.changes;
}
