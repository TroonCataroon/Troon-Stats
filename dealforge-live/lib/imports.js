function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeManualListing(row, source, index) {
  const title = String(row.title ?? row.name ?? row.item ?? "").trim();
  if (!title) throw new Error(`Imported row ${index + 1} is missing a title.`);
  const price = numberOrNull(row.price ?? row.itemPrice ?? row.currentBid) ?? 0;
  const shipping = numberOrNull(row.shipping);
  const sourceName = String(row.source ?? source ?? "manual").trim().toLowerCase() || "manual";
  const now = new Date().toISOString();
  return {
    id: `manual-${sourceName}-${crypto.randomUUID?.() ?? `${Date.now()}-${index}`}`,
    source: sourceName,
    sourceName: sourceName === "manual" ? "Manual import" : sourceName,
    sourceListingId: String(row.id ?? row.listingId ?? `import-${index + 1}`),
    url: safeUrl(row.url),
    title,
    description: String(row.description ?? "").trim(),
    category: String(row.category ?? "Imported listing").trim(),
    brand: row.brand ? String(row.brand).trim() : null,
    model: row.model ? String(row.model).trim() : null,
    imageUrl: safeUrl(row.imageUrl ?? row.image),
    sellerName: row.seller ? String(row.seller).trim() : "User supplied",
    condition: String(row.condition ?? "unknown").trim().toLowerCase(),
    costs: {
      itemPrice: price,
      shipping,
      handling: numberOrNull(row.handling),
      buyerPremium: numberOrNull(row.buyerPremium),
      taxes: numberOrNull(row.taxes),
      travelCost: numberOrNull(row.travelCost),
      replacementParts: numberOrNull(row.replacementParts),
    },
    totalLandedCost: price + (shipping ?? 0),
    estimatedMarketValue: numberOrNull(row.estimatedMarketValue ?? row.marketValue),
    dealScore: null,
    riskScore: numberOrNull(row.riskScore),
    confidenceScore: numberOrNull(row.confidenceScore) ?? 50,
    auction: {
      isAuction: Boolean(row.isAuction),
      currentBid: price,
      endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
      status: "active",
    },
    location: {
      city: String(row.city ?? "").trim(),
      state: String(row.state ?? "").trim().toUpperCase(),
      zip: String(row.zip ?? "").trim(),
      display: String(row.location ?? [row.city, row.state].filter(Boolean).join(", ") ?? "").trim(),
      pickupOnly: Boolean(row.pickupOnly),
      distanceMiles: numberOrNull(row.distanceMiles),
    },
    extractionWarnings: ["This record was supplied by the user and was not independently verified."],
    dataMode: "manual",
    fetchedAt: now,
    lastSeenAt: now,
  };
}

export function parseManualImport(text, source = "manual") {
  const input = String(text ?? "").trim();
  if (!input) throw new Error("Paste JSON or CSV data before importing.");

  let rows;
  if (input.startsWith("{") || input.startsWith("[")) {
    const parsed = JSON.parse(input);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    const parsedRows = parseCsvRows(input);
    if (parsedRows.length < 2) throw new Error("CSV imports require a header row and at least one listing.");
    const headers = parsedRows[0].map((header) => header.trim());
    rows = parsedRows.slice(1).map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
    );
  }

  return rows.map((row, index) => normalizeManualListing(row, source, index));
}

export { parseCsvRows };
