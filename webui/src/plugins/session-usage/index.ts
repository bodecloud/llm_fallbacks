import type { ChatPlugin } from "murm-ui";
import {
  COMPLETION_META_EVENT,
  type CompletionMeta,
} from "../../providers/routing-metadata";
import {
  accumulateSessionTotals,
  emptySessionTotals,
  formatSessionTotals,
  type SessionUsageTotals,
} from "./totals";

/**
 * Client-side session totals row (R60). Aggregates tokens (when exposed) and
 * wall time from COMPLETION_META_EVENT; resets on session switch.
 */
export function SessionUsagePlugin(): ChatPlugin {
  let host: HTMLElement | null = null;
  let totals: SessionUsageTotals = emptySessionTotals();
  let sessionId: string | null = null;
  let onMeta: ((event: Event) => void) | null = null;

  const paint = (): void => {
    if (!host) return;
    host.textContent = formatSessionTotals(totals);
    host.hidden = totals.replies === 0;
  };

  const reset = (): void => {
    totals = emptySessionTotals();
    paint();
  };

  return {
    name: "session-usage",
    onMount(ctx) {
      host = document.createElement("div");
      host.className = "lf-session-totals";
      host.setAttribute("aria-live", "polite");
      host.hidden = true;

      const layout = ctx.container.querySelector(".mur-chat-layout-wrapper");
      const form = ctx.container.querySelector(".mur-chat-form-container");
      if (layout && form) {
        layout.insertBefore(host, form);
      } else {
        ctx.container.appendChild(host);
      }

      sessionId = ctx.engine.state.currentSessionId;
      onMeta = (event: Event) => {
        const detail = (event as CustomEvent<CompletionMeta>).detail;
        if (!detail) return;
        totals = accumulateSessionTotals(totals, detail);
        paint();
      };
      window.addEventListener(COMPLETION_META_EVENT, onMeta);

      ctx.engine.subscribe(
        (s) => s.currentSessionId,
        (id) => {
          if (id !== sessionId) {
            sessionId = id;
            reset();
          }
        }
      );
    },
    destroy() {
      if (onMeta) window.removeEventListener(COMPLETION_META_EVENT, onMeta);
      host?.remove();
    },
  };
}
