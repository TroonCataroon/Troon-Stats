// DealForge self-contained server runtime, generated from tested source modules.

const DEFAULT_SCORE_WEIGHTS = Object.freeze({
  priceAdvantage: 35,
  condition: 20,
  performancePerDollar: 15,
  confidence: 10,
  sellerReliability: 10,
  shippingConvenience: 5,
  compatibility: 5,
});

const CONDITION_SCORES = Object.freeze({
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

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const normalized = String(value).replace(/[^0-9.+-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function calculateTotalLandedCost(costs = {}) {
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

function inferCondition(text = "") {
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

function conditionScore(condition = "unknown") {
  return CONDITION_SCORES[condition] ?? CONDITION_SCORES.unknown;
}

function calculatePriceAdvantage(totalLandedCost, estimatedMarketValue) {
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

function calculateDealScore(input = {}) {
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

function estimateTravelCost({ distanceMiles = 0, mileageRate = 0.7, roundTrip = true, timeHours = 0, timeValuePerHour = 0 } = {}) {
  const distance = Math.max(0, toNumber(distanceMiles));
  const miles = distance * (roundTrip ? 2 : 1);
  const vehicle = miles * Math.max(0, toNumber(mileageRate));
  const time = Math.max(0, toNumber(timeHours)) * Math.max(0, toNumber(timeValuePerHour));
  return roundMoney(vehicle + time);
}

function recommendedMaximumBid({
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

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function round1(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 10) / 10;
}

const ELECTRONICS_TERMS = [
  "computer", "computers", "laptop", "notebook", "desktop", "workstation", "server", "servers",
  "monitor", "display", "lcd", "led", "printer", "scanner", "copier", "electronics", "electronic",
  "network", "networking", "router", "switch", "firewall", "wireless", "telecom", "communications",
  "storage", "hard drive", "hard disk", "ssd", "solid state", "disk array", "nas", "san", "data rack",
  "graphics card", "gpu", "processor", "cpu", "motherboard", "memory", "ram", "power supply", "ups",
  "tablet", "phone", "smartphone", "camera", "video", "audio", "radio", "television", "projector",
  "console", "gaming", "test equipment", "oscilloscope", "multimeter", "spectrum analyzer", "signal generator",
  "laboratory equipment", "av equipment", "server rack", "battery backup", "electrical equipment",
];

const PRIORITY_ARRAY_KEYS = [
  "results", "auctions", "auction", "items", "data", "records", "result", "response", "activeAuctions",
];

function normalizeGsaPayload(payload, fetchedAt = new Date().toISOString()) {
  const rows = findAuctionRows(payload);
  return rows
    .filter((row) => row && typeof row === "object")
    .map((row, index) => normalizeGsaRow(row, index, fetchedAt))
    .filter(Boolean);
}

function findAuctionRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const preferred of PRIORITY_ARRAY_KEYS) {
    const key = Object.keys(payload).find((candidate) => simplify(candidate) === simplify(preferred));
    if (!key) continue;
    const value = payload[key];
    if (Array.isArray(value)) return value;
    const nested = findAuctionRows(value);
    if (nested.length) return nested;
  }

  const candidates = [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.some(looksLikeAuctionRow)) candidates.push(value);
    else if (value && typeof value === "object") {
      const nested = findAuctionRows(value);
      if (nested.length) candidates.push(nested);
    }
  }
  return candidates.sort((a, b) => b.length - a.length)[0] ?? [];
}

function normalizeGsaRow(row, index = 0, fetchedAt = new Date().toISOString()) {
  const saleNo = stringField(row, "SaleNo", "sale_no", "saleNumber", "sale_number");
  const lotNo = stringField(row, "LotNo", "lot_no", "lotNumber", "lot_number", "LotSequence");
  const title = firstNonEmpty(
    stringField(row, "ItemName", "item_name", "title", "name"),
    stringField(row, "LotDescript", "lot_description", "description"),
    "Federal surplus lot",
  );

  const descriptionParts = [
    stringField(row, "LotDescript", "lot_description", "description"),
    stringField(row, "Instruction1", "instruction_1"),
    stringField(row, "Instruction2", "instruction_2"),
    stringField(row, "Instruction3", "instruction_3"),
  ].filter(Boolean);
  const description = [...new Set(descriptionParts)].join(" ");
  const combinedText = `${title} ${description}`.trim();

  const endDate = parseGsaDate(field(row, "AucEndDt", "auction_end_date", "endDate", "end_date"));
  const startDate = parseGsaDate(field(row, "AucStartDt", "auction_start_date", "startDate", "start_date"));
  const currentBid = nonNegativeNumber(field(row, "HighBidAmount", "high_bid_amount", "currentBid", "current_bid"));
  const reserve = nullableNonNegativeNumber(field(row, "Reserve", "reserve", "reserve_price"));
  const bidders = nullableNonNegativeNumber(field(row, "BiddersCount", "bidders_count", "bidderCount"));
  const increment = nullableNonNegativeNumber(field(row, "AucIncrement", "auction_increment", "bid_increment"));
  const imageUrl = safeHttpUrl(stringField(row, "ImageURL", "image_url", "image"));
  const sourceUrl = safeHttpUrl(stringField(row, "ItemDescURL", "item_description_url", "url"));

  const city = firstNonEmpty(
    stringField(row, "PropertyCity", "property_city"),
    stringField(row, "LocationCity", "location_city"),
  );
  const state = firstNonEmpty(
    stringField(row, "PropertyState", "property_state"),
    stringField(row, "LocationST", "location_state", "state"),
  ).toUpperCase();
  const zip = firstNonEmpty(
    stringField(row, "PropertyZip", "property_zip"),
    stringField(row, "LocationZip", "location_zip", "zip"),
  );
  const location = [city, state].filter(Boolean).join(", ") + (zip ? ` ${zip}` : "");

  const condition = inferCondition(combinedText);
  const confidenceScore = calculateCompleteness({ title, description, sourceUrl, imageUrl, endDate, city, state, currentBid });
  const riskScore = calculateRisk({ condition, sourceUrl, imageUrl, description, currentBid, reserve, endDate });
  const normalizedId = `gsa-${slug(saleNo || "sale")}-${slug(lotNo || String(index + 1))}`;

  return {
    id: normalizedId,
    source: "gsa",
    sourceName: "GSA Auctions",
    sourceListingId: [saleNo, lotNo].filter(Boolean).join("-") || String(index + 1),
    url: sourceUrl,
    title,
    description,
    category: classifyElectronics(combinedText),
    brand: null,
    model: null,
    partNumber: null,
    specifications: [],
    imageUrl,
    sellerName: firstNonEmpty(
      stringField(row, "AgencyName", "agency_name"),
      stringField(row, "BureauName", "bureau_name"),
      "U.S. Government agency",
    ),
    sellerRating: null,
    condition,
    testedStatus: inferTestedStatus(combinedText),
    costs: {
      itemPrice: currentBid,
      shipping: null,
      handling: null,
      buyerPremium: 0,
      taxes: null,
      travelCost: null,
      replacementParts: null,
    },
    totalLandedCost: currentBid,
    pricingCompleteness: "partial",
    estimatedMarketValue: null,
    dealScore: null,
    qualityScore: null,
    riskScore,
    confidenceScore,
    auction: {
      isAuction: true,
      currentBid,
      bidCount: null,
      bidderCount: bidders,
      reserve,
      increment,
      startDate,
      endDate,
      status: normalizeAuctionStatus(stringField(row, "AuctionStatus", "auction_status"), endDate),
    },
    location: {
      city,
      state,
      zip,
      display: location || "Location shown on source listing",
      pickupOnly: true,
      distanceMiles: null,
    },
    duplicateGroup: null,
    extractionWarnings: buildWarnings({ sourceUrl, imageUrl, description, endDate, currentBid }),
    dataMode: "live",
    fetchedAt,
    lastSeenAt: fetchedAt,
    rawSourceFields: {
      saleNo,
      lotNo,
      agencyCode: stringField(row, "AgencyCode", "agency_code"),
      bureauCode: stringField(row, "BureauCode", "bureau_code"),
      saleLocation: stringField(row, "SaleLocation", "sale_location"),
    },
  };
}

function isElectronicsListing(listing) {
  const text = `${listing?.title ?? ""} ${listing?.description ?? ""}`.toLowerCase();
  return ELECTRONICS_TERMS.some((term) => text.includes(term));
}

function electronicsTerms() {
  return [...ELECTRONICS_TERMS];
}

function looksLikeAuctionRow(value) {
  if (!value || typeof value !== "object") return false;
  const keys = Object.keys(value).map(simplify);
  return ["saleno", "itemname", "aucenddt", "lotno"].some((key) => keys.includes(key));
}

function field(row, ...names) {
  const map = new Map(Object.keys(row).map((key) => [simplify(key), row[key]]));
  for (const name of names) {
    const value = map.get(simplify(name));
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function stringField(row, ...names) {
  const value = field(row, ...names);
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function simplify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim())?.toString().trim() ?? "";
}

function nonNegativeNumber(value) {
  return Math.max(0, toNumber(value));
}

function nullableNonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  return Math.max(0, toNumber(value));
}

function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseGsaDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const parsed = new Date(`${compact[1]}-${compact[2]}-${compact[3]}T23:59:59Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    const parsed = new Date(`${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}T23:59:59Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function inferTestedStatus(text) {
  const value = text.toLowerCase();
  if (/tested|working|operational|functions/.test(value)) return "tested";
  if (/untested/.test(value)) return "untested";
  if (/parts|salvage|nonworking|not working|repair/.test(value)) return "parts";
  return "unknown";
}

function calculateCompleteness({ title, description, sourceUrl, imageUrl, endDate, city, state, currentBid }) {
  let score = 35;
  if (title && title !== "Federal surplus lot") score += 14;
  if (description) score += 10;
  if (sourceUrl) score += 10;
  if (imageUrl) score += 7;
  if (endDate) score += 8;
  if (city || state) score += 7;
  if (currentBid > 0) score += 9;
  return Math.round(clamp(score));
}

function calculateRisk({ condition, sourceUrl, imageUrl, description, currentBid, reserve, endDate }) {
  let risk = 28;
  if (condition === "unknown") risk += 17;
  if (condition === "untested") risk += 24;
  if (condition === "for-parts") risk += 34;
  if (!sourceUrl) risk += 8;
  if (!imageUrl) risk += 6;
  if (!description) risk += 9;
  if (currentBid === 0) risk += 4;
  if (reserve !== null && reserve > currentBid) risk += 4;
  if (!endDate) risk += 5;
  return Math.round(clamp(risk));
}

function buildWarnings({ sourceUrl, imageUrl, description, endDate, currentBid }) {
  const warnings = [
    "Shipping, taxes, inspection requirements, and pickup costs are not included in the current bid.",
    "Fair market value is not supplied by GSA, so DealForge does not invent a deal score.",
  ];
  if (!description) warnings.push("The API record contains limited description data.");
  if (!imageUrl) warnings.push("No image was supplied in the API record.");
  if (!sourceUrl) warnings.push("No direct item-detail URL was supplied in the API record.");
  if (!endDate) warnings.push("Auction end time could not be normalized.");
  if (currentBid === 0) warnings.push("The API currently reports no positive high bid.");
  return warnings;
}

function normalizeAuctionStatus(status, endDate) {
  const value = String(status || "").trim().toUpperCase();
  if (value === "A") return "active";
  if (value === "P") return "preview";
  if (["C", "X", "E"].includes(value)) return "ended";
  if (endDate && new Date(endDate).getTime() < Date.now()) return "ended";
  return value ? value.toLowerCase() : "scheduled";
}

function classifyElectronics(text) {
  const value = text.toLowerCase();
  const rules = [
    ["Computer", /computer|desktop|laptop|notebook|workstation|server|processor|cpu|motherboard|memory|ram/],
    ["Networking", /network|router|switch|firewall|wireless|telecom|communications/],
    ["Storage", /hard drive|hard disk|ssd|solid state|storage|disk array|nas|san/],
    ["Display", /monitor|display|lcd|led|television|projector/],
    ["Imaging", /camera|video|scanner/],
    ["Office Electronics", /printer|copier/],
    ["Audio and Radio", /audio|radio|speaker|amplifier/],
    ["Electronic Test Equipment", /oscilloscope|multimeter|spectrum analyzer|signal generator|test equipment/],
    ["Power", /power supply|ups|battery backup/],
  ];
  return rules.find(([, regex]) => regex.test(value))?.[0] ?? "Electronics and Equipment";
}

const FIVE_MINUTES = 5 * 60 * 1000;
const UPSTREAM_URL = "https://api.gsa.gov/assets/gsaauctions/v2/auctions";
let memoryCache = null;

async function gsaHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const now = Date.now();
  const forceRefresh = String(request.query?.refresh ?? "") === "1";
  const query = cleanText(request.query?.q, 100);
  const state = cleanText(request.query?.state, 2).toUpperCase();
  const limit = Math.min(300, Math.max(1, Number(request.query?.limit) || 180));

  try {
    let cache = memoryCache;
    if (!cache || forceRefresh || now - cache.cachedAt > FIVE_MINUTES) {
      cache = await fetchLiveGsaData();
      memoryCache = cache;
    }

    let listings = cache.listings;
    if (state) listings = listings.filter((listing) => listing.location?.state === state);
    if (query) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      listings = listings.filter((listing) => {
        const haystack = `${listing.title} ${listing.description} ${listing.category} ${listing.sellerName} ${listing.location?.display}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
    }

    listings = [...listings]
      .sort((a, b) => {
        const aEnd = a.auction?.endDate ? new Date(a.auction.endDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bEnd = b.auction?.endDate ? new Date(b.auction.endDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aEnd - bEnd;
      })
      .slice(0, limit);

    response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.status(200).json({
      source: "gsa",
      sourceName: "GSA Auctions",
      dataMode: "live",
      accessMethod: "official-api",
      keyMode: cache.keyMode,
      fetchedAt: cache.fetchedAt,
      cachedAt: new Date(cache.cachedAt).toISOString(),
      upstreamCount: cache.upstreamCount,
      electronicsCount: cache.listings.length,
      returnedCount: listings.length,
      query: query || null,
      state: state || null,
      listings,
      notices: [
        cache.keyMode === "demo"
          ? "Live GSA data is currently using the public DEMO_KEY. Add GSA_AUCTIONS_API_KEY in Vercel for normal production limits."
          : "Live GSA data is using a configured api.data.gov key.",
        "Current bids do not include shipping, taxes, travel, inspection, or required repair costs.",
      ],
    });
  } catch (error) {
    console.error("GSA adapter failed", error);
    response.setHeader("Cache-Control", "no-store");
    return response.status(502).json({
      source: "gsa",
      dataMode: "unavailable",
      error: "The official GSA Auctions API could not be reached.",
      detail: safeErrorMessage(error),
      retryable: true,
      fetchedAt: new Date().toISOString(),
    });
  }
}

async function fetchLiveGsaData() {
  const apiKey = process.env.GSA_AUCTIONS_API_KEY || "DEMO_KEY";
  const url = new URL(UPSTREAM_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "JSON");

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const upstream = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "DealForge/1.0" },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!upstream.ok) throw new Error(`GSA API returned ${upstream.status}`);
      const payload = await upstream.json();
      const fetchedAt = new Date().toISOString();
      const allListings = normalizeGsaPayload(payload, fetchedAt);
      const listings = allListings.filter(isElectronicsListing);
      if (!allListings.length) throw new Error("GSA API returned no recognizable auction records");
      return {
        fetchedAt,
        cachedAt: Date.now(),
        keyMode: apiKey === "DEMO_KEY" ? "demo" : "configured",
        upstreamCount: allListings.length,
        listings,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(500 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Unknown GSA adapter error");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[<>\u0000-\u001F]/g, "").trim().slice(0, maxLength);
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.replace(/api_key=[^&\s]+/gi, "api_key=[redacted]").slice(0, 240);
}

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
let tokenCache = null;

async function ebayHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const connected = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
  const action = String(request.query?.action || "status");

  if (action === "status") {
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({
      source: "ebay",
      connected,
      status: connected ? "connected" : "credentials-required",
      accessMethod: "official-api",
      requiredEnvironmentVariables: connected ? [] : ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
      note: connected
        ? "The official eBay Browse API adapter is configured."
        : "Add eBay production application credentials in Vercel before live eBay listings can be retrieved.",
    });
  }

  if (!connected) {
    return response.status(503).json({
      source: "ebay",
      status: "credentials-required",
      error: "Official eBay API credentials are not configured.",
      requiredEnvironmentVariables: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
    });
  }

  const query = sanitize(request.query?.q, 100);
  const limit = Math.min(50, Math.max(1, Number(request.query?.limit) || 24));
  if (!query) return response.status(400).json({ error: "A search query is required." });

  try {
    const token = await getApplicationToken();
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("filter", "deliveryCountry:US");
    url.searchParams.set("fieldgroups", "EXTENDED");

    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
      },
    });
    const body = await upstream.json();
    if (!upstream.ok) throw new Error(body?.errors?.[0]?.message || `eBay returned ${upstream.status}`);

    const listings = (body.itemSummaries || []).map(normalizeEbayItem);
    response.setHeader("Cache-Control", "private, max-age=60");
    return response.status(200).json({
      source: "ebay",
      dataMode: "live",
      accessMethod: "official-api",
      fetchedAt: new Date().toISOString(),
      returnedCount: listings.length,
      listings,
      warnings: [
        "Deal scores remain unavailable until fair-market-value evidence and complete landed costs are supplied.",
      ],
    });
  } catch (error) {
    console.error("eBay adapter failed", error);
    return response.status(502).json({
      source: "ebay",
      status: "error",
      error: error instanceof Error ? error.message.slice(0, 240) : "eBay API request failed.",
    });
  }
}

async function getApplicationToken() {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const credentials = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const upstream = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  const body = await upstream.json();
  if (!upstream.ok || !body.access_token) throw new Error(body.error_description || "Unable to obtain eBay OAuth token");
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in || 7200) * 1000,
  };
  return tokenCache.token;
}

function normalizeEbayItem(item) {
  const price = number(item.price?.value);
  const shipping = number(item.shippingOptions?.[0]?.shippingCost?.value, null);
  const imageUrl = safeUrl(item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl);
  const url = safeUrl(item.itemWebUrl || item.itemAffiliateWebUrl);
  const location = item.itemLocation || {};
  return {
    id: `ebay-${String(item.itemId || crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g, "-")}`,
    source: "ebay",
    sourceName: "eBay",
    sourceListingId: item.itemId || null,
    url,
    title: item.title || "eBay listing",
    description: item.shortDescription || "",
    category: item.categories?.[0]?.categoryName || "Electronics",
    brand: null,
    model: null,
    partNumber: null,
    specifications: [],
    imageUrl,
    sellerName: item.seller?.username || "eBay seller",
    sellerRating: number(item.seller?.feedbackPercentage, null),
    condition: normalizeCondition(item.condition),
    testedStatus: "unknown",
    costs: {
      itemPrice: price,
      shipping,
      handling: null,
      buyerPremium: 0,
      taxes: null,
      travelCost: null,
      replacementParts: null,
    },
    totalLandedCost: price + (shipping || 0),
    pricingCompleteness: shipping === null ? "partial" : "partial",
    estimatedMarketValue: null,
    dealScore: null,
    qualityScore: null,
    riskScore: 35,
    confidenceScore: 74,
    auction: {
      isAuction: item.buyingOptions?.includes("AUCTION") || false,
      currentBid: price,
      bidCount: null,
      bidderCount: null,
      reserve: null,
      increment: null,
      startDate: null,
      endDate: item.itemEndDate || null,
      status: "active",
    },
    location: {
      city: location.city || "",
      state: location.stateOrProvince || "",
      zip: location.postalCode || "",
      display: [location.city, location.stateOrProvince].filter(Boolean).join(", ") || "Shipping available",
      pickupOnly: false,
      distanceMiles: null,
    },
    duplicateGroup: null,
    extractionWarnings: [
      "Taxes and any condition-specific repair costs are not included.",
      "Fair market value is not inferred from an active asking price.",
    ],
    dataMode: "live",
    fetchedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

function normalizeCondition(value = "") {
  const text = String(value).toLowerCase();
  if (text.includes("new")) return "new";
  if (text.includes("open box")) return "open-box";
  if (text.includes("refurb")) return "refurbished";
  if (text.includes("parts")) return "for-parts";
  if (text.includes("used")) return "good";
  return "unknown";
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitize(value, maxLength) {
  return String(value || "").replace(/[<>\u0000-\u001F]/g, "").trim().slice(0, maxLength);
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export default async function handler(request, response) {
  applyGatewayHeaders(response);
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const source = cleanGatewayQueryValue(request.query?.source);
  if (!source) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({
      service: "DealForge live-data gateway",
      status: "ready",
      dataPolicy: "real-or-empty",
      authentication: {
        status: authEnvironmentConfigured() ? "configured" : "configuration-required",
        provider: "supabase-google",
      },
      sources: sourceStatus(),
      generatedAt: new Date().toISOString(),
    });
  }

  const authorization = await authorizeRequest(request);
  if (!authorization.ok) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(authorization.status).json({
      error: authorization.error,
      authentication: "required",
    });
  }

  if (source === "gsa") return gsaHandler(request, response);
  if (source === "ebay") return ebayHandler(request, response);
  return response.status(400).json({ error: `Unsupported source: ${source}` });
}

function sourceStatus() {
  return {
    gsa: {
      status: "live",
      accessMethod: "official-api",
      keyMode: process.env.GSA_AUCTIONS_API_KEY ? "configured" : "demo",
    },
    ebay: {
      status: process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET
        ? "connected"
        : "credentials-required",
      accessMethod: "official-api",
    },
    shopgoodwill: { status: "manual-import", accessMethod: "user-provided" },
    craigslist: { status: "manual-import", accessMethod: "user-provided" },
    offerup: { status: "manual-import", accessMethod: "user-provided" },
    mercari: { status: "manual-import", accessMethod: "user-provided" },
  };
}

function authEnvironmentConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)
  );
}

async function authorizeRequest(request) {
  if (!authEnvironmentConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Supabase authentication is not configured for this deployment.",
    };
  }

  const header = String(request.headers?.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "A valid session is required." };

  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  try {
    const upstream = await fetch(`${String(process.env.SUPABASE_URL).replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) return { ok: false, status: 401, error: "The session is invalid or expired." };
    const user = await upstream.json();
    return { ok: true, user };
  } catch {
    return { ok: false, status: 503, error: "Authentication verification is temporarily unavailable." };
  }
}

function applyGatewayHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function cleanGatewayQueryValue(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return String(first ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40)
    .toLowerCase();
}