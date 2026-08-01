import test from "node:test";
import assert from "node:assert/strict";
import { normalizePreferences } from "../lib/preferences.js";

test("preferences clamp unsafe or invalid values", () => {
  assert.deepEqual(normalizePreferences({
    mileageRate: "-2",
    targetDiscountPercent: "120",
    defaultRegion: "washington",
    resultsLimit: "999",
  }), {
    mileageRate: 0,
    targetDiscountPercent: 95,
    defaultRegion: "WA",
    resultsLimit: 300,
  });
});

test("preferences provide production defaults", () => {
  assert.deepEqual(normalizePreferences({}), {
    mileageRate: 0.7,
    targetDiscountPercent: 25,
    defaultRegion: "WA",
    resultsLimit: 50,
  });
});
