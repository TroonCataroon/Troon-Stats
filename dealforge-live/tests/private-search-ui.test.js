import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

function privateCardSource() {
  const start = appSource.indexOf("function renderPrivateDealCard");
  const end = appSource.indexOf("function ", start + 20);
  return start >= 0 ? appSource.slice(start, end > start ? end : undefined) : "";
}

test("signed-out DealForge requires the private owner link before searching", () => {
  assert.match(appSource, /Private access link required/);
  assert.match(appSource, /importPrivateAccessFromHash/);
  assert.match(appSource, /privateAuthorizationHeader/);
});

test("private search state and form bind the requested Burien 1TB M.2 NVMe defaults", () => {
  assert.match(appSource, /id="private-deal-search-form"/);
  assert.match(appSource, /query:\s*"m\.2 ssd 1 tb"/);
  assert.match(appSource, /capacityGb:\s*"1000"/);
  assert.match(appSource, /interface:\s*"nvme"/);
  assert.match(appSource, /radiusMiles:\s*"40"/);
  assert.match(appSource, /value="\$\{escapeAttr\(search\.query\)\}"/);
  assert.match(appSource, /value="\$\{escapeAttr\(search\.capacityGb\)\}"/);
  assert.match(appSource, /value="\$\{escapeAttr\(search\.interface\)\}"/);
  assert.match(appSource, /value="\$\{escapeAttr\(search\.radiusMiles\)\}"/);
  assert.match(appSource, /Burien, WA/);
});

test("private searches call the owner-only API with an Authorization header", () => {
  assert.match(appSource, /fetch\(`\/api\/deals\?\$\{query\}`/);
  assert.match(appSource, /headers:\s*privateAuthorizationHeader/);
});

test("private result cards expose evidence and no workspace write actions", () => {
  const source = privateCardSource();
  assert.notEqual(source, "");
  assert.match(source, /Advertised price/);
  assert.match(source, /Effective spend/);
  assert.match(source, /Observed/);
  assert.match(source, /Warnings/);
  assert.match(source, /Open source/);
  assert.doesNotMatch(source, /data-action=/);
  assert.doesNotMatch(source, /watchlist/i);
  assert.doesNotMatch(source, /compare/i);
});

test("private token is never rendered into HTML", () => {
  assert.doesNotMatch(appSource, /escapeHtml\(state\.privateDeals\.token/);
  assert.doesNotMatch(appSource, /escapeAttr\(state\.privateDeals\.token/);
  assert.doesNotMatch(appSource, /localStorage\.getItem\([^)]*\).*innerHTML/s);
});