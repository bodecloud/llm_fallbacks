import { describe, expect, it } from "vitest";
import {
  AuthError,
  ColdStartError,
  mapHttpError,
  mapProxyChainFailure,
  QuotaError,
  RateLimitError,
} from "./errors";

describe("errors", () => {
  it("maps 429 to RateLimitError", () => {
    const err = mapHttpError(429, "too many", "https://proxy.test");
    expect(err).toBeInstanceOf(RateLimitError);
  });

  it("maps 401 to AuthError", () => {
    const err = mapHttpError(401, "Unauthorized", "https://proxy.test");
    expect(err).toBeInstanceOf(AuthError);
  });

  it("maps quota strings to QuotaError", () => {
    const err = mapHttpError(400, "insufficient quota", "https://proxy.test");
    expect(err).toBeInstanceOf(QuotaError);
  });

  it("maps 503 to ColdStartError", () => {
    const err = mapHttpError(503, "unavailable", "https://proxy.test");
    expect(err).toBeInstanceOf(ColdStartError);
  });

  it("maps proxy chain auth failure", () => {
    const err = mapProxyChainFailure("secondary: HTTP 401 — Unauthorized");
    expect(err).toBeInstanceOf(AuthError);
  });
});
