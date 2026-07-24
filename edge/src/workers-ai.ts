import { corsHeaders, jsonError, openAiCompletion, sseStreamFromText } from "./http";
import { extractWorkersAIContent } from "./routing";
import type { ChatBody, Env } from "./types";
import { DEFAULT_WORKERS_AI_MODEL } from "./types";

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

export async function callWorkersAI(body: ChatBody, env: Env): Promise<Response> {
  const content = await workersAIText(body, env);
  if (!content) {
    return new Response(JSON.stringify({ error: { message: "Empty Workers AI response" } }), {
      status: 502,
    });
  }
  return openAiCompletion(content);
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

export async function callWorkersAIStream(
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
