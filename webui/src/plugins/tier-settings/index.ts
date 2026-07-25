import type { ChatPlugin } from "murm-ui";
import { defaultProviderTierSettings } from "../../providers/tiers/defaults";
import { loadProviderTierSettings } from "../../providers/tiers/settings";
import type { ProviderTierSettings, TierId } from "../../providers/tiers/types";
import {
  TIER_HINTS,
  TIER_LABELS,
  moveTier,
  persistTierSettings,
  setTierEnabled,
  updateCompanionUrls,
} from "./settings";

function renderTierList(settings: ProviderTierSettings): string {
  return settings.tiers
    .map((tier, index) => {
      const label = TIER_LABELS[tier.id] ?? tier.id;
      const hint = TIER_HINTS[tier.id] ?? "";
      return `
        <li class="lf-tier-row" data-tier-id="${tier.id}">
          <div class="lf-tier-row-main">
            <label class="lf-tier-enable">
              <input type="checkbox" data-tier-enable="${tier.id}" ${tier.enabled ? "checked" : ""} />
              <span>${label}</span>
            </label>
            <div class="lf-tier-move">
              <button type="button" class="panel-btn panel-btn-ghost lf-tier-up" data-tier-up="${tier.id}" ${index === 0 ? "disabled" : ""} aria-label="Move ${label} up">↑</button>
              <button type="button" class="panel-btn panel-btn-ghost lf-tier-down" data-tier-down="${tier.id}" ${index === settings.tiers.length - 1 ? "disabled" : ""} aria-label="Move ${label} down">↓</button>
            </div>
          </div>
          <p class="panel-hint lf-tier-hint">${hint}</p>
        </li>
      `;
    })
    .join("");
}

export function TierSettingsPlugin(): ChatPlugin {
  return {
    name: "tier-settings",
    onMount() {
      window.registerShellPanel?.("tiers", (root) => {
        let draft = loadProviderTierSettings();

        const paint = (): void => {
          root.innerHTML = `
            <header class="panel-header">
              <h3>Provider tiers</h3>
            </header>
            <p class="panel-hint">
              Ordered routes we try for each chat. This is the <strong>omnifail stack</strong>
              (which route to attempt), not cloud free-tier rate limits.
              Exhausting enabled tiers still fails honestly — we do not promise never-fail.
            </p>
            <ol id="lf-tier-list" class="lf-tier-list">${renderTierList(draft)}</ol>
            <label>Web-UI runner URL
              <input id="lf-web-runner-url" type="url" autocomplete="off"
                placeholder="http://127.0.0.1:8788" value="${draft.webRunnerUrl}" />
            </label>
            <p class="panel-hint">
              Opt-in local companion. Off by default. You run it; it lowers pressure on the
              public Worker demo. You are responsible for target-site terms — we do not
              harvest credentials.
            </p>
            <label>SearXNG URL
              <input id="lf-searxng-url" type="url" autocomplete="off"
                placeholder="http://127.0.0.1:8080" value="${draft.searxngUrl}" />
            </label>
            <p class="panel-hint">
              Opt-in self-hosted search. Empty disables discovery. Respect SearXNG and
              target-site terms of service.
            </p>
            <div class="panel-actions">
              <button type="button" id="lf-tier-reset" class="panel-btn">Reset defaults</button>
              <button type="button" id="lf-tier-save" class="panel-btn panel-btn-primary">Save tiers</button>
            </div>
            <p id="lf-tier-status" class="panel-status" aria-live="polite"></p>
          `;

          const list = root.querySelector("#lf-tier-list");
          list?.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            const up = target.closest<HTMLElement>("[data-tier-up]");
            const down = target.closest<HTMLElement>("[data-tier-down]");
            if (up?.dataset.tierUp) {
              draft = moveTier(draft, up.dataset.tierUp as TierId, -1);
              paint();
              return;
            }
            if (down?.dataset.tierDown) {
              draft = moveTier(draft, down.dataset.tierDown as TierId, 1);
              paint();
            }
          });

          list?.addEventListener("change", (event) => {
            const input = event.target as HTMLInputElement;
            const tierId = input.dataset.tierEnable as TierId | undefined;
            if (!tierId || input.type !== "checkbox") return;
            draft = setTierEnabled(draft, tierId, input.checked);
          });

          root.querySelector("#lf-tier-reset")?.addEventListener("click", () => {
            draft = persistTierSettings(defaultProviderTierSettings());
            paint();
            const status = root.querySelector("#lf-tier-status");
            if (status) status.textContent = "Restored zero-config defaults.";
          });

          root.querySelector("#lf-tier-save")?.addEventListener("click", () => {
            const webRunnerUrl =
              root.querySelector<HTMLInputElement>("#lf-web-runner-url")?.value ?? "";
            const searxngUrl =
              root.querySelector<HTMLInputElement>("#lf-searxng-url")?.value ?? "";
            draft = updateCompanionUrls(draft, { webRunnerUrl, searxngUrl });
            draft = persistTierSettings(draft);
            paint();
            const status = root.querySelector("#lf-tier-status");
            if (status) {
              status.textContent = `Saved order: ${draft.tiers
                .filter((t) => t.enabled)
                .map((t) => t.id)
                .join(" → ") || "(none enabled)"}`;
            }
          });
        };

        paint();
      });
    },
  };
}
