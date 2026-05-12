const BASE = process.env.HOSTEX_API_BASE ?? "https://api.hostex.io/v3";

export class HostexError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Hostex API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

type Opts = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  token?: string;
};

export async function hostex<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const token = opts.token ?? process.env.HOSTEX_ACCESS_TOKEN;
  if (!token) throw new Error("HOSTEX_ACCESS_TOKEN not set");

  const url = new URL(BASE.replace(/\/$/, "") + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "Hostex-Access-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) throw new HostexError(res.status, parsed);
  return parsed as T;
}
