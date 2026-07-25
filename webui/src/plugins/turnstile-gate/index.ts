import type { ChatPlugin } from "murm-ui";
import { initTurnstile } from "../../turnstile-session";

export function TurnstileGatePlugin(): ChatPlugin {
  return {
    name: "turnstile-gate",
    onMount() {
      const siteKey = window.LLM_FALLBACKS_CONFIG?.turnstileSiteKey;
      if (!siteKey) return;

      let mount = document.getElementById("lf-turnstile-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "lf-turnstile-mount";
        mount.className = "lf-turnstile-mount";
        mount.setAttribute("aria-label", "Bot check");
        document.body.appendChild(mount);
      }
      initTurnstile(siteKey, mount);
    },
  };
}
