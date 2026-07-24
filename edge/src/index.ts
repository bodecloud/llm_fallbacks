/**
 * Cloudflare Worker — OpenAI-compatible edge proxy for the llm-fallbacks chat UI.
 * Holds provider secrets; static GitHub Pages UI calls this with a public guest token.
 * Falls back to Cloudflare Workers AI when upstream provider keys are not configured.
 */

export interface Env {
  AI: Ai;
  PROXY_GUEST_TOKEN: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  ALLOWED_ORIGINS: string;
  MODEL_CHAIN: string;
  MAX_TOKENS_CAP: string;
  WORKERS_AI_MODEL?: string;
}

type ChatMessage = { role: string; content: string };
type ChatBody = {
  model?: string;
  messages?: ChatMessage[];
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

function parseOrigins(raw: string): string[] {
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null, allowed: string[]): HeadersInit {
  const match = origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function unauthorized(origin: string | null, allowed: string[]): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowed) },
  });
}

function jsonError(message: string, status: number, origin: string | null, allowed: string[]): Response {
  return new Response(JSON.stringify({ error: { message, type: "proxy_error" } }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowed) },
  });
}

function openAiCompletion(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function modelChain(env: Env): string[] {
  return env.MODEL_CHAIN.split(",").map((m) => m.trim()).filter(Boolean);
}

function upstreamModelId(litellmId: string): { provider: string; apiModel: string } | null {
  const slash = litellmId.indexOf("/");
  if (slash <= 0) return null;
  const provider = litellmId.slice(0, slash);
  const apiModel = litellmId.slice(slash + 1);
  return { provider, apiModel };
}

function normalizeClientModel(model?: string): string {
  if (!model || model === "free") return "free";
  const pipe = model.indexOf("|");
  if (pipe > 0) return model.slice(pipe + 1) || "free";
  return model;
}

function sseStreamFromText(text: string, origin: string | null, allowed: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const id = `cf-${Date.now()}`;
      const parts = text.match(/\S+\s*|\s+/g) || (text ? [text] : [""]);
      for (const part of parts) {
        const payload = JSON.stringify({
          id,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: part }, finish_reason: null }],
        });
        controller.enqueue(enc.encode(`data: ${payload}\n\n`));
      }
      const donePayload = JSON.stringify({
        id,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      controller.enqueue(enc.encode(`data: ${donePayload}\n\n`));
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      ...corsHeaders(origin, allowed),
    },
  });
}

function extractWorkersAIContent(result: unknown): string | null {
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

async function workersAIText(body: ChatBody, env: Env): Promise<string | null> {
  const model = env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
  try {
    const result = await env.AI.run(model, {
      messages: body.messages,
      max_tokens: body.max_tokens,
    });
    return extractWorkersAIContent(result);
  } catch {
    return null;
  }
}

async function callWorkersAI(body: ChatBody, env: Env): Promise<Response> {
  const content = await workersAIText(body, env);
  if (!content) {
    return new Response(JSON.stringify({ error: { message: "Empty Workers AI response" } }), {
      status: 502,
    });
  }
  return openAiCompletion(content);
}

async function callWorkersAIStream(
  body: ChatBody,
  env: Env,
  origin: string | null,
  allowed: string[],
): Promise<Response> {
  const model = env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
  try {
    const aiStream = await env.AI.run(model, {
      messages: body.messages,
      max_tokens: body.max_tokens,
      stream: true,
    });
    if (aiStream instanceof ReadableStream) {
      return transformWorkersAIStream(aiStream, origin, allowed);
    }
  } catch {
    /* fall through to buffered fallback */
  }

  const content = await workersAIText(body, env);
  if (!content) {
    return jsonError("Workers AI failed", 502, origin, allowed);
  }
  return sseStreamFromText(content, origin, allowed);
}

function transformWorkersAIStream(
  aiStream: ReadableStream,
  origin: string | null,
  allowed: string[],
): Response {
  const id = `cf-${Date.now()}`;
  const reader = aiStream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as {
                response?: string;
                choices?: { delta?: { content?: string }; message?: { content?: string } }[];
              };
              const text =
                parsed.response ??
                parsed.choices?.[0]?.delta?.content ??
                parsed.choices?.[0]?.message?.content ??
                "";
              if (!text) continue;
              const payload = JSON.stringify({
                id,
                object: "chat.completion.chunk",
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
              });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            } catch {
              /* skip malformed chunk */
            }
          }
        }
        const donePayload = JSON.stringify({
          id,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
        controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch {
        controller.error(new Error("Workers AI stream failed"));
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      ...corsHeaders(origin, allowed),
    },
  });
}

async function callUpstream(
  litellmId: string,
  body: ChatBody,
  env: Env,
): Promise<Response> {
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
  const chain =
    normalized.model === "free" ? modelChain(env) : [normalized.model];

  let lastResponse: Response | null = null;
  for (const modelId of chain) {
    const parsed = upstreamModelId(modelId);
    if (!parsed) {
      continue;
    }
    if (parsed.provider === "openrouter" && !env.OPENROUTER_API_KEY) {
      continue;
    }
    if (parsed.provider === "groq" && !env.GROQ_API_KEY) {
      continue;
    }
    if (parsed.provider !== "openrouter" && parsed.provider !== "groq") {
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
