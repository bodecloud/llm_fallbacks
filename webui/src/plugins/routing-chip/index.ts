import type { ChatPlugin } from "murm-ui";
import type { ChatEngine } from "murm-ui";
import {
  COMPLETION_META_EVENT,
  formatRoutingChip,
  getLastCompletionMeta,
  type CompletionMeta,
} from "../../providers/routing-metadata";

const CHIP_CLASS = "lf-routing-chip";

export function RoutingChipPlugin(): ChatPlugin {
  let engine: ChatEngine | null = null;
  let container: HTMLElement | null = null;
  let prevGenerating: string | null = null;

  function attachChipToLastAssistant(meta: CompletionMeta): void {
    if (!engine || !container) return;
    const assistants = engine.state.messages.filter((m) => m.role === "assistant" && !m.ephemeral);
    if (assistants.length === 0) return;

    const domAssistants = container.querySelectorAll(".mur-message-assistant");
    const msgEl = domAssistants[domAssistants.length - 1] as HTMLElement | undefined;
    if (!msgEl) return;

    let chip = msgEl.querySelector<HTMLElement>(`.${CHIP_CLASS}`);
    if (!chip) {
      chip = document.createElement("div");
      chip.className = CHIP_CLASS;
      chip.setAttribute("aria-label", "Routing metadata");
      msgEl.appendChild(chip);
    }
    chip.textContent = formatRoutingChip(meta);
  }

  function scheduleAttach(meta: CompletionMeta): void {
    requestAnimationFrame(() => {
      attachChipToLastAssistant(meta);
    });
  }

  return {
    name: "routing-chip",
    onMount(ctx) {
      engine = ctx.engine;
      container = ctx.container;

      const onMeta = (ev: Event) => {
        const detail = (ev as CustomEvent<CompletionMeta>).detail;
        if (detail) scheduleAttach(detail);
      };
      window.addEventListener(COMPLETION_META_EVENT, onMeta);

      const pending = getLastCompletionMeta();
      if (pending) scheduleAttach(pending);

      ctx.engine.subscribe((s) => s.generatingMessageId, (generatingId) => {
        if (prevGenerating && !generatingId) {
          const meta = getLastCompletionMeta();
          if (meta) scheduleAttach(meta);
        }
        prevGenerating = generatingId;
      });
    },
  };
}
