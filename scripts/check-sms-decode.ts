import assert from "node:assert/strict";
import { decodeYeastarSmsContent, normalizeInboundBody } from "../src/yeastar/sms-decode.js";

assert.equal(decodeYeastarSmsContent("ok+ok+ok+123"), "ok ok ok 123");
assert.equal(
  decodeYeastarSmsContent("Thank+you+for+your+business.%2C+quote+%23269685"),
  "Thank you for your business., quote #269685"
);
assert.equal(decodeYeastarSmsContent("%EF%BB%BFHello"), "Hello");

// Already-plain outbound-style text must stay intact
assert.equal(normalizeInboundBody("hi, testing 123"), "hi, testing 123");
assert.equal(normalizeInboundBody("ok+ok+ok+123"), "ok ok ok 123");

console.log("sms-decode self-check ok");
