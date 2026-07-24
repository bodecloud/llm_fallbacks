export {};

declare global {
  interface Window {
    LLM_FALLBACKS_CONFIG: {
      endpoints: string[];
      guestToken: string;
      defaultModel: string;
      catalogUrl: string;
      providerUrlsUrl: string;
      chatProxyUrl?: string;
      maxTokens: number;
      appVersion?: string;
    };
    LLM_FALLBACKS_ROUTE?: string;
    registerShellPanel?: (
      id: string,
      init: (root: HTMLElement) => void
    ) => void;
  }
}
