import { readRuntimeConfig } from "./config";

/** Pulse / STRATEGY event names — no PII, no message content. */
export const ANALYTICS_EVENTS = {
  homepageSession: "homepage_session",
  chatCompletionSuccess: "chat_completion_success",
  zeroConfigReply: "zero_config_reply",
  darkThemeLoaded: "dark_theme_loaded",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

const SESSION_PREFIX = "llm_fallbacks_evt_";

type EventMeta = {
  route?: "proxy" | "browser";
  zeroConfig?: boolean;
};

function sessionKey(event: AnalyticsEventName): string {
  return `${SESSION_PREFIX}${event}`;
}

/** Fire at most once per browser tab session. */
export function trackSessionEvent(event: AnalyticsEventName, meta: EventMeta = {}): void {
  try {
    if (sessionStorage.getItem(sessionKey(event))) return;
    sessionStorage.setItem(sessionKey(event), "1");
    sendEventBeacon(event, meta);
  } catch {
    /* private mode / blocked storage */
  }
}

function eventsUrl(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  if (trimmed.endsWith("/v1/chat/completions")) {
    return trimmed.replace(/\/v1\/chat\/completions$/, "/v1/events");
  }
  return `${trimmed}/v1/events`;
}

function sendEventBeacon(event: AnalyticsEventName, meta: EventMeta): void {
  const config = readRuntimeConfig();
  const base = config.endpoints[0];
  if (!base) return;

  const body = JSON.stringify({
    event,
    token: config.guestToken,
    ...(meta.route ? { route: meta.route } : {}),
    ...(meta.zeroConfig ? { zero_config: true } : {}),
  });

  const url = eventsUrl(base);
  const blob = new Blob([body], { type: "application/json" });

  if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, blob)) {
    return;
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* best-effort */
  });
}

export function trackChatCompletionSuccess(route: string, zeroConfig: boolean): void {
  const coarseRoute: EventMeta["route"] = route.startsWith("proxy/") ? "proxy" : "browser";
  trackSessionEvent(ANALYTICS_EVENTS.chatCompletionSuccess, { route: coarseRoute });
  if (zeroConfig) {
    trackSessionEvent(ANALYTICS_EVENTS.zeroConfigReply, { route: coarseRoute, zeroConfig: true });
  }
}
