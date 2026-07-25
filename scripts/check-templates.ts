import assert from "node:assert/strict";
import { renderSmsBody } from "../src/engine/templates.js";

const ctx = { customerName: "Jane Smith", companyName: "Jane Smith", jobNumber: "J-1" };

assert.equal(
  renderSmsBody("Hi from {vendor.name}.", ctx, { vendorName: "Tom's Pest Control" }),
  "Hi from Tom's Pest Control."
);

// Objects must never become [object Object] in the SMS body
assert.equal(
  renderSmsBody("Hi from {vendor.name}.", ctx, { vendorName: { name: "Nope" } as unknown as string }),
  "Hi from."
);

assert.equal(
  renderSmsBody("Hi from {{vendorName}}.", ctx, { vendorName: "Tom's Pest Control" }),
  "Hi from Tom's Pest Control."
);

assert.doesNotMatch(
  renderSmsBody("Hi from {vendor.name} and {{vendorName}}.", ctx, {
    vendorName: { broken: true } as unknown as string,
  }),
  /\[object Object\]/
);

console.log("templates self-check ok");
