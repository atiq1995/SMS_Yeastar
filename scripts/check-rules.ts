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
  "En Route,Dispatched"
);
assert.equal(twoCompleted.length, 2);
assert.deepEqual(
  twoCompleted.map((r) => r.id),
  [1, 2]
);

assert.equal(customRecipientNumber(""), undefined);
assert.equal(customRecipientNumber("   "), undefined);
assert.equal(customRecipientNumber("0412 345 678"), "0412345678");

console.log("rules self-check ok");

// Infer trigger: manifest webhooks often include `uuid` in changed_fields even for updates
assert.equal(inferTrigger("job.status", "Quote", ["uuid", "status"]), "status_changed");
assert.equal(inferTrigger("job.status", "Completed", ["uuid", "status"]), "completed");
assert.equal(inferTrigger("job.status", undefined, ["uuid"]), "status_changed");

console.log("inferTrigger self-check ok");
