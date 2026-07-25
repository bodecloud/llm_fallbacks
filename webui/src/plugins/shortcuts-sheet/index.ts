import type { ChatPlugin } from "murm-ui";

const HINT_KEY = "llm_fallbacks_shortcuts_hint_dismissed";

const SHORTCUTS = [
  { keys: "Enter", action: "Send message" },
  { keys: "Shift + Enter", action: "New line in composer" },
  { keys: "Esc", action: "Stop generation (when streaming)" },
  { keys: "/", action: "Focus composer" },
  { keys: "?", action: "Show this shortcuts sheet" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function ensureModal(): HTMLElement {
  let modal = document.getElementById("lfShortcutsModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "lfShortcutsModal";
  modal.className = "lf-shortcuts-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="lf-shortcuts-backdrop" data-close="true"></div>
    <div class="lf-shortcuts-panel" role="dialog" aria-labelledby="lfShortcutsTitle" aria-modal="true">
      <header class="lf-shortcuts-header">
        <h2 id="lfShortcutsTitle">Keyboard shortcuts</h2>
        <button type="button" class="lf-shortcuts-close" aria-label="Close">×</button>
      </header>
      <ul class="lf-shortcuts-list"></ul>
    </div>
  `;
  const list = modal.querySelector(".lf-shortcuts-list")!;
  for (const { keys, action } of SHORTCUTS) {
    const li = document.createElement("li");
    li.innerHTML = `<kbd>${keys}</kbd><span>${action}</span>`;
    list.appendChild(li);
  }
  document.body.appendChild(modal);
  return modal;
}

function openModal(): void {
  const modal = ensureModal();
  modal.hidden = false;
  modal.querySelector<HTMLButtonElement>(".lf-shortcuts-close")?.focus();
}

function closeModal(): void {
  const modal = document.getElementById("lfShortcutsModal");
  if (modal) modal.hidden = true;
}

function ensureHint(): HTMLElement {
  let hint = document.getElementById("lfShortcutsHint");
  if (hint) return hint;

  hint = document.createElement("div");
  hint.id = "lfShortcutsHint";
  hint.className = "lf-shortcuts-hint";
  hint.innerHTML = `
    <span>Tip: press <kbd>?</kbd> for keyboard shortcuts</span>
    <button type="button" class="lf-shortcuts-hint-dismiss" aria-label="Dismiss">×</button>
  `;
  const mount = document.getElementById("chatMount");
  if (mount) {
    mount.appendChild(hint);
  } else {
    document.body.appendChild(hint);
  }
  return hint;
}

export function ShortcutsSheetPlugin(): ChatPlugin {
  return {
    name: "shortcuts-sheet",
    onMount() {
      ensureModal();

      const modal = document.getElementById("lfShortcutsModal")!;
      modal.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.close || target.classList.contains("lf-shortcuts-close")) {
          closeModal();
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closeModal();
          return;
        }
        if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
          e.preventDefault();
          openModal();
        }
      });

      if (localStorage.getItem(HINT_KEY) !== "1") {
        const hint = ensureHint();
        hint.hidden = false;
        hint.querySelector(".lf-shortcuts-hint-dismiss")?.addEventListener("click", () => {
          hint.hidden = true;
          localStorage.setItem(HINT_KEY, "1");
        });
      }

      const footerLink = document.createElement("button");
      footerLink.type = "button";
      footerLink.className = "lf-shortcuts-footer-link";
      footerLink.textContent = "Shortcuts";
      footerLink.title = "Keyboard shortcuts (?)";
      footerLink.addEventListener("click", () => openModal());

      const credits = document.querySelector(".credits-actions");
      credits?.appendChild(footerLink);
    },
  };
}

export { openModal as openShortcutsModal, closeModal as closeShortcutsModal };
