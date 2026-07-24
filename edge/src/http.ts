export function parseOrigins(raw: string): string[] {
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

export function corsHeaders(origin: string | null, allowed: string[]): HeadersInit {
  const match = origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function unauthorized(origin: string | null, allowed: string[]): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowed) },
  });
}

export function jsonError(message: string, status: number, origin: string | null, allowed: string[]): Response {
  return new Response(JSON.stringify({ error: { message, type: "proxy_error" } }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin, allowed) },
  });
}

export function openAiCompletion(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export function sseStreamFromText(text: string, origin: string | null, allowed: string[]): Response {
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
