import type { ChatRequest, StreamEvent } from "murm-ui";
import { classifyHopError, type RouteTrace } from "../route-trace";
import { loadProviderTierSettings } from "./settings";
import type { TierAttempt, TierId } from "./types";
import { TierOrchestratorError, TierSkipError } from "./types";

export interface TierHandlers {
  qualityApi: (request: ChatRequest, onEvent: (event: StreamEvent) => void) => Promise<void>;
  webUi: (request: ChatRequest, onEvent: (event: StreamEvent) => void) => Promise<void>;
  searxngDiscovery: (
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ) => Promise<void>;
  proxyFailover: (request: ChatRequest, onEvent: (event: StreamEvent) => void) => Promise<void>;
}

function formatAttemptError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export class TierOrchestrator {
  constructor(
    private readonly handlers: TierHandlers,
    private readonly trace?: RouteTrace
  ) {}

  async streamChat(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const settings = loadProviderTierSettings();
    const attempts: TierAttempt[] = [];

    for (const entry of settings.tiers) {
      if (!entry.enabled) continue;

      const handler = this.handlerFor(entry.id);
      if (!handler) continue;

      try {
        await handler(request, onEvent);
        // Handlers like proxy_failover may already have recorded endpoint hops.
        if (this.trace && !this.trace.hasTier(entry.id)) {
          this.trace.record({ tier: entry.id, outcome: "success" });
        }
        return;
      } catch (err) {
        if (err instanceof TierSkipError) {
          attempts.push({ tier: entry.id, error: err.message });
          this.trace?.record({
            tier: entry.id,
            outcome: "skip",
            errorClass: "skip",
            reason: err.message,
          });
          continue;
        }
        attempts.push({ tier: entry.id, error: formatAttemptError(err) });
        // Proxy loop records its own endpoint hops; only add a tier-level error
        // when the handler left no trail for this tier.
        if (this.trace && !this.trace.hasTier(entry.id)) {
          this.trace.record({
            tier: entry.id,
            outcome: "error",
            errorClass: classifyHopError(err),
            reason: formatAttemptError(err),
          });
        }
        if (request.signal.aborted) throw err;
      }
    }

    const summary = attempts.map((a) => `${a.tier}: ${a.error}`).join("; ");
    throw new TierOrchestratorError(
      summary || "No provider tiers are enabled.",
      attempts
    );
  }

  private handlerFor(id: TierId): TierHandlers[keyof TierHandlers] | null {
    switch (id) {
      case "quality_api":
        return this.handlers.qualityApi;
      case "web_ui":
        return this.handlers.webUi;
      case "searxng_discovery":
        return this.handlers.searxngDiscovery;
      case "proxy_failover":
        return this.handlers.proxyFailover;
      default:
        return null;
    }
  }
}

export function qualityApiTierUnavailable(): TierSkipError {
  return new TierSkipError(
    "quality_api",
    "No BYOK API key set for the selected model — skipping direct routes."
  );
}

export function webUiTierUnavailable(): TierSkipError {
  return new TierSkipError("web_ui", "Web UI tier is not configured.");
}

export function searxngTierUnavailable(): TierSkipError {
  return new TierSkipError("searxng_discovery", "SearXNG discovery is not configured.");
}
