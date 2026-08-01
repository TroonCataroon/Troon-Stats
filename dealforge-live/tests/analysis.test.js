import test from "node:test";
import assert from "node:assert/strict";
import { applyListingAnalysis } from "../lib/analysis.js";

test("analysis overrides persist explicit landed costs and market value", () => {
  const listing = {
    id: "gsa-1",
    costs: { itemPrice: 100, shipping: null, handling: null, buyerPremium: 0, taxes: null, travelCost: null, replacementParts: null },
    totalLandedCost: 100,
    estimatedMarketValue: null,
  };

  const updated = applyListingAnalysis(listing, {
    estimatedMarketValue: "300",
    shipping: "20",
    handling: "5",
    buyerPremium: "10",
    taxes: "15",
    travelCost: "12",
    replacementParts: "8",
  });

  assert.equal(updated.estimatedMarketValue, 300);
  assert.equal(updated.totalLandedCost, 170);
  assert.deepEqual(updated.costs, {
    itemPrice: 100,
    shipping: 20,
    handling: 5,
    buyerPremium: 10,
    taxes: 15,
    travelCost: 12,
    replacementParts: 8,
  });
});

test("analysis can estimate round-trip travel from distance and mileage rate", () => {
  const updated = applyListingAnalysis({ costs: { itemPrice: 50 } }, {
    distanceMiles: "25",
    mileageRate: "0.70",
  });

  assert.equal(updated.costs.travelCost, 35);
  assert.equal(updated.totalLandedCost, 85);
});
