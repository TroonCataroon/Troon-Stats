const DEFAULTS = Object.freeze({
  mileageRate: 0.7,
  targetDiscountPercent: 25,
  defaultRegion: "WA",
  resultsLimit: 50,
});

function numberInRange(value, fallback, min, max) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizePreferences(input = {}) {
  const region = String(input.defaultRegion ?? DEFAULTS.defaultRegion)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2) || DEFAULTS.defaultRegion;

  return {
    mileageRate: numberInRange(input.mileageRate, DEFAULTS.mileageRate, 0, 10),
    targetDiscountPercent: numberInRange(input.targetDiscountPercent, DEFAULTS.targetDiscountPercent, 0, 95),
    defaultRegion: region,
    resultsLimit: Math.round(numberInRange(input.resultsLimit, DEFAULTS.resultsLimit, 10, 300)),
  };
}

export { DEFAULTS as DEFAULT_PREFERENCES };
