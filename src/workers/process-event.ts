import { getJob, getCompany, jobCompanyUuid, resolveJobMobile } from "../servicem8/api.js";
import { getAccessToken } from "../servicem8/oauth.js";
import {
  getTemplate,
  insertOutbound,
  listRules,
  logEvent,
} from "../db/repository.js";
import { buildJobTemplateContext } from "../engine/job-context.js";
import { renderTemplate } from "../engine/templates.js";
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
  const mobile = await resolveJobMobile(token, job, company);
  const ctx = buildJobTemplateContext(job, company, mobile);
  const status = input.status ?? ctx.status;
  const trigger = inferTrigger(input.event_type, status);
  if (!trigger) return { sent: false, reason: "no_trigger" };

  const rule = evaluateRules(listRules(), trigger, { ...ctx, status });
  if (!rule) return { sent: false, reason: "no_rule" };
  const tpl = getTemplate(rule.template_id);
  if (!tpl) return { sent: false, reason: "no_template" };
  if (!mobile) return { sent: false, reason: "no_mobile" };

  const body = renderTemplate(tpl.body, { ...ctx, status });
  const result = await enqueueSend(mobile, body, { jobUuid });
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
