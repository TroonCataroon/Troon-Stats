const SESSION_KEY = "dealforge.auth.session";

function normalizeBaseUrl(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

export function buildRestUrl(baseUrl, table, query = {}) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/rest/v1/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function parseOAuthHash(hash, nowSeconds = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
  const accessToken = params.get("access_token");
  if (!accessToken) return null;
  const expiresIn = Number(params.get("expires_in") || 3600);
  return {
    access_token: accessToken,
    refresh_token: params.get("refresh_token"),
    token_type: params.get("token_type") || "bearer",
    expires_at: nowSeconds + (Number.isFinite(expiresIn) ? expiresIn : 3600),
  };
}

function readStoredSession(storage) {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(storage, session) {
  if (!storage) return;
  if (!session) storage.removeItem(SESSION_KEY);
  else storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export class SupabaseRestClient {
  constructor({ url, publishableKey, storage = globalThis.localStorage, fetchImpl = globalThis.fetch } = {}) {
    this.url = normalizeBaseUrl(url);
    this.publishableKey = String(publishableKey ?? "");
    this.storage = storage;
    this.fetchImpl = fetchImpl;
    this.session = readStoredSession(storage);
  }

  get configured() {
    return Boolean(this.url && this.publishableKey);
  }

  async initialize(hash = globalThis.location?.hash ?? "") {
    const fromHash = parseOAuthHash(hash);
    if (fromHash) {
      this.setSession(fromHash);
      if (globalThis.history && globalThis.location) {
        globalThis.history.replaceState({}, "", `${globalThis.location.pathname}${globalThis.location.search}`);
      }
    }
    if (this.session?.refresh_token && this.session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
      await this.refreshSession();
    }
    return this.session;
  }

  setSession(session) {
    this.session = session;
    writeStoredSession(this.storage, session);
  }

  async signInWithGoogle(redirectTo = globalThis.location?.origin) {
    if (!this.configured) throw new Error("Supabase authentication is not configured.");
    const url = new URL(`${this.url}/auth/v1/authorize`);
    url.searchParams.set("provider", "google");
    if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
    globalThis.location.assign(url.toString());
  }

  async refreshSession() {
    if (!this.session?.refresh_token) return null;
    const response = await this.fetchImpl(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: this.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: this.session.refresh_token }),
    });
    const body = await readBody(response);
    if (!response.ok) {
      this.setSession(null);
      throw new Error(body?.msg || body?.error_description || "Session refresh failed.");
    }
    const session = {
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? this.session.refresh_token,
      token_type: body.token_type ?? "bearer",
      expires_at: Math.floor(Date.now() / 1000) + Number(body.expires_in ?? 3600),
    };
    this.setSession(session);
    return session;
  }

  async getAccessToken() {
    if (!this.session) return null;
    if (this.session.expires_at <= Math.floor(Date.now() / 1000) + 60) await this.refreshSession();
    return this.session?.access_token ?? null;
  }

  async getUser() {
    const token = await this.getAccessToken();
    if (!token) return null;
    const response = await this.fetchImpl(`${this.url}/auth/v1/user`, {
      headers: this.headers(token),
    });
    const body = await readBody(response);
    if (!response.ok) {
      if (response.status === 401) this.setSession(null);
      throw new Error(body?.msg || "Unable to load the authenticated user.");
    }
    return body;
  }

  async signOut() {
    const token = await this.getAccessToken();
    if (token) {
      await this.fetchImpl(`${this.url}/auth/v1/logout`, {
        method: "POST",
        headers: this.headers(token),
      }).catch(() => {});
    }
    this.setSession(null);
  }

  headers(token, extra = {}) {
    return {
      apikey: this.publishableKey,
      Authorization: `Bearer ${token}`,
      ...extra,
    };
  }

  async rest(table, { method = "GET", query = {}, body, prefer } = {}) {
    const token = await this.getAccessToken();
    if (!token) throw new Error("Authentication is required.");
    const response = await this.fetchImpl(buildRestUrl(this.url, table, query), {
      method,
      headers: this.headers(token, {
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await readBody(response);
    if (!response.ok) throw new Error(result?.message || result?.hint || `Database request failed with ${response.status}.`);
    return result;
  }

  async rpc(name, body = {}) {
    const token = await this.getAccessToken();
    if (!token) throw new Error("Authentication is required.");
    const response = await this.fetchImpl(`${this.url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: this.headers(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const result = await readBody(response);
    if (!response.ok) throw new Error(result?.message || `RPC ${name} failed with ${response.status}.`);
    return result;
  }
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
