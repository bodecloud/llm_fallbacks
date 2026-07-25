import type { ChatPlugin } from "murm-ui";
import type { ChatEngine } from "murm-ui";
import { TIER_LABELS } from "../tier-settings/settings";
import type { RouteHop } from "../../providers/route-trace";
import {
  COMPLETION_META_EVENT,
  FREE_ALIAS_NOTE,
  formatRoutingChip,
  formatUsageBadge,
  getLastCompletionMeta,
  hostnameFromUrl,
  type CompletionMeta,
} from "../../providers/routing-metadata";

const CHIP_CLASS = "lf-routing-chip";
const ROOT_CLASS = "lf-routing-root";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function outcomeLabel(outcome: RouteHop["outcome"]): string {
  if (outcome === "success") return "ok";
  if (outcome === "skip") return "skip";
  return outcome === "error" ? "error" : outcome;
}

function hopRow(hop: RouteHop): string {
  const tier = TIER_LABELS[hop.tier] ?? hop.tier;
  const host = hop.endpoint ? hostnameFromUrl(hop.endpoint) : "";
  const model = hop.model ? escapeHtml(hop.model) : "";
  const reason = hop.reason ? escapeHtml(hop.reason) : "";
  const parts = [
    `<span class="lf-hop-index">#${hop.hopIndex}</span>`,
    `<span class="lf-hop-tier">${escapeHtml(tier)}</span>`,
  ];
  if (host) parts.push(`<span class="lf-hop-endpoint">${escapeHtml(host)}</span>`);
  if (model) parts.push(`<span class="lf-hop-model">${model}</span>`);
  parts.push(
    `<span class="lf-hop-outcome lf-hop-outcome-${hop.outcome}">${outcomeLabel(hop.outcome)}</span>`
  );
  return `
    <li class="lf-hop-row" data-outcome="${hop.outcome}">
      <div class="lf-hop-main">${parts.join("")}</div>
      ${reason ? `<p class="lf-hop-reason">${reason}</p>` : ""}
    </li>
  `;
}

function renderChip(root: HTMLElement, meta: CompletionMeta): void {
  const summary = formatRoutingChip(meta);
  const badge = formatUsageBadge(meta);
  const hops = meta.trace ?? [];
  const panelId = `lf-routing-panel-${Math.random().toString(36).slice(2, 9)}`;

  root.className = ROOT_CLASS;
  root.innerHTML = `
    <button type="button" class="${CHIP_CLASS}" aria-expanded="false" aria-controls="${panelId}">
      <span class="lf-routing-summary">${escapeHtml(summary)}</span>
      ${badge ? `<span class="lf-usage-badge">${escapeHtml(badge)}</span>` : ""}
      <span class="lf-routing-chevron" aria-hidden="true">▾</span>
    </button>
    <div id="${panelId}" class="lf-routing-panel" hidden>
      ${
        hops.length
          ? `<ol class="lf-hop-list">${hops.map((h) => hopRow(h)).join("")}</ol>`
          : `<p class="lf-routing-empty">No hop details for this reply.</p>`
      }
      <p class="lf-alias-note">${escapeHtml(FREE_ALIAS_NOTE)}</p>
    </div>
  `;

  const toggle = root.querySelector<HTMLButtonElement>(`.${CHIP_CLASS}`);
  const panel = root.querySelector<HTMLElement>(".lf-routing-panel");
  toggle?.addEventListener("click", () => {
    if (!toggle || !panel) return;
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    panel.hidden = open;
  });
}

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

    let root = msgEl.querySelector<HTMLElement>(`.${ROOT_CLASS}`);
    if (!root) {
      root = document.createElement("div");
      msgEl.appendChild(root);
    }
    renderChip(root, meta);
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
