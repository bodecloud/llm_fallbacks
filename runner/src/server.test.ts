import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createStubAdapter } from "./adapters/stub.ts";
import { createRunnerServer } from "./server.ts";

const servers: Server[] = [];

function listen(server: Server): Promise<string> {
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

after(() => {
  for (const server of servers) server.close();
});

describe("runner server", () => {
  it("GET /health reports the active adapter", async () => {
    const base = await listen(createRunnerServer(createStubAdapter()));
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, adapter: "stub" });
  });

  it("streams OpenAI-shaped SSE from the stub adapter", async () => {
    const base = await listen(createRunnerServer(createStubAdapter("fixed runner reply")));
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "web-ui",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

    const raw = await res.text();
    let text = "";
    let finished = false;
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      const parsed = JSON.parse(data) as {
        choices?: { delta?: { content?: string }; finish_reason?: string }[];
      };
      text += parsed.choices?.[0]?.delta?.content ?? "";
      if (parsed.choices?.[0]?.finish_reason === "stop") finished = true;
    }
    assert.equal(text, "fixed runner reply");
    assert.ok(finished, "expected a finish_reason=stop chunk");
    assert.ok(raw.includes("data: [DONE]"));
  });

  it("returns 501 with guidance when no adapter is configured", async () => {
    const base = await listen(createRunnerServer(null));
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    assert.equal(res.status, 501);
    const body = (await res.json()) as { error: { message: string } };
    assert.match(body.error.message, /runner\.config\.json/);
  });

  it("answers CORS preflight for localhost and github.io origins", async () => {
    const base = await listen(createRunnerServer(createStubAdapter()));
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "OPTIONS",
      headers: { Origin: "https://example.github.io" },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://example.github.io");

    const denied = await fetch(`${base}/health`, {
      headers: { Origin: "https://evil.example.com" },
    });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  });
});
