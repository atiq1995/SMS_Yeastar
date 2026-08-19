import { getJob, getCompany, getLocationPhone1, getNextBookingContext, getStaff, jobCompanyUuid, createJobNote, getVendorName } from "../servicem8/api.js";
import { getAccessToken } from "../servicem8/oauth.js";
import {
  getTemplate,
  hasRecentOutboundDuplicate,
  insertOutbound,
  listRules,
  logEvent,
} from "../db/repository.js";
import { automationCooldownMinutes, automationQuietHours, blockedByKeyword } from "../engine/automation-safety.js";
import { analyzeTemplateFields } from "../engine/field-support.js";
import { buildSm8Map } from "../engine/job-context.js";
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
  const booking = await getNextBookingContext(token, job);
  const vendorPhone1 = await getLocationPhone1(token, job).catch(() => undefined);
  const assignedStaffUuid =
    booking.assignedStaffUuid ||
    (typeof job.staff_uuid === "string" && job.staff_uuid.trim()) ||
    (typeof job.queue_assigned_staff_uuid === "string" && job.queue_assigned_staff_uuid.trim()) ||
    (typeof job.assigned_staff_uuid === "string" && job.assigned_staff_uuid.trim()) ||
    "";
  const assignedStaff: Record<string, unknown> = assignedStaffUuid
    ? await getStaff(token, assignedStaffUuid).catch(() => ({} as Record<string, unknown>))
    : {};
  const ctx = buildJobTemplateContext(job, company);
  ctx.nextBookingDate = booking.nextBookingDate;
  ctx.nextBookingDateExtended = booking.nextBookingDateExtended;
  ctx.nextBookingTime = booking.nextBookingTime;
  ctx.serviceWarrantyPeriod =
    (typeof job.service_warranty_period === "string" && job.service_warranty_period.trim()) ||
    (typeof company.service_warranty_period === "string" && company.service_warranty_period.trim()) ||
    (typeof job.warranty_period === "string" && job.warranty_period.trim()) ||
    (typeof company.warranty_period === "string" && company.warranty_period.trim()) ||
    undefined;
  ctx.assignedStaffFirst =
    (typeof assignedStaff.first === "string" && assignedStaff.first.trim()) ||
    (typeof assignedStaff.full_name === "string" && assignedStaff.full_name.trim().split(/\s+/)[0]) ||
    (typeof assignedStaff.name === "string" && assignedStaff.name.trim().split(/\s+/)[0]) ||
    undefined;
  ctx.vendorPhone1 = vendorPhone1;
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
    const recipient = await resolveRuleRecipient(rule, token, job, company);
    if (!recipient?.mobile) {
      console.warn("automation skip", rule.id, "no_mobile");
      lastFail = "no_mobile";
      continue;
    }
    const mobile = recipient.mobile;
    const recipientCtx = {
      ...ctx,
      customerName: recipient.name || ctx.customerName,
      contactFirst: recipient.first,
      contactLast: recipient.last,
      status,
      mobile,
    };
    const issues = analyzeTemplateFields(tpl.body, buildSm8Map(job, recipientCtx, vendorName));
    if (issues.unsupported.length || issues.missingExact.length) {
      insertOutbound({
        account_uuid: input.account_uuid,
        job_uuid: jobUuid,
        to_number: mobile,
        body: tpl.body,
        status: "blocked_template_fields",
        provider_response: [
          issues.unsupported.length ? `Unsupported fields: ${issues.unsupported.join(", ")}` : "",
          issues.missingExact.length ? `Missing exact fields: ${issues.missingExact.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        idempotency_key: `${input.idempotency_key}:out:${rule.id}`,
      });
      lastFail = "blocked_template_fields";
      continue;
    }

    const body = renderSmsBody(tpl.body, recipientCtx, { job, vendorName });
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
