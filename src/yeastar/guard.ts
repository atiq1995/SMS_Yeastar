import { env } from "../config/env.js";

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

/** ponytail: env-only UAT guard — set SMS_TEST_MOBILE and/or SMS_TEST_JOB_UUID in .env */
export function guardOutbound(destination: string, message: string, jobUuid?: string): GuardResult {
  const testJob = env.smsTestJobUuid;
  const testMobile = env.smsTestMobile;

  if (testJob) {
    if (!jobUuid || jobUuid !== testJob) {
      return { ok: false, reason: `test_mode: only job ${testJob.slice(0, 8)}… may send` };
    }
  }

  if (testMobile) {
    if (!phonesMatch(destination, testMobile)) {
      return {
        ok: true,
        destination: testMobile,
        message: `[TEST — was ${destination}]\n${message}`,
        redirected: true,
      };
    }
  }

  return { ok: true, destination, message, redirected: false };
}

export function isTestMode(): boolean {
  return !!(env.smsTestMobile || env.smsTestJobUuid);
}

export function testModeLabel(): string {
  const parts: string[] = [];
  if (env.smsTestMobile) parts.push(`mobile → ${env.smsTestMobile}`);
  if (env.smsTestJobUuid) parts.push(`job ${env.smsTestJobUuid.slice(0, 8)}… only`);
  return parts.join(" · ");
}
