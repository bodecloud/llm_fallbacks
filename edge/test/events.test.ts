import { describe, expect, it } from "vitest";
import {
  ALLOWED_EVENTS,
  counterKey,
  parseEventBody,
  recentUtcDays,
  utcDayKey,
} from "../src/events";

describe("parseEventBody", () => {
  it("accepts whitelisted events", () => {
    expect(parseEventBody({ event: "homepage_session", token: "x" })).toEqual({
      event: "homepage_session",
    });
  });

  it("rejects unknown events", () => {
    expect(parseEventBody({ event: "message_content" })).toBeNull();
  });

  it("truncates route metadata", () => {
    expect(parseEventBody({ event: "chat_completion_success", route: "proxy/very-long-url" })).toEqual({
      event: "chat_completion_success",
      route: "proxy/very-long-",
    });
  });
});

describe("counter keys", () => {
  it("uses utc day buckets", () => {
    expect(counterKey("2026-07-24", "homepage_session")).toBe("day:2026-07-24:event:homepage_session");
    expect(utcDayKey(new Date("2026-07-24T23:59:00Z"))).toBe("2026-07-24");
  });

  it("lists recent days", () => {
    expect(recentUtcDays(2)).toHaveLength(2);
  });

  it("covers pulse event names", () => {
    expect(ALLOWED_EVENTS.has("chat_completion_success")).toBe(true);
    expect(ALLOWED_EVENTS.has("zero_config_reply")).toBe(true);
  });
});
