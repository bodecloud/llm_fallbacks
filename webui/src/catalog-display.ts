import type { CatalogEntry } from "./providers/browser-router";

export type CapabilityBadge = "vision" | "tools" | "schema";

export function formatContextLength(value: number | undefined): string {
  if (value === undefined || value <= 0) return "—";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return millions >= 10 ? `${Math.round(millions)}M` : `${millions.toFixed(1)}M`;
  }
  if (value >= 1000) {
    const thousands = value / 1000;
    return thousands >= 100 ? `${Math.round(thousands)}K` : `${thousands.toFixed(0)}K`;
  }
  return String(value);
}

export function capabilityBadges(entry: CatalogEntry): CapabilityBadge[] {
  const badges: CapabilityBadge[] = [];
  if (entry.supports_vision) badges.push("vision");
  if (entry.supports_function_calling || entry.supports_tool_choice) badges.push("tools");
  if (entry.supports_response_schema) badges.push("schema");
  return badges;
}

export function badgeLabel(badge: CapabilityBadge): string {
  if (badge === "vision") return "vision";
  if (badge === "tools") return "tools";
  return "schema";
}

export function catalogSummaryLine(entry: CatalogEntry): string {
  const parts: string[] = [];
  if (entry.quality_score !== undefined) {
    parts.push(`score ${entry.quality_score.toFixed(1)}`);
  }
  const ctx = formatContextLength(entry.context_length);
  if (ctx !== "—") parts.push(`ctx ${ctx}`);
  const badges = capabilityBadges(entry);
  if (badges.length) parts.push(badges.map(badgeLabel).join(", "));
  return parts.length ? parts.join(" · ") : entry.id;
}

export function renderCapabilityBadgesHtml(entry: CatalogEntry): string {
  return capabilityBadges(entry)
    .map((b) => `<span class="lf-cap-badge lf-cap-${b}">${badgeLabel(b)}</span>`)
    .join("");
}
