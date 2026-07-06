import type { Request, Response } from "express";
import { verifyServiceM8Jwt, type AddonJwt } from "./jwt.js";
import { renderDashboardHtml, renderJobActionHtml } from "../ui/dashboard.js";
import { setSetting, upsertTemplate, replaceRules } from "../db/repository.js";
import { sendSms } from "../yeastar/send.js";
import { processJobEvent } from "../workers/process-event.js";
import { getJob, getCompany, jobCompanyUuid, resolveMobile } from "./api.js";
import { getAccessToken } from "./oauth.js";
import { renderTemplate } from "../engine/templates.js";
import { getTemplate, listRules, insertOutbound } from "../db/repository.js";
import { evaluateRules } from "../engine/rules.js";
import { enqueueSend } from "../yeastar/queue.js";

function accountUuid(payload: AddonJwt): string {
  return payload.account_uuid || (payload.args?.account_uuid as string) || "";
}

function jobUuid(payload: AddonJwt): string | undefined {
  return (
    payload.job_uuid ||
    (payload.args?.job_uuid as string) ||
    payload.object_uuid ||
    (payload.entry?.uuid as string)
  );
}

function eventName(payload: AddonJwt): string {
  return String(payload.event || payload.args?.event || "");
}

/** ServiceM8 gateway parses JSON first; HTML goes in eventResponse */
function sendEventHtml(res: Response, html: string): void {
  res.json({ eventResponse: html });
}

export async function handleAddonPost(req: Request, res: Response): Promise<void> {
  let payload: AddonJwt;
  try {
    payload = verifyServiceM8Jwt(req.body as Buffer);
  } catch (e) {
    res.status(401).send(String(e));
    return;
  }

  const event = eventName(payload);
  const acct = accountUuid(payload);
  const job = jobUuid(payload);

  try {
    if (event === "sms_dashboard_settings") {
      sendEventHtml(res, renderDashboardHtml(acct));
      return;
    }
    if (event === "sms_dashboard_action") {
      sendEventHtml(res, renderJobActionHtml(acct, job || ""));
      return;
    }
    if (event === "sms_dashboard_save") {
      const args = payload.args || {};
      const section = args.section as string;
      if (section === "settings" && typeof args.en_route_statuses === "string") {
        setSetting("en_route_statuses", args.en_route_statuses);
      }
      if (section === "templates" && Array.isArray(args.templates)) {
        for (const t of args.templates as { id?: number; name: string; body: string }[]) {
          upsertTemplate(t.name, t.body, t.id);
        }
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
      }
      res.json({ ok: true });
      return;
    }
    if (event === "sms_test_yeastar") {
      const result = await sendSms("0000000000", "SMS dashboard connection test");
      res.json({ ok: result.accepted, dryRun: result.dryRun, detail: result.rawResponse });
      return;
    }
    if (event === "sms_dashboard_send") {
      const jobId = (argsJob(payload) as string) || job;
      if (!jobId) {
        res.status(400).json({ error: "missing_job_uuid" });
        return;
      }
      const token = await getAccessToken(acct);
      if (!token) {
        res.status(400).json({ error: "no_oauth" });
        return;
      }
      const j = await getJob(token, jobId);
      const cu = jobCompanyUuid(j);
      if (!cu) {
        res.status(400).json({ error: "no_company" });
        return;
      }
      const company = await getCompany(token, cu);
      const mobile = resolveMobile(company);
      if (!mobile) {
        res.status(400).json({ error: "no_mobile" });
        return;
      }
      const status = typeof j.status === "string" ? j.status : "";
      const rule = evaluateRules(listRules(), "status_changed", { status });
      const tpl = rule ? getTemplate(rule.template_id) : undefined;
      const body =
        tpl?.body ||
        `Update for job ${typeof j.generated_job_id === "string" ? j.generated_job_id : jobId}: ${status}`;
      const text = renderTemplate(body, {
        customerName: typeof company.name === "string" ? company.name : "Customer",
        jobNumber: String(j.generated_job_id ?? jobId),
        status,
      });
      const result = await enqueueSend(mobile, text);
      insertOutbound({
        account_uuid: acct,
        job_uuid: jobId,
        to_number: mobile,
        body: text,
        status: result.accepted ? (result.dryRun ? "dry_run" : "sent") : "failed",
        provider_response: result.rawResponse,
      });
      res.json({ ok: result.accepted, dryRun: result.dryRun });
      return;
    }
    if (event === "webhook_subscription") {
      res.json({ ok: true });
      return;
    }

  const webhookish = event.includes("webhook") || payload.object === "job" || event.includes("job");
  if (webhookish || event === "job" || event.includes("status")) {
    const objectId = job || (payload.entry?.uuid as string) || payload.object_uuid;
    const status = (payload.entry?.status as string) || (payload.args?.status as string);
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

    res.status(400).json({ error: "unknown_event", event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}

function argsJob(payload: AddonJwt): string | undefined {
  return payload.args?.job_uuid as string | undefined;
}
