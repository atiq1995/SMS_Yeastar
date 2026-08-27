import {
  getJob,
  getCompany,
  getLocationPhone1,
  getNextBookingContext,
  getStaff,
  jobCompanyUuid,
  createJobNote,
  getVendorName,
  resolveBadgesByUuids,
} from "../servicem8/api.js";
import { getAccessToken } from "../servicem8/oauth.js";
import {
  getTemplate,
  claimOutboundSend,
  updateOutbound,
  insertOutbound,
  listRules,
  logEvent,
  getJobBadgeSnapshot,
  setJobBadgeSnapshot,
  upsertScheduledSend,
  cancelScheduledByBadge,
  cancelScheduledForJobRule,
  type RuleRow,
} from "../db/repository.js";
import { automationCooldownMinutes, automationQuietHours, blockedByKeyword } from "../engine/automation-safety.js";
import { analyzeTemplateFields } from "../engine/field-support.js";
import { buildSm8Map, buildJobTemplateContext } from "../engine/job-context.js";
import { renderSmsBody } from "../engine/templates.js";
import {
  evaluateRules,
  inferTrigger,
  matchingScheduledBadgeRules,
  matchingScheduledCompletedRules,
} from "../engine/rules.js";
import { resolveRuleRecipient } from "../engine/recipient.js";
import {
  addOffsetMelbourne,
  anyBadgeMatches,
  diffAddedUuids,
  diffRemovedUuids,
  parseBadgeJson,
  parseJobBadgesField,
  type BadgeRef,
} from "../engine/badges.js";
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

type SendMeta = { rule: RuleRow; badgeName?: string; idemSuffix: string };

async function sendForRules(opts: {
  accountUuid: string;
  jobUuid: string;
  token: string;
  job: Record<string, unknown>;
  company: Record<string, unknown>;
  status: string | undefined;
  idempotencyKey: string;
  rules: SendMeta[];
  jobBadges: BadgeRef[];
}): Promise<{ sent: boolean; reason?: string }> {
  if (!opts.rules.length) return { sent: false, reason: "no_rule" };

  const blockedKeyword = blockedByKeyword(opts.job, opts.company);
  const quiet = automationQuietHours();
  const cooldownMinutes = automationCooldownMinutes();
  const booking = await getNextBookingContext(opts.token, opts.job);
  const vendorPhone1 = await getLocationPhone1(opts.token, opts.job).catch(() => undefined);
  const assignedStaffUuid =
    booking.assignedStaffUuid ||
    (typeof opts.job.staff_uuid === "string" && opts.job.staff_uuid.trim()) ||
    (typeof opts.job.queue_assigned_staff_uuid === "string" && opts.job.queue_assigned_staff_uuid.trim()) ||
    (typeof opts.job.assigned_staff_uuid === "string" && opts.job.assigned_staff_uuid.trim()) ||
    "";
  const assignedStaff: Record<string, unknown> = assignedStaffUuid
    ? await getStaff(opts.token, assignedStaffUuid).catch(() => ({} as Record<string, unknown>))
    : {};
  const ctx = buildJobTemplateContext(opts.job, opts.company);
  ctx.nextBookingDate = booking.nextBookingDate;
  ctx.nextBookingDateExtended = booking.nextBookingDateExtended;
  ctx.nextBookingTime = booking.nextBookingTime;
  ctx.serviceWarrantyPeriod =
    (typeof opts.job.service_warranty_period === "string" && opts.job.service_warranty_period.trim()) ||
    (typeof opts.company.service_warranty_period === "string" && opts.company.service_warranty_period.trim()) ||
    (typeof opts.job.warranty_period === "string" && opts.job.warranty_period.trim()) ||
    (typeof opts.company.warranty_period === "string" && opts.company.warranty_period.trim()) ||
    undefined;
  ctx.assignedStaffFirst =
    (typeof assignedStaff.first === "string" && assignedStaff.first.trim()) ||
    (typeof assignedStaff.full_name === "string" && assignedStaff.full_name.trim().split(/\s+/)[0]) ||
    (typeof assignedStaff.name === "string" && assignedStaff.name.trim().split(/\s+/)[0]) ||
    undefined;
  ctx.vendorPhone1 = vendorPhone1;
  const vendorName = await getVendorName(opts.token);

  let sentAny = false;
  let lastFail: string | undefined;

  for (const meta of opts.rules) {
    const rule = meta.rule;
    const suppress = parseBadgeJson(rule.suppress_badge_json);
    if (suppress.length && anyBadgeMatches(opts.jobBadges, suppress)) {
      insertOutbound({
        account_uuid: opts.accountUuid,
        job_uuid: opts.jobUuid,
        to_number: "-",
        body: `(suppressed) ${rule.name}`,
        status: "blocked_suppress_badge",
        provider_response: `Suppressed by badge on job`,
        idempotency_key: `${opts.idempotencyKey}:out:${meta.idemSuffix}:suppress`,
        rule_id: rule.id,
        rule_name: rule.name,
        badge_name: meta.badgeName ?? null,
      });
      lastFail = "blocked_suppress_badge";
      continue;
    }

    const tpl = getTemplate(rule.template_id);
    if (!tpl) {
      console.warn("automation skip", rule.id, "no_template");
      lastFail = "no_template";
      continue;
    }
    const recipient = await resolveRuleRecipient(rule, opts.token, opts.job, opts.company);
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
      status: opts.status,
      mobile,
    };
    const issues = analyzeTemplateFields(tpl.body, buildSm8Map(opts.job, recipientCtx, vendorName));
    if (issues.unsupported.length || issues.missingExact.length) {
      insertOutbound({
        account_uuid: opts.accountUuid,
        job_uuid: opts.jobUuid,
        to_number: mobile,
        body: tpl.body,
        status: "blocked_template_fields",
        provider_response: [
          issues.unsupported.length ? `Unsupported fields: ${issues.unsupported.join(", ")}` : "",
          issues.missingExact.length ? `Missing exact fields: ${issues.missingExact.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        idempotency_key: `${opts.idempotencyKey}:out:${meta.idemSuffix}`,
        rule_id: rule.id,
        rule_name: rule.name,
        badge_name: meta.badgeName ?? null,
      });
      lastFail = "blocked_template_fields";
      continue;
    }

    const body = renderSmsBody(tpl.body, recipientCtx, { job: opts.job, vendorName });
    const idem = `${opts.idempotencyKey}:out:${meta.idemSuffix}`;
    if (blockedKeyword) {
      insertOutbound({
        account_uuid: opts.accountUuid,
        job_uuid: opts.jobUuid,
        to_number: mobile,
        body,
        status: "blocked_exclusion",
        provider_response: `Blocked by exclusion keyword: ${blockedKeyword}`,
        idempotency_key: idem,
        rule_id: rule.id,
        rule_name: rule.name,
        badge_name: meta.badgeName ?? null,
      });
      lastFail = "blocked_exclusion";
      continue;
    }
    if (quiet.blocked) {
      insertOutbound({
        account_uuid: opts.accountUuid,
        job_uuid: opts.jobUuid,
        to_number: mobile,
        body,
        status: "blocked_quiet_hours",
        provider_response: `Blocked during quiet hours (${quiet.start}:00-${quiet.end}:00 Melbourne time)`,
        idempotency_key: idem,
        rule_id: rule.id,
        rule_name: rule.name,
        badge_name: meta.badgeName ?? null,
      });
      lastFail = "blocked_quiet_hours";
      continue;
    }
    const claimId = claimOutboundSend(
      {
        account_uuid: opts.accountUuid,
        job_uuid: opts.jobUuid,
        to_number: mobile,
        body,
        idempotency_key: idem,
        rule_id: rule.id,
        rule_name: rule.name,
        badge_name: meta.badgeName ?? null,
      },
      cooldownMinutes
    );
    if (claimId == null) {
      insertOutbound({
        account_uuid: opts.accountUuid,
        job_uuid: opts.jobUuid,
        to_number: mobile,
        body,
        status: "blocked_duplicate",
        provider_response: `Blocked duplicate within ${cooldownMinutes} minutes`,
        idempotency_key: `${idem}:dup`,
        rule_id: rule.id,
        rule_name: rule.name,
        badge_name: meta.badgeName ?? null,
      });
      lastFail = "blocked_duplicate";
      continue;
    }
    const guarded = guardOutbound(mobile, body, opts.jobUuid);
    if (!guarded.ok) {
      updateOutbound(claimId, { status: "blocked_test_mode", provider_response: guarded.reason });
      lastFail = guarded.reason;
      continue;
    }
    const result = await enqueueSend(guarded.destination, guarded.message, { jobUuid: opts.jobUuid });
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
    const detail = [
      yeastarResultDetail(result),
      guarded.redirected ? `redirected from ${mobile} → ${guarded.destination}` : "",
      meta.badgeName ? `badge:${meta.badgeName}` : "",
      `rule:${rule.name}`,
    ]
      .filter(Boolean)
      .join(" | ");
    updateOutbound(claimId, { status: statusValue, provider_response: detail });
    if (result.accepted) {
      sentAny = true;
      void createJobNote(
        opts.token,
        opts.jobUuid,
        `SMS sent to ${guarded.destination}${guarded.redirected ? ` (test redirect from ${mobile})` : ""}: ${body}`
      ).catch((err) => console.error("job note failed", err));
    } else {
      lastFail = result.errorCode;
    }
  }

  return { sent: sentAny, reason: sentAny ? undefined : lastFail };
}

function scheduleOffsetIso(rule: RuleRow, from = new Date()): string | undefined {
  const value = rule.schedule_offset_value;
  const unit = rule.schedule_offset_unit;
  if (!value || value < 1) return undefined;
  if (unit !== "days" && unit !== "weeks" && unit !== "months") return undefined;
  return addOffsetMelbourne(from, value, unit).toISOString();
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
  const status = input.status ?? (typeof job.status === "string" ? job.status : undefined);
  const changed = (input.changed_fields ?? []).map((f) => f.toLowerCase());
  const rules = listRules();

  const badgeUuids = parseJobBadgesField(job.badges);
  const jobBadges = await resolveBadgesByUuids(token, badgeUuids);
  const isBadgeEvent =
    input.event_type.toLowerCase().includes("badge") || changed.includes("badges");

  let sentAny = false;
  let lastFail: string | undefined;

  if (isBadgeEvent) {
    const prev = getJobBadgeSnapshot(jobUuid);
    // First observation of a job that already has several badges: seed baseline only
    // (avoids blasting every matching automation after deploy). A 0→1 add still fires.
    if (prev.length === 0 && badgeUuids.length > 1) {
      setJobBadgeSnapshot(jobUuid, badgeUuids);
    } else {
      const addedUuids = diffAddedUuids(prev, badgeUuids);
      const removedUuids = diffRemovedUuids(prev, badgeUuids);
      setJobBadgeSnapshot(jobUuid, badgeUuids);

      for (const removed of removedUuids) {
        cancelScheduledByBadge(jobUuid, removed);
      }

      const addedBadgeRefs = jobBadges.filter((b) =>
        addedUuids.some((u) => u.toLowerCase() === b.uuid.toLowerCase())
      );
      for (const rule of rules) {
        const suppress = parseBadgeJson(rule.suppress_badge_json);
        if (suppress.length && anyBadgeMatches(addedBadgeRefs, suppress)) {
          cancelScheduledForJobRule(jobUuid, rule.id, "cancelled_suppress");
        }
      }

      if (addedBadgeRefs.length) {
        const immediate = evaluateRules(rules, "badge_added", { status }, { addedBadges: addedBadgeRefs });
        const result = await sendForRules({
          accountUuid: input.account_uuid,
          jobUuid,
          token,
          job,
          company,
          status,
          idempotencyKey: input.idempotency_key,
          jobBadges,
          rules: immediate.map((rule) => ({
            rule,
            badgeName: addedBadgeRefs.map((b) => b.name).join(", "),
            idemSuffix: `badge:${rule.id}`,
          })),
        });
        if (result.sent) sentAny = true;
        else if (result.reason) lastFail = result.reason;

        for (const rule of matchingScheduledBadgeRules(rules, addedBadgeRefs)) {
          const fireAt = scheduleOffsetIso(rule);
          if (!fireAt) continue;
          const matched = parseBadgeJson(rule.badge_json).find((n) => anyBadgeMatches(addedBadgeRefs, [n]));
          upsertScheduledSend({
            account_uuid: input.account_uuid,
            job_uuid: jobUuid,
            rule_id: rule.id,
            badge_uuid: matched?.uuid ?? addedBadgeRefs[0]?.uuid,
            badge_name: matched?.name ?? addedBadgeRefs[0]?.name,
            fire_at: fireAt,
          });
        }
      }
    }
  } else if (!getJobBadgeSnapshot(jobUuid).length && badgeUuids.length) {
    // First sight of job badges without a badges event — seed snapshot only
    setJobBadgeSnapshot(jobUuid, badgeUuids);
  }

  const lifecycleTrigger = inferTrigger(input.event_type, status, input.changed_fields);

  if (lifecycleTrigger) {
    const matched = evaluateRules(rules, lifecycleTrigger, { status });
    const result = await sendForRules({
      accountUuid: input.account_uuid,
      jobUuid,
      token,
      job,
      company,
      status,
      idempotencyKey: input.idempotency_key,
      jobBadges,
      rules: matched.map((rule) => ({ rule, idemSuffix: String(rule.id) })),
    });
    if (result.sent) sentAny = true;
    else if (result.reason) lastFail = result.reason;

    if (lifecycleTrigger === "completed") {
      for (const rule of matchingScheduledCompletedRules(rules)) {
        const fireAt = scheduleOffsetIso(rule);
        if (!fireAt) continue;
        upsertScheduledSend({
          account_uuid: input.account_uuid,
          job_uuid: jobUuid,
          rule_id: rule.id,
          fire_at: fireAt,
        });
      }
    }
  }

  if (!isBadgeEvent && !lifecycleTrigger) return { sent: false, reason: "no_trigger" };
  return { sent: sentAny, reason: sentAny ? undefined : lastFail };
}

/** Used by the scheduled-send worker. */
export async function processScheduledSend(row: {
  id: number;
  account_uuid: string | null;
  job_uuid: string;
  rule_id: number;
  badge_name: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const rule = listRules().find((r) => r.id === row.rule_id);
  if (!rule || !rule.enabled || rule.trigger_type !== "scheduled") {
    return { ok: false, reason: "rule_gone" };
  }
  const accountUuid = row.account_uuid || "";
  if (!accountUuid) return { ok: false, reason: "no_account" };
  const token = await getAccessToken(accountUuid);
  if (!token) return { ok: false, reason: "no_oauth" };
  const job = await getJob(token, row.job_uuid);
  const companyUuid = jobCompanyUuid(job);
  if (!companyUuid) return { ok: false, reason: "no_company" };
  const company = await getCompany(token, companyUuid);
  const badgeUuids = parseJobBadgesField(job.badges);
  const jobBadges = await resolveBadgesByUuids(token, badgeUuids);
  const status = typeof job.status === "string" ? job.status : undefined;

  const result = await sendForRules({
    accountUuid,
    jobUuid: row.job_uuid,
    token,
    job,
    company,
    status,
    idempotencyKey: `sched:${row.id}`,
    jobBadges,
    rules: [{ rule, badgeName: row.badge_name ?? undefined, idemSuffix: `sched:${row.id}` }],
  });
  return { ok: !!result.sent, reason: result.reason };
}
