import { describe, expect, it } from "vitest";
import type { Message } from "murm-ui";
import type { CatalogEntry } from "./browser-router";
import {
  getVisionCatalogModels,
  messagesHaveImage,
  messagesToOpenAi,
  messagesToPlainText,
  modelSupportsVision,
} from "./message-openai";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANS";

function textMessage(role: Message["role"], text: string): Message {
  return { id: `${role}-1`, role, blocks: [{ id: "b1", type: "text", text }] };
}

function imageMessage(text: string): Message {
  return {
    id: "user-img",
    role: "user",
    blocks: [
      { id: "t1", type: "text", text },
      { id: "f1", type: "file", mimeType: "image/png", name: "shot.png", data: PNG_DATA_URL },
    ],
  };
}

const catalog: CatalogEntry[] = [
  { id: "vision/model", supports_vision: true },
  { id: "text/model", supports_vision: false },
];

describe("messagesToOpenAi", () => {
  it("keeps text-only turns as string content", () => {
    const result = messagesToOpenAi([textMessage("user", "hello")]);
    expect(result).toEqual([{ role: "user", content: "hello" }]);
  });

  it("maps an image file block to an image_url content part", () => {
    const result = messagesToOpenAi([imageMessage("describe this")]);
    expect(result).toHaveLength(1);
    const content = result[0].content;
    expect(Array.isArray(content)).toBe(true);
    const parts = content as { type: string }[];
    expect(parts).toContainEqual({ type: "text", text: "describe this" });
    expect(parts).toContainEqual({ type: "image_url", image_url: { url: PNG_DATA_URL } });
  });

  it("omits the text part when the turn is image-only", () => {
    const result = messagesToOpenAi([
      { id: "u", role: "user", blocks: [{ id: "f", type: "file", mimeType: "image/png", data: PNG_DATA_URL }] },
    ]);
    const parts = result[0].content as { type: string }[];
    expect(parts).toEqual([{ type: "image_url", image_url: { url: PNG_DATA_URL } }]);
  });
});

describe("messagesToPlainText", () => {
  it("drops image blocks and keeps text", () => {
    const result = messagesToPlainText([imageMessage("caption")]);
    expect(result).toEqual([{ role: "user", content: "caption" }]);
  });
});

describe("image + vision helpers", () => {
  it("detects image attachments", () => {
    expect(messagesHaveImage([imageMessage("x")])).toBe(true);
    expect(messagesHaveImage([textMessage("user", "x")])).toBe(false);
  });

  it("resolves vision capability from the catalog", () => {
    expect(modelSupportsVision("vision/model", catalog)).toBe(true);
    expect(modelSupportsVision("text/model", catalog)).toBe(false);
    // Unknown / alias models (e.g. "free") are treated as non-vision.
    expect(modelSupportsVision("free", catalog)).toBe(false);
  });

  it("lists vision-capable catalog models (R30)", () => {
    expect(getVisionCatalogModels(catalog).map((e) => e.id)).toEqual(["vision/model"]);
  });
});
