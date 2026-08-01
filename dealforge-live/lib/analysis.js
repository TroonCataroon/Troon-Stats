import { calculateTotalLandedCost, estimateTravelCost } from "./scoring.js";

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function applyListingAnalysis(listing = {}, input = {}) {
  const original = listing.costs ?? {};
  const distanceMiles = numberOrNull(input.distanceMiles);
  const mileageRate = numberOrNull(input.mileageRate) ?? 0.7;
  const explicitTravel = numberOrNull(input.travelCost);
  const travelCost = explicitTravel ?? (distanceMiles === null
    ? numberOrNull(original.travelCost)
    : estimateTravelCost({ distanceMiles, mileageRate, roundTrip: true }));

  const costs = {
    itemPrice: numberOrNull(input.itemPrice) ?? numberOrNull(original.itemPrice) ?? 0,
    shipping: numberOrNull(input.shipping) ?? numberOrNull(original.shipping) ?? 0,
    handling: numberOrNull(input.handling) ?? numberOrNull(original.handling) ?? 0,
    buyerPremium: numberOrNull(input.buyerPremium) ?? numberOrNull(original.buyerPremium) ?? 0,
    taxes: numberOrNull(input.taxes) ?? numberOrNull(original.taxes) ?? 0,
    travelCost: travelCost ?? 0,
    replacementParts: numberOrNull(input.replacementParts) ?? numberOrNull(original.replacementParts) ?? 0,
  };
  const landed = calculateTotalLandedCost(costs);

  return {
    ...listing,
    costs,
    totalLandedCost: landed.total,
    estimatedMarketValue: numberOrNull(input.estimatedMarketValue) ?? numberOrNull(listing.estimatedMarketValue),
    analysis: {
      ...(listing.analysis ?? {}),
      distanceMiles,
      mileageRate,
      updatedAt: new Date().toISOString(),
    },
  };
}
