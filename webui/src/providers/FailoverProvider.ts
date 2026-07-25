import { trackChatCompletionSuccess } from "../analytics";
import { getActiveModel } from "../model-selection";
import type { ChatProvider, ChatRequest, StreamEvent } from "murm-ui";
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
import {
  messagesHaveImage,
  messagesToOpenAi,
  messagesToPlainText,
  modelSupportsVision,
} from "./message-openai";
import { classifyHopError, RouteTrace } from "./route-trace";
import {
  getLastCompletionMeta,
  setLastCompletionMeta,
  type CompletionMeta,
} from "./routing-metadata";
import { emitOpenAiSseAsStreamEvents, emitTextAsStreamEvents } from "./sse";
import {
  TierOrchestrator,
  qualityApiTierUnavailable,
  searxngTierUnavailable,
  webUiTierUnavailable,
} from "./tiers/orchestrator";
import {
  broadcastDiscoveryResults,
  searchFreeChatCandidates,
} from "./tiers/searxng-discovery-tier";
import { loadProviderTierSettings } from "./tiers/settings";
import { TierOrchestratorError, TierSkipError } from "./tiers/types";
import { streamFromWebRunner } from "./tiers/web-ui-tier";

type StatusListener = (status: string) => void;

function endpointUrl(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/v1/chat/completions")
    ? trimmed
    : `${trimmed}/v1/chat/completions`;
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
  /** Active per-request hop trail (Wave 6A). */
  private activeTrace: RouteTrace | null = null;
  private requestStartedAt = 0;

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
    const proxyBody = {
      ...body,
      // Ask proxies for a trailing usage chunk when supported (R58/R64).
      stream_options: { include_usage: true },
    };
    for (const base of config.endpoints) {
      this.setStatus(`proxy: ${base} …`);
      try {
        const res = await this.chatViaProxy(base, proxyBody, config.guestToken, signal);
        if (res.ok) {
          this.lastRoute = `proxy/${base}`;
          window.LLM_FALLBACKS_ROUTE = this.lastRoute;
          const headerMeta = readRoutingHeaders(res);
          const endpoint = endpointLabel(base, res);
          const timing = await emitOpenAiSseAsStreamEvents(
            res,
            onEvent,
            this.requestStartedAt || performance.now()
          );
          this.activeTrace?.record({
            tier: "proxy_failover",
            endpoint,
            model: headerMeta.modelHeader,
            outcome: "success",
            hopIndex,
          });
          setLastCompletionMeta({
            endpoint,
            modelHeader: headerMeta.modelHeader,
            fallbackCount: hopIndex,
            durationMs: headerMeta.durationMs,
            trace: this.activeTrace?.snapshot(),
            usage: timing.usage,
            ttftMs: timing.ttftMs,
            totalMs: timing.totalMs,
          });
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
          const mapped = mapHttpError(res.status, errText, base, {
            retryAfterSeconds: retryAfter,
            scope: rateScope,
          });
          this.activeTrace?.record({
            tier: "proxy_failover",
            endpoint: base,
            outcome: "error",
            errorClass: mapped.kind,
            reason: mapped.message,
            hopIndex,
          });
          if (res.status === 429) {
            lastRateLimit = {
              retryAfterSeconds: retryAfter,
              scope: rateScope,
            };
            showRateLimitBanner(retryAfter);
          }
          if (!RETRYABLE.has(res.status)) {
            throw mapped;
          }
        }
      } catch (err) {
        if (signal.aborted) throw err;
        // Non-retryable HTTP errors are already recorded above before throw.
        if (err instanceof ChatRouteError) throw err;
        lastError = `${base}: ${err instanceof Error ? err.message : String(err)}`;
        this.activeTrace?.record({
          tier: "proxy_failover",
          endpoint: base,
          outcome: "error",
          errorClass: classifyHopError(err),
          reason: lastError,
          hopIndex,
        });
      }
      hopIndex += 1;
    }
    throw mapProxyChainFailure(lastError, lastRateLimit);
  }

  private buildChatBody(request: ChatRequest): {
    config: AppConfig;
    model: string;
    body: Record<string, unknown>;
    plainMessages: { role: string; content: string }[];
    hasImage: boolean;
  } {
    const config = this.getRuntimeConfig();
    const model = this.resolveModel(request);
    // Proxy body carries multimodal content parts; browser/BYOK routes use the
    // text-only projection (they cannot forward inline images yet).
    const body = {
      model,
      messages: messagesToOpenAi(request.messages),
      max_tokens: request.options.max_tokens ?? config.maxTokens,
    };
    return {
      config,
      model,
      body,
      plainMessages: messagesToPlainText(request.messages),
      hasImage: messagesHaveImage(request.messages),
    };
  }

  // quality_api tier: direct/BYOK provider routes only. Disjoint from
  // proxy_failover (KTD7) — this tier never touches the cloud proxy chain, so
  // a single request is not attempted twice against the same endpoint. Without
  // a usable key it skips, letting the orchestrator advance to proxy_failover.
  private async streamQualityApiRoute(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { model, body, plainMessages, hasImage } = this.buildChatBody(request);
    const userKeys = loadKeys();

    // Direct BYOK routes cannot forward inline images yet — skip so the
    // orchestrator advances to a proxy tier rather than dropping the image.
    if (hasImage) {
      throw new TierSkipError(
        "quality_api",
        "Direct BYOK routes do not support image attachments yet — using the proxy tier."
      );
    }

    if (!shouldTryBrowser(model, this.catalog, userKeys)) {
      throw qualityApiTierUnavailable();
    }

    const result = await chatWithBrowserFallback({
      model,
      messages: plainMessages,
      maxTokens: body.max_tokens as number,
      catalog: this.catalog,
      providerUrls: this.providerUrls,
      keys: userKeys,
      onStatus: (s) => this.setStatus(s),
    });
    this.lastRoute = result.route;
    window.LLM_FALLBACKS_ROUTE = this.lastRoute;
    const totalMs = this.requestStartedAt
      ? Math.max(0, performance.now() - this.requestStartedAt)
      : undefined;
    setLastCompletionMeta({
      endpoint: result.route,
      fallbackCount: 0,
      trace: this.activeTrace?.snapshot(),
      ttftMs: totalMs,
      totalMs,
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
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const settings = loadProviderTierSettings();
    if (!settings.webRunnerUrl) {
      throw webUiTierUnavailable();
    }
    const { model, body, plainMessages, hasImage } = this.buildChatBody(request);
    if (hasImage) {
      throw new TierSkipError(
        "web_ui",
        "The web runner does not support image attachments — using the proxy tier."
      );
    }
    this.setStatus(`web runner: ${settings.webRunnerUrl} …`);
    let metaSet = false;
    await streamFromWebRunner({
      runnerUrl: settings.webRunnerUrl,
      model,
      messages: plainMessages,
      maxTokens: body.max_tokens as number,
      signal: request.signal,
      onEvent: (event) => {
        // Record the route once the runner actually starts streaming, so a
        // pre-stream failure never leaves stale web_ui routing metadata.
        if (!metaSet) {
          metaSet = true;
          this.lastRoute = `web_ui/${settings.webRunnerUrl}`;
          window.LLM_FALLBACKS_ROUTE = this.lastRoute;
          const totalMs = this.requestStartedAt
            ? Math.max(0, performance.now() - this.requestStartedAt)
            : undefined;
          setLastCompletionMeta({
            endpoint: this.lastRoute,
            fallbackCount: 0,
            trace: this.activeTrace?.snapshot(),
            ttftMs: totalMs,
            totalMs,
          });
        }
        onEvent(event);
      },
    });
  }

  private async streamSearxngDiscoveryRoute(
    request: ChatRequest,
    _onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const settings = loadProviderTierSettings();
    if (!settings.searxngUrl) {
      throw searxngTierUnavailable();
    }
    this.setStatus("searxng: searching for free chat sites …");
    const candidates = await searchFreeChatCandidates({
      searxngUrl: settings.searxngUrl,
      signal: request.signal,
    });
    broadcastDiscoveryResults(candidates);
    // Discovery suggests links (R39) — it cannot answer the prompt itself.
    // Record a descriptive attempt so the orchestrator moves to the next tier.
    throw new Error(
      `SearXNG found ${candidates.length} candidate chat site${
        candidates.length === 1 ? "" : "s"
      } — see suggestions below the chat.`
    );
  }

  async streamChat(request: ChatRequest, onEvent: (event: StreamEvent) => void): Promise<void> {
    // Vision guard (R29): never silently drop attachments. If the turn carries
    // an image but the selected model is not vision-capable, block clearly and
    // point at the vision-badged models in the explorer (R30).
    if (messagesHaveImage(request.messages)) {
      const model = this.resolveModel(request);
      if (!modelSupportsVision(model, this.catalog)) {
        throw new ChatRouteError(
          "vision_unsupported",
          `"${model}" can't read images. Pick a vision-capable model (filter by vision in the model explorer) or remove the attachment.`
        );
      }
    }

    this.activeTrace = new RouteTrace();
    this.requestStartedAt = performance.now();
    const orchestrator = new TierOrchestrator(
      {
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
          this.streamWithCompletionTracking(
            (inner) => this.streamProxyFailoverRoute(req, inner),
            onEv
          ),
      },
      this.activeTrace
    );

    try {
      await orchestrator.streamChat(request, onEvent);
      // Handlers set meta mid-flight; refresh with the final hop trail after
      // the orchestrator records the winning tier success (if it owns that hop).
      const meta = getLastCompletionMeta();
      if (meta && this.activeTrace) {
        setLastCompletionMeta({ ...meta, trace: this.activeTrace.snapshot() });
      }
    } catch (err) {
      if (err instanceof TierOrchestratorError) {
        throw this.mapTierFailure(err);
      }
      throw err;
    } finally {
      this.activeTrace = null;
    }
  }

  // Preserve the ChatRouteError taxonomy (rate-limit / quota / cold-start) while
  // surfacing which tiers were tried and their last error (R40). A no-attempt
  // failure means every tier skipped or none were enabled.
  private mapTierFailure(err: TierOrchestratorError): Error {
    // Attach the hop trail so UI can still show what was tried on total failure.
    if (this.activeTrace && this.activeTrace.length > 0) {
      setLastCompletionMeta({
        endpoint: "—",
        fallbackCount: Math.max(0, this.activeTrace.length - 1),
        trace: this.activeTrace.snapshot(),
        totalMs: this.requestStartedAt
          ? Math.max(0, performance.now() - this.requestStartedAt)
          : undefined,
      });
    }
    if (err.attempts.length === 0) {
      return mapProxyChainFailure(
        "No chat routes are available yet. Enable a provider tier in Settings, or wait for the demo proxy to finish deploying."
      );
    }
    const summary = err.attempts.map((a) => `${a.tier} → ${a.error}`).join(" | ");
    return mapProxyChainFailure(summary);
  }
}
