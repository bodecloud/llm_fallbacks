import type { ChatPlugin } from "murm-ui";
import { isLocalEndpoint, normalizeEndpoints, readRuntimeConfig } from "../../config";
import type { FailoverProvider } from "../../providers/FailoverProvider";
import { STORAGE_KEYS, saveJson } from "../../storage-keys";

export function FailoverSettingsPlugin(deps: {
  provider: FailoverProvider;
  onConfigSaved: () => void;
}): ChatPlugin {
  return {
    name: "failover-settings",
    onMount() {
      window.registerShellPanel?.("failover", (root) => {
        const config = readRuntimeConfig();
        root.innerHTML = `
          <h3>Failover &amp; Proxy</h3>
          <p class="panel-hint">Cloud proxy routes (one per line). Localhost is blocked.</p>
          <label>Proxy endpoints
            <textarea id="apiHostInput" rows="4" placeholder="https://your-worker.workers.dev"></textarea>
          </label>
          <label>Guest token
            <input id="guestTokenInput" type="password" autocomplete="off" />
          </label>
          <label>Default model
            <input id="defaultModelInput" type="text" value="free" />
          </label>
          <div id="routeStatus" class="panel-status">Route: —</div>
          <button type="button" id="testConnectionBtn">Test connection</button>
          <button type="button" id="saveFailoverBtn">Save</button>
        `;

        const endpointsEl = root.querySelector<HTMLTextAreaElement>("#apiHostInput")!;
        const guestEl = root.querySelector<HTMLInputElement>("#guestTokenInput")!;
        const modelEl = root.querySelector<HTMLInputElement>("#defaultModelInput")!;
        const statusEl = root.querySelector<HTMLDivElement>("#routeStatus")!;

        endpointsEl.value = config.endpoints.join("\n");
        guestEl.value = config.guestToken;
        modelEl.value = config.defaultModel;

        deps.provider.onStatus((s) => {
          statusEl.textContent = `Status: ${s}`;
        });

        const updateRoute = () => {
          const route = deps.provider.getLastRoute() || window.LLM_FALLBACKS_ROUTE || "—";
          statusEl.textContent = `Route: ${route}`;
        };
        setInterval(updateRoute, 1000);

        root.querySelector("#saveFailoverBtn")?.addEventListener("click", () => {
          const lines = endpointsEl.value
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          const bad = lines.find((l) => isLocalEndpoint(l));
          if (bad) {
            alert(`Localhost endpoints are not allowed: ${bad}`);
            return;
          }
          const endpoints = normalizeEndpoints(lines);
          saveJson(STORAGE_KEYS.endpoints, endpoints);
          localStorage.setItem(STORAGE_KEYS.guestToken, guestEl.value.trim());
          localStorage.setItem(STORAGE_KEYS.defaultModel, modelEl.value.trim() || "free");
          deps.provider.updateConfig(readRuntimeConfig());
          deps.onConfigSaved();
          statusEl.textContent = `Saved ${endpoints.length} endpoint(s)`;
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
      });
    },
  };
}
