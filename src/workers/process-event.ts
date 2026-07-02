import { getJob, getCompany, jobCompanyUuid, resolveMobile } from "../servicem8/api.js";
import { getAccessToken } from "../servicem8/oauth.js";
import {
  getTemplate,
  insertOutbound,
  listRules,
  logEvent,
} from "../db/repository.js";
import { renderTemplate, type TemplateContext } from "../engine/templates.js";
import { evaluateRules, inferTrigger } from "../engine/rules.js";
import { enqueueSend } from "../yeastar/queue.js";

export type ProcessInput = {
  account_uuid: string;
  event_type: string;
  object_type?: string;
  object_id?: string;
  status?: string;
  idempotency_key: string;
};

function jobContext(job: Record<string, unknown>, company: Record<string, unknown>): TemplateContext {
  const jobNumber =
    (typeof job.generated_job_id === "string" && job.generated_job_id) ||
    (typeof job.job_number === "string" && job.job_number) ||
    String(job.uuid ?? "").slice(0, 8);
  const status = typeof job.status === "string" ? job.status : undefined;
  const address =
    (typeof job.job_address === "string" && job.job_address) ||
    (typeof job.address === "string" && job.address) ||
    undefined;
  const customerName =
    (typeof company.name === "string" && company.name) ||
    (typeof company.company_name === "string" && company.company_name) ||
    "Customer";
  return {
    customerName,
    jobNumber: String(jobNumber),
    status,
    address,
    companyName: customerName,
    mobile: resolveMobile(company),
  };
}

export async function processJobEvent(input: ProcessInput): Promise<{ sent: boolean; reason?: string }> {
  const dup = !logEvent({
    account_uuid: input.account_uuid,
    event_type: input.event_type,
    object_type: input.object_type,
    object_id: input.object_id,
    idempotency_key: input.idempotency_key,
    payload_json: JSON.stringify(input),
  });
  if (dup) return { sent: false, reason: "duplicate" };

  if (input.object_type && input.object_type !== "job") return { sent: false, reason: "not_job" };
  const jobUuid = input.object_id;
  if (!jobUuid) return { sent: false, reason: "no_job_uuid" };

  const token = await getAccessToken(input.account_uuid);
  if (!token) return { sent: false, reason: "no_oauth" };

  const job = await getJob(token, jobUuid);
  const companyUuid = jobCompanyUuid(job);
  if (!companyUuid) return { sent: false, reason: "no_company" };
  const company = await getCompany(token, companyUuid);
  const ctx = jobContext(job, company);
  const status = input.status ?? ctx.status;
  const trigger = inferTrigger(input.event_type, status);
  if (!trigger) return { sent: false, reason: "no_trigger" };

  const rule = evaluateRules(listRules(), trigger, { ...ctx, status });
  if (!rule) return { sent: false, reason: "no_rule" };
  const tpl = getTemplate(rule.template_id);
  if (!tpl) return { sent: false, reason: "no_template" };

  const mobile = ctx.mobile;
  if (!mobile) return { sent: false, reason: "no_mobile" };

  const body = renderTemplate(tpl.body, { ...ctx, status });
  const result = await enqueueSend(mobile, body);
  insertOutbound({
    account_uuid: input.account_uuid,
    job_uuid: jobUuid,
    to_number: mobile,
    body,
    status: result.accepted ? (result.dryRun ? "dry_run" : "sent") : "failed",
    provider_response: result.rawResponse,
    idempotency_key: input.idempotency_key + ":out",
  });

  return { sent: result.accepted, reason: result.accepted ? undefined : result.errorCode };
}
