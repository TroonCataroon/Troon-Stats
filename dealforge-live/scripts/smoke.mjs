import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "dist/index.html",
  "dist/app.js",
  "dist/styles.css",
  "dist/lib/scoring.js",
  "api/index.js",
  "api/config.js",
  "supabase/migrations/001_dealforge.sql",
  "supabase/migrations/002_magic_link_owner_identity.sql",
];
for (const path of required) await access(resolve(root, path));
const html = await readFile(resolve(root, "dist/index.html"), "utf8");
const app = await readFile(resolve(root, "dist/app.js"), "utf8");
if (!html.includes('src="/app.js"')) throw new Error("Built HTML does not load the application.");
if (app.includes("cdn.jsdelivr.net")) throw new Error("Application still depends on the broken GitHub CDN loader.");
if (!app.includes("claim_app_owner")) throw new Error("Single-owner authentication gate is missing.");
if (!app.includes("magic-link-form")) throw new Error("Email magic-link sign-in form is missing.");
if (app.includes("signInWithGoogle")) throw new Error("Legacy Google OAuth sign-in is still present.");
console.log("DealForge smoke checks passed.");
