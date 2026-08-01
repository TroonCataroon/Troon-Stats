import test from "node:test";
import assert from "node:assert/strict";
import { buildRestUrl, parseOAuthHash } from "../lib/supabase-rest.js";

test("REST URL encodes filters and ordering", () => {
  const url = buildRestUrl("https://abc.supabase.co", "watchlist", {
    select: "*",
    user_id: "eq.user-1",
    order: "created_at.desc",
  });
  assert.equal(
    url,
    "https://abc.supabase.co/rest/v1/watchlist?select=*&user_id=eq.user-1&order=created_at.desc",
  );
});

test("OAuth hash parser returns a normalized session", () => {
  const session = parseOAuthHash(
    "#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer",
    1000,
  );
  assert.equal(session.access_token, "abc");
  assert.equal(session.refresh_token, "def");
  assert.equal(session.expires_at, 4600);
});
