import type { RuleRow } from "../db/repository.js";
import type { TemplateContext } from "./templates.js";
import { getSetting } from "../db/repository.js";
import { anyBadgeMatches, parseBadgeJson, type BadgeRef } from "./badges.js";

export type TriggerType = "job_created" | "status_changed" | "en_route" | "completed" | "badge_added";

export function evaluateRules(
  rules: RuleRow[],
  trigger: TriggerType,
  ctx: TemplateContext,
  opts?: { enRouteStatuses?: string; addedBadges?: BadgeRef[] }
): RuleRow[] {
  const status = (ctx.status ?? "").trim();
  const enRoute = (opts?.enRouteStatuses ?? getSetting("en_route_statuses") ?? "En Route,Dispatched")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const added = opts?.addedBadges ?? [];

  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.trigger_type !== trigger) return false;
    if (trigger === "status_changed" && rule.status_match) {
      if (status.toLowerCase() !== rule.status_match.trim().toLowerCase()) return false;
    }
    if (trigger === "en_route") {
      if (!enRoute.includes(status.toLowerCase())) return false;
    }
    if (trigger === "completed") {
      if (status.toLowerCase() !== "completed" && rule.status_match?.toLowerCase() !== status.toLowerCase()) {
        if (status.toLowerCase() !== "completed") return false;
      }
    }
    if (trigger === "badge_added") {
      const needles = parseBadgeJson(rule.badge_json);
      if (!needles.length || !anyBadgeMatches(added, needles)) return false;
    }
    return true;
  });
}

/** Scheduled rules that start when a matching badge is added. */
export function matchingScheduledBadgeRules(rules: RuleRow[], addedBadges: BadgeRef[]): RuleRow[] {
  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.trigger_type !== "scheduled") return false;
    if (rule.schedule_anchor !== "badge_added") return false;
    if (!rule.schedule_offset_value || !rule.schedule_offset_unit) return false;
    const needles = parseBadgeJson(rule.badge_json);
    return needles.length > 0 && anyBadgeMatches(addedBadges, needles);
  });
}

export function matchingScheduledCompletedRules(rules: RuleRow[]): RuleRow[] {
  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.trigger_type !== "scheduled") return false;
    if (rule.schedule_anchor !== "completed") return false;
    return !!(rule.schedule_offset_value && rule.schedule_offset_unit);
  });
}

export function inferTrigger(
  eventType: string,
  status?: string,
  changedFields?: string[]
): TriggerType | undefined {
  const changed = (changedFields ?? []).map((f) => f.toLowerCase());
  const e = eventType.toLowerCase();
  // Badge changes are handled separately in processJobEvent — do not steal status triggers.
  if (
    e.includes("create") ||
    e === "job.created" ||
    changed.includes("generated_job_id")
  ) {
    return "job_created";
  }
  const s = (status ?? "").toLowerCase();
  if (s === "completed") return "completed";
  if (s.includes("route") || s === "dispatched") return "en_route";
  if (e.includes("status") || (status && !changed.includes("badges"))) return "status_changed";
  if (status && changed.includes("status")) return "status_changed";
  return undefined;
}
