import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAuthSettings } from "../lib/auth-settings.js";
test("auth settings summary exposes only provider booleans", () => {
  assert.deepEqual(summarizeAuthSettings({ external: { email: true, google: false }, disable_signup: false, secret: "hidden" }), {
    emailMagicLinkEnabled: true,
    googleEnabled: false,
    signupDisabled: false,
  });
});
