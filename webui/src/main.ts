import { ChatUI, IndexedDBStorage } from "murm-ui/with-css";
import { CopyPlugin } from "murm-ui/plugins/copy";
import {
  mergeChatProxyArtifact,
  readRuntimeConfig,
  seedZeroConfigFromPageConfig,
} from "./config";
import { FailoverProvider } from "./providers/FailoverProvider";
import type { CatalogEntry } from "./providers/browser-router";
import { FailoverSettingsPlugin } from "./plugins/failover-settings";
import { ByokSettingsPlugin } from "./plugins/byok-settings";
import { ModelExplorerPlugin } from "./plugins/model-explorer";
import { bindTopBarButtons, initShellPanels } from "./shell-panels";

async function loadCatalog(): Promise<{
  catalog: CatalogEntry[];
  providerUrls: Record<string, string>;
}> {
  let config = readRuntimeConfig();
  config = await mergeChatProxyArtifact(config);

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
  if (input && !input.id) input.id = "chatinput";
  if (send && !send.id) send.id = "sendbutton";
}

async function bootstrap(): Promise<void> {
  seedZeroConfigFromPageConfig();
  initShellPanels();
  bindTopBarButtons();

  const { catalog, providerUrls } = await loadCatalog();
  const config = readRuntimeConfig();
  const provider = new FailoverProvider(config);
  provider.setCatalog(catalog, providerUrls);

  let catalogRef = catalog;

  const ui = new ChatUI({
    container: "#chatMount",
    provider,
    storage: new IndexedDBStorage(),
    fullscreen: false,
    enableSidebar: true,
    routing: false,
    plugins: (engine) => [
      CopyPlugin(),
      FailoverSettingsPlugin({
        provider,
        onConfigSaved: async () => {
          const refreshed = await loadCatalog();
          catalogRef = refreshed.catalog;
          provider.setCatalog(refreshed.catalog, refreshed.providerUrls);
        },
      }),
      ByokSettingsPlugin({
        onKeysSaved: () => {
          provider.setCatalog(catalogRef, providerUrls);
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
