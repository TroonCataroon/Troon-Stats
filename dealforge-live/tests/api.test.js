import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../api/index.js";
import configHandler from "../api/config.js";

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

function withCleanEnvironment(callback) {
  const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("gateway status is public but reports missing secure configuration", async () => {
  await withCleanEnvironment(async () => {
    const response = responseRecorder();
    await gateway({ method: "GET", query: {}, headers: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.authentication.status, "configuration-required");
    assert.equal(response.body.sources.gsa.status, "live");
    assert.equal(response.body.sources.ebay.status, "credentials-required");
  });
});

test("live source searches fail closed when authentication is not configured", async () => {
  await withCleanEnvironment(async () => {
    const response = responseRecorder();
    await gateway({ method: "GET", query: { source: "gsa", q: "laptop" }, headers: {} }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.authentication, "required");
  });
});

test("public configuration endpoint never exposes secret provider credentials", async () => {
  const previous = process.env.EBAY_CLIENT_SECRET;
  process.env.EBAY_CLIENT_SECRET = "secret-value";
  const response = responseRecorder();
  configHandler({ method: "GET" }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.stringify(response.body).includes("secret-value"), false);
  if (previous === undefined) delete process.env.EBAY_CLIENT_SECRET;
  else process.env.EBAY_CLIENT_SECRET = previous;
});
