import assert from "node:assert/strict";
import { renderSmsBody } from "../src/engine/templates.js";

const ctx = { customerName: "Jane Smith", companyName: "Jane Smith", jobNumber: "J-1" };

assert.equal(
  renderSmsBody("Hi from {vendor.name}.", ctx, { vendorName: "Tom's Pest Control" }),
  "Hi from Tom's Pest Control."
);

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

// Unknown {ss} must NOT be stripped (that turned "business" into "busine")
assert.equal(renderSmsBody("Thank you for your busine{ss}.", ctx, {}), "Thank you for your busine{ss}.");
assert.equal(
  renderSmsBody("Thank you for your business. {vendor.name}", ctx, { vendorName: "Tom's Pest Control" }),
  "Thank you for your business. Tom's Pest Control"
);

console.log("templates self-check ok");
