import type { RuleRow } from "../db/repository.js";
import type { TemplateContext } from "./templates.js";
import { getSetting } from "../db/repository.js";

export type TriggerType = "job_created" | "status_changed" | "en_route" | "completed";

export function evaluateRules(rules: RuleRow[], trigger: TriggerType, ctx: TemplateContext): RuleRow | undefined {
  const status = (ctx.status ?? "").trim();
  const enRoute = (getSetting("en_route_statuses") ?? "En Route,Dispatched")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.trigger_type !== trigger) continue;
    if (trigger === "status_changed" && rule.status_match) {
      if (status.toLowerCase() !== rule.status_match.trim().toLowerCase()) continue;
    }
    if (trigger === "en_route") {
      if (!enRoute.includes(status.toLowerCase())) continue;
    }
    if (trigger === "completed") {
      if (status.toLowerCase() !== "completed" && rule.status_match?.toLowerCase() !== status.toLowerCase()) {
        if (status.toLowerCase() !== "completed") continue;
      }
    }
    return rule;
  }
  return undefined;
}

export function inferTrigger(eventType: string, status?: string): TriggerType | undefined {
  const e = eventType.toLowerCase();
  if (e.includes("create") || e === "job.created") return "job_created";
  const s = (status ?? "").toLowerCase();
  if (s === "completed") return "completed";
  if (s.includes("route") || s === "dispatched") return "en_route";
  if (e.includes("status") || status) return "status_changed";
  return undefined;
}
