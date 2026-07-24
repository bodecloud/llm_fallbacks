import type { Env } from "./types";

export function upstreamModelId(litellmId: string): { provider: string; apiModel: string } | null {
  const slash = litellmId.indexOf("/");
  if (slash <= 0) return null;
  return { provider: litellmId.slice(0, slash), apiModel: litellmId.slice(slash + 1) };
}

export function normalizeClientModel(model?: string): string {
  if (!model || model === "free") return "free";
  const pipe = model.indexOf("|");
  if (pipe > 0) return model.slice(pipe + 1) || "free";
  return model;
}

export function modelChain(env: Env): string[] {
  return env.MODEL_CHAIN.split(",").map((m) => m.trim()).filter(Boolean);
}

export function isChainModelSupported(
  modelId: string,
  env: Pick<Env, "OPENROUTER_API_KEY" | "GROQ_API_KEY">,
): boolean {
  const parsed = upstreamModelId(modelId);
  if (!parsed) return false;
  if (parsed.provider === "openrouter") return Boolean(env.OPENROUTER_API_KEY);
  if (parsed.provider === "groq") return Boolean(env.GROQ_API_KEY);
  return false;
}

export function extractWorkersAIContent(result: unknown): string | null {
  if (typeof result === "string") {
    return result.trim() || null;
  }
  if (!result || typeof result !== "object") {
    return null;
  }
  const obj = result as {
    response?: string;
    text?: string;
    result?: unknown;
    choices?: { message?: { content?: string }; delta?: { content?: string } }[];
  };
  const choiceContent =
    obj.choices?.[0]?.message?.content ?? obj.choices?.[0]?.delta?.content ?? "";
  const legacy = obj.response ?? obj.text ?? "";
  const nested =
    typeof obj.result === "string"
      ? obj.result
      : extractWorkersAIContent(obj.result) ?? "";
  const content = (choiceContent || legacy || nested).trim();
  return content || null;
}
