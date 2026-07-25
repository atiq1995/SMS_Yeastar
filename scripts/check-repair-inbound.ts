import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { repairInboundMessages } from "../src/yeastar/repair-inbound.js";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE inbound_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_number TEXT NOT NULL,
    body TEXT NOT NULL,
    port INTEGER,
    job_uuid TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.prepare("INSERT INTO inbound_messages(from_number, body, received_at) VALUES(?,?,?)").run(
  "0450323290",
  "ok+ok+ok+123",
  "2026-07-25 10:49:00"
);
db.prepare("INSERT INTO inbound_messages(from_number, body, received_at) VALUES(?,?,?)").run(
  "0450323290",
  "Thank+you+for+your+business.+Please+find+your+invoice+open+th",
  "2026-07-25 10:50:00"
);
db.prepare("INSERT INTO inbound_messages(from_number, body, received_at) VALUES(?,?,?)").run(
  "0450323290",
  "+invoice+please+call+our+office",
  "2026-07-25 10:50:01"
);

const result = repairInboundMessages(db);
assert.equal(result.decoded, 3);
assert.equal(result.merged, 1);

const rows = db.prepare("SELECT body FROM inbound_messages ORDER BY id").all() as { body: string }[];
assert.equal(rows.length, 2);
assert.equal(rows[0].body, "ok ok ok 123");
assert.match(rows[1].body, /Thank you for your business/);
assert.match(rows[1].body, /please call our office/);
assert.doesNotMatch(rows[1].body, /\+/);

console.log("repair-inbound self-check ok");
db.close();
