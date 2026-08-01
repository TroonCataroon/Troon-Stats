import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDealScore,
  calculateTotalLandedCost,
  recommendedMaximumBid,
} from "../lib/scoring.js";

test("landed cost includes every explicit cost", () => {
  const result = calculateTotalLandedCost({
    itemPrice: 100,
    shipping: 10,
    handling: 2,
    buyerPremium: 15,
    taxes: 9,
    travelCost: 8,
    replacementParts: 6,
  });
  assert.equal(result.total, 150);
});

test("deal score refuses to invent market value", () => {
  const result = calculateDealScore({
    costs: { itemPrice: 100 },
    condition: "good",
    riskScore: 20,
  });
  assert.equal(result.status, "needs-market-value");
  assert.equal(result.score, null);
});

test("maximum bid subtracts fixed landed costs", () => {
  const bid = recommendedMaximumBid({
    estimatedMarketValue: 1000,
    targetDiscountPercent: 25,
    shipping: 50,
    travelCost: 25,
    buyerPremiumRate: 10,
    taxesRate: 10,
  });
  assert.equal(bid, 562.5);
});
