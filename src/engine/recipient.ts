import type { RuleRow } from "../db/repository.js";
import {
  resolveCompanyPrimaryMobile,
  resolveJobMobile,
  type ServiceM8Company,
  type ServiceM8Job,
} from "../servicem8/api.js";

/** Strip spaces; empty → undefined so the rule is skipped */
export function customRecipientNumber(raw?: string | null): string | undefined {
  const n = (raw ?? "").replace(/\s+/g, "");
  return n || undefined;
}

export async function resolveRuleRecipient(
  rule: Pick<RuleRow, "recipient_type" | "recipient_number">,
  accessToken: string,
  job: ServiceM8Job,
  company: ServiceM8Company
): Promise<string | undefined> {
  const type = rule.recipient_type || "job_contact";
  if (type === "custom") return customRecipientNumber(rule.recipient_number);
  if (type === "company_primary") return resolveCompanyPrimaryMobile(accessToken, job, company);
  return resolveJobMobile(accessToken, job, company);
}
