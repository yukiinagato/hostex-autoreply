import { cookies } from "next/headers";

const COOKIE = "hxar_session";

export async function isAuthenticated(): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true; // no password set → open
  const c = await cookies();
  return c.get(COOKIE)?.value === expected;
}

export async function setAuthCookie(value: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected || value !== expected) return false;
  const c = await cookies();
  c.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export async function clearAuthCookie() {
  const c = await cookies();
  c.delete(COOKIE);
}
