import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceStatus } from "../lib/source-status.js";

test("source status distinguishes connected and credential-required providers", () => {
  const status = buildSourceStatus({
    gsa: { status: "live" },
    ebay: { status: "credentials-required" },
  });
  assert.equal(status.gsa.operational, true);
  assert.equal(status.ebay.operational, false);
  assert.equal(status.ebay.label, "Needs credentials");
});
