import test from "node:test";
import assert from "node:assert/strict";

async function loadApi() {
  return import("../api/deals.js").catch(() => ({}));
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function snapshot(overrides = {}) {
  return {
    id: "redmond-1tb",
    source: "craigslist",
    source_listing_id: "7944855670",
    url: "https://seattle.craigslist.org/est/sop/d/redmond-lightly-used-tb-and-512gb-nvme/7944855670.html",
    title: "1TB various brand PCI-E 3 NVME M.2 SSD",
    description: "Lightly used drive. $100 minimum purchase.",
    category: "Internal SSD",
    item_price: 60,
    shipping_cost: 0,
    minimum_purchase: 100,
    condition: "used",
    seller_confidence: 72,
    city: "Redmond",
    state: "WA",
    distance_miles: 24.6,
    pickup_available: true,
    capacity_gb: 1000,
    form_factor: "M.2 2280",
    interface: "NVMe PCIe 3.0 x4",
    warnings: ["$100 minimum purchase"],
    evidence: { updated: "2026-07-17" },
    observed_at: "2026-08-02T15:00:00.000Z",
    expires_at: "2026-08-09T00:00:00.000Z",
    active: true,
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("exports a dependency-injectable deals handler", async () => {
  const { createDealsHandler } = await loadApi();
  assert.equal(typeof createDealsHandler, "function");
});

test("rejects a missing query", async () => {
  const { createDealsHandler } = await loadApi();
  assert.equal(typeof createDealsHandler, "function");
  const handler = createDealsHandler({ fetchImpl: async () => jsonResponse([]) });
  const response = responseRecorder();
  await handler({ method: "GET", url: "/api/deals", headers: { host: "dealforge.test" } }, response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /query/i);
});

test("returns ranked source-backed snapshots without requiring a session", async () => {
  const { createDealsHandler } = await loadApi();
  const calls = [];
  const handler = createDealsHandler({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse([
        snapshot({ id: "shipped", source: "newegg", item_price: 139.99, minimum_purchase: null, pickup_available: false, distance_miles: null, seller_confidence: 88 }),
        snapshot(),
      ]);
    },
    now: () => new Date("2026-08-02T16:00:00.000Z"),
  });
  const response = responseRecorder();
  await handler({
    method: "GET",
    url: "/api/deals?q=m.2%20ssd%201%20tb&capacityGb=1000&interface=nvme&radiusMiles=40&limit=10",
    headers: { host: "dealforge.test", "x-forwarded-proto": "https" },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dataMode, "verified-snapshots");
  assert.equal(response.body.returnedCount, 2);
  assert.equal(response.body.listings[0].id, "redmond-1tb");
  assert.equal(response.body.listings[0].effectivePrice, 100);
  assert.equal(response.body.listings[0].warnings.includes("$100 minimum purchase"), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /deal_snapshots/);
  assert.equal(calls[0].options.headers.apikey.startsWith("sb_publishable_"), true);
  assert.equal(calls[0].options.headers.Authorization.startsWith("Bearer sb_publishable_"), true);
});

test("returns real-or-empty when no snapshot matches", async () => {
  const { createDealsHandler } = await loadApi();
  const handler = createDealsHandler({
    fetchImpl: async () => jsonResponse([snapshot({ capacity_gb: 500 })]),
    now: () => new Date("2026-08-02T16:00:00.000Z"),
  });
  const response = responseRecorder();
  await handler({ method: "GET", url: "/api/deals?q=1tb%20nvme&capacityGb=1000", headers: { host: "dealforge.test" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.returnedCount, 0);
  assert.deepEqual(response.body.listings, []);
  assert.equal(response.body.dataPolicy, "real-or-empty");
});

test("returns 503 when Supabase cannot be queried", async () => {
  const { createDealsHandler } = await loadApi();
  const handler = createDealsHandler({ fetchImpl: async () => jsonResponse({ message: "unavailable" }, 503) });
  const response = responseRecorder();
  await handler({ method: "GET", url: "/api/deals?q=1tb%20nvme", headers: { host: "dealforge.test" } }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.listings, undefined);
  assert.match(response.body.error, /temporarily unavailable/i);
});