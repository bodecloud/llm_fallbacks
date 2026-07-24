import { corsHeaders, jsonError, unauthorized } from "./http";
import { checkRateLimit } from "./rate-limit";
import type { Env } from "./types";

export const ALLOWED_EVENTS = new Set([
  "homepage_session",
  "chat_completion_success",
  "zero_config_reply",
  "dark_theme_loaded",
]);

export type AllowedEvent = typeof ALLOWED_EVENTS extends Set<infer T> ? T : never;

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function counterKey(day: string, event: string): string {
  return `day:${day}:event:${event}`;
}

export function parseEventBody(raw: unknown): { event: string; route?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { event?: unknown; route?: unknown };
  if (typeof obj.event !== "string" || !ALLOWED_EVENTS.has(obj.event)) return null;
  const route = typeof obj.route === "string" ? obj.route.slice(0, 16) : undefined;
  return { event: obj.event, route };
}

export async function incrementEventCounter(env: Env, event: string, day = utcDayKey()): Promise<void> {
  if (!env.METRICS_KV) return;
  const key = counterKey(day, event);
  const current = parseInt((await env.METRICS_KV.get(key)) || "0", 10);
  await env.METRICS_KV.put(key, String(Number.isFinite(current) ? current + 1 : 1));
}

export async function readEventCounts(env: Env, days: string[]): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  if (!env.METRICS_KV) return totals;

  for (const day of days) {
    for (const event of ALLOWED_EVENTS) {
      const value = parseInt((await env.METRICS_KV.get(counterKey(day, event))) || "0", 10);
      if (value > 0) {
        totals[event] = (totals[event] || 0) + value;
      }
    }
  }
  return totals;
}

export function recentUtcDays(count: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  for (let i = 0; i < count; i += 1) {
    days.push(utcDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function authorized(request: Request, env: Env, bodyToken?: string): boolean {
  const auth = request.headers.get("Authorization") ?? "";
  const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const token = headerToken || bodyToken || "";
  return Boolean(env.PROXY_GUEST_TOKEN && token === env.PROXY_GUEST_TOKEN);
}

export async function handleEventsPost(
  request: Request,
  env: Env,
  origin: string | null,
  allowed: string[],
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400, origin, allowed);
  }

  const bodyToken =
    body && typeof body === "object" && typeof (body as { token?: unknown }).token === "string"
      ? (body as { token: string }).token
      : undefined;

  if (!authorized(request, env, bodyToken)) {
    return unauthorized(origin, allowed);
  }

  const rate = await checkRateLimit(request, env);
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({
        error: {
          message: `Rate limit exceeded (${rate.scope}). Try again later.`,
          type: "rate_limit",
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rate.retryAfterSeconds),
          ...corsHeaders(origin, allowed),
        },
      },
    );
  }

  const parsed = parseEventBody(body);
  if (!parsed) {
    return jsonError("Unknown or missing event", 400, origin, allowed);
  }

  await incrementEventCounter(env, parsed.event);
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, allowed),
  });
}

export async function handleMetricsGet(
  request: Request,
  env: Env,
  origin: string | null,
  allowed: string[],
): Promise<Response> {
  if (!authorized(request, env)) {
    return unauthorized(origin, allowed);
  }

  const url = new URL(request.url);
  const daysParam = parseInt(url.searchParams.get("days") || "1", 10);
  const days = recentUtcDays(Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 30) : 1);
  const events = await readEventCounts(env, days);

  return new Response(
    JSON.stringify({
      days,
      events,
      kv_enabled: Boolean(env.METRICS_KV),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowed) },
    },
  );
}
