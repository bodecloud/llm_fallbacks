/**
 * llm-fallbacks web-UI runner (R38): a user-run companion that exposes an
 * OpenAI-shaped SSE endpoint backed by a configurable adapter. The public
 * Pages demo never requires this process — it powers the opt-in web_ui tier.
 *
 * Endpoints:
 *   GET  /health               → { ok, adapter }
 *   POST /v1/chat/completions  → OpenAI-style SSE (501 until an adapter is configured)
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { createGenericSelectorAdapter, type SelectorAdapterConfig } from "./adapters/generic-selector.ts";
import { createStubAdapter } from "./adapters/stub.ts";
import type { ChatMessage, RunnerAdapter } from "./adapters/types.ts";

const DEFAULT_PORT = 8815;

// Browser callers are the local dev shell or the GitHub Pages demo.
const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|^https:\/\/[\w-]+\.github\.io$/;

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function handleChat(
  adapter: RunnerAdapter | null,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!adapter) {
    sendJson(res, 501, {
      error: {
        message:
          "No runner adapter configured. Create runner.config.json (see runner/README.md) and restart.",
      },
    });
    return;
  }

  let messages: ChatMessage[];
  try {
    const parsed = JSON.parse(await readBody(req)) as { messages?: ChatMessage[] };
    messages = parsed.messages ?? [];
  } catch {
    sendJson(res, 400, { error: { message: "Invalid JSON body" } });
    return;
  }
  if (messages.length === 0) {
    sendJson(res, 400, { error: { message: "messages[] is required" } });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const abort = new AbortController();
  req.on("close", () => abort.abort());

  try {
    await adapter.streamReply(
      messages,
      (delta) => {
        res.write(sseChunk({ choices: [{ delta: { content: delta } }] }));
      },
      abort.signal
    );
    res.write(sseChunk({ choices: [{ delta: {}, finish_reason: "stop" }] }));
    res.write("data: [DONE]\n\n");
  } catch (err) {
    // Headers are already sent; surface the failure as an SSE error payload.
    const message = err instanceof Error ? err.message : String(err);
    res.write(sseChunk({ error: { message: `runner adapter "${adapter.name}" failed: ${message}` } }));
  }
  res.end();
}

export function createRunnerServer(adapter: RunnerAdapter | null): Server {
  return createServer((req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, adapter: adapter?.name ?? null });
      return;
    }
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      void handleChat(adapter, req, res);
      return;
    }
    sendJson(res, 404, { error: { message: "Not found" } });
  });
}

interface RunnerConfig {
  adapter?: "stub" | "generic-selector";
  stubReply?: string;
  port?: number;
  selector?: SelectorAdapterConfig;
}

export function adapterFromConfig(config: RunnerConfig): RunnerAdapter | null {
  if (config.adapter === "stub") return createStubAdapter(config.stubReply);
  if (config.adapter === "generic-selector" && config.selector) {
    return createGenericSelectorAdapter(config.selector);
  }
  return null;
}

function loadConfig(path: string): RunnerConfig {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunnerConfig;
  } catch {
    return {};
  }
}

const isMain = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");
if (isMain) {
  const configPath = process.env.RUNNER_CONFIG ?? new URL("../runner.config.json", import.meta.url).pathname;
  const config = loadConfig(configPath);
  const adapter = adapterFromConfig(config);
  const port = config.port ?? (Number(process.env.PORT) || DEFAULT_PORT);
  createRunnerServer(adapter).listen(port, "127.0.0.1", () => {
    console.log(
      `llm-fallbacks runner on http://127.0.0.1:${port} — adapter: ${adapter?.name ?? "none (chat returns 501)"}`
    );
  });
}
