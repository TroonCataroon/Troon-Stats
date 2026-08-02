import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDealQuery, rankDeals } from "../lib/deal-search.js";

async function loadFixtures() {
  return import("../data/verified-ssd-deals.js").catch(() => ({}));
}

const NOW = new Date("2026-08-02T17:00:00.000Z");

test("verified SSD fixtures include a local Redmond option and a shipped retailer alternative", async () => {
  const { VERIFIED_SSD_DEALS } = await loadFixtures();
  assert.equal(Array.isArray(VERIFIED_SSD_DEALS), true);
  assert.equal(VERIFIED_SSD_DEALS.length >= 2, true);

  const local = VERIFIED_SSD_DEALS.find((deal) => deal.source === "craigslist");
  assert.ok(local);
  assert.equal(local.source_listing_id, "7944855670");
  assert.equal(local.city, "Redmond");
  assert.equal(local.state, "WA");
  assert.equal(local.capacity_gb, 1000);
  assert.match(local.interface, /nvme/i);
  assert.equal(local.item_price, 60);
  assert.equal(local.minimum_purchase, 100);
  assert.equal(local.warnings.includes("$100 minimum purchase"), true);
  assert.equal(local.evidence.updated, "2026-07-17 16:03");

  const shipped = VERIFIED_SSD_DEALS.find((deal) => deal.source === "bestbuy");
  assert.ok(shipped);
  assert.equal(shipped.capacity_gb, 1000);
  assert.match(shipped.form_factor, /m\.2 2280/i);
  assert.match(shipped.interface, /nvme/i);
  assert.equal(shipped.item_price <= 150, true);
  assert.equal(shipped.shipping_cost, 0);
  assert.equal(shipped.pickup_available, false);
  assert.equal(shipped.warnings.some((warning) => /verify/i.test(warning)), true);
});

test("the private acceptance search returns the local deal first and a shipped alternative", async () => {
  const { VERIFIED_SSD_DEALS } = await loadFixtures();
  const criteria = normalizeDealQuery({
    q: "m.2 ssd 1 tb",
    capacityGb: 1000,
    interface: "nvme",
    radiusMiles: 40,
    maxPrice: 250,
    limit: 20,
  });
  const ranked = rankDeals(VERIFIED_SSD_DEALS, criteria, NOW);
  assert.equal(ranked.length >= 2, true);
  assert.equal(ranked[0].source, "craigslist");
  assert.equal(ranked[0].effectivePrice, 100);
  assert.equal(ranked[0].distance_miles <= 40, true);
  assert.equal(ranked[0].warnings.includes("$100 minimum purchase"), true);
  assert.equal(ranked.some((deal) => deal.source === "bestbuy" && deal.effectivePrice <= 150), true);
  assert.equal(ranked.every((deal) => new Date(deal.expires_at) > NOW), true);
});

test("the SQL seed contains every verified fixture and preserves pricing constraints", async () => {
  const { VERIFIED_SSD_DEALS } = await loadFixtures();
  const sql = await readFile(new URL("../supabase/seeds/001_verified_ssd_deals.sql", import.meta.url), "utf8");
  for (const deal of VERIFIED_SSD_DEALS) {
    assert.match(sql, new RegExp(deal.source_listing_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(sql, /minimum_purchase/);
  assert.match(sql, /100\.00/);
  assert.match(sql, /on conflict \(source, source_listing_id\) do update/i);
  assert.doesNotMatch(sql, /private_deal_search_owner_token/i);
});
