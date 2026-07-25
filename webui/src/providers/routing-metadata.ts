import type { RouteHop } from "./route-trace";

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface CompletionMeta {
  endpoint: string;
  modelHeader?: string;
  fallbackCount: number;
  /** Server-reported duration when CORS-exposed (secondary to client totalMs). */
  durationMs?: number;
  messageId?: string;
  /** Ordered hop trail for the failover timeline (R61/R63). */
  trace?: RouteHop[];
  /** Token usage when the route exposes a usage chunk (R58); never fabricated. */
  usage?: TokenUsage;
  /** Client-measured time-to-first-token (R58). */
  ttftMs?: number;
  /** Client-measured total stream duration (R58). */
  totalMs?: number;
}

let lastCompletionMeta: CompletionMeta | null = null;

export const COMPLETION_META_EVENT = "llm-fallbacks:completion-meta";

export function setLastCompletionMeta(meta: CompletionMeta): void {
  lastCompletionMeta = meta;
  window.dispatchEvent(
    new CustomEvent(COMPLETION_META_EVENT, { detail: { ...meta } })
  );
}

export function getLastCompletionMeta(): CompletionMeta | null {
  return lastCompletionMeta;
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

export function formatRoutingChip(meta: CompletionMeta): string {
  const parts: string[] = [];
  if (meta.endpoint) {
    parts.push(hostnameFromUrl(meta.endpoint));
  }
  if (meta.modelHeader) {
    parts.push(meta.modelHeader);
  }
  if (meta.fallbackCount > 0) {
    parts.push(`${meta.fallbackCount} fallback${meta.fallbackCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ") || "—";
}

/** Compact collapsed badge: tokens when present, else TTFT · total (R58/R59). */
export function formatUsageBadge(meta: CompletionMeta): string {
  const latencyParts: string[] = [];
  if (meta.ttftMs !== undefined && Number.isFinite(meta.ttftMs)) {
    latencyParts.push(`TTFT ${Math.round(meta.ttftMs)}ms`);
  }
  const total = meta.totalMs ?? meta.durationMs;
  if (total !== undefined && Number.isFinite(total)) {
    latencyParts.push(`${Math.round(total)}ms`);
  }

  const usage = meta.usage;
  if (usage && (usage.promptTokens !== undefined || usage.completionTokens !== undefined)) {
    const inTok = usage.promptTokens ?? "?";
    const outTok = usage.completionTokens ?? "?";
    const tokenPart = `${inTok}→${outTok} tok`;
    return latencyParts.length ? `${tokenPart} · ${latencyParts.join(" · ")}` : tokenPart;
  }

  return latencyParts.join(" · ") || "";
}

export const FREE_ALIAS_NOTE =
  "`free` is our ranked quality-sorted alias; `openrouter/free` is OpenRouter's own meta-router.";
