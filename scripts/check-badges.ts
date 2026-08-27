import assert from "node:assert/strict";
import {
  addOffsetMelbourne,
  anyBadgeMatches,
  diffAddedUuids,
  diffRemovedUuids,
  parseBadgeJson,
  parseJobBadgesField,
  slidePastQuietHours,
} from "../src/engine/badges.js";

assert.deepEqual(parseJobBadgesField('["a","b"]'), ["a", "b"]);
assert.deepEqual(parseJobBadgesField(["x"]), ["x"]);
assert.deepEqual(diffAddedUuids(["a"], ["a", "b"]), ["b"]);
assert.deepEqual(diffRemovedUuids(["a", "b"], ["a"]), ["b"]);

const badges = parseBadgeJson(JSON.stringify([{ uuid: "1", name: "Don't Chase" }]));
assert.equal(anyBadgeMatches(badges, [{ uuid: "1", name: "Don't Chase" }]), true);
assert.equal(anyBadgeMatches(badges, [{ uuid: "", name: "don't chase" }]), true);
assert.equal(anyBadgeMatches(badges, [{ uuid: "2", name: "Other" }]), false);

const from = new Date("2026-08-27T02:00:00.000Z"); // ~12:00 Melbourne AEST
const plus3m = addOffsetMelbourne(from, 3, "months");
assert.ok(plus3m.getTime() > from.getTime());

// Quiet overnight 20–7: at 21:00 Melbourne → slide to 07:00 next day
const evening = new Date("2026-08-27T11:00:00.000Z"); // 21:00 AEST
const slid = slidePastQuietHours(evening, 20, 7, true);
assert.ok(slid.getTime() > evening.getTime());

console.log("check-badges: ok");
