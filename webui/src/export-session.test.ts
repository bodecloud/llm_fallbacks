import { describe, expect, it } from "vitest";
import { exportFilename, toJson, toMarkdown } from "./export-session";

describe("export-session", () => {
  it("serializes markdown with roles", () => {
    const md = toMarkdown(
      [
        {
          id: "1",
          role: "user",
          blocks: [{ type: "text", text: "Hello" }],
        },
        {
          id: "2",
          role: "assistant",
          blocks: [{ type: "text", text: "Hi there" }],
        },
      ],
      { id: "sess-1", title: "Test chat" }
    );
    expect(md).toContain("# Test chat");
    expect(md).toContain("## User");
    expect(md).toContain("Hello");
    expect(md).toContain("## Assistant");
    expect(md).toContain("Hi there");
  });

  it("serializes json", () => {
    const json = toJson(
      [{ id: "1", role: "user", blocks: [{ type: "text", text: "Ping" }] }],
      { id: "abc", title: "Ping" }
    );
    const parsed = JSON.parse(json) as { id: string; messages: { role: string }[] };
    expect(parsed.id).toBe("abc");
    expect(parsed.messages[0].role).toBe("user");
  });

  it("builds filename", () => {
    expect(exportFilename("md", "My Chat!")).toMatch(/^llm-fallbacks-my-chat-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
