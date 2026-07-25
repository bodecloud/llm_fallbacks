import type { ChatPlugin, ChatRequest, StreamEvent } from "murm-ui";
import {
  getActiveModel,
  getCatalogModels,
  getPinnedModels,
  modelOptionLabel,
} from "../../model-selection";
import type { CatalogEntry } from "../../providers/browser-router";
import type { FailoverProvider } from "../../providers/FailoverProvider";
import { showStatusMessage } from "../status-strip";
import {
  METERED_COMPARE_BANNER,
  bothColumnsMetered,
  defaultCompareState,
  type CompareState,
} from "./column-provider";

function modelOptionsHtml(selected: string): string {
  const parts: string[] = [];
  for (const pinned of getPinnedModels()) {
    parts.push(
      `<option value="${pinned.id}" ${pinned.id === selected ? "selected" : ""}>${pinned.label}</option>`
    );
  }
  for (const entry of getCatalogModels(40)) {
    if (getPinnedModels().some((p) => p.id === entry.id)) continue;
    parts.push(
      `<option value="${entry.id}" ${entry.id === selected ? "selected" : ""}>${modelOptionLabel(entry)}</option>`
    );
  }
  return parts.join("");
}

function applyDeltaToPane(pane: HTMLElement, event: StreamEvent): void {
  if (event.type === "message_start") {
    pane.textContent = "";
    return;
  }
  if (event.type === "text_delta") {
    pane.textContent = (pane.textContent || "") + event.delta;
  }
}

/** Tag message_start so history rows carry compare column + model (R33). */
function tagCompareMeta(
  event: StreamEvent,
  column: "a" | "b",
  model: string
): StreamEvent {
  if (event.type !== "message_start") return event;
  return {
    ...event,
    message: {
      ...event.message,
      meta: { ...(event.message.meta || {}), compareColumn: column, model },
    },
  };
}

export function CompareModePlugin(deps: {
  provider: FailoverProvider;
  getCatalog: () => CatalogEntry[];
}): ChatPlugin {
  let state: CompareState = defaultCompareState(getActiveModel());
  let mount: HTMLElement | null = null;
  let chrome: HTMLElement | null = null;
  let bannerEl: HTMLElement | null = null;
  let paneA: HTMLElement | null = null;
  let paneB: HTMLElement | null = null;
  let labelA: HTMLElement | null = null;
  let labelB: HTMLElement | null = null;
  let wrapped = false;

  const refreshBanner = (): void => {
    if (!bannerEl) return;
    const show = bothColumnsMetered(state, deps.getCatalog());
    bannerEl.hidden = !show;
    bannerEl.textContent = show ? METERED_COMPARE_BANNER : "";
  };

  const syncChromeVisibility = (): void => {
    if (!chrome || !mount) return;
    chrome.hidden = !state.active;
    mount.classList.toggle("lf-compare-active", state.active);
    refreshBanner();
  };

  const paintColumnLabels = (): void => {
    if (labelA) labelA.textContent = state.columns.a.model;
    if (labelB) labelB.textContent = state.columns.b.model;
  };

  return {
    name: "compare-mode",
    onMount(ctx) {
      mount = ctx.container;

      chrome = document.createElement("div");
      chrome.className = "lf-compare-chrome";
      chrome.hidden = true;
      chrome.innerHTML = `
        <p class="lf-compare-banner" id="lf-compare-banner" hidden></p>
        <div class="lf-compare-grid" role="group" aria-label="Compare two models">
          <section class="lf-compare-column" data-column="a">
            <header class="lf-compare-column-header">
              <label>
                <span class="lf-compare-column-title">Column A</span>
                <select class="lf-compare-model" data-column="a" aria-label="Compare model A"></select>
              </label>
              <span class="lf-compare-live-label" data-label="a"></span>
            </header>
            <div class="lf-compare-pane" data-pane="a" aria-live="polite"></div>
          </section>
          <section class="lf-compare-column" data-column="b">
            <header class="lf-compare-column-header">
              <label>
                <span class="lf-compare-column-title">Column B</span>
                <select class="lf-compare-model" data-column="b" aria-label="Compare model B"></select>
              </label>
              <span class="lf-compare-live-label" data-label="b"></span>
            </header>
            <div class="lf-compare-pane" data-pane="b" aria-live="polite"></div>
          </section>
        </div>
      `;

      const layout = mount.querySelector(".mur-chat-layout-wrapper");
      const formHost = mount.querySelector(".mur-chat-form-container");
      if (layout && formHost) {
        layout.insertBefore(chrome, formHost);
      } else {
        (mount.querySelector(".mur-chat-scroll-area") || mount).appendChild(chrome);
      }

      bannerEl = chrome.querySelector("#lf-compare-banner");
      paneA = chrome.querySelector('[data-pane="a"]');
      paneB = chrome.querySelector('[data-pane="b"]');
      labelA = chrome.querySelector('[data-label="a"]');
      labelB = chrome.querySelector('[data-label="b"]');

      const selectA = chrome.querySelector<HTMLSelectElement>('select[data-column="a"]')!;
      const selectB = chrome.querySelector<HTMLSelectElement>('select[data-column="b"]')!;
      selectA.innerHTML = modelOptionsHtml(state.columns.a.model);
      selectB.innerHTML = modelOptionsHtml(state.columns.b.model);
      selectA.addEventListener("change", () => {
        state.columns.a.model = selectA.value;
        paintColumnLabels();
        refreshBanner();
      });
      selectB.addEventListener("change", () => {
        state.columns.b.model = selectB.value;
        paintColumnLabels();
        refreshBanner();
      });
      paintColumnLabels();

      if (formHost) {
        const toggleRow = document.createElement("div");
        toggleRow.className = "lf-compare-toggle-row";
        toggleRow.innerHTML = `
          <label class="lf-compare-toggle">
            <input type="checkbox" id="lf-compare-toggle" />
            <span>Compare mode</span>
          </label>
          <span class="lf-compare-toggle-hint">Same prompt → two models side by side</span>
        `;
        formHost.insertBefore(toggleRow, formHost.firstChild);
        const checkbox = toggleRow.querySelector<HTMLInputElement>("#lf-compare-toggle")!;
        checkbox.addEventListener("change", () => {
          state.active = checkbox.checked;
          if (state.active) {
            state.columns.a.model = selectA.value || getActiveModel();
            selectA.value = state.columns.a.model;
            paintColumnLabels();
            showStatusMessage("Compare mode on — replies appear in both columns.");
          } else {
            showStatusMessage("Compare mode off — history kept.");
          }
          syncChromeVisibility();
        });
      }

      syncChromeVisibility();

      if (!wrapped) {
        wrapped = true;
        const original = deps.provider.streamChat.bind(deps.provider);
        deps.provider.streamChat = async (
          request: ChatRequest,
          onEvent: (event: StreamEvent) => void
        ): Promise<void> => {
          if (!state.active) {
            return original(request, onEvent);
          }

          refreshBanner();
          if (paneA) paneA.textContent = "";
          if (paneB) paneB.textContent = "";
          paintColumnLabels();

          const modelA = state.columns.a.model;
          const modelB = state.columns.b.model;
          const reqA: ChatRequest = {
            ...request,
            options: { ...request.options, model: modelA },
          };
          const reqB: ChatRequest = {
            ...request,
            options: { ...request.options, model: modelB },
          };

          // Sequential through onEvent so murm-ui appends two assistants in one
          // generation (multiple message_start). setMessages cannot run while busy.
          try {
            await original(reqA, (event) => {
              if (paneA) applyDeltaToPane(paneA, event);
              onEvent(tagCompareMeta(event, "a", modelA));
            });
          } catch (err) {
            if (paneA && !paneA.textContent) {
              paneA.textContent = err instanceof Error ? err.message : String(err);
            }
            throw err;
          }

          try {
            await original(reqB, (event) => {
              if (paneB) applyDeltaToPane(paneB, event);
              onEvent(tagCompareMeta(event, "b", modelB));
            });
          } catch (err) {
            if (paneB && !paneB.textContent) {
              paneB.textContent = err instanceof Error ? err.message : String(err);
            }
            // Column B failure must not erase column A's history message.
          }
        };
      }
    },
    beforeSubmit: async (request) => {
      if (!state.active) return;
      refreshBanner();
      return {
        options: {
          ...request.options,
          model: state.columns.a.model,
          lfCompare: true,
        },
      };
    },
    destroy() {
      chrome?.remove();
      mount?.classList.remove("lf-compare-active");
    },
  };
}
