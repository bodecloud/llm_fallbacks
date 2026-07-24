import { modelChain, normalizeClientModel } from "./routing";
import type { Env } from "./types";

export function allowedModelSet(env: Env): Set<string> {
  const allowed = new Set<string>(["free"]);
  for (const id of env.ALLOWED_MODELS.split(",").map((m) => m.trim()).filter(Boolean)) {
    allowed.add(id);
  }
  for (const id of modelChain(env)) {
    allowed.add(id);
  }
  return allowed;
}

export function isModelAllowed(model: string | undefined, env: Env): boolean {
  const normalized = normalizeClientModel(model);
  if (normalized === "free") {
    return true;
  }
  return allowedModelSet(env).has(normalized);
}
