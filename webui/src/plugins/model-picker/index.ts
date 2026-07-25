import type { ChatPlugin } from "murm-ui";
import {
  getActiveModel,
  getCatalogModels,
  getPinnedModels,
  MODEL_CHANGED_EVENT,
  modelOptionLabel,
  setActiveModel,
} from "../../model-selection";

const HELP_TEXT =
  "`free` = our ranked chain; `openrouter/free` = OpenRouter meta-router";

export function ModelPickerPlugin(): ChatPlugin {
  let selectEl: HTMLSelectElement | null = null;

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
        <label class="lf-model-picker-label">
          <span class="lf-model-picker-title">Model</span>
          <select class="lf-model-picker-select" aria-label="Chat model"></select>
        </label>
        <p class="lf-model-picker-help" title="${HELP_TEXT}">${HELP_TEXT}</p>
      `;

      form.insertBefore(wrapper, form.firstChild);
      selectEl = wrapper.querySelector(".lf-model-picker-select");
      if (!selectEl) return;

      populateOptions();
      selectEl.addEventListener("change", () => {
        setActiveModel(selectEl!.value);
      });

      window.addEventListener(MODEL_CHANGED_EVENT, syncSelect);
      window.addEventListener(MODEL_CHANGED_EVENT, populateOptions);
    },
    destroy() {
      window.removeEventListener(MODEL_CHANGED_EVENT, syncSelect);
    },
  };
}

/** Re-export for explorer sync without importing plugin internals */
export { setActiveModel, MODEL_CHANGED_EVENT };
