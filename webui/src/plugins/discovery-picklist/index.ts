import type { ChatPlugin } from "murm-ui";
import {
  DISCOVERY_RESULTS_EVENT,
  type DiscoveryCandidate,
} from "../../providers/tiers/searxng-discovery-tier";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function candidateRow(candidate: DiscoveryCandidate): string {
  const title = escapeHtml(candidate.title);
  const url = escapeHtml(candidate.url);
  const snippet = escapeHtml(candidate.snippet);
  return `
    <li class="lf-discovery-item">
      <a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${title}</a>
      <span class="lf-discovery-url">${url}</span>
      ${snippet ? `<p class="lf-discovery-snippet">${snippet}</p>` : ""}
    </li>
  `;
}

/**
 * Renders SearXNG discovery results as a dismissible pick list (Q5) between
 * the chat history and the composer. Links only — the user decides what to
 * open; nothing is automated on their behalf (R39).
 */
export function DiscoveryPicklistPlugin(): ChatPlugin {
  let host: HTMLElement | null = null;
  let handler: ((event: Event) => void) | null = null;

  return {
    name: "discovery-picklist",
    onMount(ctx) {
      host = document.createElement("div");
      host.className = "lf-discovery-picklist";
      host.hidden = true;

      const layout = ctx.container.querySelector(".mur-chat-layout-wrapper");
      const form = ctx.container.querySelector(".mur-chat-form-container");
      if (layout && form) {
        layout.insertBefore(host, form);
      } else {
        ctx.container.appendChild(host);
      }

      handler = (event: Event) => {
        const detail = (event as CustomEvent<{ candidates: DiscoveryCandidate[] }>).detail;
        const candidates = detail?.candidates ?? [];
        if (!host || candidates.length === 0) return;
        host.innerHTML = `
          <div class="lf-discovery-header">
            <span>Free chat sites found via your SearXNG (open manually — nothing is automated):</span>
            <button type="button" class="panel-btn panel-btn-ghost lf-discovery-dismiss" aria-label="Dismiss suggestions">×</button>
          </div>
          <ul class="lf-discovery-list">
            ${candidates.map((c) => candidateRow(c)).join("")}
          </ul>
        `;
        host.hidden = false;
        host
          .querySelector(".lf-discovery-dismiss")
          ?.addEventListener("click", () => {
            if (host) host.hidden = true;
          });
      };
      window.addEventListener(DISCOVERY_RESULTS_EVENT, handler);
    },
    destroy() {
      if (handler) window.removeEventListener(DISCOVERY_RESULTS_EVENT, handler);
      host?.remove();
    },
  };
}
