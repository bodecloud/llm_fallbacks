import type { ChatPlugin } from "murm-ui";
import { loadRuntimeConfig, normalizeEndpoints } from "../../config";
import { healthPathForBase, probeEndpoint, type HealthProbeResult } from "../../health-probe";
import type { FailoverProvider } from "../../providers/FailoverProvider";
import { STORAGE_KEYS, saveJson } from "../../storage-keys";

function stateLabel(state: HealthProbeResult["state"]): string {
  if (state === "ok") return "Reachable";
  if (state === "slow") return "Degraded";
  return "Unreachable";
}

function renderHealthRow(base: string, result: HealthProbeResult): string {
  const hint = result.authFailure
    ? `<span class="lf-health-hint">Auth failed — see docs/CAVEATS.md</span>`
    : "";
  const statusCode = result.statusCode ? `HTTP ${result.statusCode}` : "No response";
  return `
    <li class="lf-health-row" data-endpoint="${base}">
      <span class="lf-health-dot lf-health-${result.state}" aria-hidden="true"></span>
      <span class="lf-health-url">${base}</span>
      <span class="lf-health-meta">${stateLabel(result.state)} · ${result.ms}ms · ${statusCode}</span>
      ${hint}
    </li>
  `;
}

export function FailoverSettingsPlugin(deps: {
  provider: FailoverProvider;
  onConfigSaved: () => void;
}): ChatPlugin {
  return {
    name: "failover-settings",
    onMount() {
      const fillPanelFromConfig = (
        config: { endpoints: string[]; guestToken: string; defaultModel: string },
        endpointsEl: HTMLTextAreaElement,
        guestEl: HTMLInputElement,
        modelEl: HTMLInputElement,
      ): void => {
        endpointsEl.value = config.endpoints.join("\n");
        guestEl.value = config.guestToken;
        modelEl.value = config.defaultModel;
      };

      window.registerShellPanel?.("failover", (root) => {
        root.innerHTML = `
          <header class="panel-header">
            <h3>Chat server</h3>
          </header>
          <p class="panel-hint">Server addresses, one per line. We try the first one, then the next if it fails.</p>
          <label>Server URLs
            <textarea id="apiHostInput" rows="4" placeholder="https://your-worker.workers.dev"></textarea>
          </label>
          <div class="lf-endpoint-health">
            <div class="lf-endpoint-health-header">
              <span>Endpoint health</span>
              <button type="button" id="checkEndpointsBtn" class="panel-btn">Check endpoints</button>
            </div>
            <ul id="endpointHealthList" class="lf-endpoint-health-list" aria-live="polite"></ul>
            <p id="endpointHealthChecked" class="panel-hint lf-health-checked-at"></p>
          </div>
          <label>Access token
            <input id="guestTokenInput" type="password" autocomplete="off" />
          </label>
          <label>Default model
            <input id="defaultModelInput" type="text" value="free" />
          </label>
          <div id="routeStatus" class="panel-status">Route: —</div>
          <div class="panel-actions">
            <button type="button" id="testConnectionBtn" class="panel-btn">Test connection</button>
            <button type="button" id="saveFailoverBtn" class="panel-btn panel-btn-primary">Save</button>
          </div>
        `;

        const endpointsEl = root.querySelector<HTMLTextAreaElement>("#apiHostInput")!;
        const guestEl = root.querySelector<HTMLInputElement>("#guestTokenInput")!;
        const modelEl = root.querySelector<HTMLInputElement>("#defaultModelInput")!;
        const statusEl = root.querySelector<HTMLDivElement>("#routeStatus")!;
        const healthListEl = root.querySelector<HTMLUListElement>("#endpointHealthList")!;
        const healthCheckedEl = root.querySelector<HTMLParagraphElement>("#endpointHealthChecked")!;

        fillPanelFromConfig(deps.provider.getConfig(), endpointsEl, guestEl, modelEl);
        void loadRuntimeConfig().then((config) => {
          fillPanelFromConfig(config, endpointsEl, guestEl, modelEl);
          deps.provider.updateConfig(config);
        });

        const runHealthChecks = async () => {
          const endpoints = normalizeEndpoints(
            endpointsEl.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
          );
          if (!endpoints.length) {
            healthListEl.innerHTML = `<li class="lf-health-empty">No endpoints configured</li>`;
            healthCheckedEl.textContent = "";
            return;
          }
          healthListEl.innerHTML = endpoints
            .map(
              (base) =>
                `<li class="lf-health-row lf-health-pending"><span class="lf-health-url">${base}</span> Checking…</li>`
            )
            .join("");
          const results = await Promise.all(
            endpoints.map(async (base) => ({ base, result: await probeEndpoint(base) }))
          );
          healthListEl.innerHTML = results
            .map(({ base, result }) => renderHealthRow(base, result))
            .join("");
          healthCheckedEl.textContent = `Last checked ${new Date().toLocaleTimeString()}`;
        };

        let healthDebounce: ReturnType<typeof setTimeout> | undefined;
        const scheduleHealthCheck = () => {
          clearTimeout(healthDebounce);
          healthDebounce = setTimeout(() => void runHealthChecks(), 400);
        };

        document.getElementById("sysSetting")?.addEventListener("click", () => {
          void loadRuntimeConfig().then((config) => {
            fillPanelFromConfig(config, endpointsEl, guestEl, modelEl);
            deps.provider.updateConfig(config);
            scheduleHealthCheck();
          });
        });

        root.querySelector("#checkEndpointsBtn")?.addEventListener("click", () => void runHealthChecks());

        deps.provider.onStatus((s) => {
          statusEl.textContent = `Status: ${s}`;
        });

        const updateRoute = () => {
          const route = deps.provider.getLastRoute() || window.LLM_FALLBACKS_ROUTE || "—";
          statusEl.textContent = `Route: ${route}`;
        };
        setInterval(updateRoute, 1000);

        root.querySelector("#saveFailoverBtn")?.addEventListener("click", async () => {
          const endpoints = normalizeEndpoints(
            endpointsEl.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
          );
          saveJson(STORAGE_KEYS.endpoints, endpoints);
          localStorage.setItem(STORAGE_KEYS.guestToken, guestEl.value.trim());
          localStorage.setItem(STORAGE_KEYS.defaultModel, modelEl.value.trim() || "free");
          deps.provider.updateConfig(await loadRuntimeConfig());
          deps.onConfigSaved();
          statusEl.textContent = `Saved ${endpoints.length} endpoint(s)`;
          scheduleHealthCheck();
        });

        root.querySelector("#testConnectionBtn")?.addEventListener("click", async () => {
          const endpoints = normalizeEndpoints(
            endpointsEl.value.split("\n").map((l) => l.trim()).filter(Boolean)
          );
          if (!endpoints.length) {
            statusEl.textContent = "No endpoints configured";
            return;
          }
          const base = endpoints[0];
          const url = base.endsWith("/v1/chat/completions")
            ? base
            : `${base.replace(/\/$/, "")}/v1/chat/completions`;
          statusEl.textContent = `Testing ${base}…`;
          try {
            const res = await fetch(url, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${guestEl.value.trim()}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "free",
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 8,
                stream: false,
              }),
            });
            statusEl.textContent = res.ok
              ? `OK (${res.status})`
              : `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`;
          } catch (err) {
            statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        });

        scheduleHealthCheck();
      });
    },
  };
}
