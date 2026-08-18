import type { RuleRow } from "../db/repository.js";
import {
  resolveCompanyPrimaryRecipient,
  resolveJobRecipient,
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
): Promise<{ mobile: string; name?: string } | undefined> {
  const type = rule.recipient_type || "job_contact";
  if (type === "custom") {
    const mobile = customRecipientNumber(rule.recipient_number);
    return mobile ? { mobile } : undefined;
  }
  if (type === "company_primary") return resolveCompanyPrimaryRecipient(accessToken, job, company);
  return resolveJobRecipient(accessToken, job, company);
}
