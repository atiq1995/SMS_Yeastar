import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { seedDefaults } from "./repository.js";
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
seedDefaults(db);
const repaired = repairInboundMessages(db);
db.close();
console.log("migrate ok:", env.databasePath);
console.log("inbound repair:", repaired);
