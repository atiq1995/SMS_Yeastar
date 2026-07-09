import type { Request, Response } from "express";
import { verifyServiceM8Jwt, type AddonJwt } from "./jwt.js";
import { renderDashboardHtml } from "../ui/dashboard.js";
import { renderJobActionHtml } from "../ui/job-composer.js";
import {
  setSetting,
  upsertTemplate,
  replaceRules,
  insertOutbound,
  getSingleOAuthTokens,
  listTemplates,
  listOutbound,
  listInbound,
  countOutboundSince,
} from "../db/repository.js";
import { sendSms } from "../yeastar/send.js";
import { env } from "../config/env.js";
import { processJobEvent } from "../workers/process-event.js";
import { getJob, getCompany, jobCompanyUuid, createJobNote, createSmsTemplate, listSmsTemplates } from "./api.js";
import { resolveAccessToken } from "./oauth.js";
import { renderSmsBody } from "../engine/templates.js";
import { buildJobTemplateContext } from "../engine/job-context.js";
import { enqueueSend } from "../yeastar/queue.js";
import { guardOutbound } from "../yeastar/guard.js";

function accountUuid(payload: AddonJwt, args: Record<string, unknown>): string {
  return (
    payload.account_uuid ||
    (args.account_uuid as string) ||
    (args.accountUUID as string) ||
    (args.vendorUUID as string) ||
    getSingleOAuthTokens()?.account_uuid ||
    ""
  );
}

function jobUuid(payload: AddonJwt, args: Record<string, unknown>): string | undefined {
  return (
    (args.jobUUID as string) ||
    (args.job_uuid as string) ||
    payload.job_uuid ||
    payload.object_uuid ||
    (payload.entry?.uuid as string)
  );
}

function eventArgs(payload: AddonJwt): Record<string, unknown> {
  return payload.eventArgs || payload.args || {};
}

function eventName(payload: AddonJwt): string {
  return String(payload.eventName || payload.event || eventArgs(payload).event || "").toLowerCase();
}

/** ServiceM8 gateway parses JSON first; HTML goes in eventResponse */
function sendEventHtml(res: Response, html: string): void {
  res.json({ eventResponse: html });
}

/** invoke() responses also use eventResponse with a JSON string value */
function sendInvokeJson(res: Response, data: unknown): void {
  res.json({ eventResponse: JSON.stringify(data) });
}

export async function handleAddonPost(req: Request, res: Response): Promise<void> {
  let payload: AddonJwt;
  try {
    payload = verifyServiceM8Jwt(req.body as Buffer);
  } catch (e) {
    console.error("addon jwt error", e);
    res.status(401).json({ eventResponse: JSON.stringify({ error: String(e) }) });
    return;
  }

  const event = eventName(payload);
  const args = eventArgs(payload);
  const acct = accountUuid(payload, args);
  const job = jobUuid(payload, args);
  console.log("addon event", event, "account", acct || "(none)");

  try {
    if (event === "sms_dashboard_settings") {
      sendEventHtml(res, await renderDashboardHtml(acct, payload.auth));
      return;
    }
    if (event === "sms_dashboard_action") {
      sendEventHtml(res, await renderJobActionHtml(acct, job || "", payload.auth));
      return;
    }
    if (event === "sms_dashboard_data") {
      const token = await resolveAccessToken(acct, payload.auth);
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      sendInvokeJson(res, {
        ok: true,
        templates: listTemplates().map((t) => ({ id: t.id, name: t.name, body: t.body })),
        importedTemplates: token ? await listSmsTemplates(token) : [],
        outbound: listOutbound(50),
        inbound: listInbound(50),
        sent7d: countOutboundSince(since),
      });
      return;
    }
    if (event === "sms_dashboard_save") {
      const section = args.section as string;
      if (section === "settings" && typeof args.en_route_statuses === "string") {
        setSetting("en_route_statuses", args.en_route_statuses);
        sendInvokeJson(res, { ok: true });
        return;
      }
      if (section === "templates" && Array.isArray(args.templates)) {
        for (const t of args.templates as { id?: number; name: string; body: string }[]) {
          upsertTemplate(t.name, t.body, t.id);
        }
        sendInvokeJson(res, {
          ok: true,
          templates: listTemplates().map((t) => ({ id: t.id, name: t.name, body: t.body })),
        });
        return;
      }
      if (section === "imported_templates" && Array.isArray(args.templates)) {
        const token = await resolveAccessToken(acct, payload.auth);
        if (!token) {
          sendInvokeJson(res, { ok: false, error: "no_oauth" });
          return;
        }
        for (const t of args.templates as { name: string; body: string }[]) {
          const result = await createSmsTemplate(token, { name: t.name, message: t.body });
          if (!result.ok) {
            sendInvokeJson(res, { ok: false, error: result.error });
            return;
          }
        }
        sendInvokeJson(res, { ok: true, importedTemplates: await listSmsTemplates(token) });
        return;
      }
      if (section === "rules" && Array.isArray(args.rules)) {
        replaceRules(
          (args.rules as { name: string; trigger_type: string; status_match?: string; template_id: number; enabled?: number }[]).map(
            (r, i) => ({
              name: r.name,
              trigger_type: r.trigger_type,
              status_match: r.status_match ?? null,
              template_id: r.template_id,
              enabled: r.enabled ?? 1,
              sort_order: i,
            })
          )
        );
        sendInvokeJson(res, { ok: true });
        return;
      }
      sendInvokeJson(res, { ok: false, error: "unknown_section" });
      return;
    }
    if (event === "sms_test_yeastar") {
      try {
        const dest = env.smsTestMobile || "0000000000";
        const result = await sendSms(dest, "SMS dashboard connection test");
        sendInvokeJson(res, { ok: result.accepted, dryRun: result.dryRun, detail: result.rawResponse, to: dest });
      } catch (err) {
        sendInvokeJson(res, { ok: false, error: String(err) });
      }
      return;
    }
    if (event === "sms_dashboard_send") {
      const jobId = (args.job_uuid as string) || (args.jobUUID as string) || job;
      const toNumber = typeof args.to_number === "string" ? args.to_number.replace(/\s+/g, "") : "";
      const message = typeof args.message === "string" ? args.message.trim() : "";
      const recipientName = typeof args.recipient_name === "string" ? args.recipient_name : undefined;
      if (!jobId) {
        sendInvokeJson(res, { error: "missing_job_uuid" });
        return;
      }
      if (!toNumber) {
        sendInvokeJson(res, { error: "missing_to_number" });
        return;
      }
      if (!message) {
        sendInvokeJson(res, { error: "missing_message" });
        return;
      }
      const token = await resolveAccessToken(acct, payload.auth);
      if (!token) {
        sendInvokeJson(res, { error: "no_oauth" });
        return;
      }
      const j = await getJob(token, jobId);
      const cu = jobCompanyUuid(j);
      if (!cu) {
        sendInvokeJson(res, { error: "no_company" });
        return;
      }
      const company = await getCompany(token, cu);
      const text = renderSmsBody(message, buildJobTemplateContext(j, company, toNumber, recipientName));
      const guarded = guardOutbound(toNumber, text, jobId);
      if (!guarded.ok) {
        insertOutbound({
          account_uuid: acct,
          job_uuid: jobId,
          to_number: toNumber,
          body: text,
          status: "blocked_test_mode",
          provider_response: guarded.reason,
        });
        sendInvokeJson(res, { error: guarded.reason });
        return;
      }
      sendInvokeJson(res, { ok: true, queued: true });
      void enqueueSend(guarded.destination, guarded.message, { jobUuid: jobId })
        .then((result) => {
          const status = guarded.redirected
            ? result.accepted
              ? result.dryRun
                ? "test_redirected_dry_run"
                : "test_redirected"
              : "failed"
            : result.accepted
              ? result.dryRun
                ? "dry_run"
                : "sent"
              : "failed";
          insertOutbound({
            account_uuid: acct,
            job_uuid: jobId,
            to_number: guarded.destination,
            body: text,
            status,
            provider_response: result.rawResponse,
          });
          if (result.accepted) {
            void createJobNote(
              token,
              jobId,
              `SMS sent to ${guarded.destination}${guarded.redirected ? ` (test redirect from ${toNumber})` : ""}: ${text}`
            ).catch((err) => console.error("job note failed", err));
          }
          console.log("sms sent", jobId, guarded.destination, result.accepted);
        })
        .catch((err) => console.error("sms send failed", err));
      return;
    }
    if (event === "webhook_subscription") {
      res.json({});
      return;
    }

  const webhookish = event.includes("webhook") || payload.object === "job" || event.includes("job");
  if (webhookish || event === "job" || event.includes("status")) {
    const objectId = job || (payload.entry?.uuid as string) || payload.object_uuid;
    const status = (payload.entry?.status as string) || (args.status as string);
    const eventType = event.includes("create") ? "job.created" : event || "job.status";
    if (objectId && acct) {
      void processJobEvent({
        account_uuid: acct,
        event_type: eventType,
        object_type: "job",
        object_id: objectId,
        status,
        idempotency_key: `${acct}:${eventType}:${objectId}:${status ?? ""}:${payload.iat ?? ""}`,
      }).catch((err) => console.error("processJobEvent", err));
    }
    res.status(202).json({ accepted: true });
    return;
  }

    sendInvokeJson(res, { error: "unknown_event", event });
  } catch (err) {
    console.error("addon handler error", err);
    if (!res.headersSent) {
      sendInvokeJson(res, { error: String(err) });
    }
  }
}
