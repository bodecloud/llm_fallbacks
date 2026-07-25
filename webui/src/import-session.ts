import type { Message } from "murm-ui";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

interface JsonExportPayload {
  title?: string | null;
  messages?: Array<{ role?: string; text?: string }>;
}

function newMessage(role: "user" | "assistant", text: string): Message {
  const id = crypto.randomUUID();
  const now = Date.now();
  return {
    id,
    role,
    blocks: [{ id: crypto.randomUUID(), type: "text", text }],
    runId: id,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseJsonExport(text: string): Message[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError("Invalid JSON — could not parse file.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ImportError("Invalid JSON — expected an object with a messages array.");
  }
  const payload = parsed as JsonExportPayload;
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new ImportError("Invalid JSON — messages array is missing or empty.");
  }
  const messages: Message[] = [];
  for (const item of payload.messages) {
    if (!item || typeof item !== "object") continue;
    const role = item.role;
    const msgText = typeof item.text === "string" ? item.text.trim() : "";
    if (role !== "user" && role !== "assistant") {
      throw new ImportError(`Invalid JSON — unknown role "${String(role)}".`);
    }
    if (!msgText) continue;
    messages.push(newMessage(role, msgText));
  }
  if (messages.length === 0) {
    throw new ImportError("No messages with text found in JSON export.");
  }
  return messages;
}

export function parseMarkdownExport(text: string): Message[] {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ImportError("Markdown file is empty.");
  }
  const sections = trimmed.split(/^##\s+(User|Assistant)\s*$/im);
  if (sections.length < 3) {
    throw new ImportError("Could not find ## User / ## Assistant headings in Markdown.");
  }
  const messages: Message[] = [];
  for (let i = 1; i < sections.length; i += 2) {
    const roleLabel = sections[i]?.toLowerCase();
    const content = (sections[i + 1] ?? "").trim();
    if (!content) continue;
    const role = roleLabel === "user" ? "user" : "assistant";
    messages.push(newMessage(role, content));
  }
  if (messages.length === 0) {
    throw new ImportError("No message content found under headings.");
  }
  return messages;
}

export function parseExportText(text: string, filename: string): Message[] {
  if (filename.toLowerCase().endsWith(".json")) {
    return parseJsonExport(text);
  }
  return parseMarkdownExport(text);
}

export async function importMessagesFromFile(file: File): Promise<Message[]> {
  const text = await file.text();
  return parseExportText(text, file.name);
}

export function importTitleFromFile(text: string, filename: string): string | undefined {
  if (filename.toLowerCase().endsWith(".json")) {
    try {
      const parsed = JSON.parse(text) as { title?: string | null };
      const title = parsed.title?.trim();
      if (title) return title;
    } catch {
      /* fall through */
    }
  }
  const base = filename.replace(/\.(md|json)$/i, "");
  const slug = base.replace(/^llm-fallbacks-/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return slug.replace(/-/g, " ").trim() || undefined;
}
