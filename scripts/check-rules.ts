import assert from "node:assert/strict";
import type { RuleRow } from "../src/db/repository.js";
import { evaluateRules } from "../src/engine/rules.js";
import { customRecipientNumber } from "../src/engine/recipient.js";
import { inferTrigger } from "../src/engine/rules.js";

function rule(partial: Partial<RuleRow> & Pick<RuleRow, "id" | "trigger_type">): RuleRow {
  return {
    name: "r" + partial.id,
    status_match: null,
    template_id: 1,
    enabled: 1,
    sort_order: 0,
    recipient_type: "job_contact",
    recipient_number: null,
    badge_json: null,
    suppress_badge_json: null,
    schedule_offset_value: null,
    schedule_offset_unit: null,
    schedule_anchor: null,
    ...partial,
  };
}

const twoCompleted = evaluateRules(
  [
    rule({ id: 1, trigger_type: "completed", name: "Customer" }),
    rule({ id: 2, trigger_type: "completed", name: "Office", recipient_type: "custom", recipient_number: "0412345678" }),
    rule({ id: 3, trigger_type: "job_created" }),
    rule({ id: 4, trigger_type: "completed", enabled: 0 }),
  ],
  "completed",
  { status: "Completed" },
  { enRouteStatuses: "En Route,Dispatched" }
);
assert.equal(twoCompleted.length, 2);
assert.deepEqual(
  twoCompleted.map((r) => r.id),
  [1, 2]
);

const badgeHit = evaluateRules(
  [
    rule({
      id: 10,
      trigger_type: "badge_added",
      badge_json: JSON.stringify([{ uuid: "u1", name: "Booking Reminder" }]),
    }),
    rule({
      id: 11,
      trigger_type: "badge_added",
      badge_json: JSON.stringify([{ uuid: "u2", name: "Other" }]),
    }),
  ],
  "badge_added",
  {},
  { addedBadges: [{ uuid: "u1", name: "Booking Reminder" }] }
);
assert.equal(badgeHit.length, 1);
assert.equal(badgeHit[0]?.id, 10);

assert.equal(customRecipientNumber(""), undefined);
assert.equal(customRecipientNumber("   "), undefined);
assert.equal(customRecipientNumber("0412 345 678"), "0412345678");

console.log("rules self-check ok");

// Infer trigger: manifest webhooks often include `uuid` in changed_fields even for updates
assert.equal(inferTrigger("job.status", "Quote", ["uuid", "status"]), "status_changed");
assert.equal(inferTrigger("job.status", "Completed", ["uuid", "status"]), "completed");
assert.equal(inferTrigger("job.status", undefined, ["uuid"]), "status_changed");
assert.equal(inferTrigger("job.status", "Quote", ["uuid", "badges", "status"]), "status_changed");

console.log("inferTrigger self-check ok");
