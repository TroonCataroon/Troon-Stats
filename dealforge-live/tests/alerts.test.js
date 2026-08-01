import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAlert } from "../lib/alerts.js";

test("price alert triggers at or below threshold", () => {
  const result = evaluateAlert(
    { rule: { type: "price_below", value: 200 } },
    { totalLandedCost: 180 }
  );
  assert.equal(result.triggered, true);
});

test("ending-soon alert remains false without an end date", () => {
  const result = evaluateAlert(
    { rule: { type: "ending_within_hours", value: 24 } },
    { auction: { endDate: null } }
  );
  assert.equal(result.triggered, false);
});
