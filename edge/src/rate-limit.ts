import type { Env } from "./types";

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; scope: "minute" | "day" };

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function minuteWindowStart(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / (windowSeconds * 1000));
}

export function rateLimitConfig(env: Env): {
  perMinute: number;
  perDay: number;
  windowSeconds: number;
} {
  const perMinute = parseInt(env.RATE_LIMIT_PER_MINUTE || "30", 10);
  const perDay = parseInt(env.RATE_LIMIT_PER_DAY || "300", 10);
  const windowSeconds = parseInt(env.RATE_LIMIT_WINDOW_SECONDS || "60", 10);
  return {
    perMinute: Number.isFinite(perMinute) && perMinute > 0 ? perMinute : 30,
    perDay: Number.isFinite(perDay) && perDay > 0 ? perDay : 300,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 60,
  };
}

export async function checkRateLimit(request: Request, env: Env): Promise<RateLimitResult> {
  if (!env.METRICS_KV) {
    return { allowed: true };
  }

  const ip = clientIp(request);
  const { perMinute, perDay, windowSeconds } = rateLimitConfig(env);
  const now = Date.now();
  const minuteKey = `rl:min:${minuteWindowStart(now, windowSeconds)}:${ip}`;
  const dayKey = `rl:day:${new Date(now).toISOString().slice(0, 10)}:${ip}`;

  const [minuteRaw, dayRaw] = await Promise.all([
    env.METRICS_KV.get(minuteKey),
    env.METRICS_KV.get(dayKey),
  ]);

  const minuteCount = parseInt(minuteRaw || "0", 10);
  const dayCount = parseInt(dayRaw || "0", 10);

  if (dayCount >= perDay) {
    return { allowed: false, retryAfterSeconds: 3600, scope: "day" };
  }

  if (minuteCount >= perMinute) {
    return { allowed: false, retryAfterSeconds: windowSeconds, scope: "minute" };
  }

  await Promise.all([
    env.METRICS_KV.put(minuteKey, String(minuteCount + 1), { expirationTtl: windowSeconds + 5 }),
    env.METRICS_KV.put(dayKey, String(dayCount + 1), { expirationTtl: 86_400 }),
  ]);

  return { allowed: true };
}
