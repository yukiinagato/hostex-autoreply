import { cookies, headers } from "next/headers";
import {
  createSession,
  deleteSession,
  getUserBySessionToken,
  getUserByUsername,
  verifyPassword,
} from "@/lib/db/users";
import type { User } from "@/lib/db/types";

const COOKIE = "hxar_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function isHttpsRequest(): Promise<boolean> {
  const h = await headers();
  return (
    h.get("x-forwarded-proto") === "https" ||
    h.get("x-forwarded-ssl") === "on"
  );
}

/** Returns the logged-in user or null. */
export async function currentUser(): Promise<User | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  return getUserBySessionToken(token);
}

/** Returns true if there's a logged-in user. */
export async function isAuthenticated(): Promise<boolean> {
  return (await currentUser()) !== null;
}

/** Validate credentials and set the session cookie. Returns the user on success, null on failure. */
export async function login(username: string, password: string): Promise<User | null> {
  const u = getUserByUsername(username);
  if (!u) return null;
  if (!verifyPassword(password, u.password_hash)) return null;

  const session = createSession(u.id);

  const secure = await isHttpsRequest();
  const c = await cookies();
  c.set(COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return {
    id: u.id,
    username: u.username,
    message_suffix: u.message_suffix,
    is_admin: u.is_admin,
    created_at: u.created_at,
  };
}

/** Tear down the current session (server-side row + cookie). */
export async function logout(): Promise<void> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) deleteSession(token);
  c.delete(COOKIE);
}

/** Require admin or throw a friendly Response. */
export async function requireAdmin(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new Response("unauthorized", { status: 401 });
  if (!u.is_admin) throw new Response("forbidden", { status: 403 });
  return u;
}
