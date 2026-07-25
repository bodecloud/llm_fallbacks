import { describe, expect, it } from "vitest";
import { toJson, toMarkdown } from "./export-session";
import {
  ImportError,
  parseJsonExport,
  parseMarkdownExport,
  parseExportText,
} from "./import-session";

describe("import-session", () => {
  it("round-trips JSON export", () => {
    const messages = [
      { id: "1", role: "user" as const, blocks: [{ type: "text" as const, text: "Hello" }] },
      {
        id: "2",
        role: "assistant" as const,
        blocks: [{ type: "text" as const, text: "Hi there" }],
      },
    ];
    const json = toJson(messages, { id: "sess-1", title: "Test" });
    const parsed = parseJsonExport(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].role).toBe("user");
    expect(parsed[1].role).toBe("assistant");
    expect(parsed[0].blocks[0]).toMatchObject({ type: "text", text: "Hello" });
    expect(parsed[1].blocks[0]).toMatchObject({ type: "text", text: "Hi there" });
  });

  it("parses markdown with two turns", () => {
    const md = toMarkdown(
      [
        { id: "1", role: "user", blocks: [{ type: "text", text: "Question?" }] },
        { id: "2", role: "assistant", blocks: [{ type: "text", text: "Answer." }] },
      ],
      { id: "x", title: "Chat" }
    );
    const parsed = parseMarkdownExport(md);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].blocks[0]).toMatchObject({ text: "Question?" });
    expect(parsed[1].blocks[0]).toMatchObject({ text: "Answer." });
  });

  it("rejects invalid JSON", () => {
    expect(() => parseJsonExport("{")).toThrow(ImportError);
    expect(() => parseJsonExport('{"messages":[]}')).toThrow(/empty/i);
  });

  it("rejects empty markdown", () => {
    expect(() => parseMarkdownExport("   ")).toThrow(/empty/i);
    expect(() => parseMarkdownExport("# Title only")).toThrow(/headings/i);
  });

  it("detects format by extension", () => {
    const json = parseExportText('{"messages":[{"role":"user","text":"Hi"}]}', "x.json");
    expect(json).toHaveLength(1);
  });
});
