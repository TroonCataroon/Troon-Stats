function finiteNumber(value, fallback = null) {
  if (value === "" || value === undefined || value === null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = finiteNumber(value, fallback);
  if (!Number.isInteger(number) || number < minimum || number > maximum) return fallback;
  return number;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(\d+)\s*tb\b/g, "$1tb")
    .replace(/\b(\d+)\s*gb\b/g, "$1gb")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDealQuery(input = {}) {
  const q = normalizeText(input.q).slice(0, 120);
  const maxPrice = finiteNumber(input.maxPrice, null);
  return {
    q,
    terms: q ? q.split(" ").filter(Boolean) : [],
    capacityGb: boundedInteger(input.capacityGb, null, 1, 100000),
    formFactor: normalizeText(input.formFactor).slice(0, 40),
    interface: normalizeText(input.interface).slice(0, 40),
    radiusMiles: finiteNumber(input.radiusMiles, null),
    maxPrice: maxPrice !== null && maxPrice >= 0 && maxPrice <= 100000 ? maxPrice : null,
    limit: boundedInteger(input.limit, 20, 1, 50),
  };
}

export function effectiveDealPrice(snapshot = {}) {
  const itemPrice = Math.max(0, finiteNumber(snapshot.item_price, 0));
  const shipping = Math.max(0, finiteNumber(snapshot.shipping_cost, 0));
  const advertisedLanded = itemPrice + shipping;
  const minimumPurchase = finiteNumber(snapshot.minimum_purchase, null);
  const effective = minimumPurchase === null
    ? advertisedLanded
    : Math.max(advertisedLanded, minimumPurchase);
  return Math.round((effective + Number.EPSILON) * 100) / 100;
}

function normalizedCapacity(snapshot) {
  return finiteNumber(snapshot.capacity_gb, null);
}

function isCapacityCompatible(snapshotCapacity, requestedCapacity) {
  if (requestedCapacity === null) return true;
  if (snapshotCapacity === null) return false;
  const tolerance = Math.max(24, requestedCapacity * 0.03);
  return Math.abs(snapshotCapacity - requestedCapacity) <= tolerance;
}

function searchableText(snapshot) {
  return normalizeText([
    snapshot.title,
    snapshot.description,
    snapshot.category,
    snapshot.form_factor,
    snapshot.interface,
    snapshot.capacity_gb ? `${snapshot.capacity_gb}gb` : "",
    snapshot.capacity_gb && snapshot.capacity_gb >= 1000 ? `${Math.round(snapshot.capacity_gb / 1000)}tb` : "",
  ].filter(Boolean).join(" "));
}

export function matchesDeal(snapshot = {}, criteria = normalizeDealQuery(), now = new Date()) {
  if (snapshot.active === false) return false;
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const expiresAt = new Date(snapshot.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= currentTime) return false;

  if (!isCapacityCompatible(normalizedCapacity(snapshot), criteria.capacityGb)) return false;
  if (criteria.formFactor && !normalizeText(snapshot.form_factor).includes(criteria.formFactor)) return false;
  if (criteria.interface && !normalizeText(snapshot.interface).includes(criteria.interface)) return false;
  if (criteria.maxPrice !== null && effectiveDealPrice(snapshot) > criteria.maxPrice) return false;

  const haystack = searchableText(snapshot);
  return criteria.terms.every((term) => haystack.includes(term));
}

function freshnessScore(snapshot, now) {
  const observed = new Date(snapshot.observed_at).getTime();
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return 0;
  const ageDays = Math.max(0, (current - observed) / 86_400_000);
  return Math.max(0, 15 - ageDays * 0.75);
}

function localityScore(snapshot, criteria) {
  const distance = finiteNumber(snapshot.distance_miles, null);
  if (!snapshot.pickup_available || distance === null) return 0;
  const radius = criteria.radiusMiles ?? 40;
  if (distance > radius) return Math.max(0, 4 - (distance - radius) * 0.1);
  return 15 * Math.max(0.2, 1 - distance / Math.max(radius, 1));
}

function priceScore(snapshot) {
  const price = effectiveDealPrice(snapshot);
  if (price <= 0) return 0;
  return Math.max(0, 25 - price / 8);
}

function compatibilityScore(snapshot, criteria) {
  let score = 0;
  if (criteria.capacityGb !== null && isCapacityCompatible(normalizedCapacity(snapshot), criteria.capacityGb)) score += 8;
  if (criteria.interface && normalizeText(snapshot.interface).includes(criteria.interface)) score += 7;
  if (criteria.formFactor && normalizeText(snapshot.form_factor).includes(criteria.formFactor)) score += 5;
  if (!criteria.formFactor && normalizeText(snapshot.form_factor).includes("m.2")) score += 3;
  return score;
}

function relevanceScore(snapshot, criteria) {
  if (!criteria.terms.length) return 0;
  const haystack = searchableText(snapshot);
  return criteria.terms.filter((term) => haystack.includes(term)).length / criteria.terms.length * 30;
}

function confidenceScore(snapshot) {
  const confidence = finiteNumber(snapshot.seller_confidence, 50);
  return Math.max(0, Math.min(100, confidence)) / 10;
}

export function rankDeals(snapshots = [], criteriaInput = {}, now = new Date()) {
  const criteria = criteriaInput?.terms ? criteriaInput : normalizeDealQuery(criteriaInput);
  return snapshots
    .filter((snapshot) => matchesDeal(snapshot, criteria, now))
    .map((snapshot) => {
      const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings.map(String) : [];
      const scoreComponents = {
        relevance: relevanceScore(snapshot, criteria),
        compatibility: compatibilityScore(snapshot, criteria),
        freshness: freshnessScore(snapshot, now),
        locality: localityScore(snapshot, criteria),
        price: priceScore(snapshot),
        confidence: confidenceScore(snapshot),
        warningPenalty: warnings.length * 1.25,
      };
      const rankScore = Object.entries(scoreComponents)
        .reduce((total, [key, value]) => total + (key === "warningPenalty" ? -value : value), 0);
      return {
        ...snapshot,
        warnings,
        effectivePrice: effectiveDealPrice(snapshot),
        rankScore: Math.round((rankScore + Number.EPSILON) * 100) / 100,
        scoreComponents: Object.fromEntries(
          Object.entries(scoreComponents).map(([key, value]) => [key, Math.round((value + Number.EPSILON) * 100) / 100]),
        ),
      };
    })
    .sort((left, right) =>
      right.rankScore - left.rankScore ||
      left.effectivePrice - right.effectivePrice ||
      new Date(right.observed_at).getTime() - new Date(left.observed_at).getTime() ||
      String(left.id).localeCompare(String(right.id)),
    )
    .slice(0, criteria.limit);
}