export type TierId = "quality_api" | "web_ui" | "searxng_discovery" | "proxy_failover";

export interface TierEntry {
  id: TierId;
  enabled: boolean;
}

export interface ProviderTierSettings {
  tiers: TierEntry[];
  webRunnerUrl: string;
  searxngUrl: string;
}

export interface TierAttempt {
  tier: TierId;
  error: string;
}

export class TierOrchestratorError extends Error {
  readonly attempts: readonly TierAttempt[];

  constructor(message: string, attempts: readonly TierAttempt[]) {
    super(message);
    this.name = "TierOrchestratorError";
    this.attempts = attempts;
  }
}

export class TierSkipError extends Error {
  readonly tier: TierId;

  constructor(tier: TierId, reason: string) {
    super(reason);
    this.name = "TierSkipError";
    this.tier = tier;
  }
}
