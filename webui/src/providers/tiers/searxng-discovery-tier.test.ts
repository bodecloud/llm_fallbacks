import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DISCOVERY_QUERY,
  DiscoveryEmptyError,
  DiscoveryUnavailableError,
  discoverySearchUrl,
  filterChatCandidates,
  searchFreeChatCandidates,
} from "./searxng-discovery-tier";

const SEARX = "http://127.0.0.1:8080";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("filterChatCandidates", () => {
  it("keeps https chat-looking results, one per host, capped", () => {
    const results = [
      { url: "https://chat.example.com", title: "Example AI Chat", content: "free chat" },
      { url: "https://chat.example.com/other", title: "Same host again", content: "chat" },
      { url: "http://insecure.example.org", title: "AI chat", content: "chat" },
      { url: "https://en.wikipedia.org/wiki/Chatbot", title: "Chatbot", content: "chat" },
      { url: "https://plain.example.net", title: "Cooking recipes", content: "food" },
      { url: "https://gpt.example.io", title: "Free GPT playground", content: "" },
    ];
    const candidates = filterChatCandidates(results);
    expect(candidates.map((c) => c.url)).toEqual([
      "https://chat.example.com",
      "https://gpt.example.io",
    ]);
  });
});

describe("searchFreeChatCandidates", () => {
  it("returns ≥1 candidate from mock SearXNG JSON (AE4)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: [
          { url: "https://chat.example.com", title: "Example AI Chat", content: "no signup" },
        ],
      })
    );
    const candidates = await searchFreeChatCandidates({ searxngUrl: SEARX, fetchImpl });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].url).toBe("https://chat.example.com");
    expect(fetchImpl).toHaveBeenCalledWith(
      discoverySearchUrl(SEARX, DEFAULT_DISCOVERY_QUERY),
      expect.objectContaining({ headers: { Accept: "application/json" } })
    );
  });

  it("throws a typed empty diagnostic when nothing matches (R40)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [] }));
    await expect(
      searchFreeChatCandidates({ searxngUrl: SEARX, fetchImpl })
    ).rejects.toBeInstanceOf(DiscoveryEmptyError);
  });

  it("maps fetch failure (CORS/network) to a clear diagnostic", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      searchFreeChatCandidates({ searxngUrl: SEARX, fetchImpl })
    ).rejects.toMatchObject({
      name: "DiscoveryUnavailableError",
      message: expect.stringContaining("CORS"),
    });
  });

  it("maps HTTP errors and non-JSON bodies to unavailable diagnostics", async () => {
    const fetch403 = vi.fn(async () => new Response("forbidden", { status: 403 }));
    await expect(
      searchFreeChatCandidates({ searxngUrl: SEARX, fetchImpl: fetch403 })
    ).rejects.toBeInstanceOf(DiscoveryUnavailableError);

    const fetchHtml = vi.fn(async () => new Response("<html></html>", { status: 200 }));
    await expect(
      searchFreeChatCandidates({ searxngUrl: SEARX, fetchImpl: fetchHtml })
    ).rejects.toMatchObject({ message: expect.stringContaining("JSON format") });
  });
});
