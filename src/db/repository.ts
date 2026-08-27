import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { defaultRules, defaultTemplates } from "../engine/triggers.js";
import { normalizeInboundBody } from "../yeastar/sms-decode.js";

let _db: Database.Database | undefined;

export function db(): Database.Database {
  if (!_db) _db = new Database(env.databasePath);
  _db.pragma("foreign_keys = ON");
  return _db;
}

export type TemplateRow = { id: number; name: string; body: string };
export type RuleRow = {
  id: number;
  name: string;
  trigger_type: string;
  status_match: string | null;
  template_id: number;
  enabled: number;
  sort_order: number;
  recipient_type: string;
  recipient_number: string | null;
  badge_json: string | null;
  suppress_badge_json: string | null;
  schedule_offset_value: number | null;
  schedule_offset_unit: string | null;
  schedule_anchor: string | null;
};

export type ScheduledSendRow = {
  id: number;
  account_uuid: string | null;
  job_uuid: string;
  rule_id: number;
  badge_uuid: string | null;
  badge_name: string | null;
  fire_at: string;
  status: string;
  created_at: string;
};

export function getSetting(key: string): string | undefined {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db().prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function listTemplates(): TemplateRow[] {
  return db().prepare("SELECT id, name, body FROM templates ORDER BY name").all() as TemplateRow[];
}

export function getTemplate(id: number): TemplateRow | undefined {
  return db().prepare("SELECT id, name, body FROM templates WHERE id = ?").get(id) as TemplateRow | undefined;
}

export function upsertTemplate(name: string, body: string, id?: number): number {
  if (id) {
    db().prepare("UPDATE templates SET name = ?, body = ?, updated_at = datetime('now') WHERE id = ?").run(name, body, id);
    return id;
  }
  const r = db().prepare("INSERT INTO templates(name, body) VALUES(?, ?)").run(name, body);
  return Number(r.lastInsertRowid);
}

export function listRules(): RuleRow[] {
  return (db().prepare("SELECT * FROM rules ORDER BY sort_order, id").all() as RuleRow[]).map((r) => ({
    ...r,
    recipient_type: r.recipient_type || "job_contact",
    recipient_number: r.recipient_number ?? null,
    badge_json: r.badge_json ?? null,
    suppress_badge_json: r.suppress_badge_json ?? null,
    schedule_offset_value: r.schedule_offset_value ?? null,
    schedule_offset_unit: r.schedule_offset_unit ?? null,
    schedule_anchor: r.schedule_anchor ?? null,
  }));
}

export function getRule(id: number): RuleRow | undefined {
  const row = db().prepare("SELECT * FROM rules WHERE id = ?").get(id) as RuleRow | undefined;
  if (!row) return undefined;
  return {
    ...row,
    recipient_type: row.recipient_type || "job_contact",
    recipient_number: row.recipient_number ?? null,
    badge_json: row.badge_json ?? null,
    suppress_badge_json: row.suppress_badge_json ?? null,
    schedule_offset_value: row.schedule_offset_value ?? null,
    schedule_offset_unit: row.schedule_offset_unit ?? null,
    schedule_anchor: row.schedule_anchor ?? null,
  };
}

export type RuleInput = {
  id?: number;
  name: string;
  trigger_type: string;
  status_match?: string | null;
  template_id: number;
  enabled?: number;
  sort_order?: number;
  recipient_type?: string | null;
  recipient_number?: string | null;
  badge_json?: string | null;
  suppress_badge_json?: string | null;
  schedule_offset_value?: number | null;
  schedule_offset_unit?: string | null;
  schedule_anchor?: string | null;
};
export function replaceRules(rules: RuleInput[]): void {
  const d = db();
  const tx = d.transaction(() => {
    const keepIds = rules.map((r) => r.id).filter((id): id is number => typeof id === "number" && id > 0);
    if (keepIds.length) {
      d.prepare(`DELETE FROM rules WHERE id NOT IN (${keepIds.map(() => "?").join(",")})`).run(...keepIds);
    } else {
      d.prepare("DELETE FROM rules").run();
    }
    const upd = d.prepare(
      `UPDATE rules SET
        name=?, trigger_type=?, status_match=?, template_id=?, enabled=?, sort_order=?,
        recipient_type=?, recipient_number=?, badge_json=?, suppress_badge_json=?,
        schedule_offset_value=?, schedule_offset_unit=?, schedule_anchor=?
       WHERE id=?`
    );
    const ins = d.prepare(
      `INSERT INTO rules(
        name, trigger_type, status_match, template_id, enabled, sort_order,
        recipient_type, recipient_number, badge_json, suppress_badge_json,
        schedule_offset_value, schedule_offset_unit, schedule_anchor
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    rules.forEach((r, i) => {
      const type = r.recipient_type === "company_primary" || r.recipient_type === "custom" ? r.recipient_type : "job_contact";
      const number = type === "custom" ? (r.recipient_number?.replace(/\s+/g, "") || null) : null;
      const unit =
        r.schedule_offset_unit === "days" || r.schedule_offset_unit === "weeks" || r.schedule_offset_unit === "months"
          ? r.schedule_offset_unit
          : null;
      const anchor = r.schedule_anchor === "badge_added" || r.schedule_anchor === "completed" ? r.schedule_anchor : null;
      const vals = [
        r.name,
        r.trigger_type,
        r.status_match ?? null,
        r.template_id,
        r.enabled ?? 1,
        r.sort_order ?? i,
        type,
        number,
        r.badge_json ?? null,
        r.suppress_badge_json ?? null,
        r.schedule_offset_value ?? null,
        unit,
        anchor,
      ] as const;
      if (typeof r.id === "number" && r.id > 0) {
        upd.run(...vals, r.id);
      } else {
        ins.run(...vals);
      }
    });
    // Drop pending rows whose rule was removed
    d.prepare(
      `UPDATE scheduled_sends SET status = 'cancelled'
       WHERE status = 'pending' AND rule_id NOT IN (SELECT id FROM rules)`
    ).run();
  });
  tx();
}

export function listOutbound(limit = 100): Record<string, unknown>[] {
  return db().prepare("SELECT * FROM outbound_messages ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
}

export type ThreadMessage = { dir: "out" | "in"; body: string; at: string; number: string };

export function listJobThread(jobUuid: string, limit = 20): ThreadMessage[] {
  const outbound = db()
    .prepare(
      "SELECT body, created_at AS at, to_number AS number FROM outbound_messages WHERE job_uuid = ? ORDER BY id DESC LIMIT ?"
    )
    .all(jobUuid, limit) as { body: string; at: string; number: string }[];
  const inbound = db()
    .prepare(
      "SELECT body, received_at AS at, from_number AS number FROM inbound_messages WHERE job_uuid = ? ORDER BY id DESC LIMIT ?"
    )
    .all(jobUuid, limit) as { body: string; at: string; number: string }[];
  const merged: ThreadMessage[] = [
    ...outbound.map((m) => ({ dir: "out" as const, body: m.body, at: m.at, number: m.number })),
    ...inbound.map((m) => ({
      dir: "in" as const,
      body: normalizeInboundBody(m.body),
      at: m.at,
      number: m.number,
    })),
  ];
  merged.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return merged.slice(0, limit).reverse();
}

export function insertOutbound(row: {
  account_uuid?: string;
  job_uuid?: string;
  to_number: string;
  body: string;
  status: string;
  provider_response?: string;
  idempotency_key?: string;
  rule_id?: number | null;
  rule_name?: string | null;
  badge_name?: string | null;
}): number {
  const r = db()
    .prepare(
      `INSERT INTO outbound_messages(
        account_uuid, job_uuid, to_number, body, status, provider_response, idempotency_key,
        rule_id, rule_name, badge_name
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      row.account_uuid ?? null,
      row.job_uuid ?? null,
      row.to_number,
      row.body,
      row.status,
      row.provider_response ?? null,
      row.idempotency_key ?? null,
      row.rule_id ?? null,
      row.rule_name ?? null,
      row.badge_name ?? null
    );
  return Number(r.lastInsertRowid);
}

/** Statuses that count as "already sent / in flight" for cooldown */
const COOLDOWN_STATUSES = "('sent','dry_run','test_redirected','test_redirected_dry_run','submitted','queued')";

export function hasRecentOutboundDuplicate(input: {
  job_uuid?: string;
  to_number: string;
  body: string;
  window_minutes: number;
}): boolean {
  const window = `-${Math.max(1, input.window_minutes)} minutes`;
  // ponytail: match job+body only — under UAT redirect the stored to_number is the test mobile,
  // so checking the customer number never finds the prior send. Ceiling: two jobs with identical
  // body collide only if they share a job_uuid (they don't).
  if (input.job_uuid) {
    const row = db()
      .prepare(
        `SELECT 1 FROM outbound_messages
         WHERE job_uuid = ? AND body = ?
           AND created_at >= datetime('now', ?)
           AND status IN ${COOLDOWN_STATUSES}
         LIMIT 1`
      )
      .get(input.job_uuid, input.body, window) as { 1: number } | undefined;
    return !!row;
  }
  const row = db()
    .prepare(
      `SELECT 1 FROM outbound_messages
       WHERE job_uuid IS NULL AND to_number = ? AND body = ?
         AND created_at >= datetime('now', ?)
         AND status IN ${COOLDOWN_STATUSES}
       LIMIT 1`
    )
    .get(input.to_number, input.body, window) as { 1: number } | undefined;
  return !!row;
}

/** Atomically claim a send slot (queued row) or return null if within cooldown. */
export function claimOutboundSend(
  row: {
    account_uuid?: string;
    job_uuid?: string;
    to_number: string;
    body: string;
    idempotency_key?: string;
    rule_id?: number | null;
    rule_name?: string | null;
    badge_name?: string | null;
  },
  window_minutes: number
): number | null {
  return db().transaction(() => {
    if (
      hasRecentOutboundDuplicate({
        job_uuid: row.job_uuid,
        to_number: row.to_number,
        body: row.body,
        window_minutes,
      })
    ) {
      return null;
    }
    return insertOutbound({
      ...row,
      status: "queued",
      provider_response: "Claimed for send",
    });
  })();
}

export function updateOutbound(
  id: number,
  patch: { status: string; provider_response?: string; to_number?: string }
): void {
  db()
    .prepare(
      `UPDATE outbound_messages
       SET status = ?,
           provider_response = COALESCE(?, provider_response),
           to_number = COALESCE(?, to_number)
       WHERE id = ?`
    )
    .run(patch.status, patch.provider_response ?? null, patch.to_number ?? null, id);
}

export function listInbound(limit = 100): Record<string, unknown>[] {
  const rows = db().prepare("SELECT * FROM inbound_messages ORDER BY id DESC LIMIT ?").all(limit) as Record<
    string,
    unknown
  >[];
  return rows.map((r) => ({
    ...r,
    body: typeof r.body === "string" ? normalizeInboundBody(r.body) : r.body,
  }));
}

export function insertInbound(from_number: string, body: string, port?: number, job_uuid?: string): number {
  const r = db()
    .prepare("INSERT INTO inbound_messages(from_number, body, port, job_uuid) VALUES(?,?,?,?)")
    .run(from_number, body, port ?? null, job_uuid ?? null);
  return Number(r.lastInsertRowid);
}

export function logEvent(row: {
  account_uuid?: string;
  event_type: string;
  object_type?: string;
  object_id?: string;
  payload_json?: string;
  idempotency_key?: string;
}): boolean {
  try {
    db()
      .prepare(
        "INSERT INTO event_log(account_uuid, event_type, object_type, object_id, payload_json, idempotency_key) VALUES(?,?,?,?,?,?)"
      )
      .run(
        row.account_uuid ?? null,
        row.event_type,
        row.object_type ?? null,
        row.object_id ?? null,
        row.payload_json ?? null,
        row.idempotency_key ?? null
      );
    return true;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return false;
    }
    throw e;
  }
}

export function saveOAuthTokens(account_uuid: string, access_token: string, refresh_token: string | null, expires_at: number): void {
  db()
    .prepare(
      "INSERT INTO oauth_tokens(account_uuid, access_token, refresh_token, expires_at) VALUES(?,?,?,?) ON CONFLICT(account_uuid) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=datetime('now')"
    )
    .run(account_uuid, access_token, refresh_token, expires_at);
}

export function getOAuthTokens(account_uuid: string): { access_token: string; refresh_token: string | null; expires_at: number } | undefined {
  return db().prepare("SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE account_uuid = ?").get(account_uuid) as
    | { access_token: string; refresh_token: string | null; expires_at: number }
    | undefined;
}

/** ponytail: single-tenant fallback when JWT has no account_uuid */
export function getSingleOAuthTokens(): { account_uuid: string; access_token: string; refresh_token: string | null; expires_at: number } | undefined {
  return db()
    .prepare("SELECT account_uuid, access_token, refresh_token, expires_at FROM oauth_tokens ORDER BY updated_at DESC LIMIT 1")
    .get() as { account_uuid: string; access_token: string; refresh_token: string | null; expires_at: number } | undefined;
}

export function countOutboundSince(sinceIso: string): number {
  const row = db().prepare("SELECT COUNT(*) AS c FROM outbound_messages WHERE created_at >= ?").get(sinceIso) as { c: number };
  return row.c;
}

export function refreshDefaultTemplates(database?: Database.Database): number {
  const d = database ?? db();
  const pairs = [
    {
      name: "job_created",
      oldBody: "Hi {{customerName}}, we received your job {{jobNumber}}. We will be in touch soon. — Tom's Pest Control",
      newBody: "Hi {{customerName}}, thanks for contacting Tom's Pest Control. We've received job {{jobNumber}} and will be in touch shortly.",
    },
    {
      name: "status_update",
      oldBody: "Hi {{customerName}}, job {{jobNumber}} is now: {{status}}. — Tom's Pest Control",
      newBody: "Hi {{customerName}}, there has been an update to job {{jobNumber}}. If you need anything, just reply to this message.",
    },
    {
      name: "en_route",
      oldBody: "Hi {{customerName}}, our technician is on the way to {{address}} for job {{jobNumber}}.",
      newBody: "Hi {{customerName}}, our technician is on the way for job {{jobNumber}} and is heading to {{address}}.",
    },
    {
      name: "completed",
      oldBody: "Hi {{customerName}}, job {{jobNumber}} is complete. Thank you for choosing Tom's Pest Control.",
      newBody: "Hi {{customerName}}, your Tom's Pest Control job {{jobNumber}} has been completed. Thank you for choosing us.",
    },
  ];
  const upd = d.prepare("UPDATE templates SET body = ?, updated_at = datetime('now') WHERE name = ? AND body = ?");
  let changed = 0;
  for (const pair of pairs) {
    const res = upd.run(pair.newBody, pair.name, pair.oldBody);
    changed += res.changes;
  }
  return changed;
}

export function seedDefaults(database?: Database.Database): void {
  const d = database ?? db();
  const tplCount = (d.prepare("SELECT COUNT(*) AS c FROM templates").get() as { c: number }).c;
  if (tplCount > 0) return;
  const insTpl = d.prepare("INSERT INTO templates(name, body) VALUES(?, ?)");
  const ids: Record<string, number> = {};
  for (const t of defaultTemplates) {
    const r = insTpl.run(t.name, t.body);
    ids[t.name] = Number(r.lastInsertRowid);
  }
  const insRule = d.prepare(
    "INSERT INTO rules(name, trigger_type, status_match, template_id, enabled, sort_order) VALUES(?,?,?,?,?,?)"
  );
  defaultRules.forEach((rule, i) => {
    const tid = ids[rule.templateName];
    if (!tid) return;
    insRule.run(rule.name, rule.trigger_type, rule.status_match ?? null, tid, 1, i);
  });
  d.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)").run("en_route_statuses", "En Route,Dispatched");
}

export function getJobBadgeSnapshot(jobUuid: string): string[] {
  const row = db().prepare("SELECT badge_uuids FROM job_badge_snapshot WHERE job_uuid = ?").get(jobUuid) as
    | { badge_uuids: string }
    | undefined;
  if (!row?.badge_uuids) return [];
  try {
    const parsed = JSON.parse(row.badge_uuids) as unknown;
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export function setJobBadgeSnapshot(jobUuid: string, badgeUuids: string[]): void {
  db()
    .prepare(
      `INSERT INTO job_badge_snapshot(job_uuid, badge_uuids, updated_at) VALUES(?,?,datetime('now'))
       ON CONFLICT(job_uuid) DO UPDATE SET badge_uuids = excluded.badge_uuids, updated_at = datetime('now')`
    )
    .run(jobUuid, JSON.stringify(badgeUuids));
}

export function upsertScheduledSend(row: {
  account_uuid?: string;
  job_uuid: string;
  rule_id: number;
  badge_uuid?: string | null;
  badge_name?: string | null;
  fire_at: string;
}): void {
  db()
    .prepare(
      `INSERT INTO scheduled_sends(account_uuid, job_uuid, rule_id, badge_uuid, badge_name, fire_at, status)
       VALUES(?,?,?,?,?,?, 'pending')
       ON CONFLICT(job_uuid, rule_id) DO UPDATE SET
         account_uuid = excluded.account_uuid,
         badge_uuid = excluded.badge_uuid,
         badge_name = excluded.badge_name,
         fire_at = excluded.fire_at,
         status = 'pending',
         created_at = datetime('now')`
    )
    .run(
      row.account_uuid ?? null,
      row.job_uuid,
      row.rule_id,
      row.badge_uuid ?? null,
      row.badge_name ?? null,
      row.fire_at
    );
}

export function cancelScheduledForJobRule(jobUuid: string, ruleId: number, reason = "cancelled"): void {
  db()
    .prepare(`UPDATE scheduled_sends SET status = ? WHERE job_uuid = ? AND rule_id = ? AND status = 'pending'`)
    .run(reason, jobUuid, ruleId);
}

export function cancelScheduledByBadge(jobUuid: string, badgeUuid: string): void {
  db()
    .prepare(
      `UPDATE scheduled_sends SET status = 'cancelled'
       WHERE job_uuid = ? AND status = 'pending' AND lower(badge_uuid) = lower(?)`
    )
    .run(jobUuid, badgeUuid);
}

export function listDueScheduled(nowIso: string, limit = 50): ScheduledSendRow[] {
  return db()
    .prepare(
      `SELECT * FROM scheduled_sends
       WHERE status = 'pending' AND fire_at <= ?
       ORDER BY fire_at ASC LIMIT ?`
    )
    .all(nowIso, limit) as ScheduledSendRow[];
}

export function listPendingScheduled(limit = 100): ScheduledSendRow[] {
  return db()
    .prepare(
      `SELECT * FROM scheduled_sends WHERE status = 'pending' ORDER BY fire_at ASC LIMIT ?`
    )
    .all(limit) as ScheduledSendRow[];
}

export function updateScheduledStatus(id: number, status: string, fireAt?: string): void {
  if (fireAt) {
    db().prepare(`UPDATE scheduled_sends SET status = ?, fire_at = ? WHERE id = ?`).run(status, fireAt, id);
    return;
  }
  db().prepare(`UPDATE scheduled_sends SET status = ? WHERE id = ?`).run(status, id);
}

export function cancelScheduledById(id: number): boolean {
  const r = db()
    .prepare(`UPDATE scheduled_sends SET status = 'cancelled' WHERE id = ? AND status = 'pending'`)
    .run(id);
  return r.changes > 0;
}
