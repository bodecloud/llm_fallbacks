# Chat UI plugins

The public chat at [`docs/index.html`](../index.html) is built from [`webui/`](../webui/) and deployed via GitHub Actions.

## Stack

| Layer | Source | Role |
|-------|--------|------|
| Shell | [ai-researchwizard](https://github.com/bolabaden/ai-researchwizard) (`webui/shell/styles.css`) | Top bar, slide panels, dark theme |
| Chat engine | [murm-ui](https://github.com/levmv/murm-ui) | `ChatUI` + `IndexedDBStorage` |
| Routing | `FailoverProvider` | Cloud proxy first (SSE), optional browser BYOK fallback |

## Build

```bash
cd webui
npm ci
npm run build          # writes docs/assets/* and docs/index.html
npm run sync:shell     # refresh styles.css from ai-researchwizard
npm test               # vitest (model explorer filters)
```

Set `APP_VERSION` when building for cache busting (CI sets this from `github.sha`).

## First-party plugins

| Plugin | Panel | Purpose |
|--------|-------|---------|
| `failover-settings` | Server (top bar) | Proxy endpoints, guest token, default model, test connection |
| `byok-settings` | Your keys | Optional provider API keys (`localStorage` only) |
| `model-explorer` | Models | Filter/sort `free_models.json`; **Use for chat** sets session model |
| `model-picker` | Composer | Dropdown for `free`, `openrouter/free`, and top catalog models |
| `routing-chip` | Messages | Endpoint / model / fallback metadata under assistant replies |
| `message-actions` | Messages | Regenerate, edit user message; stop preserves partial output when present |
| `status-strip` | Top bar | Proxy liveness dot + optional daily chat count from `/v1/metrics` |
| `turnstile-gate` | Body (optional) | Cloudflare Turnstile widget when `turnstileSiteKey` is in config |

Plugins register murm-ui hooks **and** optional slide panels via `registerShellPanel(id, initFn)` — see `webui/src/shell-panels.ts`.

## Add a plugin

1. Create `webui/src/plugins/my-plugin/index.ts` exporting a `ChatPlugin` factory.
2. Register in `webui/src/main.ts` inside `plugins: (engine) => [...]`.
3. Optional shell panel: call `registerShellPanel("my-plugin", (root) => { ... })` in `onMount`.
4. Rebuild: `cd webui && npm run build`.

### Deferred: MCP bridge

ResearchWizard includes MCP config UI backed by a server. Static Pages cannot host an MCP server — leave a panel slot for a future addon that talks to an external MCP endpoint.

## localStorage keys

| Key | Purpose |
|-----|---------|
| `llm_fallbacks_proxy_endpoints` | JSON array of proxy base URLs |
| `llm_fallbacks_guest_token` | Bearer token for proxy auth |
| `llm_fallbacks_default_model` | Default chat model (usually `free`) |
| `llm_fallbacks_api_keys` | Optional BYOK map |

Zero-config values seed from `docs/config.js` on first visit (`seedZeroConfigFromPageConfig` in `webui/src/config.ts`).

## E2E

Playwright tests in `tests/e2e/`. Selectors target murm-ui (`.mur-message-assistant`, `#chatinput`, `#sendbutton`) and shell panels (`#sysSetting`, `#apiHostInput`).

```bash
npm ci
npx playwright install chromium
PAGES_BASE_URL=https://bodecloud.github.io/llm_fallbacks/ npm run test:e2e
```
