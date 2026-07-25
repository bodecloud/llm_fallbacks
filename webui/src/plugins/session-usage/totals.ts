import type { CompletionMeta, TokenUsage } from "../../providers/routing-metadata";

export interface SessionUsageTotals {
  replies: number;
  repliesWithUsage: number;
  promptTokens: number;
  completionTokens: number;
  totalMs: number;
}

export function emptySessionTotals(): SessionUsageTotals {
  return {
    replies: 0,
    repliesWithUsage: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalMs: 0,
  };
}

export function accumulateSessionTotals(
  current: SessionUsageTotals,
  meta: CompletionMeta
): SessionUsageTotals {
  const next = { ...current, replies: current.replies + 1 };
  const wall = meta.totalMs ?? meta.durationMs;
  if (wall !== undefined && Number.isFinite(wall)) {
    next.totalMs += Math.max(0, wall);
  }
  const usage: TokenUsage | undefined = meta.usage;
  if (
    usage &&
    (usage.promptTokens !== undefined || usage.completionTokens !== undefined)
  ) {
    next.repliesWithUsage += 1;
    next.promptTokens += usage.promptTokens ?? 0;
    next.completionTokens += usage.completionTokens ?? 0;
  }
  return next;
}

/** Format totals for the footer row (R60 / R59 consistency). */
export function formatSessionTotals(totals: SessionUsageTotals): string {
  if (totals.replies === 0) return "Session: no replies yet";
  const parts: string[] = [`${totals.replies} repl${totals.replies === 1 ? "y" : "ies"}`];
  if (totals.repliesWithUsage > 0) {
    const tokenLabel =
      totals.repliesWithUsage < totals.replies
        ? `${totals.promptTokens}→${totals.completionTokens} tok (partial)`
        : `${totals.promptTokens}→${totals.completionTokens} tok`;
    parts.push(tokenLabel);
  }
  if (totals.totalMs > 0) {
    parts.push(`${Math.round(totals.totalMs)}ms`);
  }
  return `Session: ${parts.join(" · ")}`;
}
