import { corsHeaders, jsonError } from "./http";
import type { Env } from "./types";

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

type TurnstileVerifyResult = { success: boolean };

export async function checkTurnstile(
  request: Request,
  env: Env,
  origin: string | null,
  allowed: string[]
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!env.TURNSTILE_SECRET) {
    return { ok: true };
  }

  const ip = clientIp(request);
  const passKey = `ts:pass:${ip}`;

  if (env.METRICS_KV) {
    const existing = await env.METRICS_KV.get(passKey);
    if (existing === "1") {
      return { ok: true };
    }
  }

  const token = request.headers.get("CF-Turnstile-Response")?.trim() ?? "";
  if (!token) {
    return {
      ok: false,
      response: jsonError(
        "Turnstile verification required. Complete the check and try again.",
        403,
        origin,
        allowed
      ),
    };
  }

  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET,
      response: token,
      remoteip: ip,
    }),
  });

  let verified = false;
  try {
    const body = (await verifyRes.json()) as TurnstileVerifyResult;
    verified = Boolean(body.success);
  } catch {
    verified = false;
  }

  if (!verified) {
    return {
      ok: false,
      response: jsonError("Turnstile verification failed. Try again.", 403, origin, allowed),
    };
  }

  if (env.METRICS_KV) {
    await env.METRICS_KV.put(passKey, "1", { expirationTtl: 3600 });
  }

  return { ok: true };
}
