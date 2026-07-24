/**
 * Cloudflare Worker — OpenAI-compatible edge proxy for the llm-fallbacks chat UI.
 * Holds provider secrets; static GitHub Pages UI calls this with a public guest token.
 * Falls back to Cloudflare Workers AI when upstream provider keys are not configured.
 */

export type { Env } from "./types";

import { corsHeaders, jsonError, parseOrigins, unauthorized } from "./http";
import { handleEventsPost, handleMetricsGet } from "./events";
import {
  isChainModelSupported,
  modelChain,
  normalizeClientModel,
  upstreamModelId,
} from "./routing";
import type { ChatBody, Env } from "./types";
import { RETRYABLE } from "./types";
import { callWorkersAI, callWorkersAIStream } from "./workers-ai";

async function callUpstream(litellmId: string, body: ChatBody, env: Env): Promise<Response> {
  const parsed = upstreamModelId(litellmId);
  if (!parsed) {
    return new Response(JSON.stringify({ error: { message: `Unknown model id: ${litellmId}` } }), {
      status: 400,
    });
  }

  const payload = {
    model: parsed.apiModel,
    messages: body.messages,
    max_tokens: body.max_tokens,
    stream: body.stream ?? false,
    temperature: body.temperature,
  };

  if (parsed.provider === "openrouter") {
    const key = env.OPENROUTER_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: { message: "OpenRouter not configured" } }), {
        status: 503,
      });
    }
    const orModel =
      litellmId === "openrouter/free" ? "openrouter/free" : litellmId.replace(/^openrouter\//, "");
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bodecloud.github.io/llm_fallbacks/",
        "X-Title": "llm-fallbacks",
      },
      body: JSON.stringify({ ...payload, model: orModel }),
    });
  }

  if (parsed.provider === "groq") {
    const key = env.GROQ_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: { message: "Groq not configured" } }), {
        status: 503,
      });
    }
    return fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  return new Response(JSON.stringify({ error: { message: `Unsupported provider: ${parsed.provider}` } }), {
    status: 503,
  });
}

async function chatWithFallback(
  body: ChatBody,
  env: Env,
  origin: string | null,
  allowed: string[],
): Promise<Response> {
  const normalized = { ...body, model: normalizeClientModel(body.model) };
  const chain = normalized.model === "free" ? modelChain(env) : [normalized.model];

  let lastResponse: Response | null = null;
  for (const modelId of chain) {
    if (!isChainModelSupported(modelId, env)) {
      continue;
    }
    const attemptBody = { ...normalized, model: modelId };
    const res = await callUpstream(modelId, attemptBody, env);
    if (res.ok) {
      return res;
    }
    if (!RETRYABLE.has(res.status)) {
      const errBody = await res.clone().text();
      if (errBody.includes("Unsupported provider")) {
        lastResponse = res;
        continue;
      }
      lastResponse = res;
      break;
    }
    lastResponse = res;
  }

  if (normalized.stream) {
    return callWorkersAIStream(normalized, env, origin, allowed);
  }

  const workersAi = await callWorkersAI(normalized, env);
  if (workersAi.ok) {
    return workersAi;
  }

  return lastResponse ?? workersAi;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowed = parseOrigins(env.ALLOWED_ORIGINS);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowed) },
      });
    }

    if (url.pathname === "/v1/events" && request.method === "POST") {
      return handleEventsPost(request, env, origin, allowed);
    }

    if (url.pathname === "/v1/metrics" && request.method === "GET") {
      return handleMetricsGet(request, env, origin, allowed);
    }

    if (url.pathname !== "/v1/chat/completions" || request.method !== "POST") {
      return jsonError("Not found", 404, origin, allowed);
    }

    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.PROXY_GUEST_TOKEN || token !== env.PROXY_GUEST_TOKEN) {
      return unauthorized(origin, allowed);
    }

    let body: ChatBody;
    try {
      body = (await request.json()) as ChatBody;
    } catch {
      return jsonError("Invalid JSON body", 400, origin, allowed);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonError("messages required", 400, origin, allowed);
    }

    const cap = parseInt(env.MAX_TOKENS_CAP || "1024", 10);
    if (body.max_tokens === undefined || body.max_tokens > cap) {
      body.max_tokens = cap;
    }

    body.model = normalizeClientModel(body.model) || "free";
    body.stream = body.stream ?? false;

    const upstream = await chatWithFallback(body, env, origin, allowed);

    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin, allowed))) {
      headers.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
