import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const smoke = await readFile(new URL("../scripts/smoke.mjs", import.meta.url), "utf8");

test("deployment smoke checks cover the owner-only deal search artifacts", () => {
  assert.match(smoke, /api\/deals\.js/);
  assert.match(smoke, /lib\/private-access\.js/);
  assert.match(smoke, /supabase\/migrations\/003_private_deal_snapshots\.sql/);
  assert.match(smoke, /private-deal-search-form/);
  assert.match(smoke, /privateAuthorizationHeader/);
  assert.match(smoke, /rpc\/private_deal_search/);
});
