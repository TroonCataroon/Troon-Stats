import test from "node:test";
import assert from "node:assert/strict";

async function loadPrivateAccess() {
  return import("../lib/private-access.js").catch(() => ({}));
}

function storageFixture() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const TOKEN = "owner_link_token_0123456789_abcdef_ABCDEFG";

test("imports a valid owner token from the URL fragment, stores it, and clears the fragment", async () => {
  const { importPrivateAccessFromHash, getPrivateAccessToken } = await loadPrivateAccess();
  assert.equal(typeof importPrivateAccessFromHash, "function");
  const storage = storageFixture();
  const replacements = [];
  const token = importPrivateAccessFromHash({
    hash: `#access=${TOKEN}`,
    storage,
    history: { replaceState(_state, _title, url) { replacements.push(url); } },
    location: { pathname: "/", search: "?view=deals" },
  });
  assert.equal(token, TOKEN);
  assert.equal(getPrivateAccessToken(storage), TOKEN);
  assert.deepEqual(replacements, ["/?view=deals"]);
});

test("rejects malformed fragments and does not store them", async () => {
  const { importPrivateAccessFromHash, getPrivateAccessToken } = await loadPrivateAccess();
  const storage = storageFixture();
  const replacements = [];
  const token = importPrivateAccessFromHash({
    hash: "#access=short",
    storage,
    history: { replaceState(_state, _title, url) { replacements.push(url); } },
    location: { pathname: "/", search: "" },
  });
  assert.equal(token, null);
  assert.equal(getPrivateAccessToken(storage), null);
  assert.deepEqual(replacements, ["/"]);
});

test("uses a stored owner token when the URL has no access fragment", async () => {
  const { importPrivateAccessFromHash, getPrivateAccessToken } = await loadPrivateAccess();
  const storage = storageFixture();
  storage.setItem("dealforge.private.access", TOKEN);
  const token = importPrivateAccessFromHash({
    hash: "#discover",
    storage,
    history: { replaceState() { throw new Error("unrelated fragment must not be cleared"); } },
    location: { pathname: "/", search: "" },
  });
  assert.equal(token, TOKEN);
  assert.equal(getPrivateAccessToken(storage), TOKEN);
});

test("builds an Authorization header without exposing the token elsewhere", async () => {
  const { privateAuthorizationHeader } = await loadPrivateAccess();
  assert.deepEqual(privateAuthorizationHeader(TOKEN), { Authorization: `Bearer ${TOKEN}` });
  assert.deepEqual(privateAuthorizationHeader("short"), {});
});

test("clears the private owner token", async () => {
  const { clearPrivateAccessToken, getPrivateAccessToken } = await loadPrivateAccess();
  const storage = storageFixture();
  storage.setItem("dealforge.private.access", TOKEN);
  clearPrivateAccessToken(storage);
  assert.equal(getPrivateAccessToken(storage), null);
});