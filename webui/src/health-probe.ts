export type HealthState = "ok" | "slow" | "fail";

export interface HealthProbeResult {
  state: HealthState;
  ms: number;
  statusCode?: number;
  authFailure?: boolean;
}

const SLOW_MS = 2000;
const TIMEOUT_MS = 5000;

export function healthPathForBase(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  try {
    const host = new URL(trimmed).hostname;
    if (host.includes("onrender.com")) {
      return `${trimmed}/health/liveliness`;
    }
  } catch {
    /* invalid URL — fall through */
  }
  return `${trimmed}/health`;
}

export async function probeEndpoint(
  base: string,
  fetchFn: typeof fetch = fetch
): Promise<HealthProbeResult> {
  const url = healthPathForBase(base);
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetchFn(url, { method: "GET", signal: controller.signal, mode: "cors" });
    const ms = Date.now() - start;
    clearTimeout(timeout);

    if (res.status === 401 || res.status === 403) {
      return { state: "fail", ms, statusCode: res.status, authFailure: true };
    }
    if (!res.ok) {
      return { state: "fail", ms, statusCode: res.status };
    }
    if (ms > SLOW_MS) {
      return { state: "slow", ms, statusCode: res.status };
    }
    return { state: "ok", ms, statusCode: res.status };
  } catch {
    clearTimeout(timeout);
    return { state: "fail", ms: Date.now() - start };
  }
}

export async function probeEndpoints(
  bases: string[],
  fetchFn: typeof fetch = fetch
): Promise<Map<string, HealthProbeResult>> {
  const results = new Map<string, HealthProbeResult>();
  await Promise.all(
    bases.map(async (base) => {
      results.set(base, await probeEndpoint(base, fetchFn));
    })
  );
  return results;
}
