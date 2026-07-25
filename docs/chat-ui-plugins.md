# Chat UI plugins

The public chat at [`docs/index.html`](../index.html) is built from [`webui/`](../webui/) and deployed via GitHub Actions.

## Stack

| Layer | Source | Role |
|-------|--------|------|
| Shell | [ai-researchwizard](https://github.com/bolabaden/ai-researchwizard) (`webui/shell/styles.css`) | Top bar, slide panels, dark theme |
| Chat engine | [murm-ui](https://github.com/levmv/murm-ui) | `ChatUI` + `IndexedDBStorage` |
| Routing | `FailoverProvider` | Tier orchestrator: direct/BYOK → optional runner/SearXNG → cloud proxy SSE |

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
| `tier-settings` | Tiers | Ordered omnifail route stack (enable/reorder + optional runner/SearXNG URLs) |
| `compare-mode` | Composer toggle | Two-column model compare (same prompt → dual proxy/BYOK streams) |
| `discovery-picklist` | Above composer | SearXNG-discovered free chat links (manual open only, dismissible) |
| `model-explorer` | Models | Filter/sort `free_models.json`; **Use for chat** sets session model |
| `model-picker` | Composer | Dropdown for `free`, `openrouter/free`, and top catalog models |
| `routing-chip` | Messages | Endpoint / model / fallback metadata under assistant replies |
| `message-actions` | Messages | Regenerate, edit user message; stop preserves partial output when present |
| `status-strip` | Top bar | Proxy liveness dot + optional daily chat count from `/v1/metrics` |
| `turnstile-gate` | Body (optional) | Cloudflare Turnstile widget when `turnstileSiteKey` is in config |
| `shortcuts-sheet` | Footer / `?` key | Keyboard shortcuts modal + dismissible first-visit hint |

Wave 3 adds **catalog enrichment** (context + capability badges in Models panel and composer subtitle), **session export** (sidebar menu → Markdown/JSON), and **hash routing** (`#/chat/{sessionId}` via murm-ui `AppRouter`).

Wave 4 adds **streaming polish** (plain-text tail during SSE, full markdown on completion — `patch-package` on murm-ui), **conversation import** (symmetry with export), **copy session link**, empty-state copy, and the shortcuts sheet.

Wave 4B adds **provider tiers** (omnifail route stack in the Tiers panel), **image attachments** (composer tray → multimodal proxy requests), **compare mode** (two-column dual streams), **SearXNG discovery** (suggested free chat links when the tier is enabled — never automated), and an **opt-in local web-UI runner** (`runner/` — OpenAI-shaped SSE over user-configured adapters, see `runner/README.md`).

## Session export, import, and hash links

- **Export** — Session ⋮ menu → “Export as Markdown” or “Export as JSON”. Serializes text blocks only; empty chats disable the items.
- **Import** — Session ⋮ menu → “Import conversation”. Creates a **new** session from exported `.md` or `.json`; does not merge into the active session.
- **Copy session link** — Session ⋮ menu → copies `#/chat/{id}` URL (local browser only).
- **Hash routing** — Enabled in `webui/src/main.ts` with `routing: { type: "hash", pathPrefix: "#/chat/" }`. Links are local-only; see [CAVEATS.md](CAVEATS.md).
- **Why this rank?** — Composer link to [README quality scoring](https://github.com/bodecloud/llm_fallbacks#quality-scoring).

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
| `llm_fallbacks_provider_tiers` | Omnifail tier order, enable flags, runner/SearXNG URLs |
| `llm_fallbacks_shortcuts_hint_dismissed` | `1` after user dismisses first-visit shortcuts hint |

Zero-config values seed from `docs/config.js` on first visit (`seedZeroConfigFromPageConfig` in `webui/src/config.ts`).

## E2E

Playwright tests in `tests/e2e/`. Selectors target murm-ui (`.mur-message-assistant`, `#chatinput`, `#sendbutton`) and shell panels (`#sysSetting`, `#apiHostInput`).

```bash
npm ci
npx playwright install chromium
PAGES_BASE_URL=https://bodecloud.github.io/llm_fallbacks/ npm run test:e2e
```
