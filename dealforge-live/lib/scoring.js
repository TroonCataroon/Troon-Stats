export const DEFAULT_SCORE_WEIGHTS = Object.freeze({
  priceAdvantage: 35,
  condition: 20,
  performancePerDollar: 15,
  confidence: 10,
  sellerReliability: 10,
  shippingConvenience: 5,
  compatibility: 5,
});

export const CONDITION_SCORES = Object.freeze({
  new: 96,
  "open-box": 90,
  refurbished: 84,
  excellent: 87,
  good: 76,
  fair: 61,
  untested: 42,
  "for-parts": 24,
  unknown: 50,
});

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const normalized = String(value).replace(/[^0-9.+-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function calculateTotalLandedCost(costs = {}) {
  const parts = {
    itemPrice: Math.max(0, toNumber(costs.itemPrice)),
    shipping: Math.max(0, toNumber(costs.shipping)),
    handling: Math.max(0, toNumber(costs.handling)),
    buyerPremium: Math.max(0, toNumber(costs.buyerPremium)),
    taxes: Math.max(0, toNumber(costs.taxes)),
    travelCost: Math.max(0, toNumber(costs.travelCost)),
    replacementParts: Math.max(0, toNumber(costs.replacementParts)),
  };

  const total = Object.values(parts).reduce((sum, value) => sum + value, 0);
  return { parts, total: roundMoney(total) };
}

export function inferCondition(text = "") {
  const value = String(text).toLowerCase();
  if (/brand[ -]?new|new in box|\bnib\b/.test(value)) return "new";
  if (/open[ -]?box/.test(value)) return "open-box";
  if (/refurb|recondition/.test(value)) return "refurbished";
  if (/excellent|like new/.test(value)) return "excellent";
  if (/working|tested|operational|functions|good condition/.test(value)) return "good";
  if (/fair condition|wear|scratches|used/.test(value)) return "fair";
  if (/untested|unknown condition|as[ -]?is/.test(value)) return "untested";
  if (/parts only|for parts|salvage|broken|nonworking|not working|repair/.test(value)) return "for-parts";
  return "unknown";
}

export function conditionScore(condition = "unknown") {
  return CONDITION_SCORES[condition] ?? CONDITION_SCORES.unknown;
}

export function calculatePriceAdvantage(totalLandedCost, estimatedMarketValue) {
  const landed = toNumber(totalLandedCost);
  const market = toNumber(estimatedMarketValue);
  if (market <= 0) return null;
  return ((market - landed) / market) * 100;
}

function scorePriceAdvantage(advantagePercent) {
  if (advantagePercent === null || !Number.isFinite(advantagePercent)) return null;
  // A 50% discount maps close to 100. Market price maps to 45. A 50% premium maps to 0.
  return clamp(45 + advantagePercent * 1.1);
}

function normalizeWeights(weights = DEFAULT_SCORE_WEIGHTS) {
  const merged = { ...DEFAULT_SCORE_WEIGHTS, ...weights };
  const total = Object.values(merged).reduce((sum, value) => sum + Math.max(0, toNumber(value)), 0) || 100;
  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, (Math.max(0, toNumber(value)) / total) * 100]),
  );
}

export function calculateDealScore(input = {}) {
  const costs = calculateTotalLandedCost(input.costs ?? input);
  const marketValue = toNumber(input.estimatedMarketValue, 0);
  const priceAdvantagePercent = calculatePriceAdvantage(costs.total, marketValue);
  const weights = normalizeWeights(input.weights);

  const riskKnown = input.riskScore !== null && input.riskScore !== undefined && input.riskScore !== "";
  const riskPenalty = riskKnown ? round1(clamp(toNumber(input.riskScore)) * 0.22) : null;

  if (priceAdvantagePercent === null) {
    return {
      status: "needs-market-value",
      score: null,
      coverage: 0,
      totalLandedCost: costs.total,
      priceAdvantagePercent: null,
      riskPenalty,
      components: {
        priceAdvantage: null,
        condition: conditionScore(input.condition),
        performancePerDollar: nullableScore(input.performancePerDollar),
        confidence: nullableScore(input.confidenceScore),
        sellerReliability: nullableScore(input.sellerReliability),
        shippingConvenience: nullableScore(input.shippingConvenience),
        compatibility: nullableScore(input.compatibilityScore),
      },
      weights,
      explanation: "A fair-market-value estimate is required before a defensible deal score can be calculated.",
    };
  }

  const components = {
    priceAdvantage: scorePriceAdvantage(priceAdvantagePercent),
    condition: conditionScore(input.condition),
    performancePerDollar: nullableScore(input.performancePerDollar),
    confidence: nullableScore(input.confidenceScore),
    sellerReliability: nullableScore(input.sellerReliability),
    shippingConvenience: nullableScore(input.shippingConvenience),
    compatibility: nullableScore(input.compatibilityScore),
  };

  let weightedPoints = 0;
  let availableWeight = 0;
  for (const [key, value] of Object.entries(components)) {
    if (value === null) continue;
    const weight = weights[key] ?? 0;
    weightedPoints += value * weight;
    availableWeight += weight;
  }

  const partialScore = availableWeight > 0 ? weightedPoints / availableWeight : 0;
  const coverage = clamp(availableWeight);
  // Incomplete evidence cannot earn the same score as a complete listing.
  const evidenceMultiplier = (0.65 + 0.35 * (coverage / 100)) * (riskKnown ? 1 : 0.9);
  const score = clamp(partialScore * evidenceMultiplier - (riskPenalty ?? 0));

  return {
    status: "scored",
    score: Math.round(score),
    coverage: Math.round(coverage),
    totalLandedCost: costs.total,
    priceAdvantagePercent: round1(priceAdvantagePercent),
    riskPenalty,
    components,
    weights,
    explanation: !riskKnown
      ? "Score is evidence-adjusted because risk evidence is unknown; no risk penalty was invented."
      : coverage < 75
        ? "Score is evidence-adjusted because several listing inputs are unavailable."
        : "Score uses landed cost, market value, condition, confidence, seller evidence, convenience, compatibility, and risk.",
  };
}

export function estimateTravelCost({ distanceMiles = 0, mileageRate = 0.7, roundTrip = true, timeHours = 0, timeValuePerHour = 0 } = {}) {
  const distance = Math.max(0, toNumber(distanceMiles));
  const miles = distance * (roundTrip ? 2 : 1);
  const vehicle = miles * Math.max(0, toNumber(mileageRate));
  const time = Math.max(0, toNumber(timeHours)) * Math.max(0, toNumber(timeValuePerHour));
  return roundMoney(vehicle + time);
}

export function recommendedMaximumBid({
  estimatedMarketValue,
  targetDiscountPercent = 25,
  shipping = 0,
  handling = 0,
  buyerPremiumRate = 0,
  taxesRate = 0,
  travelCost = 0,
  replacementParts = 0,
} = {}) {
  const market = Math.max(0, toNumber(estimatedMarketValue));
  if (!market) return null;

  const targetTotal = market * (1 - clamp(toNumber(targetDiscountPercent), 0, 95) / 100);
  const fixedCosts = [shipping, handling, travelCost, replacementParts]
    .map((value) => Math.max(0, toNumber(value)))
    .reduce((sum, value) => sum + value, 0);
  const multiplier = 1 + Math.max(0, toNumber(buyerPremiumRate)) / 100 + Math.max(0, toNumber(taxesRate)) / 100;
  return roundMoney(Math.max(0, (targetTotal - fixedCosts) / multiplier));
}

function nullableScore(value) {
  if (value === null || value === undefined || value === "") return null;
  return clamp(toNumber(value));
}

export function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function round1(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 10) / 10;
}
