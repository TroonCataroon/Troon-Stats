import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "dist/index.html",
  "dist/app.js",
  "dist/styles.css",
  "dist/lib/scoring.js",
  "dist/lib/private-access.js",
  "api/index.js",
  "api/config.js",
  "api/deals.js",
  "lib/private-access.js",
  "supabase/migrations/001_dealforge.sql",
  "supabase/migrations/002_magic_link_owner_identity.sql",
  "supabase/migrations/003_private_deal_snapshots.sql",
];
for (const path of required) await access(resolve(root, path));

const html = await readFile(resolve(root, "dist/index.html"), "utf8");
const app = await readFile(resolve(root, "dist/app.js"), "utf8");
const privateAccess = await readFile(resolve(root, "lib/private-access.js"), "utf8");
const privateApi = await readFile(resolve(root, "api/deals.js"), "utf8");
const privateMigration = await readFile(
  resolve(root, "supabase/migrations/003_private_deal_snapshots.sql"),
  "utf8",
);

if (!html.includes('src="/app.js"')) throw new Error("Built HTML does not load the application.");
if (app.includes("cdn.jsdelivr.net")) throw new Error("Application still depends on the broken GitHub CDN loader.");
if (!app.includes("claim_app_owner")) throw new Error("Single-owner authentication gate is missing.");
if (!app.includes("magic-link-form")) throw new Error("Email magic-link sign-in form is missing.");
if (app.includes("signInWithGoogle")) throw new Error("Legacy Google OAuth sign-in is still present.");
if (!app.includes("private-deal-search-form")) throw new Error("Owner-only private deal search form is missing.");
if (!app.includes("privateAuthorizationHeader")) throw new Error("Private search Authorization header wiring is missing.");
if (!privateAccess.includes("dealforge.private.access")) throw new Error("Private access token storage contract is missing.");
if (!privateApi.includes("rpc/private_deal_search")) throw new Error("Guarded private deal RPC call is missing.");
if (!privateApi.includes("return response.status(401)")) throw new Error("Private API missing unauthenticated rejection.");
if (!privateApi.includes("return response.status(403)")) throw new Error("Private API missing unauthorized-token rejection.");
if (!privateMigration.includes("force row level security")) throw new Error("Private snapshots do not force RLS.");
if (!privateMigration.includes("revoke all on public.deal_snapshots from public, anon, authenticated")) {
  throw new Error("Private snapshot table grants are not revoked.");
}
if (!privateMigration.includes("extensions.digest(p_access_token")) {
  throw new Error("Private token hash does not schema-qualify pgcrypto.");
}
console.log("DealForge smoke checks passed.");
