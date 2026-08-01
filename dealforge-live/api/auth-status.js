import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/public-config.js";
import { summarizeAuthSettings } from "../lib/auth-settings.js";
export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }
  try {
    const upstream = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await upstream.json();
    if (!upstream.ok) throw new Error(body?.msg || `Auth settings returned ${upstream.status}`);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ provider: "email-magic-link", ...summarizeAuthSettings(body) });
  } catch (error) {
    return response.status(502).json({ provider: "email-magic-link", error: error instanceof Error ? error.message : "Unable to inspect auth settings" });
  }
}
