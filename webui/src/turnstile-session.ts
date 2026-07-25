declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          size?: "normal" | "compact" | "flexible";
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

let siteKey: string | undefined;
let widgetId: string | undefined;
let currentToken: string | null = null;
let loadPromise: Promise<void> | null = null;
let pendingResolve: ((token: string) => void) | null = null;

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback";

function loadTurnstileScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    window.onloadTurnstileCallback = () => resolve();
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

function renderWidget(mount: HTMLElement): void {
  if (!window.turnstile || !siteKey || widgetId) return;
  widgetId = window.turnstile.render(mount, {
    sitekey: siteKey,
    size: "compact",
    theme: "dark",
    callback: (token: string) => {
      currentToken = token;
      pendingResolve?.(token);
      pendingResolve = null;
    },
    "error-callback": () => {
      pendingResolve?.("");
      pendingResolve = null;
    },
  });
}

export function initTurnstile(key: string | undefined, mount: HTMLElement): void {
  siteKey = key?.trim() || undefined;
  if (!siteKey) return;
  void loadTurnstileScript().then(() => renderWidget(mount));
}

export function hasTurnstile(): boolean {
  return Boolean(siteKey);
}

export function getTurnstileToken(): string | null {
  return currentToken;
}

export function clearTurnstileToken(): void {
  currentToken = null;
  if (widgetId && window.turnstile) {
    window.turnstile.reset(widgetId);
  }
}

export async function ensureTurnstileToken(): Promise<string | undefined> {
  if (!siteKey) return undefined;
  if (currentToken) return currentToken;
  await loadTurnstileScript();
  if (!widgetId || !window.turnstile) return undefined;

  return new Promise((resolve) => {
    pendingResolve = (token) => resolve(token || undefined);
    window.turnstile!.execute(widgetId!);
  });
}
