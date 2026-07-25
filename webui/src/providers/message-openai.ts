import type { Message } from "murm-ui";
import type { CatalogEntry } from "./browser-router";

// OpenAI-compatible chat content. A string for text-only turns; an array of
// parts for multimodal turns (text + inline image data URLs). LiteLLM / the
// proxy accept `image_url` parts when the resolved model supports vision.
export type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface OpenAiMessage {
  role: string;
  content: string | OpenAiContentPart[];
}

interface ImageFileBlock {
  type: "file";
  mimeType: string;
  name?: string;
  data: string;
}

function isImageFileBlock(block: { type: string }): block is ImageFileBlock {
  return (
    block.type === "file" &&
    typeof (block as ImageFileBlock).mimeType === "string" &&
    (block as ImageFileBlock).mimeType.startsWith("image/") &&
    typeof (block as ImageFileBlock).data === "string"
  );
}

function messageText(message: Message): string {
  return message.blocks
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

export function messageHasImage(message: Message): boolean {
  return message.blocks.some((b) => isImageFileBlock(b));
}

export function messagesHaveImage(messages: readonly Message[]): boolean {
  return messages.some((m) => messageHasImage(m));
}

// Multimodal projection: text-only turns stay strings; turns with image file
// blocks become an OpenAI content-part array so images are never dropped.
export function messagesToOpenAi(messages: readonly Message[]): OpenAiMessage[] {
  return messages.map((message) => {
    const text = messageText(message);
    const images = message.blocks.filter((b): b is ImageFileBlock => isImageFileBlock(b));
    if (images.length === 0) {
      return { role: message.role, content: text };
    }
    const parts: OpenAiContentPart[] = [];
    if (text) parts.push({ type: "text", text });
    for (const image of images) {
      parts.push({ type: "image_url", image_url: { url: image.data } });
    }
    return { role: message.role, content: parts };
  });
}

// Text-only projection for routes that cannot carry inline images yet
// (browser/BYOK direct calls). Image blocks are omitted here on purpose; the
// vision guard and quality_api image skip ensure such turns never reach a
// route that would silently drop the attachment.
export function messagesToPlainText(
  messages: readonly Message[]
): { role: string; content: string }[] {
  return messages.map((message) => ({ role: message.role, content: messageText(message) }));
}

export function modelSupportsVision(modelId: string, catalog: readonly CatalogEntry[]): boolean {
  const entry = catalog.find((e) => e.id === modelId);
  return entry?.supports_vision === true;
}

export function getVisionCatalogModels(catalog: readonly CatalogEntry[]): CatalogEntry[] {
  return catalog.filter((e) => e.supports_vision === true);
}
