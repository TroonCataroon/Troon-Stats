import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/public-config.js";

export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = SUPABASE_URL;
  const publishableKey = SUPABASE_PUBLISHABLE_KEY;
  response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.status(200).json({
    appName: "DealForge",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "development",
    supabaseUrl,
    supabasePublishableKey: publishableKey,
    authConfigured: Boolean(supabaseUrl && publishableKey),
    authProvider: "google",
    databaseMode: supabaseUrl && publishableKey ? "supabase" : "configuration-required",
  });
}
