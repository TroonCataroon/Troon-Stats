const STORAGE_KEY = "dealforge.private.access";

export function normalizePrivateAccessToken(value) {
  const token = String(value ?? "").trim();
  if (token.length < 32 || token.length > 256) return null;
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : null;
}

export function getPrivateAccessToken(storage = globalThis.localStorage) {
  try {
    return normalizePrivateAccessToken(storage?.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearPrivateAccessToken(storage = globalThis.localStorage) {
  try { storage?.removeItem(STORAGE_KEY); } catch {}
}

export function importPrivateAccessFromHash({
  hash = globalThis.location?.hash ?? "",
  storage = globalThis.localStorage,
  history = globalThis.history,
  location = globalThis.location,
} = {}) {
  const text = String(hash ?? "");
  const params = new URLSearchParams(text.replace(/^#/, ""));
  if (!params.has("access")) return getPrivateAccessToken(storage);

  const token = normalizePrivateAccessToken(params.get("access"));
  try {
    if (token) storage?.setItem(STORAGE_KEY, token);
    else storage?.removeItem(STORAGE_KEY);
  } catch {}

  if (history && location) {
    history.replaceState({}, "", `${location.pathname || "/"}${location.search || ""}`);
  }
  return token;
}

export function privateAuthorizationHeader(value) {
  const token = normalizePrivateAccessToken(value);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
