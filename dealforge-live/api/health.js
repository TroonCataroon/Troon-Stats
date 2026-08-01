import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/public-config.js";

export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }
  const checks = {
    supabaseUrl: Boolean(SUPABASE_URL),
    supabasePublishableKey: Boolean(SUPABASE_PUBLISHABLE_KEY),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseServiceRoleRequired: false,
    gsaApiKey: Boolean(process.env.GSA_AUCTIONS_API_KEY),
    ebayClientId: Boolean(process.env.EBAY_CLIENT_ID),
    ebayClientSecret: Boolean(process.env.EBAY_CLIENT_SECRET),
  };
  const coreReady = checks.supabaseUrl && checks.supabasePublishableKey;
  response.setHeader("Cache-Control", "no-store");
  return response.status(coreReady ? 200 : 503).json({
    service: "DealForge",
    status: coreReady ? "ready" : "configuration-required",
    checks,
    generatedAt: new Date().toISOString(),
  });
}
