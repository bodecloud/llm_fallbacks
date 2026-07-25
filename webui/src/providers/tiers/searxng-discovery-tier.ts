/**
 * SearXNG discovery tier (R39): query a user-configured SearXNG instance for
 * candidate free web chat URLs. Discovery never chats by itself — results are
 * presented as a pick list (Q5) or fed to the opt-in web runner. Errors are
 * typed so the orchestrator surfaces actionable diagnostics (R40).
 */

export interface DiscoveryCandidate {
  url: string;
  title: string;
  snippet: string;
}

export class DiscoveryEmptyError extends Error {
  constructor(query: string) {
    super(`SearXNG returned no candidate free chat sites for "${query}".`);
    this.name = "DiscoveryEmptyError";
  }
}

export class DiscoveryUnavailableError extends Error {
  constructor(endpoint: string, cause: string) {
    super(
      `SearXNG at ${endpoint} is unreachable (${cause}). ` +
        "Check the URL in Tiers settings and that the instance allows browser requests (CORS)."
    );
    this.name = "DiscoveryUnavailableError";
  }
}

export const DEFAULT_DISCOVERY_QUERY = "free AI chat online no signup";

const CHAT_HINT_RE = /\b(chat|gpt|assistant|llm|ai)\b/i;
const EXCLUDED_HOST_RE =
  /(^|\.)(wikipedia\.org|youtube\.com|reddit\.com|github\.com|medium\.com|x\.com|twitter\.com|facebook\.com|linkedin\.com)$/i;
const MAX_CANDIDATES = 6;

interface SearxngResult {
  url?: string;
  title?: string;
  content?: string;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Heuristic filter: https chat-looking results, one per host, capped. */
export function filterChatCandidates(results: SearxngResult[]): DiscoveryCandidate[] {
  const seenHosts = new Set<string>();
  const candidates: DiscoveryCandidate[] = [];
  for (const result of results) {
    const url = result.url?.trim() ?? "";
    if (!url.startsWith("https://")) continue;
    const host = hostOf(url);
    if (!host || seenHosts.has(host) || EXCLUDED_HOST_RE.test(host)) continue;
    const haystack = `${url} ${result.title ?? ""} ${result.content ?? ""}`;
    if (!CHAT_HINT_RE.test(haystack)) continue;
    seenHosts.add(host);
    candidates.push({
      url,
      title: result.title?.trim() || host,
      snippet: (result.content ?? "").trim().slice(0, 200),
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

export function discoverySearchUrl(searxngUrl: string, query: string): string {
  const base = searxngUrl.replace(/\/$/, "");
  return `${base}/search?q=${encodeURIComponent(query)}&format=json`;
}

export async function searchFreeChatCandidates(options: {
  searxngUrl: string;
  query?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<DiscoveryCandidate[]> {
  const query = options.query?.trim() || DEFAULT_DISCOVERY_QUERY;
  const doFetch = options.fetchImpl ?? fetch;
  const url = discoverySearchUrl(options.searxngUrl, query);

  let res: Response;
  try {
    res = await doFetch(url, {
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    // Browser fetch failures (including CORS) surface as opaque TypeErrors.
    const cause = err instanceof Error ? err.message : String(err);
    throw new DiscoveryUnavailableError(options.searxngUrl, cause || "network/CORS error");
  }

  if (!res.ok) {
    throw new DiscoveryUnavailableError(options.searxngUrl, `HTTP ${res.status}`);
  }

  let parsed: { results?: SearxngResult[] };
  try {
    parsed = (await res.json()) as { results?: SearxngResult[] };
  } catch {
    throw new DiscoveryUnavailableError(
      options.searxngUrl,
      "non-JSON response — enable the JSON format in SearXNG settings"
    );
  }

  const candidates = filterChatCandidates(parsed.results ?? []);
  if (candidates.length === 0) {
    throw new DiscoveryEmptyError(query);
  }
  return candidates;
}

/** Event fired with discovered candidates so the pick-list plugin can render them. */
export const DISCOVERY_RESULTS_EVENT = "llm-fallbacks:discovery-results";

export function broadcastDiscoveryResults(candidates: DiscoveryCandidate[]): void {
  window.dispatchEvent(
    new CustomEvent(DISCOVERY_RESULTS_EVENT, { detail: { candidates } })
  );
}
