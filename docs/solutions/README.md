# Solutions runbooks

Incident and workflow notes with YAML frontmatter. Search by `applies_when`, `category`, or `tags`.

## Categories

| Category | Runbook | When to read |
|----------|---------|--------------|
| **workflow-issues** | [GitHub Pages webui CI and secrets](workflow-issues/github-pages-webui-deploy-and-secrets.md) | CF auth 10000, workflow scope, secret rotation |
| **workflow-issues** | [Product pulse without analytics](workflow-issues/ci-based-product-pulse-without-analytics.md) | STRATEGY metrics when PostHog is not wired |
| **integration-issues** | [Workers AI proxy fallback and model chain](integration-issues/workers-ai-proxy-fallback-and-model-chain.md) | 502 on stream fallback, long MODEL_CHAIN |
| **ui-bugs** | [murm-ui light theme on dark shell](ui-bugs/murm-ui-light-theme-on-dark-shell.md) | White chat surfaces on dark Pages shell |
| **tooling-decisions** | [murm-ui streaming plaintext tail patch](tooling-decisions/murm-ui-streaming-plaintext-tail-patch.md) | SSE flicker; murm-ui bump vs patch-package |

## `applies_when` quick reference

| Runbook | Trigger (summary) |
|---------|-------------------|
| github-pages-webui-deploy-and-secrets | Pushing workflow YAML; Deploy Proxies auth 10000; docs/assets drift |
| ci-based-product-pulse-without-analytics | Need product health recap without PostHog |
| workers-ai-proxy-fallback-and-model-chain | Live chat 502 after OpenRouter 429; MODEL_CHAIN too long |
| murm-ui-light-theme-on-dark-shell | Chat UI renders light surfaces despite dark shell |
| murm-ui-streaming-plaintext-tail-patch | Stream flicker; re-justify patch after murm-ui upgrade |

## Related

- [`docs/CAVEATS.md`](../CAVEATS.md) — product limits (not incident-specific)
- [`CONCEPTS.md`](../../CONCEPTS.md) — gateway vocabulary
- [`AGENTS.md`](../../AGENTS.md) — pitfalls with deep links
