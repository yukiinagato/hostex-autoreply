import { login } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!username || !password) {
    return new Response(null, { status: 303, headers: { Location: "/login?error=1" } });
  }
  const user = await login(username, password);
  const location = user ? "/" : "/login?error=1";
  return new Response(null, { status: 303, headers: { Location: location } });
}
