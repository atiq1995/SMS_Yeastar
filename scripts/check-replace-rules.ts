/**
 * Self-check: new rules with unknown ids must INSERT, not silent UPDATE.
 * Run: npx tsx scripts/check-replace-rules.ts
 */
import Database from "better-sqlite3";
import assert from "node:assert/strict";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    status_match TEXT,
    template_id INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    recipient_type TEXT NOT NULL DEFAULT 'job_contact',
    recipient_number TEXT,
    badge_json TEXT,
    suppress_badge_json TEXT,
    schedule_offset_value INTEGER,
    schedule_offset_unit TEXT,
    schedule_anchor TEXT,
    daily_send_cap INTEGER
  );
  CREATE TABLE scheduled_sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  );
`);

db.prepare(
  `INSERT INTO rules(name, trigger_type, template_id, enabled, sort_order) VALUES(?,?,?,?,?)`
).run("New job", "job_created", 1, 1, 0);

type RuleInput = {
  id?: number;
  name: string;
  trigger_type: string;
  template_id: number;
  enabled?: number;
  sort_order?: number;
};

function replaceRules(rules: RuleInput[]): void {
  const tx = db.transaction(() => {
    const keepIds = rules.map((r) => r.id).filter((id): id is number => typeof id === "number" && id > 0);
    if (keepIds.length) {
      db.prepare(`DELETE FROM rules WHERE id NOT IN (${keepIds.map(() => "?").join(",")})`).run(...keepIds);
    } else {
      db.prepare("DELETE FROM rules").run();
    }
    const upd = db.prepare(
      `UPDATE rules SET name=?, trigger_type=?, template_id=?, enabled=?, sort_order=? WHERE id=?`
    );
    const ins = db.prepare(
      `INSERT INTO rules(name, trigger_type, template_id, enabled, sort_order) VALUES(?,?,?,?,?)`
    );
    rules.forEach((r, i) => {
      const vals = [r.name, r.trigger_type, r.template_id, r.enabled ?? 1, r.sort_order ?? i] as const;
      if (typeof r.id === "number" && r.id > 0) {
        const result = upd.run(...vals, r.id);
        if (result.changes === 0) ins.run(...vals);
      } else {
        ins.run(...vals);
      }
    });
  });
  tx();
}

// Bug case: keep existing id=1, plus a synthetic client id=5 that is not in DB
replaceRules([
  { id: 1, name: "New job", trigger_type: "job_created", template_id: 1 },
  { id: 5, name: "Booking Reminder", trigger_type: "badge_added", template_id: 1 },
  { name: "Chase", trigger_type: "badge_added", template_id: 1 }, // no id → insert
]);

const rows = db.prepare("SELECT name, trigger_type FROM rules ORDER BY id").all() as {
  name: string;
  trigger_type: string;
}[];
assert.equal(rows.length, 3);
assert.ok(rows.some((r) => r.name === "Booking Reminder" && r.trigger_type === "badge_added"));
assert.ok(rows.some((r) => r.name === "Chase" && r.trigger_type === "badge_added"));
console.log("check-replace-rules: ok");
