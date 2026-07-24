# Plugin-based chat UI

The public chat at [`docs/index.html`](../index.html) is built from [`webui/`](../webui/) and deployed via GitHub Actions.

## Architecture

- **Shell:** [ai-researchwizard](https://github.com/bolabaden/ai-researchwizard) static frontend (`webui/shell/styles.css`) — top bar, slide-in panels, dark gradient theme.
- **Chat engine:** [murm-ui](https://github.com/levmv/murm-ui) (`ChatUI` + `IndexedDBStorage`).
- **Routing:** `FailoverProvider` — cloud proxy first (SSE), optional browser BYOK fallback (ported from `docs/legacy/simple-chat/`).

## Build

```bash
cd webui
npm ci
npm run build          # writes docs/assets/* and docs/index.html
npm run sync:shell     # refresh styles.css from ai-researchwizard
npm test               # vitest (model explorer filters)
```

Set `APP_VERSION` when building for cache busting (CI sets this automatically).

## First-party plugins

| Plugin | Panel | Purpose |
|--------|-------|---------|
| `failover-settings` | Failover (top bar) | Proxy endpoints, guest token, default model, test connection |
| `byok-settings` | BYOK | Optional provider API keys (`localStorage` only) |
| `model-explorer` | Models | Filter/sort `free_models.json` (subset of Tkinter `filter_model_specs`) |

Plugins register murm-ui hooks **and** optional slide panels via `registerShellPanel(id, initFn)` (see `webui/src/shell-panels.ts`).

## Adding a plugin

1. Create `webui/src/plugins/my-plugin/index.ts` exporting a `ChatPlugin` factory.
2. Register in `webui/src/main.ts` inside the `plugins: (engine) => [...]` array.
3. Optional shell panel: call `registerShellPanel("my-plugin", (root) => { ... })` in `onMount`.
4. Rebuild: `cd webui && npm run build`.

### Deferred: MCP bridge

ResearchWizard includes MCP config UI backed by a server. Static Pages cannot host an MCP server — leave a panel slot / manifest stub for a future addon that talks to an external MCP endpoint.

## localStorage keys

| Key | Purpose |
|-----|---------|
| `llm_fallbacks_proxy_endpoints` | JSON array of proxy base URLs |
| `llm_fallbacks_guest_token` | Bearer token for proxy auth |
| `llm_fallbacks_default_model` | Default chat model (usually `free`) |
| `llm_fallbacks_api_keys` | Optional BYOK map |

Zero-config values are seeded from `docs/config.js` on first visit (`seedZeroConfigFromPageConfig` in `webui/src/config.ts`).

## E2E

Production Playwright tests live in `tests/e2e/`. Selectors target murm-ui (`.mur-message-assistant`, `#chatinput`, `#sendbutton`) and shell panels (`#sysSetting`, `#apiHostInput`).

```bash
npm ci
npx playwright install chromium
PAGES_BASE_URL=https://bodecloud.github.io/llm_fallbacks/ npm run test:e2e
```
