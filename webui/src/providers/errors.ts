export class ChatRouteError extends Error {
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.name = "ChatRouteError";
    this.kind = kind;
  }
}

export class RateLimitError extends ChatRouteError {
  constructor(message = "Rate limit reached. Wait a moment and try again.") {
    super("rate_limit", message);
    this.name = "RateLimitError";
  }
}

export class QuotaError extends ChatRouteError {
  constructor(message = "Daily quota exhausted for this route. Try again tomorrow or use a different model.") {
    super("quota", message);
    this.name = "QuotaError";
  }
}

export class ColdStartError extends ChatRouteError {
  constructor(message = "The proxy is waking up — retry in a few seconds.") {
    super("cold_start", message);
    this.name = "ColdStartError";
  }
}

export class AuthError extends ChatRouteError {
  constructor(message = "Authentication failed. Check your guest token in Server settings.") {
    super("auth", message);
    this.name = "AuthError";
  }
}

export class ProxyUnavailableError extends ChatRouteError {
  constructor(message = "All proxy endpoints failed. Try again later or check Server settings.") {
    super("proxy_unavailable", message);
    this.name = "ProxyUnavailableError";
  }
}

const QUOTA_RE = /quota|credit|insufficient|billing|exhausted/i;
const COLD_START_RE = /cold start|starting up|still deploying|proxy pending|503|502/i;

export type RateLimitScope = "minute" | "day";

export interface RateLimitInfo {
  retryAfterSeconds?: number;
  scope?: RateLimitScope;
}

function formatRateLimitMessage(endpoint: string, info?: RateLimitInfo): string {
  const scope = info?.scope;
  const seconds = info?.retryAfterSeconds;
  let prefix = `Rate limit exceeded at ${endpoint}.`;
  if (scope === "day") {
    prefix = `Daily rate limit reached at ${endpoint}.`;
  } else if (scope === "minute") {
    prefix = `Per-minute rate limit reached at ${endpoint}.`;
  }
  if (seconds !== undefined && seconds > 0) {
    const unit = seconds === 1 ? "second" : "seconds";
    return `${prefix} Try again in ${seconds} ${unit}.`;
  }
  return `${prefix} Wait and try again.`;
}

function parseRateLimitScope(bodyText: string): RateLimitScope | undefined {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { type?: string; message?: string };
    };
    const message = parsed.error?.message ?? "";
    if (/daily|per day|\(day\)/i.test(message)) return "day";
    if (/minute|\(minute\)/i.test(message)) return "minute";
    if (parsed.error?.type === "rate_limit") {
      if (/day/i.test(message)) return "day";
      if (/minute/i.test(message)) return "minute";
    }
  } catch {
    /* not JSON */
  }
  return undefined;
}

export function mapHttpError(
  status: number,
  bodyText: string,
  endpoint: string,
  rateLimit?: RateLimitInfo
): ChatRouteError {
  const snippet = bodyText.slice(0, 200);
  if (status === 401 || status === 403) {
    if (/turnstile/i.test(bodyText)) {
      return new AuthError(
        `Turnstile verification required at ${endpoint}. Complete the check and try again.`
      );
    }
    return new AuthError(`Authentication failed at ${endpoint}. Check your guest token in Server settings.`);
  }
  if (status === 429) {
    const scope = rateLimit?.scope ?? parseRateLimitScope(bodyText);
    return new RateLimitError(formatRateLimitMessage(endpoint, { ...rateLimit, scope }));
  }
  if (QUOTA_RE.test(bodyText)) {
    return new QuotaError(`Quota exhausted at ${endpoint}. ${snippet}`);
  }
  if (status === 502 || status === 503 || COLD_START_RE.test(bodyText)) {
    return new ColdStartError(`Proxy at ${endpoint} is unavailable (${status}). Retry shortly.`);
  }
  return new ProxyUnavailableError(`${endpoint}: HTTP ${status} — ${snippet}`);
}

function endpointFromChainError(lastError: string): string {
  const match = lastError.match(/^(.+?): HTTP \d+/);
  return match?.[1]?.trim() || "proxy";
}

export function mapProxyChainFailure(lastError: string, rateLimit?: RateLimitInfo): ChatRouteError {
  if (/401|403|Unauthorized/i.test(lastError)) {
    return new AuthError(lastError);
  }
  if (/429|rate limit/i.test(lastError)) {
    const endpoint = endpointFromChainError(lastError);
    if (rateLimit?.retryAfterSeconds || rateLimit?.scope) {
      return new RateLimitError(formatRateLimitMessage(endpoint, rateLimit));
    }
    return new RateLimitError(lastError);
  }
  if (QUOTA_RE.test(lastError)) {
    return new QuotaError(lastError);
  }
  if (COLD_START_RE.test(lastError)) {
    return new ColdStartError(lastError);
  }
  return new ProxyUnavailableError(lastError);
}
