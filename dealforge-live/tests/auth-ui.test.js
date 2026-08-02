import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

test("legacy email magic-link client remains available without Google OAuth", () => {
  assert.match(appSource, /id="magic-link-form"/);
  assert.match(appSource, /type="email"/);
  assert.match(appSource, /Email me a sign-in link/);
  assert.doesNotMatch(appSource, /signInWithGoogle/);
  assert.doesNotMatch(appSource, /Continue with Google/);
});

test("signed-out deal search is gated by the private owner link", () => {
  assert.match(appSource, /Private access link required/);
  assert.match(appSource, /owner-only DealForge link/);
  assert.doesNotMatch(appSource, /Google account that claimed/);
});
