/**
 * Self-check: cooldown key is job+body (not to_number), so UAT redirect can't bypass it.
 * Run: npx tsx scripts/check-cooldown.ts
 */

type Row = { job_uuid: string; to_number: string; body: string; status: string };

const COOLDOWN = new Set([
  "sent",
  "dry_run",
  "test_redirected",
  "test_redirected_dry_run",
  "submitted",
  "queued",
]);

function oldCheck(rows: Row[], job: string, to: string, body: string): boolean {
  return rows.some((r) => r.job_uuid === job && r.to_number === to && r.body === body && COOLDOWN.has(r.status));
}

function newCheck(rows: Row[], job: string, body: string): boolean {
  return rows.some((r) => r.job_uuid === job && r.body === body && COOLDOWN.has(r.status));
}

const job = "job-275697";
const body = "Hi Ash, there has been an update to job 275697.";
const customer = "0411111111";
const testMobile = "+61483933593";

const afterRedirect: Row[] = [
  { job_uuid: job, to_number: testMobile, body, status: "test_redirected" },
];

console.assert(!oldCheck(afterRedirect, job, customer, body), "old: misses when stored number is test mobile");
console.assert(newCheck(afterRedirect, job, body), "new: catches same job+body after UAT redirect");

const inFlight: Row[] = [{ job_uuid: job, to_number: customer, body, status: "queued" }];
console.assert(newCheck(inFlight, job, body), "queued claim blocks concurrent send");

console.log("check-cooldown: ok");
