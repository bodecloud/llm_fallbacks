import { trackChatCompletionSuccess } from "../analytics";
import { getActiveModel } from "../model-selection";
import type { ChatProvider, ChatRequest, Message, StreamEvent } from "murm-ui";
import type { AppConfig } from "../config";
import { readRuntimeConfig } from "../config";
import type { CatalogEntry } from "./browser-router";
import {
  RETRYABLE,
  chatWithBrowserFallback,
  loadKeys,
  shouldTryBrowser,
} from "./browser-router";
import { ensureTurnstileToken } from "../turnstile-session";
import { showRateLimitBanner } from "../plugins/status-strip";
import { ChatRouteError, mapHttpError, mapProxyChainFailure, type RateLimitInfo, type RateLimitScope } from "./errors";
import { setLastCompletionMeta, type CompletionMeta } from "./routing-metadata";
import { emitOpenAiSseAsStreamEvents, emitTextAsStreamEvents } from "./sse";
import {
  TierOrchestrator,
  qualityApiTierUnavailable,
  searxngTierUnavailable,
  webUiTierUnavailable,
} from "./tiers/orchestrator";
import { loadProviderTierSettings } from "./tiers/settings";
import { TierOrchestratorError } from "./tiers/types";

type StatusListener = (status: string) => void;

function endpointUrl(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/v1/chat/completions")
    ? trimmed
    : `${trimmed}/v1/chat/completions`;
}

function messagesToOpenAi(messages: readonly Message[]): { role: string; content: string }[] {
  return messages.map((m) => {
    const text = m.blocks
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    return { role: m.role, content: text };
  });
}

function readRoutingHeaders(res: Response): Pick<CompletionMeta, "modelHeader" | "durationMs"> {
  const modelHeader =
    res.headers.get("x-litellm-model-name") ||
    res.headers.get("x-litellm-model-id") ||
    undefined;
  const durationRaw = res.headers.get("x-litellm-response-duration-ms");
  const durationMs = durationRaw ? Number.parseFloat(durationRaw) : undefined;
  return {
    modelHeader: modelHeader ?? undefined,
    durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
  };
}

function endpointLabel(base: string, res: Response): string {
  return res.headers.get("x-llm-fallbacks-endpoint") || base;
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After") ?? res.headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function parseRateLimitScopeFromBody(bodyText: string): RateLimitScope | undefined {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: string } };
    const message = parsed.error?.message ?? "";
    if (/daily|\(day\)/i.test(message)) return "day";
    if (/minute|\(minute\)/i.test(message)) return "minute";
  } catch {
    /* ignore */
  }
  return undefined;
}

function parseRetryAfterFromBody(bodyText: string): number | undefined {
  try {
    const parsed = JSON.parse(bodyText) as {
      retry_after?: number;
      error?: { retry_after?: number };
    };
    const raw = parsed.retry_after ?? parsed.error?.retry_after;
    if (typeof raw === "number" && raw > 0) return raw;
  } catch {
    /* ignore */
  }
  return undefined;
}

export class FailoverProvider implements ChatProvider {
  private config: AppConfig;
  private catalog: CatalogEntry[] = [];
  private providerUrls: Record<string, string> = {};
  private statusListeners = new Set<StatusListener>();
  private lastRoute = "";

  constructor(initialConfig?: AppConfig) {
    this.config = initialConfig || readRuntimeConfig();
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  getLastRoute(): string {
    return this.lastRoute;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  updateConfig(config: AppConfig): void {
    this.config = config;
  }

  setCatalog(catalog: CatalogEntry[], providerUrls: Record<string, string>): void {
    this.catalog = catalog;
    this.providerUrls = providerUrls;
  }

  private setStatus(text: string): void {
    for (const fn of this.statusListeners) fn(text);
  }

  private recordSuccessfulChat(): void {
    const keys = loadKeys();
    const zeroConfig = Object.keys(keys).length === 0;
    trackChatCompletionSuccess(this.lastRoute || "unknown", zeroConfig);
  }

  private async streamWithCompletionTracking(
    run: (onEvent: (event: StreamEvent) => void) => Promise<void>,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    let sawAssistantText = false;
    await run((event) => {
      if (event.type === "text_delta" && event.delta.trim()) {
        sawAssistantText = true;
      }
      onEvent(event);
    });
    if (sawAssistantText) {
      this.recordSuccessfulChat();
    }
  }

  private getRuntimeConfig(): AppConfig {
    return this.config;
  }

  private resolveModel(request: ChatRequest): string {
    const fromRequest = request.options.model as string | undefined;
    if (fromRequest) return fromRequest;
    const sessionModel = getActiveModel(this.config.defaultModel || "free");
    return sessionModel || this.config.defaultModel || "free";
  }

  private async chatViaProxy(
    base: string,
    body: Record<string, unknown>,
    guestToken: string,
    signal: AbortSignal
  ): Promise<Response> {
    const turnstileToken = await ensureTurnstileToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${guestToken}`,
      "Content-Type": "application/json",
    };
    if (turnstileToken) {
      headers["CF-Turnstile-Response"] = turnstileToken;
    }
    return fetch(endpointUrl(base), {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  }

  private async streamProxyFallback(
    body: Record<string, unknown>,
    config: AppConfig,
    onEvent: (event: StreamEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    if (!config.endpoints.length) throw mapProxyChainFailure("PROXY_UNAVAILABLE");

    let lastError = "All proxy endpoints failed";
    let hopIndex = 0;
    let lastRateLimit: RateLimitInfo | undefined;
    for (const base of config.endpoints) {
      this.setStatus(`proxy: ${base} …`);
      try {
        const res = await this.chatViaProxy(base, body, config.guestToken, signal);
        if (res.ok) {
          this.lastRoute = `proxy/${base}`;
          window.LLM_FALLBACKS_ROUTE = this.lastRoute;
          const headerMeta = readRoutingHeaders(res);
          setLastCompletionMeta({
            endpoint: endpointLabel(base, res),
            modelHeader: headerMeta.modelHeader,
            fallbackCount: hopIndex,
            durationMs: headerMeta.durationMs,
          });
          await emitOpenAiSseAsStreamEvents(res, onEvent);
          return;
        }
        if (!res.ok) {
          const retryAfterHeader = res.status === 429 ? parseRetryAfter(res) : undefined;
          const errText = await res.text();
          const retryAfter =
            retryAfterHeader ??
            (res.status === 429 ? parseRetryAfterFromBody(errText) : undefined);
          const rateScope = res.status === 429 ? parseRateLimitScopeFromBody(errText) : undefined;
          lastError = `${base}: HTTP ${res.status} — ${errText.slice(0, 160)}`;
          if (res.status === 429) {
            lastRateLimit = {
              retryAfterSeconds: retryAfter,
              scope: rateScope,
            };
            showRateLimitBanner(retryAfter);
          }
          if (!RETRYABLE.has(res.status)) {
            throw mapHttpError(res.status, errText, base, {
              retryAfterSeconds: retryAfter,
              scope: rateScope,
            });
          }
        }
      } catch (err) {
        if (signal.aborted) throw err;
        if (err instanceof ChatRouteError) {
          throw err;
        }
        lastError = `${base}: ${err instanceof Error ? err.message : String(err)}`;
      }
      hopIndex += 1;
    }
    throw mapProxyChainFailure(lastError, lastRateLimit);
  }

  private buildChatBody(request: ChatRequest): {
    config: AppConfig;
    model: string;
    body: Record<string, unknown>;
    openAiMessages: { role: string; content: string }[];
  } {
    const config = this.getRuntimeConfig();
    const model = this.resolveModel(request);
    const openAiMessages = messagesToOpenAi(request.messages);
    const body = {
      model,
      messages: openAiMessages,
      max_tokens: request.options.max_tokens ?? config.maxTokens,
    };
    return { config, model, body, openAiMessages };
  }

  // quality_api tier: direct/BYOK provider routes only. Disjoint from
  // proxy_failover (KTD7) — this tier never touches the cloud proxy chain, so
  // a single request is not attempted twice against the same endpoint. Without
  // a usable key it skips, letting the orchestrator advance to proxy_failover.
  private async streamQualityApiRoute(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { model, body, openAiMessages } = this.buildChatBody(request);
    const userKeys = loadKeys();

    if (!shouldTryBrowser(model, this.catalog, userKeys)) {
      throw qualityApiTierUnavailable();
    }

    const result = await chatWithBrowserFallback({
      model,
      messages: openAiMessages,
      maxTokens: body.max_tokens as number,
      catalog: this.catalog,
      providerUrls: this.providerUrls,
      keys: userKeys,
      onStatus: (s) => this.setStatus(s),
    });
    this.lastRoute = result.route;
    window.LLM_FALLBACKS_ROUTE = this.lastRoute;
    setLastCompletionMeta({
      endpoint: result.route,
      fallbackCount: 0,
    });
    emitTextAsStreamEvents(result.content, onEvent);
  }

  private async streamProxyFailoverRoute(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { config, body } = this.buildChatBody(request);
    await this.streamProxyFallback(body, config, onEvent, request.signal);
  }

  private async streamWebUiRoute(
    _request: ChatRequest,
    _onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const settings = loadProviderTierSettings();
    if (!settings.webRunnerUrl) {
      throw webUiTierUnavailable();
    }
    throw new Error("Web UI tier runner is not connected yet.");
  }

  private async streamSearxngDiscoveryRoute(
    _request: ChatRequest,
    _onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const settings = loadProviderTierSettings();
    if (!settings.searxngUrl) {
      throw searxngTierUnavailable();
    }
    throw new Error("SearXNG discovery tier is not connected yet.");
  }

  async streamChat(request: ChatRequest, onEvent: (event: StreamEvent) => void): Promise<void> {
    const orchestrator = new TierOrchestrator({
      qualityApi: (req, onEv) =>
        this.streamWithCompletionTracking((inner) => this.streamQualityApiRoute(req, inner), onEv),
      webUi: (req, onEv) =>
        this.streamWithCompletionTracking((inner) => this.streamWebUiRoute(req, inner), onEv),
      searxngDiscovery: (req, onEv) =>
        this.streamWithCompletionTracking(
          (inner) => this.streamSearxngDiscoveryRoute(req, inner),
          onEv
        ),
      proxyFailover: (req, onEv) =>
        this.streamWithCompletionTracking((inner) => this.streamProxyFailoverRoute(req, inner), onEv),
    });

    try {
      await orchestrator.streamChat(request, onEvent);
    } catch (err) {
      if (err instanceof TierOrchestratorError) {
        throw this.mapTierFailure(err);
      }
      throw err;
    }
  }

  // Preserve the ChatRouteError taxonomy (rate-limit / quota / cold-start) while
  // surfacing which tiers were tried and their last error (R40). A no-attempt
  // failure means every tier skipped or none were enabled.
  private mapTierFailure(err: TierOrchestratorError): Error {
    if (err.attempts.length === 0) {
      return mapProxyChainFailure(
        "No chat routes are available yet. Enable a provider tier in Settings, or wait for the demo proxy to finish deploying."
      );
    }
    const summary = err.attempts.map((a) => `${a.tier} → ${a.error}`).join(" | ");
    return mapProxyChainFailure(summary);
  }
}
