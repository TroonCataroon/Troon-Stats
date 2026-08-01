import test from "node:test";
import assert from "node:assert/strict";
import { parseManualImport } from "../lib/imports.js";

test("manual JSON imports normalize listing fields", () => {
  const [listing] = parseManualImport(JSON.stringify({
    title: "RTX 4070",
    price: 450,
    url: "https://example.com/item",
    source: "craigslist"
  }), "craigslist");
  assert.equal(listing.title, "RTX 4070");
  assert.equal(listing.costs.itemPrice, 450);
  assert.equal(listing.source, "craigslist");
});

test("manual CSV imports support quoted commas", () => {
  const rows = parseManualImport(
    'title,price,url\n"Monitor, 27 inch",125,https://example.com/monitor',
    "manual"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Monitor, 27 inch");
  assert.equal(rows[0].costs.itemPrice, 125);
});
