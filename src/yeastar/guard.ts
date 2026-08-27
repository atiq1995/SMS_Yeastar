import { env } from "../config/env.js";
import { getSetting } from "../db/repository.js";

export type GuardResult =
  | { ok: true; destination: string; message: string; redirected: boolean }
  | { ok: false; reason: string };

function normPhone(p: string): string {
  return p.replace(/\D/g, "");
}

function phonesMatch(a: string, b: string): boolean {
  const na = normPhone(a);
  const nb = normPhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 9 && nb.length >= 9) return na.slice(-9) === nb.slice(-9);
  return false;
}

/** Dashboard settings win after first Save; until then fall back to .env. */
export function resolveUatConfig(): { enabled: boolean; mobile: string; jobOnly: string } {
  const configured = getSetting("uat_configured") === "1";
  if (configured) {
    return {
      enabled: getSetting("uat_enabled") === "1",
      mobile: (getSetting("uat_redirect_number") ?? "").trim(),
      jobOnly: env.smsTestJobUuid,
    };
  }
  return {
    enabled: !!(env.smsTestMobile || env.smsTestJobUuid),
    mobile: env.smsTestMobile,
    jobOnly: env.smsTestJobUuid,
  };
}

export function guardOutbound(destination: string, message: string, jobUuid?: string): GuardResult {
  const uat = resolveUatConfig();

  if (uat.jobOnly) {
    if (!jobUuid || jobUuid !== uat.jobOnly) {
      return { ok: false, reason: `test_mode: only job ${uat.jobOnly.slice(0, 8)}… may send` };
    }
  }

  if (uat.enabled && uat.mobile) {
    if (!phonesMatch(destination, uat.mobile)) {
      return {
        ok: true,
        destination: uat.mobile,
        message: `[TEST — was ${destination}]\n${message}`,
        redirected: true,
      };
    }
  }

  return { ok: true, destination, message, redirected: false };
}

export function isTestMode(): boolean {
  const uat = resolveUatConfig();
  return !!(uat.enabled && uat.mobile) || !!uat.jobOnly;
}

export function testModeLabel(): string {
  const uat = resolveUatConfig();
  const parts: string[] = [];
  if (uat.enabled && uat.mobile) parts.push(`mobile → ${uat.mobile}`);
  if (uat.jobOnly) parts.push(`job ${uat.jobOnly.slice(0, 8)}… only`);
  if (!parts.length && uat.enabled) parts.push("on (set redirect number)");
  return parts.join(" · ") || "on";
}
