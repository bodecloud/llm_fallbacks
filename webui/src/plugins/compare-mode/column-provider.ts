import type { CatalogEntry } from "../../providers/browser-router";
import { hasKeyForModel, loadKeys, shouldTryBrowser } from "../../providers/browser-router";

export type CompareColumnId = "a" | "b";

export interface CompareColumnConfig {
  model: string;
}

export interface CompareState {
  active: boolean;
  columns: Record<CompareColumnId, CompareColumnConfig>;
}

export function defaultCompareState(activeModel = "free"): CompareState {
  return {
    active: false,
    columns: {
      a: { model: activeModel || "free" },
      b: { model: "openrouter/free" },
    },
  };
}

/**
 * A column is "metered" when it will hit the shared public proxy (no usable
 * BYOK key for that model). Compare of two metered columns costs two proxy
 * requests — rate limits and Turnstile apply twice (R34).
 */
export function columnIsMetered(
  model: string,
  catalog: readonly CatalogEntry[],
  keys = loadKeys()
): boolean {
  if (model === "free") return true;
  return !shouldTryBrowser(model, catalog as CatalogEntry[], keys);
}

export function bothColumnsMetered(
  state: CompareState,
  catalog: readonly CatalogEntry[],
  keys = loadKeys()
): boolean {
  if (!state.active) return false;
  return (
    columnIsMetered(state.columns.a.model, catalog, keys) &&
    columnIsMetered(state.columns.b.model, catalog, keys)
  );
}

export function compareUsesByok(
  model: string,
  keys = loadKeys()
): boolean {
  if (model === "free") return false;
  return hasKeyForModel(model, keys);
}

export const METERED_COMPARE_BANNER =
  "Compare sends two requests. Rate limits and Turnstile apply to each column when both use the public proxy.";
