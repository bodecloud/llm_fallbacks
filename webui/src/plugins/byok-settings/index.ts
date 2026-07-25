import type { ChatPlugin } from "murm-ui";
import { PROVIDER_KEY_FIELDS, loadKeys, saveKeys } from "../../providers/browser-router";

const KEY_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  groq: "Groq",
  google: "Google AI Studio",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  together: "Together AI",
  fireworks: "Fireworks AI",
};

const PRIMARY_FIELDS = ["openrouter", "groq", "google", "mistral", "deepseek", "together", "fireworks"];

export function ByokSettingsPlugin(deps: { onKeysSaved: () => void }): ChatPlugin {
  return {
    name: "byok-settings",
    onMount() {
      window.registerShellPanel?.("byok", (root) => {
        const fields = [...new Set(Object.values(PROVIDER_KEY_FIELDS))];
        root.innerHTML = `
          <header class="panel-header">
            <h3>Your API keys</h3>
          </header>
          <p class="panel-hint">Optional. Keys stay in this browser only. They never go to GitHub Pages.</p>
          <form id="byok-form">
            <div id="byok-fields-primary"></div>
            <div id="byok-fields-extra" hidden></div>
            <button type="button" id="byok-toggle-extra" class="panel-btn panel-btn-ghost">Show more providers</button>
            <div class="panel-actions">
              <button type="submit" class="panel-btn panel-btn-primary">Save keys</button>
            </div>
          </form>
        `;
        const form = root.querySelector<HTMLFormElement>("#byok-form")!;
        const primaryHost = root.querySelector<HTMLDivElement>("#byok-fields-primary")!;
        const extraHost = root.querySelector<HTMLDivElement>("#byok-fields-extra")!;
        const toggleBtn = root.querySelector<HTMLButtonElement>("#byok-toggle-extra")!;
        const keys = loadKeys();

        const addField = (host: HTMLElement, field: string) => {
          const label = document.createElement("label");
          label.textContent = KEY_LABELS[field] || field;
          const input = document.createElement("input");
          input.type = "password";
          input.name = field;
          input.autocomplete = "off";
          input.placeholder = "sk-…";
          input.value = keys[field] || "";
          if (field === "openrouter") input.id = "keyInput";
          label.appendChild(input);
          host.appendChild(label);
        };

        const primary = fields.filter((f) => PRIMARY_FIELDS.includes(f));
        const extra = fields.filter((f) => !PRIMARY_FIELDS.includes(f));
        for (const field of primary) addField(primaryHost, field);
        for (const field of extra) addField(extraHost, field);

        if (extra.length === 0) toggleBtn.hidden = true;

        toggleBtn.addEventListener("click", () => {
          const open = extraHost.hidden;
          extraHost.hidden = !open;
          toggleBtn.textContent = open ? "Show fewer providers" : "Show more providers";
        });

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const next: Record<string, string> = {};
          for (const field of fields) {
            const input = form.querySelector<HTMLInputElement>(`[name="${field}"]`);
            if (input?.value.trim()) next[field] = input.value.trim();
          }
          saveKeys(next);
          deps.onKeysSaved();
          const note = document.createElement("p");
          note.className = "panel-status";
          note.textContent = "Keys saved locally.";
          form.after(note);
          setTimeout(() => note.remove(), 3000);
        });
      });
    },
  };
}
