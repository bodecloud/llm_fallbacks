import type { ChatPlugin } from "murm-ui";
import { loadRuntimeConfig } from "../../config";
import { healthPathForBase } from "../../health-probe";

export function StatusStripPlugin(): ChatPlugin {
  return {
    name: "status-strip",
    onMount() {
      const mount =
        document.getElementById("lfStatusStrip") ??
        (() => {
          const el = document.createElement("div");
          el.id = "lfStatusStrip";
          el.className = "lf-status-strip";
          el.setAttribute("aria-live", "polite");
          const credits = document.querySelector(".credits-content");
          const actions = credits?.querySelector(".credits-actions");
          if (credits && actions) {
            credits.insertBefore(el, actions);
          } else {
            document.body.prepend(el);
          }
          return el;
        })();

      void refreshStatusStrip(mount);
    },
  };
}

async function refreshStatusStrip(mount: HTMLElement): Promise<void> {
  const config = await loadRuntimeConfig();
  const base = config.endpoints[0];
  if (!base) {
    mount.hidden = true;
    return;
  }

  mount.hidden = false;
  mount.textContent = "Checking proxy…";

  let healthOk = false;
  try {
    const healthUrl = healthPathForBase(base);
    const healthRes = await fetch(healthUrl, { method: "GET", mode: "cors" });
    healthOk = healthRes.ok;
  } catch {
    healthOk = false;
  }

  let chatCount = 0;
  try {
    const metricsUrl = `${base.replace(/\/$/, "")}/v1/metrics?days=1`;
    const metricsRes = await fetch(metricsUrl, {
      headers: { Authorization: `Bearer ${config.guestToken}` },
    });
    if (metricsRes.ok) {
      const metrics = (await metricsRes.json()) as {
        events?: Record<string, number>;
      };
      chatCount = metrics.events?.chat_completion_success ?? 0;
    }
  } catch {
    /* optional */
  }

  const dotClass = healthOk ? "lf-status-ok" : "lf-status-fail";
  const statusText = healthOk ? "Proxy OK" : "Proxy unreachable";
  const countText = chatCount > 0 ? ` · ${chatCount} chat${chatCount === 1 ? "" : "s"} today` : "";
  mount.innerHTML = `<span class="lf-status-dot ${dotClass}" aria-hidden="true"></span><span class="lf-status-text">${statusText}${countText}</span>`;
}

export function showRateLimitBanner(seconds?: number): void {
  const mount = document.getElementById("lfStatusStrip");
  if (!mount) return;
  const suffix =
    seconds !== undefined && seconds > 0
      ? ` Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`
      : " Wait and try again.";
  mount.innerHTML = `<span class="lf-status-dot lf-status-warn" aria-hidden="true"></span><span class="lf-status-text">Rate limited.${suffix}</span>`;
}
