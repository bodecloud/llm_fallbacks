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
  shouldFallbackToProxy,
  shouldTryBrowser,
} from "./browser-router";
import { ChatRouteError, mapHttpError, mapProxyChainFailure } from "./errors";
import { setLastCompletionMeta, type CompletionMeta } from "./routing-metadata";
import { emitOpenAiSseAsStreamEvents, emitTextAsStreamEvents } from "./sse";

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
    return fetch(endpointUrl(base), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "Content-Type": "application/json",
      },
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
        const errText = await res.text();
        lastError = `${base}: HTTP ${res.status} — ${errText.slice(0, 160)}`;
        if (!RETRYABLE.has(res.status)) {
          throw mapHttpError(res.status, errText, base);
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
    throw mapProxyChainFailure(lastError);
  }

  async streamChat(request: ChatRequest, onEvent: (event: StreamEvent) => void): Promise<void> {
    const config = this.getRuntimeConfig();
    const model = this.resolveModel(request);
    const openAiMessages = messagesToOpenAi(request.messages);
    const body = {
      model,
      messages: openAiMessages,
      max_tokens: request.options.max_tokens ?? config.maxTokens,
    };

    const keys = loadKeys();
    const userKeys = keys;

    const tryBrowser = async (onEv: (event: StreamEvent) => void): Promise<void> => {
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
      window.LLM_FALLBACKS_ROUTE = result.route;
      setLastCompletionMeta({
        endpoint: result.route,
        fallbackCount: 0,
      });
      emitTextAsStreamEvents(result.content, onEv);
    };

    if (config.endpoints.length) {
      try {
        await this.streamWithCompletionTracking(
          (onEv) => this.streamProxyFallback(body, config, onEv, request.signal),
          onEvent
        );
        return;
      } catch (proxyErr) {
        if (!shouldTryBrowser(model, this.catalog, userKeys)) throw proxyErr;
        this.setStatus("cloud proxy unavailable — trying optional browser route …");
      }
    }

    if (model !== "free" && !shouldTryBrowser(model, this.catalog, userKeys)) {
      if (config.endpoints.length) {
        await this.streamWithCompletionTracking(
          (onEv) => this.streamProxyFallback({ ...body, model: "free" }, config, onEv, request.signal),
          onEvent
        );
        return;
      }
      throw new Error(
        "Selected model requires an API key for its provider. Choose free or add the provider key in Settings."
      );
    }

    if (shouldTryBrowser(model, this.catalog, userKeys)) {
      try {
        await this.streamWithCompletionTracking((onEv) => tryBrowser(onEv), onEvent);
        return;
      } catch (browserErr) {
        const err = browserErr instanceof Error ? browserErr : new Error(String(browserErr));
        if (config.endpoints.length && shouldFallbackToProxy(err)) {
          this.setStatus("browser route failed — retrying cloud proxy …");
          await this.streamWithCompletionTracking(
            (onEv) => this.streamProxyFallback(body, config, onEv, request.signal),
            onEvent
          );
          return;
        }
        throw err;
      }
    }

    if (config.endpoints.length) {
      await this.streamWithCompletionTracking(
        (onEv) => this.streamProxyFallback(body, config, onEv, request.signal),
        onEvent
      );
      return;
    }

    throw mapProxyChainFailure(
      "No chat routes are available yet. The demo proxy is still deploying — refresh in a minute."
    );
  }
}
