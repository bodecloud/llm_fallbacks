import { ChatUI, IndexedDBStorage } from "murm-ui/with-css";
import { CopyPlugin } from "murm-ui/plugins/copy";
import {
  loadRuntimeConfig,
  readRuntimeConfig,
  seedZeroConfigFromPageConfig,
  type AppConfig,
} from "./config";
import { FailoverProvider } from "./providers/FailoverProvider";
import type { CatalogEntry } from "./providers/browser-router";
import { FailoverSettingsPlugin } from "./plugins/failover-settings";
import { ByokSettingsPlugin } from "./plugins/byok-settings";
import { ModelExplorerPlugin } from "./plugins/model-explorer";
import { ModelPickerPlugin } from "./plugins/model-picker";
import { RoutingChipPlugin } from "./plugins/routing-chip";
import { MessageActionsPlugin } from "./plugins/message-actions";
import { initModelSelection, setCatalogRef } from "./model-selection";
import {
  ANALYTICS_EVENTS,
  trackSessionEvent,
} from "./analytics";
import { bindTopBarButtons, initShellPanels } from "./shell-panels";

async function loadCatalog(config: AppConfig): Promise<{
  catalog: CatalogEntry[];
  providerUrls: Record<string, string>;
}> {
  let catalog: CatalogEntry[] = [];
  let providerUrls: Record<string, string> = {};

  if (config.catalogUrl) {
    try {
      const res = await fetch(config.catalogUrl);
      if (res.ok) catalog = (await res.json()) as CatalogEntry[];
    } catch {
      /* optional */
    }
  }
  if (config.providerUrlsUrl) {
    try {
      const res = await fetch(config.providerUrlsUrl);
      if (res.ok) providerUrls = (await res.json()) as Record<string, string>;
    } catch {
      /* optional */
    }
  }

  return { catalog, providerUrls };
}

function wireChatInputIds(container: HTMLElement): void {
  const input = container.querySelector<HTMLTextAreaElement>(".mur-chat-input");
  const send = container.querySelector<HTMLButtonElement>(".mur-send-btn");
  const history = container.querySelector<HTMLElement>(".mur-chat-history");
  if (input && !input.id) input.id = "chatinput";
  if (send && !send.id) send.id = "sendbutton";
  if (history && !history.getAttribute("aria-live")) {
    history.setAttribute("aria-live", "polite");
    history.setAttribute("aria-relevant", "additions");
  }
}

async function bootstrap(): Promise<void> {
  seedZeroConfigFromPageConfig();
  initShellPanels();
  bindTopBarButtons();

  const mount = document.querySelector("#chatMount");
  mount?.classList.add("mur-app", "mur-app-embedded", "mur-sidebar-animated", "mur-sidebar-closed");
  mount?.setAttribute("data-theme", "dark");
  trackSessionEvent(ANALYTICS_EVENTS.darkThemeLoaded);
  trackSessionEvent(ANALYTICS_EVENTS.homepageSession);

  const config = await loadRuntimeConfig();
  const { catalog, providerUrls } = await loadCatalog(config);
  initModelSelection(catalog);
  const provider = new FailoverProvider(config);
  provider.setCatalog(catalog, providerUrls);

  let catalogRef = catalog;
  let providerUrlsRef = providerUrls;

  const ui = new ChatUI({
    container: "#chatMount",
    provider,
    storage: new IndexedDBStorage(),
    fullscreen: false,
    enableSidebar: true,
    routing: false,
    plugins: (engine) => [
      CopyPlugin(),
      ModelPickerPlugin(),
      MessageActionsPlugin(),
      RoutingChipPlugin(),
      FailoverSettingsPlugin({
        provider,
        onConfigSaved: async () => {
          const refreshedConfig = await loadRuntimeConfig();
          const refreshed = await loadCatalog(refreshedConfig);
          catalogRef = refreshed.catalog;
          providerUrlsRef = refreshed.providerUrls;
          setCatalogRef(refreshed.catalog);
          provider.updateConfig(refreshedConfig);
          provider.setCatalog(refreshed.catalog, refreshed.providerUrls);
        },
      }),
      ByokSettingsPlugin({
        onKeysSaved: () => {
          provider.setCatalog(catalogRef, providerUrlsRef);
        },
      }),
      ModelExplorerPlugin({
        getCatalog: () => catalogRef,
        getCatalogUrl: () => readRuntimeConfig().catalogUrl,
      }),
    ],
  });

  wireChatInputIds(document.querySelector("#chatMount")!);

  const observer = new MutationObserver(() => wireChatInputIds(document.querySelector("#chatMount")!));
  observer.observe(document.querySelector("#chatMount")!, { childList: true, subtree: true });

  void ui;
}

bootstrap().catch((err) => {
  console.error("Chat bootstrap failed", err);
  const mount = document.getElementById("chatMount");
  if (mount) {
    mount.innerHTML = `<p class="boot-error">Failed to load chat: ${err instanceof Error ? err.message : String(err)}</p>`;
  }
});
