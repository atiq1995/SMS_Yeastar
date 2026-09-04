import assert from "node:assert/strict";
import { buildSm8Map, resolveJobAddress } from "../src/engine/job-context.js";
import { analyzeTemplateFields } from "../src/engine/field-support.js";

assert.equal(resolveJobAddress({ job_address: " 1 Main St " }), "1 Main St");
assert.equal(
  resolveJobAddress({
    geo_number: "12",
    geo_street: "Oak St",
    geo_city: "Melbourne",
    geo_state: "VIC",
    geo_postcode: "3000",
  }),
  "12 Oak St, Melbourne VIC 3000"
);
assert.equal(resolveJobAddress({}, { address: "99 Client Rd" }), "99 Client Rd");
assert.equal(resolveJobAddress({}), "");

const map = buildSm8Map(
  { generated_job_id: "275696", status: "Completed", geo_street: "Oak St", geo_city: "Melbourne" },
  { jobNumber: "275696", status: "Completed" }
);
assert.equal(map["job.job_address"], "Oak St, Melbourne");
const issues = analyzeTemplateFields(
  "Job {job.generated_job_id} at {job.job_address}",
  map
);
assert.deepEqual(issues.missingExact, []);

console.log("check-job-address: ok");
