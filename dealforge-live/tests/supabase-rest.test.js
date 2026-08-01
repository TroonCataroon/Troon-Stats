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

test("magic-link sign-in posts a normalized email and redirect URL", async () => {
  const calls = [];
  const client = new (await import("../lib/supabase-rest.js")).SupabaseRestClient({
    url: "https://abc.supabase.co",
    publishableKey: "publishable-key",
    storage: null,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const result = await client.signInWithMagicLink("  Owner@Example.com  ", "https://dealforge.example/auth");
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://abc.supabase.co/auth/v1/otp?redirect_to=https%3A%2F%2Fdealforge.example%2Fauth");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.apikey, "publishable-key");
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: "owner@example.com", create_user: true });
});

test("magic-link sign-in rejects an invalid email without sending a request", async () => {
  let called = false;
  const client = new (await import("../lib/supabase-rest.js")).SupabaseRestClient({
    url: "https://abc.supabase.co",
    publishableKey: "publishable-key",
    storage: null,
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });
  await assert.rejects(() => client.signInWithMagicLink("not-an-email"), /valid email/i);
  assert.equal(called, false);
});
