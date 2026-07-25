import type { CatalogEntry } from "./providers/browser-router";

/** Fired when the active chat model changes (picker, explorer, etc.). */
export const MODEL_CHANGED_EVENT = "llm-fallbacks:model-changed";

const PINNED_MODELS: { id: string; label: string }[] = [
  { id: "free", label: "free (ranked alias)" },
  { id: "openrouter/free", label: "openrouter/free (OpenRouter router)" },
];

let sessionModel: string | null = null;
let catalogRef: CatalogEntry[] = [];

export function initModelSelection(catalog: CatalogEntry[]): void {
  catalogRef = catalog;
  if (sessionModel === null) {
    sessionModel = "free";
  }
}

export function setCatalogRef(catalog: CatalogEntry[]): void {
  catalogRef = catalog;
}

/** Active model for this session; falls back to `free`. Failover panel defaultModel applies only when unset. */
export function getActiveModel(fallbackDefault = "free"): string {
  return sessionModel ?? fallbackDefault;
}

export function setActiveModel(id: string): void {
  const trimmed = id.trim();
  if (!trimmed) return;
  sessionModel = trimmed;
  window.dispatchEvent(
    new CustomEvent(MODEL_CHANGED_EVENT, { detail: { modelId: trimmed } })
  );
}

export function getPinnedModels(): readonly { id: string; label: string }[] {
  return PINNED_MODELS;
}

/** Top catalog entries by quality_score for the composer picker (max 50). */
export function getCatalogModels(limit = 50): CatalogEntry[] {
  const sorted = [...catalogRef].sort(
    (a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0)
  );
  return sorted.slice(0, limit);
}

export function modelOptionLabel(entry: CatalogEntry): string {
  const score =
    entry.quality_score !== undefined ? ` · ${entry.quality_score.toFixed(1)}` : "";
  return `${entry.id}${score}`;
}
