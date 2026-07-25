import type { ChatPlugin, Message } from "murm-ui";
import type { ChatEngine } from "murm-ui";

function extractText(msg: Message): string {
  return msg.blocks
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

function newBlockId(): string {
  return crypto.randomUUID();
}

function findUserForAssistant(engine: ChatEngine, assistantMsg: Message): Message | null {
  const messages = engine.state.messages;
  const idx = messages.findIndex((m) => m.id === assistantMsg.id);
  if (idx <= 0) return null;
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i];
  }
  return null;
}

const ICON_REGEN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>`;
const ICON_EDIT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

export function MessageActionsPlugin(): ChatPlugin {
  let engine: ChatEngine | null = null;
  let root: HTMLElement | null = null;

  return {
    name: "message-actions",
    onMount(ctx) {
      engine = ctx.engine;
      root = ctx.container;
      const origStop = ctx.engine.stopGeneration.bind(ctx.engine);
      ctx.engine.stopGeneration = async () => {
        const generatingId = ctx.engine.state.generatingMessageId;
        let partialText = "";
        if (generatingId) {
          const pending = ctx.engine.state.messages.find((m) => m.id === generatingId);
          if (pending) partialText = extractText(pending);
        }
        if (!partialText.trim() && root) {
          const live = root.querySelector(".mur-message-assistant.mur-generating .mur-message-blocks-wrapper");
          partialText = (live?.textContent ?? "").trim();
        }
        await origStop();
        await new Promise((r) => setTimeout(r, 50));
        if (partialText.trim() && !ctx.engine.isBusy) {
          const lastUser = [...ctx.engine.state.messages].reverse().find((m) => m.role === "user");
          const now = Date.now();
          const assistantId = newBlockId();
          await ctx.engine.setMessages([
            ...ctx.engine.state.messages,
            {
              id: assistantId,
              role: "assistant",
              blocks: [{ id: newBlockId(), type: "text", text: partialText }],
              runId: lastUser?.runId ?? lastUser?.id ?? assistantId,
              createdAt: now,
              updatedAt: now,
            },
          ]);
        }
      };
    },
    getActionButtons(msg) {
      if (!engine) return [];

      if (msg.role === "assistant" && !msg.ephemeral && extractText(msg).trim()) {
        return [
          {
            id: "regenerate",
            title: "Regenerate response",
            iconHtml: ICON_REGEN,
            onClick: ({ message }) => {
              if (!engine || engine.isBusy) return;
              const userMsg = findUserForAssistant(engine, message);
              if (!userMsg) return;
              const text = extractText(userMsg);
              if (!text.trim()) return;
              engine.editAndResubmit(userMsg.id, text);
            },
          },
        ];
      }

      if (msg.role === "user" && extractText(msg).trim()) {
        return [
          {
            id: "edit",
            title: "Edit message",
            iconHtml: ICON_EDIT,
            onClick: ({ message }) => {
              if (!engine || engine.isBusy) return;
              const current = extractText(message);
              const next = window.prompt("Edit your message:", current);
              if (next === null || next.trim() === current.trim()) return;
              engine.editAndResubmit(message.id, next.trim());
            },
          },
        ];
      }

      return [];
    },
  };
}
