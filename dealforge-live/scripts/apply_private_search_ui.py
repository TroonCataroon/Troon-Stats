from pathlib import Path
import re
import textwrap

app = Path("web/app.js")
text = app.read_text()

import_line = 'import { SupabaseRestClient } from "/lib/supabase-rest.js";'
if import_line not in text:
    raise SystemExit("Supabase import marker missing")
text = text.replace(
    import_line,
    import_line + '\nimport { clearPrivateAccessToken, importPrivateAccessFromHash, privateAuthorizationHeader } from "/lib/private-access.js";',
    1,
)

state_line = "  compare: [],"
if state_line not in text:
    raise SystemExit("State marker missing")
state_block = textwrap.dedent(
    """\
  compare: [],
  privateDeals: {
    token: null,
    busy: false,
    message: null,
    listings: [],
    search: {
      query: "m.2 ssd 1 tb",
      capacityGb: "1000",
      interface: "nvme",
      radiusMiles: "40",
      maxPrice: "250",
    },
  },"""
)
text = text.replace(state_line, state_block, 1)

source_line = "    state.sources = buildSourceStatus(gateway.sources ?? {});"
if source_line not in text:
    raise SystemExit("Boot source marker missing")
text = text.replace(source_line, source_line + "\n    state.privateDeals.token = importPrivateAccessFromHash();", 1)

route_line = '    const initialRoute = window.location.hash.replace(/^#/, "");'
if route_line not in text:
    raise SystemExit("Initial route marker missing")
boot_search = textwrap.dedent(
    """\
    if (!state.user && state.privateDeals.token) {
      try {
        await fetchPrivateDeals();
      } catch (error) {
        state.privateDeals.message = errorMessage(error);
      }
    }

"""
)
text = text.replace(route_line, boot_search + route_line, 1)

signed_out_pattern = re.compile(
    r"  if \(state\.accessDenied\) \{.*?\n  if \(!state\.user\) \{.*?\n  \}\n\n  refreshListingIndex\(\);",
    re.S,
)
signed_out = textwrap.dedent(
    """\
  if (!state.user) {
    app.innerHTML = `
      <main class="private-search-shell">
        <section class="private-search-card">
          <div class="brand-mark">D</div>
          <div class="eyebrow">Owner-only deal intelligence</div>
          <h1>Find the deal. Count the real cost.</h1>
          <p>This search is private to the owner link stored on this browser. It does not expose your workspace or allow public searches.</p>
          ${renderPrivateDealFinder()}
          <div class="workspace-lock">
            <strong>Private workspace editing remains locked.</strong>
            <p>${state.accessDenied ? "The authenticated workspace already has a different owner session." : "Deal search works independently while the Supabase sign-in provider remains unavailable."}</p>
          </div>
        </section>
      </main>`;
    return;
  }

  refreshListingIndex();"""
)
text, count = signed_out_pattern.subn(lambda _match: signed_out, text, count=1)
if count != 1:
    raise SystemExit("Signed-out render block did not match")

render_marker = "function renderSetupRequired() {"
if render_marker not in text:
    raise SystemExit("renderSetupRequired marker missing")
render_functions = textwrap.dedent(
    """\
function renderPrivateDealFinder() {
  if (!state.privateDeals.token) {
    return `<div class="callout private-access-required"><strong>Private access link required.</strong><p>Open the owner-only DealForge link on this device. No search data is publicly readable.</p></div>`;
  }
  const search = state.privateDeals.search;
  return `
    <form id="private-deal-search-form" class="private-search-form">
      <div class="field private-query"><label for="private-query">Search</label><input class="input" id="private-query" name="query" value="${escapeAttr(search.query)}" required></div>
      <div class="field"><label>Capacity (GB)</label><input class="input" name="capacityGb" type="number" min="1" value="${escapeAttr(search.capacityGb)}"></div>
      <div class="field"><label>Interface</label><input class="input" name="interface" value="${escapeAttr(search.interface)}"></div>
      <div class="field"><label>Radius (miles)</label><input class="input" name="radiusMiles" type="number" min="1" max="500" value="${escapeAttr(search.radiusMiles)}"></div>
      <div class="field"><label>Maximum effective spend</label><input class="input" name="maxPrice" type="number" min="0" value="${escapeAttr(search.maxPrice)}"></div>
      <div class="field private-location"><label>Search center</label><input class="input" value="Burien, WA" readonly></div>
      <div class="private-search-actions"><button class="button primary" type="submit" ${state.privateDeals.busy ? "disabled" : ""}>${state.privateDeals.busy ? "Searching…" : "Search private deals"}</button><button class="button ghost" type="button" data-action="clear-private-access">Remove private access from this browser</button></div>
    </form>
    ${state.privateDeals.message ? `<div class="callout error-callout">${escapeHtml(state.privateDeals.message)}</div>` : ""}
    ${renderPrivateDealResults()}`;
}

function renderPrivateDealResults() {
  if (state.privateDeals.busy) return `<div class="empty"><strong>Searching verified snapshots…</strong><p>Checking current private deal evidence.</p></div>`;
  if (!state.privateDeals.listings.length) return `<div class="empty"><strong>No matching private deals loaded.</strong><p>Run the default 1TB M.2 NVMe search.</p></div>`;
  return `<div class="private-results"><div class="section-head"><div><h2>Best private matches</h2><p>${state.privateDeals.listings.length} source-backed results</p></div></div><div class="grid">${state.privateDeals.listings.map(renderPrivateDealCard).join("")}</div></div>`;
}

function renderPrivateDealCard(listing) {
  const warnings = Array.isArray(listing.warnings) ? listing.warnings : [];
  const advertised = Number(listing.item_price) + Number(listing.shipping_cost || 0);
  const distance = Number.isFinite(Number(listing.distance_miles)) ? `${Number(listing.distance_miles).toFixed(1)} miles from Burien` : "Shipped alternative";
  return `<article class="listing-card private-deal-card">
    <div class="card-top"><div><span class="source-chip">${escapeHtml(listing.source)}</span><h3>${escapeHtml(listing.title)}</h3></div><div class="price">${formatMoney(listing.effectivePrice)}</div></div>
    <div class="private-evidence-grid">
      <div><span>Advertised price</span><strong>${formatMoney(advertised)}</strong></div>
      <div><span>Effective spend</span><strong>${formatMoney(listing.effectivePrice)}</strong></div>
      <div><span>Location</span><strong>${escapeHtml(distance)}</strong></div>
      <div><span>Observed</span><strong>${escapeHtml(formatDate(listing.observed_at))}</strong></div>
      <div><span>Hardware</span><strong>${escapeHtml(`${listing.capacity_gb ?? "?"}GB ${listing.form_factor ?? ""} ${listing.interface ?? ""}`.trim())}</strong></div>
      <div><span>Condition</span><strong>${escapeHtml(listing.condition ?? "unknown")}</strong></div>
    </div>
    <div class="private-warning-list"><strong>Warnings</strong>${warnings.length ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : `<p>None recorded.</p>`}</div>
    ${listing.url ? `<a class="button small ghost" href="${escapeAttr(listing.url)}" target="_blank" rel="noopener noreferrer">Open source</a>` : ""}
  </article>`;
}

"""
)
text = text.replace(render_marker, render_functions + render_marker, 1)

click_marker = '    if (action === "sign-out") {'
if click_marker not in text:
    raise SystemExit("handleClick marker missing")
clear_block = textwrap.dedent(
    """\
    if (action === "clear-private-access") {
      clearPrivateAccessToken();
      state.privateDeals.token = null;
      state.privateDeals.listings = [];
      state.privateDeals.message = null;
      render();
      return;
    }
"""
)
text = text.replace(click_marker, clear_block + click_marker, 1)

submit_marker = '    if (form.id === "magic-link-form") return await requestMagicLink(new FormData(form));'
if submit_marker not in text:
    raise SystemExit("handleSubmit marker missing")
text = text.replace(
    submit_marker,
    '    if (form.id === "private-deal-search-form") return await runPrivateDealSearch(new FormData(form));\n' + submit_marker,
    1,
)

request_marker = "async function requestMagicLink(formData) {"
if request_marker not in text:
    raise SystemExit("requestMagicLink marker missing")
search_functions = textwrap.dedent(
    """\
async function fetchPrivateDeals() {
  const search = state.privateDeals.search;
  const query = new URLSearchParams({
    q: search.query,
    capacityGb: search.capacityGb,
    interface: search.interface,
    radiusMiles: search.radiusMiles,
    maxPrice: search.maxPrice,
    limit: "20",
  });
  const response = await fetch(`/api/deals?${query}`, {
    headers: privateAuthorizationHeader(state.privateDeals.token),
  });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearPrivateAccessToken();
      state.privateDeals.token = null;
      state.privateDeals.listings = [];
    }
    throw new Error(body.error || `Private search failed with ${response.status}.`);
  }
  state.privateDeals.listings = Array.isArray(body.listings) ? body.listings : [];
  state.privateDeals.message = null;
}

async function runPrivateDealSearch(formData) {
  state.privateDeals.search = {
    query: String(formData.get("query") || "").trim(),
    capacityGb: String(formData.get("capacityGb") || "").trim(),
    interface: String(formData.get("interface") || "").trim(),
    radiusMiles: String(formData.get("radiusMiles") || "").trim(),
    maxPrice: String(formData.get("maxPrice") || "").trim(),
  };
  state.privateDeals.busy = true;
  state.privateDeals.message = null;
  render();
  try {
    await fetchPrivateDeals();
  } catch (error) {
    state.privateDeals.message = errorMessage(error);
  } finally {
    state.privateDeals.busy = false;
    render();
  }
}

"""
)
text = text.replace(request_marker, search_functions + request_marker, 1)
app.write_text(text)

styles = Path("web/styles.css")
css = styles.read_text()
if ".private-search-shell" not in css:
    css += textwrap.dedent(
        """\

.private-search-shell { min-height: 100vh; padding: clamp(18px, 4vw, 48px); display: grid; place-items: start center; }
.private-search-card { width: min(1120px, 100%); background: rgba(13, 27, 21, .95); border: 1px solid var(--line); border-radius: 28px; padding: clamp(24px, 5vw, 48px); box-shadow: var(--shadow); }
.private-search-card > h1 { font-size: clamp(38px, 7vw, 68px); line-height: .95; margin: 18px 0; letter-spacing: -.05em; }
.private-search-card > p, .workspace-lock p { color: var(--muted); line-height: 1.65; }
.private-search-form { display: grid; grid-template-columns: minmax(220px, 2fr) repeat(4, minmax(120px, 1fr)); gap: 12px; margin: 28px 0 20px; }
.private-location { grid-column: 1 / 2; }
.private-search-actions { grid-column: 2 / -1; display: flex; gap: 10px; align-items: end; }
.private-results { margin-top: 24px; }
.private-evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.private-evidence-grid div { display: grid; gap: 3px; padding: 9px; border-radius: 10px; background: #102119; }
.private-evidence-grid span { color: var(--muted); font-size: 11px; }
.private-evidence-grid strong { font-size: 13px; }
.private-warning-list { color: var(--warn); font-size: 12px; line-height: 1.5; }
.private-warning-list ul { margin: 6px 0 0; padding-left: 18px; }
.workspace-lock { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--line); }
.private-access-required { margin-top: 24px; }
@media (max-width: 900px) {
  .private-search-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .private-query, .private-location, .private-search-actions { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .private-search-form { grid-template-columns: 1fr; }
  .private-search-actions { display: grid; }
  .private-evidence-grid { grid-template-columns: 1fr; }
}
"""
    )
styles.write_text(css)
