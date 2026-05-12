import { setAuthCookie } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Login via password. Uses relative-path redirects so that the browser
 * resolves them against the URL in its address bar (ngrok host, public IPv6,
 * etc.) instead of whatever Next.js thinks the absolute origin is — which is
 * `http://localhost:3000` when behind ngrok.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const ok = await setAuthCookie(password);
  const location = ok ? "/" : "/login?error=1";
  return new Response(null, { status: 303, headers: { Location: location } });
}
