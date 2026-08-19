import { getSetting } from "../db/repository.js";

function parts(key: string, fallback = ""): string[] {
  return (getSetting(key) ?? fallback)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normHour(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : fallback;
}

function localHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-AU", {
      hour: "numeric",
      hour12: false,
      timeZone: "Australia/Melbourne",
    }).format(now)
  );
}

export function automationCooldownMinutes(): number {
  const raw = Number.parseInt((getSetting("automation_cooldown_minutes") ?? "").trim(), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

export function automationQuietHours(now = new Date()): { blocked: boolean; start: number; end: number } {
  const start = normHour(getSetting("quiet_hours_start"), 20);
  const end = normHour(getSetting("quiet_hours_end"), 7);
  const enabled = (getSetting("quiet_hours_enabled") ?? "1") !== "0";
  if (!enabled) return { blocked: false, start, end };
  const hour = localHour(now);
  const blocked = start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end;
  return { blocked, start, end };
}

export function blockedByKeyword(job: Record<string, unknown>, company: Record<string, unknown>): string | undefined {
  const keywords = parts("automation_exclusion_keywords", "admin,internal,test,not a job");
  if (!keywords.length) return undefined;
  const haystack = [
    job.generated_job_id,
    job.status,
    job.description,
    job.category,
    job.site_name,
    job.company_name,
    job.job_address,
    company.name,
    company.company_name,
  ]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join("\n")
    .toLowerCase();
  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) return keyword;
  }
  return undefined;
}
