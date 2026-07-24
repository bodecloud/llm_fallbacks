export interface Env {
  AI: Ai;
  METRICS_KV?: KVNamespace;
  PROXY_GUEST_TOKEN: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  ALLOWED_ORIGINS: string;
  MODEL_CHAIN: string;
  ALLOWED_MODELS: string;
  MAX_TOKENS_CAP: string;
  RATE_LIMIT_PER_MINUTE?: string;
  RATE_LIMIT_PER_DAY?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  WORKERS_AI_MODEL?: string;
}

export type ChatMessage = { role: string; content: string };

export type ChatBody = {
  model?: string;
  messages?: ChatMessage[];
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
};

export const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
