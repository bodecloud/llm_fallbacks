/**
 * Per-request ordered hop trail for Wave 6A failover timeline (R61, R63).
 * Client-only — no new proxy logging backend (R64).
 */
import type { TierId } from "./tiers/types";

export type HopOutcome = "success" | "skip" | "error";

export interface RouteHop {
  tier: TierId;
  endpoint?: string;
  model?: string;
  outcome: HopOutcome;
  /** Short error taxonomy when outcome is error/skip (e.g. cold_start, skip). */
  errorClass?: string;
  /** Human-readable skip/error reason (R63). */
  reason?: string;
  hopIndex: number;
  ms?: number;
}

export type RouteHopInput = Omit<RouteHop, "hopIndex"> & { hopIndex?: number };

export class RouteTrace {
  private readonly hops: RouteHop[] = [];
  private nextIndex = 0;

  record(input: RouteHopInput): RouteHop {
    const hopIndex = input.hopIndex ?? this.nextIndex;
    this.nextIndex = Math.max(this.nextIndex, hopIndex + 1);
    const hop: RouteHop = { ...input, hopIndex };
    this.hops.push(hop);
    return hop;
  }

  hasTier(tier: TierId): boolean {
    return this.hops.some((h) => h.tier === tier);
  }

  snapshot(): RouteHop[] {
    return this.hops.map((h) => ({ ...h }));
  }

  get length(): number {
    return this.hops.length;
  }
}

/** Map a thrown error to a short errorClass for timeline pills. */
export function classifyHopError(err: unknown): string {
  if (err && typeof err === "object" && "kind" in err && typeof (err as { kind: unknown }).kind === "string") {
    return (err as { kind: string }).kind;
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (/429|rate limit/i.test(msg)) return "rate_limit";
    if (/quota|credit|exhausted/i.test(msg)) return "quota";
    if (/503|502|cold start|unavailable/i.test(msg)) return "cold_start";
    if (/401|403|auth|turnstile/i.test(msg)) return "auth";
  }
  return "error";
}
