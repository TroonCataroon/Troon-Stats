import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const appSource = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
test("signed-out workspace uses an email magic-link form", () => {
  assert.match(appSource, /id="magic-link-form"/);
  assert.match(appSource, /type="email"/);
  assert.match(appSource, /Email me a sign-in link/);
  assert.doesNotMatch(appSource, /signInWithGoogle/);
  assert.doesNotMatch(appSource, /Continue with Google/);
});
test("access-denied copy directs the owner to the authorized email", () => {
  assert.match(appSource, /authorized email address/);
  assert.doesNotMatch(appSource, /Google account that claimed/);
});
