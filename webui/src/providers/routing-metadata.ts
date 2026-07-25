export interface CompletionMeta {
  endpoint: string;
  modelHeader?: string;
  fallbackCount: number;
  durationMs?: number;
  messageId?: string;
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
