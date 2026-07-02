import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { defaultRules, defaultTemplates } from "../engine/triggers.js";

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
  return db().prepare("SELECT * FROM rules ORDER BY sort_order, id").all() as RuleRow[];
}

export type RuleInput = {
  name: string;
  trigger_type: string;
  status_match?: string | null;
  template_id: number;
  enabled?: number;
  sort_order?: number;
};
export function replaceRules(rules: RuleInput[]): void {
  const d = db();
  const tx = d.transaction(() => {
    d.prepare("DELETE FROM rules").run();
    const ins = d.prepare(
      "INSERT INTO rules(name, trigger_type, status_match, template_id, enabled, sort_order) VALUES(?,?,?,?,?,?)"
    );
    rules.forEach((r, i) => {
      ins.run(r.name, r.trigger_type, r.status_match ?? null, r.template_id, r.enabled ?? 1, r.sort_order ?? i);
    });
  });
  tx();
}

export function listOutbound(limit = 100): Record<string, unknown>[] {
  return db().prepare("SELECT * FROM outbound_messages ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
}

export function insertOutbound(row: {
  account_uuid?: string;
  job_uuid?: string;
  to_number: string;
  body: string;
  status: string;
  provider_response?: string;
  idempotency_key?: string;
}): number {
  const r = db()
    .prepare(
      "INSERT INTO outbound_messages(account_uuid, job_uuid, to_number, body, status, provider_response, idempotency_key) VALUES(?,?,?,?,?,?,?)"
    )
    .run(
      row.account_uuid ?? null,
      row.job_uuid ?? null,
      row.to_number,
      row.body,
      row.status,
      row.provider_response ?? null,
      row.idempotency_key ?? null
    );
  return Number(r.lastInsertRowid);
}

export function listInbound(limit = 100): Record<string, unknown>[] {
  return db().prepare("SELECT * FROM inbound_messages ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
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

export function countOutboundSince(sinceIso: string): number {
  const row = db().prepare("SELECT COUNT(*) AS c FROM outbound_messages WHERE created_at >= ?").get(sinceIso) as { c: number };
  return row.c;
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
