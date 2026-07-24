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

export function ByokSettingsPlugin(deps: { onKeysSaved: () => void }): ChatPlugin {
  return {
    name: "byok-settings",
    onMount() {
      window.registerShellPanel?.("byok", (root) => {
        const fields = [...new Set(Object.values(PROVIDER_KEY_FIELDS))];
        root.innerHTML = `
          <h3>Bring Your Own Keys</h3>
          <p class="panel-hint">Optional. Keys stay in this browser only — never sent to GitHub Pages.</p>
          <form id="byok-form">
            <div id="byok-fields"></div>
            <button type="submit">Save keys</button>
          </form>
        `;
        const form = root.querySelector<HTMLFormElement>("#byok-form")!;
        const fieldsHost = root.querySelector<HTMLDivElement>("#byok-fields")!;
        const keys = loadKeys();

        for (const field of fields) {
          const label = document.createElement("label");
          label.textContent = KEY_LABELS[field] || field;
          const input = document.createElement("input");
          input.type = "password";
          input.name = field;
          input.autocomplete = "off";
          input.value = keys[field] || "";
          if (field === "openrouter") input.id = "keyInput";
          label.appendChild(input);
          fieldsHost.appendChild(label);
        }

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
