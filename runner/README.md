# llm-fallbacks web-UI runner

Opt-in local companion for the chat demo's **web_ui** provider tier (Wave 4B, R38). It exposes an OpenAI-shaped SSE endpoint that the browser client streams from; behind it, a user-configured adapter automates a free web chat UI. The public GitHub Pages demo works fully without this process — zero-config chat always goes through the proxy tier.

## Quick start

Requires **Node.js ≥ 23.6** (runs TypeScript natively via type stripping — no build step).

```bash
cd runner
npm install
npm test          # health + SSE contract tests (stub adapter)
npm start         # http://127.0.0.1:8815 — chat returns 501 until configured
```

Then in the chat demo: **Tiers panel → enable "Local web UI" → set runner URL** to `http://127.0.0.1:8815`.

## Endpoints

| Endpoint | Behavior |
|----------|----------|
| `GET /health` | `{ "ok": true, "adapter": "stub" \| "generic-selector" \| null }` |
| `POST /v1/chat/completions` | OpenAI-style SSE stream; **501** until an adapter is configured |

CORS allows `localhost` / `127.0.0.1` (any port) and `https://*.github.io` origins.

## Configuration

Create `runner/runner.config.json` (or point `RUNNER_CONFIG` at a path):

```json
{
  "adapter": "stub",
  "stubReply": "Hello from the runner",
  "port": 8815
}
```

The stub adapter streams a fixed reply — use it to verify tier wiring end to end.

### Generic selector adapter (BYO selectors)

Automates an arbitrary web chat page with CSS selectors you supply. Requires Playwright:

```bash
npm i playwright && npx playwright install chromium
```

```json
{
  "adapter": "generic-selector",
  "port": 8815,
  "selector": {
    "targetUrl": "https://example-free-chat.example",
    "inputSelector": "textarea",
    "submitSelector": "button[type=submit]",
    "replySelector": ".assistant-message",
    "firstReplyTimeoutMs": 30000,
    "settleMs": 2500,
    "headless": true
  }
}
```

The adapter navigates to `targetUrl`, types the latest user prompt, clicks submit, and streams the last `replySelector` element's text until it stops growing for `settleMs`.

## Caveats and responsibilities

- **You run this; you own it.** The runner is never hosted by the project and no site selectors are shipped. Automating a third-party chat UI is subject to **that site's terms of service** — review them before pointing the adapter anywhere.
- No login automation. Sites requiring auth or captchas need `"headless": false` and a manual session, and may still break.
- One request at a time per adapter; a fresh browser is launched per request (slow but stateless). This is a spike-quality tier, not the primary route — quality API and proxy tiers remain the supported paths.
- The runner binds to `127.0.0.1` only.
