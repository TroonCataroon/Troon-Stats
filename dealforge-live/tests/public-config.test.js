import assert from "node:assert/strict";
import test from "node:test";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/public-config.js";

test("DealForge has safe public Supabase runtime defaults", () => {
  assert.equal(SUPABASE_URL, "https://hdpwlspschpqimgszagb.supabase.co");
  assert.match(SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/);
});
