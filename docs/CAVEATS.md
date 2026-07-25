# What to expect

Honest limits for the public chat demo and the Python library.

## Public chat demo

| Topic | What you should know |
|-------|----------------------|
| **Shared access** | The demo uses a public token in the page source. It limits abuse but is not personal login. Anyone can use it. |
| **No uptime promise** | Free Cloudflare, Render, and provider tiers can fail, rate-limit, or sleep when idle. |
| **Cold starts** | The backup server on Render may take 30–60 seconds to wake up after idle. |
| **Daily quotas** | OpenRouter free limits can run out. The Worker may switch to Cloudflare Workers AI when configured. |
| **Backup server auth** | The browser sends the same guest token to every endpoint. The Worker accepts it; the Render backup may return 401 until a LiteLLM virtual key is set up. |
| **Saved settings** | If you changed proxy URLs in the browser, old values stay in localStorage. Clear site data if the failover list looks wrong after an update. |
| **Usage stats** | We count sessions and completions without storing message text. This is not full product analytics. |
| **Routing headers** | The routing chip reads `x-llm-fallbacks-endpoint` and LiteLLM headers from proxy responses. After edge changes, redeploy the Worker (`Deploy Proxies` workflow) for production to expose them. |
| **Turnstile** | Optional bot check when `TURNSTILE_SECRET` is set on the Worker and `turnstileSiteKey` is in `docs/config.js`. Skipped in local dev when secrets are absent. |
| **Hash session links** | `#/chat/{id}` only works when that session exists in your browser’s IndexedDB. Copy the link on another device or after clearing site data and you get a new empty chat — use **Export as Markdown/JSON** to share transcripts. |
| **Provider tiers vs free-tier limits** | The **Tiers** panel is the omnifail *route stack* (direct/BYOK → optional local runner → SearXNG → cloud proxy). That is separate from cloud *free-tier* rate limits and quotas on OpenRouter / Workers. Reordering tiers changes which route we try first; it does not raise provider quotas. |
| **Bootstrap merge** | Chat endpoints come from `loadRuntimeConfig()` (page `config.js` + `chat_proxy.json` merged with localStorage). If you once saved a single endpoint, that stale localStorage value can hide newer secondaries until you clear site data or re-save Server settings — see AGENTS.md pitfall 14. |
| **Web-UI runner & SearXNG** | Both are **opt-in** and empty by default on the public homepage. You run them locally; you own target-site and SearXNG terms of service. We do not harvest credentials. Exhausting enabled tiers still fails honestly — this is best-effort free HA, not “never fail.” |
| **Vision export** | Session Markdown/JSON export is **text-only**. Attached images are not serialized into export files (thumbnails stay in IndexedDB until you clear site data). |

## Library and CI

| Topic | What you should know |
|-------|----------------------|
| **Import side effects** | Setting `OPENROUTER_API_KEY` (even to `dummy`) triggers live fetches at import. Use `OPENROUTER_API_KEY=dummy` in tests. |
| **Cloudflare deploy token** | Deploy Proxies needs Workers Scripts Edit. Auth error **10000** means regenerate the token — see [workflow runbook](solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md). |
| **Provider limits** | The README provider table is a snapshot. Verify limits on each provider's official docs before production use. |

## Evidence labels

Some README provider links point to official vendor docs. Full relabeling across all docs is a follow-up task.
