import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { refreshDefaultTemplates, seedDefaults } from "./repository.js";
import { repairInboundMessages } from "../yeastar/repair-inbound.js";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "schema.sql"), "utf8");

function addColumn(database: Database.Database, sql: string): void {
  try {
    database.exec(sql);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/duplicate column/i.test(msg)) throw e;
  }
}

mkdirSync(dirname(env.databasePath), { recursive: true });
const db = new Database(env.databasePath);
db.exec(schema);
addColumn(db, "ALTER TABLE rules ADD COLUMN recipient_type TEXT NOT NULL DEFAULT 'job_contact'");
addColumn(db, "ALTER TABLE rules ADD COLUMN recipient_number TEXT");
addColumn(db, "ALTER TABLE rules ADD COLUMN badge_json TEXT");
addColumn(db, "ALTER TABLE rules ADD COLUMN suppress_badge_json TEXT");
addColumn(db, "ALTER TABLE rules ADD COLUMN schedule_offset_value INTEGER");
addColumn(db, "ALTER TABLE rules ADD COLUMN schedule_offset_unit TEXT");
addColumn(db, "ALTER TABLE rules ADD COLUMN schedule_anchor TEXT");
addColumn(db, "ALTER TABLE outbound_messages ADD COLUMN rule_id INTEGER");
addColumn(db, "ALTER TABLE outbound_messages ADD COLUMN rule_name TEXT");
addColumn(db, "ALTER TABLE outbound_messages ADD COLUMN badge_name TEXT");
addColumn(db, "ALTER TABLE rules ADD COLUMN daily_send_cap INTEGER");
addColumn(db, "ALTER TABLE templates ADD COLUMN sm8_uuid TEXT");
db.exec("DROP INDEX IF EXISTS idx_templates_sm8_uuid");
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_sm8_uuid ON templates(sm8_uuid)");
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (!/already exists/i.test(msg)) throw e;
}
seedDefaults(db);
const refreshedTemplates = refreshDefaultTemplates(db);
const repaired = repairInboundMessages(db);
db.close();
console.log("migrate ok:", env.databasePath);
console.log("default template refresh:", refreshedTemplates);
console.log("inbound repair:", repaired);
