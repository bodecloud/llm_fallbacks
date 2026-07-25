import { ChatUI, IndexedDBStorage, type ChatEngine } from "murm-ui/with-css";
import { CopyPlugin } from "murm-ui/plugins/copy";
import { AttachmentPlugin } from "murm-ui/plugins/attachment";
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
import { TierSettingsPlugin } from "./plugins/tier-settings";
import { CompareModePlugin } from "./plugins/compare-mode";
import { DiscoveryPicklistPlugin } from "./plugins/discovery-picklist";
import { ModelExplorerPlugin } from "./plugins/model-explorer";
import { ModelPickerPlugin } from "./plugins/model-picker";
import { RoutingChipPlugin } from "./plugins/routing-chip";
import { MessageActionsPlugin } from "./plugins/message-actions";
import { StatusStripPlugin } from "./plugins/status-strip";
import { TurnstileGatePlugin } from "./plugins/turnstile-gate";
import { initModelSelection, setCatalogRef } from "./model-selection";
import {
  ANALYTICS_EVENTS,
  trackSessionEvent,
} from "./analytics";
import { bindTopBarButtons, initShellPanels } from "./shell-panels";
import {
  downloadBlob,
  exportFilename,
  toJson,
  toMarkdown,
} from "./export-session";
import {
  ImportError,
  importMessagesFromFile,
  importTitleFromFile,
} from "./import-session";
import { ShortcutsSheetPlugin } from "./plugins/shortcuts-sheet";
import { showStatusMessage } from "./plugins/status-strip";

// Published client-side image attachment cap (R31).
const MAX_IMAGE_ATTACHMENT_BYTES = 4_000_000;

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

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".md,.json,text/markdown,application/json";
  importInput.hidden = true;
  document.body.appendChild(importInput);

  let importEngine: ChatEngine | null = null;

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file || !importEngine) return;
    if (importEngine.state.generatingMessageId) {
      showStatusMessage("Wait for the current reply to finish before importing.");
      return;
    }
    try {
      const text = await file.text();
      const messages = await importMessagesFromFile(file);
      await importEngine.sessions.create();
      const ok = await importEngine.setMessages(messages);
      if (!ok) {
        throw new ImportError("Could not import while a reply is generating.");
      }
      const title = importTitleFromFile(text, file.name);
      if (title) {
        await importEngine.sessions.updateTitle(importEngine.state.currentSessionId, title);
      }
      showStatusMessage(`Imported ${messages.length} message${messages.length === 1 ? "" : "s"}.`);
    } catch (err) {
      const msg = err instanceof ImportError ? err.message : "Import failed.";
      showStatusMessage(msg);
    }
  });

  const ui = new ChatUI({
    container: "#chatMount",
    provider,
    storage: new IndexedDBStorage(),
    fullscreen: false,
    enableSidebar: true,
    routing: { type: "hash", pathPrefix: "#/chat/" },
    sidebarMenu: (defaults, ctx) => {
      const messages = ctx.engine.state.messages;
      const hasMessages = messages.length > 0;
      return [
        ...defaults,
        {
          id: "export-md",
          label: "Export as Markdown",
          disabled: !hasMessages,
          onClick: () => {
            if (!hasMessages) return;
            const content = toMarkdown(messages, {
              id: ctx.session.id,
              title: ctx.session.title,
            });
            downloadBlob(
              exportFilename("md", ctx.session.title),
              content,
              "text/markdown;charset=utf-8"
            );
          },
        },
        {
          id: "export-json",
          label: "Export as JSON",
          disabled: !hasMessages,
          onClick: () => {
            if (!hasMessages) return;
            const content = toJson(messages, {
              id: ctx.session.id,
              title: ctx.session.title,
            });
            downloadBlob(
              exportFilename("json", ctx.session.title),
              content,
              "application/json;charset=utf-8"
            );
          },
        },
        {
          id: "import-conversation",
          label: "Import conversation",
          disabled: ctx.engine.state.generatingMessageId !== null,
          onClick: () => {
            importInput.click();
          },
        },
        {
          id: "copy-session-link",
          label: "Copy session link",
          onClick: async () => {
            const hash = `#/chat/${encodeURIComponent(ctx.session.id)}`;
            const url = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
            try {
              await navigator.clipboard.writeText(url);
              showStatusMessage("Session link copied (local browser only).");
            } catch {
              window.prompt("Copy session link:", url);
            }
          },
        },
      ];
    },
    plugins: (engine) => [
      CopyPlugin(),
      AttachmentPlugin({
        acceptedTypes: "image/*",
        maxFileSize: MAX_IMAGE_ATTACHMENT_BYTES,
        onSizeExceeded: (file, maxSize) => {
          const limitMb = Math.round(maxSize / 1_000_000);
          showStatusMessage(
            `"${file.name}" is too large. Images must be under ${limitMb} MB.`
          );
        },
        onUnsupportedFile: (file) => {
          showStatusMessage(`"${file.name}" isn't a supported image type.`);
        },
      }),
      ModelPickerPlugin(),
      MessageActionsPlugin(),
      RoutingChipPlugin(),
      StatusStripPlugin(),
      TurnstileGatePlugin(),
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
      TierSettingsPlugin(),
      CompareModePlugin({
        provider,
        getCatalog: () => catalogRef,
      }),
      DiscoveryPicklistPlugin(),
      ModelExplorerPlugin({
        getCatalog: () => catalogRef,
        getCatalogUrl: () => readRuntimeConfig().catalogUrl,
      }),
      ShortcutsSheetPlugin(),
    ],
  });

  importEngine = ui.engine;

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
