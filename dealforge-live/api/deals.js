import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/public-config.js";
import { normalizeDealQuery, rankDeals } from "../lib/deal-search.js";

function requestSearchParams(request) {
  const protocol = String(request.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(request.headers?.host || "dealforge.local");
  return new URL(String(request.url || "/api/deals"), `${protocol}://${host}`).searchParams;
}

function ownerToken(request) {
  const header = String(request.headers?.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (token.length < 32 || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  return token;
}

function parseOptionalNumber(params, name, minimum, maximum, integer = false) {
  const raw = params.get(name);
  if (raw === null || raw === "") return { value: null };
  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < minimum || value > maximum) {
    return { error: `${name} must be ${integer ? "an integer" : "a number"} from ${minimum} to ${maximum}.` };
  }
  return { value };
}

function applyHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function normalizeRpcBody(value) {
  if (Array.isArray(value)) return value[0] ?? {};
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === "object" ? value : {};
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export function createDealsHandler({ fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  return async function dealsHandler(request, response) {
    applyHeaders(response);
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return response.status(405).json({ error: "Method not allowed" });
    }

    const accessToken = ownerToken(request);
    if (!accessToken) {
      return response.status(401).json({ error: "Private access is required." });
    }

    const params = requestSearchParams(request);
    const q = String(params.get("q") || "").replace(/[<>\u0000-\u001F]/g, "").trim().slice(0, 120);
    if (!q) return response.status(400).json({ error: "A search query is required." });

    const fields = {
      capacityGb: parseOptionalNumber(params, "capacityGb", 1, 100000, true),
      radiusMiles: parseOptionalNumber(params, "radiusMiles", 1, 500),
      maxPrice: parseOptionalNumber(params, "maxPrice", 0, 100000),
      limit: parseOptionalNumber(params, "limit", 1, 50, true),
    };
    const validationError = Object.values(fields).find((field) => field.error)?.error;
    if (validationError) return response.status(400).json({ error: validationError });

    const criteria = normalizeDealQuery({
      q,
      capacityGb: fields.capacityGb.value,
      formFactor: params.get("formFactor") || "",
      interface: params.get("interface") || "",
      radiusMiles: fields.radiusMiles.value,
      maxPrice: fields.maxPrice.value,
      limit: fields.limit.value ?? 20,
    });

    try {
      const upstream = await fetchImpl(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/private_deal_search`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_access_token: accessToken }),
        signal: AbortSignal.timeout(10_000),
      });
      const rawBody = await readJson(upstream);
      if (!upstream.ok) {
        console.error("Private deal RPC failed", upstream.status);
        return response.status(503).json({ error: "Private deal search is temporarily unavailable." });
      }

      const rpcBody = normalizeRpcBody(rawBody);
      if (rpcBody.authorized !== true) {
        return response.status(403).json({ error: "This owner token is not authorized." });
      }

      const snapshots = Array.isArray(rpcBody.snapshots) ? rpcBody.snapshots : [];
      const listings = rankDeals(snapshots, criteria, now());
      return response.status(200).json({
        dataMode: "verified-private-snapshots",
        dataPolicy: "real-or-empty",
        query: criteria.q,
        filters: {
          capacityGb: criteria.capacityGb,
          formFactor: criteria.formFactor,
          interface: criteria.interface,
          radiusMiles: criteria.radiusMiles,
          maxPrice: criteria.maxPrice,
          limit: criteria.limit,
        },
        returnedCount: listings.length,
        listings,
        generatedAt: now().toISOString(),
      });
    } catch (error) {
      console.error("Private deal search unavailable", error instanceof Error ? error.name : "unknown");
      return response.status(503).json({ error: "Private deal search is temporarily unavailable." });
    }
  };
}

export default createDealsHandler();
