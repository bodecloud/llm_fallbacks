// In-memory browser seams for Vitest's node environment.
// Tier settings, API keys, and runtime config persist through localStorage,
// and FailoverProvider writes window.LLM_FALLBACKS_ROUTE. Neither exists in
// node, so provide minimal shims instead of pulling in full jsdom.

class MemoryStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

// Routing metadata broadcasts via window.dispatchEvent; provide inert event
// methods so provider success paths run under the node environment.
const eventTarget = globalThis as {
  dispatchEvent?: (event: unknown) => boolean;
  addEventListener?: (...args: unknown[]) => void;
  removeEventListener?: (...args: unknown[]) => void;
};
if (typeof eventTarget.dispatchEvent !== "function") {
  eventTarget.dispatchEvent = () => true;
}
if (typeof eventTarget.addEventListener !== "function") {
  eventTarget.addEventListener = () => {};
}
if (typeof eventTarget.removeEventListener !== "function") {
  eventTarget.removeEventListener = () => {};
}

if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
    writable: true,
  });
}
