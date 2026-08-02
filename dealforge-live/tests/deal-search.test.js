import test from "node:test";
import assert from "node:assert/strict";

async function loadDomain() {
  return import("../lib/deal-search.js").catch(() => ({}));
}

const NOW = new Date("2026-08-02T16:00:00.000Z");

const localRedmond = {
  id: "redmond-1tb",
  source: "craigslist",
  title: "1TB various brand PCI-E 3 NVME",
  description: "Lightly used M.2 drives. $100 minimum purchase.",
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
  warnings: ["$100 minimum purchase", "Verify SMART health"],
  observed_at: "2026-08-02T15:00:00.000Z",
  expires_at: "2026-08-09T00:00:00.000Z",
  active: true,
};

const shippedAdata = {
  id: "adata-1tb",
  source: "newegg",
  title: "ADATA LEGEND 710 1TB M.2 2280 NVMe SSD",
  description: "New PCIe 3.0 x4 drive with free shipping.",
  category: "Internal SSD",
  item_price: 139.99,
  shipping_cost: 0,
  minimum_purchase: null,
  condition: "new",
  seller_confidence: 88,
  city: null,
  state: null,
  distance_miles: null,
  pickup_available: false,
  capacity_gb: 1000,
  form_factor: "M.2 2280",
  interface: "NVMe PCIe 3.0 x4",
  warnings: ["Verify price at checkout"],
  observed_at: "2026-08-01T12:00:00.000Z",
  expires_at: "2026-08-06T00:00:00.000Z",
  active: true,
};

test("normalizes the acceptance query and hardware filters", async () => {
  const { normalizeDealQuery } = await loadDomain();
  assert.equal(typeof normalizeDealQuery, "function");
  assert.deepEqual(normalizeDealQuery({
    q: "  M.2 SSD 1 TB  ",
    capacityGb: "1000",
    interface: "NVME",
    radiusMiles: "40",
    limit: "10",
  }), {
    q: "m.2 ssd 1tb",
    terms: ["m.2", "ssd", "1tb"],
    capacityGb: 1000,
    formFactor: "",
    interface: "nvme",
    radiusMiles: 40,
    maxPrice: null,
    limit: 10,
  });
});

test("uses minimum purchase when it exceeds advertised landed price", async () => {
  const { effectiveDealPrice } = await loadDomain();
  assert.equal(typeof effectiveDealPrice, "function");
  assert.equal(effectiveDealPrice(localRedmond), 100);
  assert.equal(effectiveDealPrice(shippedAdata), 139.99);
});

test("matches compatible active snapshots and excludes expired rows", async () => {
  const { normalizeDealQuery, matchesDeal } = await loadDomain();
  assert.equal(typeof matchesDeal, "function");
  const criteria = normalizeDealQuery({ q: "m.2 ssd 1 tb", capacityGb: 1000, interface: "nvme", radiusMiles: 40 });
  assert.equal(matchesDeal(localRedmond, criteria, NOW), true);
  assert.equal(matchesDeal({ ...localRedmond, expires_at: "2026-08-01T00:00:00.000Z" }, criteria, NOW), false);
  assert.equal(matchesDeal({ ...localRedmond, capacity_gb: 500 }, criteria, NOW), false);
  assert.equal(matchesDeal({ ...localRedmond, interface: "SATA" }, criteria, NOW), false);
});

test("ranks the inexpensive local result first without hiding its constraint", async () => {
  const { normalizeDealQuery, rankDeals } = await loadDomain();
  assert.equal(typeof rankDeals, "function");
  const criteria = normalizeDealQuery({ q: "m.2 ssd 1 tb", capacityGb: 1000, interface: "nvme", radiusMiles: 40 });
  const ranked = rankDeals([shippedAdata, localRedmond], criteria, NOW);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, "redmond-1tb");
  assert.equal(ranked[0].effectivePrice, 100);
  assert.equal(ranked[0].warnings.includes("$100 minimum purchase"), true);
  assert.equal(typeof ranked[0].rankScore, "number");
  assert.equal(typeof ranked[0].scoreComponents.locality, "number");
});