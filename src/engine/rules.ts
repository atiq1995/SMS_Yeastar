import type { RuleRow } from "../db/repository.js";
import type { TemplateContext } from "./templates.js";
import { getSetting } from "../db/repository.js";

export type TriggerType = "job_created" | "status_changed" | "en_route" | "completed";

export function evaluateRules(
  rules: RuleRow[],
  trigger: TriggerType,
  ctx: TemplateContext,
  enRouteStatuses?: string
): RuleRow[] {
  const status = (ctx.status ?? "").trim();
  const enRoute = (enRouteStatuses ?? getSetting("en_route_statuses") ?? "En Route,Dispatched")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

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
    return true;
  });
}

export function inferTrigger(
  eventType: string,
  status?: string,
  changedFields?: string[]
): TriggerType | undefined {
  const changed = (changedFields ?? []).map((f) => f.toLowerCase());
  const e = eventType.toLowerCase();
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
  if (e.includes("status") || status) return "status_changed";
  return undefined;
}
