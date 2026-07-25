import type { ChatPlugin } from "murm-ui";
import { catalogSummaryLine } from "../../catalog-display";
import {
  findCatalogEntry,
  getActiveModel,
  getCatalogModels,
  getPinnedModels,
  MODEL_CHANGED_EVENT,
  modelOptionLabel,
  setActiveModel,
} from "../../model-selection";

const R11_TEXT =
  "`free` = our ranked chain; `openrouter/free` = OpenRouter meta-router";
const RANK_HELP_URL = "https://github.com/bodecloud/llm_fallbacks#quality-scoring";

export function ModelPickerPlugin(): ChatPlugin {
  let selectEl: HTMLSelectElement | null = null;
  let detailEl: HTMLElement | null = null;

  function syncDetail(): void {
    if (!detailEl) return;
    const active = getActiveModel();
    const pinned = getPinnedModels().find((p) => p.id === active);
    if (pinned) {
      detailEl.textContent = pinned.label;
      return;
    }
    const entry = findCatalogEntry(active);
    detailEl.textContent = entry ? catalogSummaryLine(entry) : active;
  }

  function syncSelect(): void {
    if (!selectEl) return;
    const active = getActiveModel();
    if (selectEl.value !== active) {
      const opt = selectEl.querySelector<HTMLOptionElement>(`option[value="${CSS.escape(active)}"]`);
      if (opt) selectEl.value = active;
    }
  }

  function populateOptions(): void {
    if (!selectEl) return;
    const active = getActiveModel();
    selectEl.innerHTML = "";
    for (const pinned of getPinnedModels()) {
      const opt = document.createElement("option");
      opt.value = pinned.id;
      opt.textContent = pinned.label;
      selectEl.appendChild(opt);
    }
    for (const entry of getCatalogModels()) {
      if (getPinnedModels().some((p) => p.id === entry.id)) continue;
      const opt = document.createElement("option");
      opt.value = entry.id;
      opt.textContent = modelOptionLabel(entry);
      selectEl.appendChild(opt);
    }
    selectEl.value = active;
  }

  return {
    name: "model-picker",
    beforeSubmit: async (request) => {
      return {
        options: {
          ...request.options,
          model: getActiveModel(),
        },
      };
    },
    onMount(ctx) {
      const form = ctx.container.querySelector(".mur-chat-form-container");
      if (!form) return;

      const wrapper = document.createElement("div");
      wrapper.className = "lf-model-picker-row";
      wrapper.innerHTML = `
        <div class="lf-model-picker-main">
          <label class="lf-model-picker-label">
            <span class="lf-model-picker-title">Model</span>
            <select class="lf-model-picker-select" aria-label="Chat model"></select>
          </label>
          <p id="lf-model-detail" class="lf-model-detail" aria-live="polite"></p>
        </div>
        <div class="lf-model-picker-info">
          <p class="lf-model-picker-help">${R11_TEXT}</p>
          <a class="lf-model-rank-link" href="${RANK_HELP_URL}" target="_blank" rel="noopener noreferrer">Why this rank?</a>
        </div>
      `;

      form.insertBefore(wrapper, form.firstChild);
      selectEl = wrapper.querySelector(".lf-model-picker-select");
      detailEl = wrapper.querySelector("#lf-model-detail");
      if (!selectEl) return;

      populateOptions();
      syncDetail();
      selectEl.addEventListener("change", () => {
        setActiveModel(selectEl!.value);
        syncDetail();
      });

      window.addEventListener(MODEL_CHANGED_EVENT, syncSelect);
      window.addEventListener(MODEL_CHANGED_EVENT, populateOptions);
      window.addEventListener(MODEL_CHANGED_EVENT, syncDetail);
    },
    destroy() {
      window.removeEventListener(MODEL_CHANGED_EVENT, syncSelect);
      window.removeEventListener(MODEL_CHANGED_EVENT, syncDetail);
    },
  };
}

/** Re-export for explorer sync without importing plugin internals */
export { setActiveModel, MODEL_CHANGED_EVENT };
