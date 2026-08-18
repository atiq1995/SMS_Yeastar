import { getJob, getCompany, jobCompanyUuid, createJobNote, getVendorName } from "../servicem8/api.js";
import { getAccessToken } from "../servicem8/oauth.js";
import {
  getTemplate,
  hasRecentOutboundDuplicate,
  insertOutbound,
  listRules,
  logEvent,
} from "../db/repository.js";
import { automationCooldownMinutes, automationQuietHours, blockedByKeyword } from "../engine/automation-safety.js";
import { buildJobTemplateContext } from "../engine/job-context.js";
import { renderSmsBody } from "../engine/templates.js";
import { evaluateRules, inferTrigger } from "../engine/rules.js";
import { resolveRuleRecipient } from "../engine/recipient.js";
import { enqueueSend } from "../yeastar/queue.js";
import { guardOutbound } from "../yeastar/guard.js";
import { yeastarResultDetail } from "../yeastar/result.js";

export type ProcessInput = {
  account_uuid: string;
  event_type: string;
  object_type?: string;
  object_id?: string;
  status?: string;
  changed_fields?: string[];
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
  const ctx = buildJobTemplateContext(job, company);
  const status = input.status ?? ctx.status;
  const trigger = inferTrigger(input.event_type, status, input.changed_fields);
  if (!trigger) return { sent: false, reason: "no_trigger" };

  const matched = evaluateRules(listRules(), trigger, { ...ctx, status });
  if (!matched.length) return { sent: false, reason: "no_rule" };

  const vendorName = await getVendorName(token);
  const blockedKeyword = blockedByKeyword(job, company);
  const quiet = automationQuietHours();
  const cooldownMinutes = automationCooldownMinutes();
  let sentAny = false;
  let lastFail: string | undefined;

  for (const rule of matched) {
    const tpl = getTemplate(rule.template_id);
    if (!tpl) {
      console.warn("automation skip", rule.id, "no_template");
      lastFail = "no_template";
      continue;
    }
    const mobile = await resolveRuleRecipient(rule, token, job, company);
    if (!mobile) {
      console.warn("automation skip", rule.id, "no_mobile");
      lastFail = "no_mobile";
      continue;
    }

    const body = renderSmsBody(tpl.body, { ...ctx, status, mobile }, { job, vendorName });
    const idem = `${input.idempotency_key}:out:${rule.id}`;
    if (blockedKeyword) {
      insertOutbound({
        account_uuid: input.account_uuid,
        job_uuid: jobUuid,
        to_number: mobile,
        body,
        status: "blocked_exclusion",
        provider_response: `Blocked by exclusion keyword: ${blockedKeyword}`,
        idempotency_key: idem,
      });
      lastFail = "blocked_exclusion";
      continue;
    }
    if (quiet.blocked) {
      insertOutbound({
        account_uuid: input.account_uuid,
        job_uuid: jobUuid,
        to_number: mobile,
        body,
        status: "blocked_quiet_hours",
        provider_response: `Blocked during quiet hours (${quiet.start}:00-${quiet.end}:00 Melbourne time)`,
        idempotency_key: idem,
      });
      lastFail = "blocked_quiet_hours";
      continue;
    }
    if (
      hasRecentOutboundDuplicate({
        job_uuid: jobUuid,
        to_number: mobile,
        body,
        window_minutes: cooldownMinutes,
      })
    ) {
      insertOutbound({
        account_uuid: input.account_uuid,
        job_uuid: jobUuid,
        to_number: mobile,
        body,
        status: "blocked_duplicate",
        provider_response: `Blocked duplicate within ${cooldownMinutes} minutes`,
        idempotency_key: idem,
      });
      lastFail = "blocked_duplicate";
      continue;
    }
    const guarded = guardOutbound(mobile, body, jobUuid);
    if (!guarded.ok) {
      insertOutbound({
        account_uuid: input.account_uuid,
        job_uuid: jobUuid,
        to_number: mobile,
        body,
        status: "blocked_test_mode",
        provider_response: guarded.reason,
        idempotency_key: idem,
      });
      lastFail = guarded.reason;
      continue;
    }
    const result = await enqueueSend(guarded.destination, guarded.message, { jobUuid });
    const statusValue = guarded.redirected
      ? result.accepted
        ? result.dryRun
          ? "test_redirected_dry_run"
          : "test_redirected"
        : "failed"
      : result.accepted
        ? result.dryRun
          ? "dry_run"
          : "submitted"
        : "failed";
    insertOutbound({
      account_uuid: input.account_uuid,
      job_uuid: jobUuid,
      to_number: guarded.destination,
      body,
      status: statusValue,
      provider_response: yeastarResultDetail(result),
      idempotency_key: idem,
    });
    if (result.accepted) {
      sentAny = true;
      void createJobNote(
        token,
        jobUuid,
        `SMS sent to ${guarded.destination}${guarded.redirected ? ` (test redirect from ${mobile})` : ""}: ${body}`
      ).catch((err) => console.error("job note failed", err));
    } else {
      lastFail = result.errorCode;
    }
  }

  return { sent: sentAny, reason: sentAny ? undefined : lastFail };
}
