import { applyListingAnalysis } from "/lib/analysis.js";
import { evaluateAlert } from "/lib/alerts.js";
import { parseManualImport } from "/lib/imports.js";
import { DealForgeRepository } from "/lib/repository.js";
import { calculateDealScore, recommendedMaximumBid } from "/lib/scoring.js";
import { normalizePreferences } from "/lib/preferences.js";
import { buildSourceStatus } from "/lib/source-status.js";
import { SupabaseRestClient } from "/lib/supabase-rest.js";

const NAV_ITEMS = [
  ["discover", "Discover"],
  ["watchlist", "Watchlist"],
  ["saved", "Saved"],
  ["compare", "Compare"],
  ["alerts", "Alerts"],
  ["imports", "Imports"],
  ["settings", "Settings"],
];

const state = {
  booting: true,
  busy: false,
  route: "discover",
  config: null,
  client: null,
  repository: null,
  user: null,
  accessDenied: false,
  sources: {},
  listings: [],
  search: { source: "all", query: "", region: "" },
  workspace: {
    watchlist: [],
    savedSearches: [],
    settings: {},
    alerts: [],
    comparisons: [],
    manualImports: [],
    alertEvents: [],
  },
  compare: [],
  message: null,
};

const app = document.querySelector("#app");
document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
window.addEventListener("hashchange", () => {
  const route = window.location.hash.replace(/^#/, "");
  if (NAV_ITEMS.some(([key]) => key === route)) {
    state.route = route;
    render();
  }
});

boot();

async function boot() {
  try {
    const [config, gateway] = await Promise.all([
      fetchJson("/api/config"),
      fetchJson("/api/index"),
    ]);
    state.config = config;
    state.sources = buildSourceStatus(gateway.sources ?? {});

    if (!config.authConfigured) {
      state.booting = false;
      render();
      return;
    }

    state.client = new SupabaseRestClient({
      url: config.supabaseUrl,
      publishableKey: config.supabasePublishableKey,
    });
    await state.client.initialize();

    if (state.client.session) {
      state.user = await state.client.getUser();
      const ownerClaimed = await state.client.rpc("claim_app_owner");
      if (ownerClaimed !== true) {
        state.accessDenied = true;
        await state.client.signOut();
        state.user = null;
      } else {
        state.repository = new DealForgeRepository(state.client);
        state.workspace = await state.repository.loadWorkspace(state.user.id);
        state.workspace.settings = normalizePreferences(state.workspace.settings);
        state.search.region = state.search.region || state.workspace.settings.defaultRegion;
        state.compare = state.workspace.comparisons?.[0]?.listings ?? [];
      }
    }

    const initialRoute = window.location.hash.replace(/^#/, "");
    if (NAV_ITEMS.some(([key]) => key === initialRoute)) state.route = initialRoute;
  } catch (error) {
    state.message = errorMessage(error);
  } finally {
    state.booting = false;
    render();
  }
}

function render() {
  if (state.booting) {
    app.innerHTML = `<main class="boot"><div class="brand-mark">D</div><div><strong>DealForge</strong><p>Starting secure workspace…</p></div></main>`;
    return;
  }
  if (!state.config?.authConfigured) {
    renderSetupRequired();
    return;
  }
  if (state.accessDenied) {
    app.innerHTML = authLayout(`
      <div class="brand-mark">D</div>
      <div class="eyebrow">Access denied</div>
      <h1>This workspace already has an owner.</h1>
      <p>DealForge is configured as a private, single-user application. Request a sign-in link using the authorized email address.</p>
      ${renderMagicLinkForm()}
    `);
    return;
  }
  if (!state.user) {
    app.innerHTML = authLayout(`
      <div class="brand-mark">D</div>
      <div class="eyebrow">Private workspace</div>
      <h1>Find the deal. Count the real cost.</h1>
      <p>Search connected public auction sources, compare landed cost, save evidence, and keep your data synchronized through Supabase.</p>
      ${state.message ? `<div class="callout ${state.message.startsWith("Check your email") ? "success-callout" : "error-callout"}">${escapeHtml(state.message)}</div>` : ""}
      ${renderMagicLinkForm()}
    `);
    return;
  }

  refreshListingIndex();
  app.innerHTML = `
    <div class="app-shell ${state.busy ? "loading" : ""}">
      ${renderSidebar()}
      <main class="main">
        ${renderHeader()}
        ${state.message ? `<div class="callout error-callout">${escapeHtml(state.message)}</div>` : ""}
        ${renderRoute()}
      </main>
      ${renderMobileNav()}
    </div>
  `;
}

function renderSetupRequired() {
  app.innerHTML = authLayout(`
    <div class="brand-mark">D</div>
    <div class="eyebrow">Configuration required</div>
    <h1>The source is repaired. The deployment still needs its secure services.</h1>
    <p>Set the following Vercel environment variables, run the included Supabase migration, and enable passwordless email authentication in Supabase Auth.</p>
    <ul class="setup-list">
      <li><code>SUPABASE_URL</code></li>
      <li><code>SUPABASE_PUBLISHABLE_KEY</code></li>
      <li><code>EBAY_CLIENT_ID</code> and <code>EBAY_CLIENT_SECRET</code> for live eBay search</li>
      <li><code>GSA_AUCTIONS_API_KEY</code> to replace the public GSA demo key</li>
    </ul>
    <div class="callout">Until Supabase is configured, DealForge intentionally refuses to store personal data or expose an unsecured private workspace.</div>
  `);
}

function renderMagicLinkForm() {
  return `
    <form id="magic-link-form" class="auth-form">
      <div class="field">
        <label for="auth-email">Email address</label>
        <input class="input" id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
      </div>
      <button class="button primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Sending…" : "Email me a sign-in link"}</button>
      <p class="auth-note">Only the preauthorized owner email can claim this private workspace.</p>
    </form>`;
}

function authLayout(content) {
  return `<main class="auth-shell"><section class="auth-card">${content}</section></main>`;
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">D</div><div><strong>DealForge</strong><span>Private intelligence</span></div></div>
      <nav class="nav">${NAV_ITEMS.map(([key, label]) => navButton(key, label)).join("")}</nav>
      <div class="sidebar-footer">
        <div class="user-line">${escapeHtml(state.user.email ?? "Signed in")}</div>
        <button class="button ghost small" data-action="sign-out">Sign out</button>
      </div>
    </aside>`;
}

function renderMobileNav() {
  return `<nav class="mobile-nav" aria-label="Application sections">${NAV_ITEMS.map(([key, label]) =>
    `<button class="${state.route === key ? "active" : ""}" data-route="${key}">${escapeHtml(label)}</button>`
  ).join("")}</nav>`;
}

function navButton(key, label) {
  const count = {
    watchlist: state.workspace.watchlist.length,
    saved: state.workspace.savedSearches.length,
    compare: state.compare.length,
    alerts: state.workspace.alerts.length,
    imports: state.workspace.manualImports.length,
  }[key];
  return `<button class="nav-button ${state.route === key ? "active" : ""}" data-route="${key}">
    <span>${escapeHtml(label)}</span>${count !== undefined ? `<span class="badge">${count}</span>` : ""}
  </button>`;
}

function renderHeader() {
  const copy = {
    discover: ["Deal intelligence", "Discover", "Search connected sources and compare actual landed cost instead of headline price."],
    watchlist: ["Persistent workspace", "Watchlist", "Saved listings stay synchronized across devices."],
    saved: ["Repeatable research", "Saved searches", "Store search criteria and rerun them without rebuilding filters."],
    compare: ["Decision support", "Compare", "Evaluate up to four listings side by side."],
    alerts: ["Evidence monitoring", "Alerts", "Persist alert rules and evaluate them against current listing evidence."],
    imports: ["User-provided evidence", "Manual imports", "Add listings from sources that do not provide an authorized public API."],
    settings: ["Defaults", "Settings", "Save mileage, discount, region, and display preferences."],
  }[state.route];
  return `<header class="page-header">
    <div><div class="eyebrow">${copy[0]}</div><h1>${copy[1]}</h1><p>${copy[2]}</p></div>
    <div class="status-row">${renderSourcePills()}</div>
  </header>`;
}

function renderSourcePills() {
  return Object.entries(state.sources).slice(0, 6).map(([key, source]) => {
    const tone = source.operational ? "live" : source.status === "credentials-required" ? "warn" : "";
    return `<span class="status-pill ${tone}">${escapeHtml(key.toUpperCase())}: ${escapeHtml(source.label)}</span>`;
  }).join("");
}

function renderRoute() {
  switch (state.route) {
    case "watchlist": return renderWatchlist();
    case "saved": return renderSavedSearches();
    case "compare": return renderCompare();
    case "alerts": return renderAlerts();
    case "imports": return renderImports();
    case "settings": return renderSettings();
    default: return renderDiscover();
  }
}

function renderDiscover() {
  return `
    <section class="panel">
      <form id="search-form" class="search-form">
        <div class="field"><label for="source">Source</label>
          <select id="source" name="source">
            ${["all", "gsa", "ebay"].map((value) => `<option value="${value}" ${state.search.source === value ? "selected" : ""}>${value === "all" ? "All connected" : value.toUpperCase()}</option>`).join("")}
          </select>
        </div>
        <div class="field query"><label for="query">Search</label><input class="input" id="query" name="query" value="${escapeAttr(state.search.query)}" placeholder="laptop, GPU, server rack…" required></div>
        <div class="field"><label for="region">State</label><input class="input" id="region" name="region" maxlength="2" value="${escapeAttr(state.search.region)}" placeholder="WA"></div>
        <div class="field submit"><label>&nbsp;</label><button class="button primary" type="submit">Search live sources</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="section-head"><div><h2>Results</h2><p>${state.listings.length ? `${state.listings.length} current and imported listings` : "Run a search to load current evidence."}</p></div>
        ${state.search.query ? `<button class="button small" data-action="open-save-search">Save search</button>` : ""}
      </div>
      ${state.listings.length ? `<div class="grid">${state.listings.map(renderListingCard).join("")}</div>` : emptyState("No results loaded", "Search GSA, eBay, or your manual imports.")}
    </section>
    ${state.search.query ? renderSaveSearchPanel() : ""}
  `;
}

function renderSaveSearchPanel() {
  return `<section class="panel" id="save-search-panel">
    <div class="section-head"><div><h2>Save current search</h2><p>Store this query in Supabase.</p></div></div>
    <form id="save-search-form" class="form-grid">
      <div class="field"><label>Name</label><input class="input" name="name" required value="${escapeAttr(state.search.query)}"></div>
      <div class="field"><label>Source</label><input class="input" value="${escapeAttr(state.search.source)}" disabled></div>
      <div class="wide"><button class="button primary" type="submit">Save search</button></div>
    </form>
  </section>`;
}

function renderListingCard(listing, options = {}) {
  const watched = state.workspace.watchlist.some((row) => row.source === listing.source && row.listing_id === listing.sourceListingId);
  const compared = state.compare.some((item) => item.id === listing.id);
  const preferences = normalizePreferences(state.workspace.settings);
  const scored = listing.estimatedMarketValue ? calculateDealScore({
    costs: listing.costs,
    estimatedMarketValue: listing.estimatedMarketValue,
    condition: listing.condition,
    riskScore: listing.riskScore,
    confidenceScore: listing.confidenceScore,
  }) : null;
  const maximumBid = scored ? recommendedMaximumBid({
    estimatedMarketValue: listing.estimatedMarketValue,
    targetDiscountPercent: preferences.targetDiscountPercent,
    shipping: listing.costs?.shipping,
    handling: listing.costs?.handling,
    travelCost: listing.costs?.travelCost,
    replacementParts: listing.costs?.replacementParts,
  }) : null;
  const price = listing.totalLandedCost ?? listing.costs?.itemPrice ?? 0;
  return `<article class="listing-card">
    <div class="card-top"><div><span class="source-chip">${escapeHtml(listing.sourceName ?? listing.source)}</span><h3>${escapeHtml(listing.title)}</h3></div><div class="price">${formatMoney(price)}</div></div>
    <div class="meta">
      <span>${escapeHtml(listing.condition ?? "unknown")}</span>
      <span>${escapeHtml(listing.location?.display ?? "Location unavailable")}</span>
      <span>${listing.auction?.endDate ? `Ends ${formatDate(listing.auction.endDate)}` : "No end date"}</span>
      <span>${scored?.score !== null && scored?.score !== undefined ? `Score ${scored.score}` : "Needs market value"}</span>
      ${maximumBid !== null ? `<span>Max bid ${formatMoney(maximumBid)}</span>` : ""}
    </div>
    ${listing.description ? `<p class="card-note">${escapeHtml(truncate(listing.description, 180))}</p>` : ""}
    <div class="card-actions">
      ${options.watchOnly || options.analysis ? "" : `<button class="button small" data-action="watch" data-id="${escapeAttr(listing.id)}" ${watched ? "disabled" : ""}>${watched ? "Watching" : "Add to watchlist"}</button>`}
      <button class="button small ghost" data-action="compare" data-id="${escapeAttr(listing.id)}">${compared ? "Remove compare" : "Compare"}</button>
      ${listing.url ? `<a class="button small ghost" href="${escapeAttr(listing.url)}" target="_blank" rel="noopener noreferrer">Open source</a>` : ""}
      ${options.removeWatch ? `<button class="button small danger" data-action="remove-watch" data-row-id="${escapeAttr(options.rowId)}">Remove</button>` : ""}
      ${options.removeImport ? `<button class="button small danger" data-action="remove-import" data-row-id="${escapeAttr(options.rowId)}">Delete import</button>` : ""}
    </div>
    ${options.analysis ? renderAnalysisForm(listing, options.rowId, preferences) : ""}
  </article>`;
}

function renderAnalysisForm(listing, rowId, preferences) {
  const costs = listing.costs ?? {};
  return `<details class="analysis-panel">
    <summary>Edit landed-cost analysis</summary>
    <form class="listing-analysis-form" data-row-id="${escapeAttr(rowId)}">
      ${analysisField("Market value", "estimatedMarketValue", listing.estimatedMarketValue)}
      ${analysisField("Item price", "itemPrice", costs.itemPrice)}
      ${analysisField("Shipping", "shipping", costs.shipping)}
      ${analysisField("Handling", "handling", costs.handling)}
      ${analysisField("Buyer premium", "buyerPremium", costs.buyerPremium)}
      ${analysisField("Taxes", "taxes", costs.taxes)}
      ${analysisField("Replacement parts", "replacementParts", costs.replacementParts)}
      ${analysisField("One-way miles", "distanceMiles", listing.analysis?.distanceMiles)}
      ${analysisField("Travel cost override", "travelCost", costs.travelCost)}
      <input type="hidden" name="mileageRate" value="${escapeAttr(preferences.mileageRate)}">
      <div class="analysis-actions"><span>Round trip uses ${formatMoney(preferences.mileageRate)} per mile unless travel cost is entered.</span><button class="button small primary" type="submit">Save analysis</button></div>
    </form>
  </details>`;
}

function analysisField(label, name, value) {
  return `<label><span>${escapeHtml(label)}</span><input class="input" type="number" min="0" step="0.01" name="${escapeAttr(name)}" value="${numberInputValue(value)}"></label>`;
}

function renderWatchlist() {
  const rows = state.workspace.watchlist;
  return `<section class="panel">
    <div class="section-head"><div><h2>Saved listings</h2><p>${rows.length} synchronized records</p></div></div>
    ${rows.length ? `<div class="grid">${rows.map((row) => renderListingCard(row.listing, { analysis: true, removeWatch: true, rowId: row.id })).join("")}</div>` : emptyState("Watchlist is empty", "Add a listing from Discover or Imports.")}
  </section>`;
}

function renderSavedSearches() {
  const rows = state.workspace.savedSearches;
  return `<section class="panel">
    <div class="section-head"><div><h2>Search library</h2><p>Reusable source and filter combinations.</p></div></div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Query</th><th>Source</th><th>Region</th><th>Actions</th></tr></thead><tbody>
      ${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.query)}</td><td>${escapeHtml(row.source)}</td><td>${escapeHtml(row.filters?.region ?? "")}</td><td>
        <button class="button small" data-action="run-saved" data-row-id="${escapeAttr(row.id)}">Run</button>
        <button class="button small danger" data-action="delete-saved" data-row-id="${escapeAttr(row.id)}">Delete</button>
      </td></tr>`).join("")}
    </tbody></table></div>` : emptyState("No saved searches", "Run a search and save it from Discover.")}
  </section>`;
}

function renderCompare() {
  return `<section class="panel">
    <div class="section-head"><div><h2>Comparison set</h2><p>${state.compare.length}/4 listings selected</p></div>
      <button class="button small" data-action="save-comparison" ${state.compare.length < 2 ? "disabled" : ""}>Save comparison</button>
    </div>
    ${state.compare.length ? `<div class="compare-grid">${state.compare.map((listing) => `
      <article class="listing-card">
        <span class="source-chip">${escapeHtml(listing.sourceName ?? listing.source)}</span><h3>${escapeHtml(listing.title)}</h3>
        ${compareMetric("Landed cost", formatMoney(listing.totalLandedCost ?? listing.costs?.itemPrice))}
        ${compareMetric("Market value", listing.estimatedMarketValue ? formatMoney(listing.estimatedMarketValue) : "unknown")}
        ${compareMetric("Condition", listing.condition ?? "unknown")}
        ${compareMetric("Risk", listing.riskScore ?? "unknown")}
        ${compareMetric("Confidence", listing.confidenceScore ?? "unknown")}
        ${compareMetric("Location", listing.location?.display ?? "unknown")}
        ${compareMetric("End", listing.auction?.endDate ? formatDate(listing.auction.endDate) : "unknown")}
        <button class="button small danger" data-action="remove-compare" data-id="${escapeAttr(listing.id)}">Remove</button>
      </article>`).join("")}</div>` : emptyState("Nothing selected", "Use Compare on any listing.")}
    ${renderSavedComparisons()}
  </section>`;
}

function renderSavedComparisons() {
  const rows = state.workspace.comparisons;
  if (!rows.length) return "";
  return `<div class="saved-block"><div class="section-head"><div><h2>Saved comparisons</h2><p>${rows.length} synchronized sets</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Listings</th><th>Created</th><th>Actions</th></tr></thead><tbody>
      ${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.listings?.length ?? 0}</td><td>${formatDate(row.created_at)}</td><td><button class="button small" data-action="load-comparison" data-row-id="${escapeAttr(row.id)}">Load</button> <button class="button small danger" data-action="delete-comparison" data-row-id="${escapeAttr(row.id)}">Delete</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
}

function compareMetric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderAlerts() {
  const alerts = state.workspace.alerts;
  return `
    <section class="panel">
      <div class="section-head"><div><h2>Create alert</h2><p>Rules persist and can be evaluated against the latest loaded listing.</p></div></div>
      <form id="alert-form" class="form-grid">
        <div class="field"><label>Watchlist listing</label><select name="listingId" required>
          <option value="">Select listing</option>
          ${state.workspace.watchlist.map((row) => `<option value="${escapeAttr(row.listing.id)}">${escapeHtml(truncate(row.listing.title, 70))}</option>`).join("")}
        </select></div>
        <div class="field"><label>Rule</label><select name="type"><option value="price_below">Price at or below</option><option value="ending_within_hours">Ending within hours</option><option value="score_above">Score at or above</option></select></div>
        <div class="field"><label>Threshold</label><input class="input" type="number" name="value" step="0.01" min="0" required></div>
        <div class="field"><label>&nbsp;</label><button class="button primary" type="submit">Create alert</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="section-head"><div><h2>Alert rules</h2><p>${alerts.length} persisted rules</p></div><button class="button small" data-action="evaluate-alerts">Evaluate now</button></div>
      ${alerts.length ? `<div class="table-wrap"><table><thead><tr><th>Listing</th><th>Rule</th><th>Threshold</th><th>Status</th><th></th></tr></thead><tbody>
        ${alerts.map((alert) => {
          const listing = findListing(alert.listing_id);
          const evaluation = evaluateAlert(alert, listing);
          return `<tr><td>${escapeHtml(listing?.title ?? "Listing unavailable")}</td><td>${escapeHtml(alert.rule?.type ?? "")}</td><td>${escapeHtml(String(alert.rule?.value ?? ""))}</td><td>${evaluation.triggered ? "Triggered" : escapeHtml(evaluation.reason)}</td><td><button class="button small danger" data-action="delete-alert" data-row-id="${escapeAttr(alert.id)}">Delete</button></td></tr>`;
        }).join("")}
      </tbody></table></div>` : emptyState("No alerts", "Create a rule for a watchlist listing.")}
    </section>`;
}

function renderImports() {
  return `
    <section class="panel">
      <div class="section-head"><div><h2>Import user-provided listings</h2><p>Use JSON or CSV for sources without an authorized public API.</p></div></div>
      <form id="import-form" class="form-grid">
        <div class="field"><label>Source</label><select name="source"><option>shopgoodwill</option><option>craigslist</option><option>offerup</option><option>mercari</option><option>manual</option></select></div>
        <div class="field"><label>Format</label><input class="input" value="Auto-detect JSON or CSV" disabled></div>
        <div class="field wide"><label>Listing data</label><textarea name="payload" required placeholder='{"title":"RTX 4070","price":450,"url":"https://…"}'></textarea></div>
        <div class="wide"><button class="button primary" type="submit">Validate and import</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="section-head"><div><h2>Imported evidence</h2><p>${state.workspace.manualImports.length} synchronized records</p></div></div>
      ${state.workspace.manualImports.length ? `<div class="grid">${state.workspace.manualImports.map((row) => renderListingCard(row.listing, { removeImport: true, rowId: row.id })).join("")}</div>` : emptyState("No manual imports", "Paste a listing or a CSV export above.")}
    </section>`;
}

function renderSettings() {
  const settings = normalizePreferences(state.workspace.settings);
  return `<section class="panel">
    <div class="section-head"><div><h2>Analysis defaults</h2><p>Applied to travel and bidding calculations.</p></div></div>
    <form id="settings-form" class="form-grid">
      <div class="field"><label>Mileage rate</label><input class="input" name="mileageRate" type="number" min="0" step="0.01" value="${escapeAttr(settings.mileageRate)}"></div>
      <div class="field"><label>Target discount percent</label><input class="input" name="targetDiscountPercent" type="number" min="0" max="95" step="1" value="${escapeAttr(settings.targetDiscountPercent)}"></div>
      <div class="field"><label>Default state</label><input class="input" name="defaultRegion" maxlength="2" value="${escapeAttr(settings.defaultRegion)}"></div>
      <div class="field"><label>Results limit</label><input class="input" name="resultsLimit" type="number" min="10" max="300" step="10" value="${escapeAttr(settings.resultsLimit)}"></div>
      <div class="wide"><button class="button primary" type="submit">Save settings</button></div>
    </form>
  </section>`;
}

async function handleClick(event) {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    state.route = routeButton.dataset.route;
    window.location.hash = state.route;
    render();
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  try {
    if (action === "sign-out") {
      await withBusy(async () => {
        await state.client.signOut();
        state.user = null;
        state.workspace = emptyWorkspace();
      });
      return;
    }
    if (action === "watch") return await addToWatchlist(button.dataset.id);
    if (action === "compare") return toggleCompare(button.dataset.id);
    if (action === "remove-compare") return toggleCompare(button.dataset.id);
    if (action === "remove-watch") return await deleteRow("watchlist", button.dataset.rowId);
    if (action === "remove-import") return await deleteRow("manual_imports", button.dataset.rowId);
    if (action === "run-saved") return runSavedSearch(button.dataset.rowId);
    if (action === "delete-saved") return await deleteRow("saved_searches", button.dataset.rowId);
    if (action === "delete-alert") return await deleteRow("alerts", button.dataset.rowId);
    if (action === "save-comparison") return await saveComparison();
    if (action === "load-comparison") return loadComparison(button.dataset.rowId);
    if (action === "delete-comparison") return await deleteRow("comparisons", button.dataset.rowId);
    if (action === "evaluate-alerts") return await evaluateAndPersistAlerts();
  } catch (error) {
    notify(errorMessage(error), true);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === "magic-link-form") return await requestMagicLink(new FormData(form));
    if (form.matches(".listing-analysis-form")) return await saveListingAnalysis(form.dataset.rowId, new FormData(form));
    if (form.id === "search-form") return await runSearch(new FormData(form));
    if (form.id === "save-search-form") return await saveSearch(new FormData(form));
    if (form.id === "alert-form") return await createAlert(new FormData(form));
    if (form.id === "import-form") return await importListings(new FormData(form));
    if (form.id === "settings-form") return await saveSettings(new FormData(form));
  } catch (error) {
    notify(errorMessage(error), true);
  }
}

async function requestMagicLink(formData) {
  const email = String(formData.get("email") || "");
  state.accessDenied = false;
  await withBusy(async () => {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    await state.client.signInWithMagicLink(email, redirectTo);
    state.message = "Check your email for the one-time DealForge sign-in link.";
  });
}

async function runSearch(formData) {
  state.search = {
    source: String(formData.get("source") || "all"),
    query: String(formData.get("query") || "").trim(),
    region: String(formData.get("region") || "").trim().toUpperCase(),
  };
  if (!state.search.query) return;

  await withBusy(async () => {
    const preferences = normalizePreferences(state.workspace.settings);
    const requested = state.search.source === "all" ? ["gsa", "ebay"] : [state.search.source];
    const connected = requested.filter((source) => state.sources[source]?.operational && source !== "manual");
    const token = await state.client.getAccessToken();
    const settled = await Promise.allSettled(connected.map(async (source) => {
      const query = new URLSearchParams({ source, q: state.search.query, limit: String(preferences.resultsLimit) });
      if (state.search.region && source === "gsa") query.set("state", state.search.region);
      const response = await fetch(`/api/index?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`${source.toUpperCase()}: ${body.error || "Search failed"}`);
      return body.listings ?? [];
    }));

    const live = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const manual = state.workspace.manualImports
      .map((row) => row.listing)
      .filter((listing) => matchesSearch(listing, state.search.query, state.search.region));
    state.listings = [...live, ...manual].slice(0, preferences.resultsLimit);
    const failures = settled.filter((result) => result.status === "rejected");
    state.message = failures.length ? failures.map((failure) => failure.reason.message).join(" ") : null;
  });
}

async function addToWatchlist(listingId) {
  const listing = findListing(listingId);
  if (!listing) throw new Error("Listing not found.");
  await withBusy(async () => {
    const row = await state.repository.upsert("watchlist", state.user.id, {
      source: listing.source,
      listing_id: listing.sourceListingId ?? listing.id,
      listing,
      status: "watching",
      updated_at: new Date().toISOString(),
    }, "user_id,source,listing_id");
    const index = state.workspace.watchlist.findIndex((item) => item.id === row.id || (item.source === row.source && item.listing_id === row.listing_id));
    if (index >= 0) state.workspace.watchlist[index] = row;
    else state.workspace.watchlist.unshift(row);
    notify("Listing added to watchlist.");
  });
}

function toggleCompare(listingId) {
  const existing = state.compare.findIndex((listing) => listing.id === listingId);
  if (existing >= 0) state.compare.splice(existing, 1);
  else {
    if (state.compare.length >= 4) throw new Error("Compare supports up to four listings.");
    const listing = findListing(listingId);
    if (!listing) throw new Error("Listing not found.");
    state.compare.push(listing);
  }
  render();
}

function loadComparison(rowId) {
  const row = state.workspace.comparisons.find((item) => item.id === rowId);
  if (!row) throw new Error("Saved comparison not found.");
  state.compare = Array.isArray(row.listings) ? row.listings.slice(0, 4) : [];
  render();
  notify("Saved comparison loaded.");
}

async function saveListingAnalysis(rowId, formData) {
  const index = state.workspace.watchlist.findIndex((row) => row.id === rowId);
  if (index < 0) throw new Error("Watchlist record not found.");
  const current = state.workspace.watchlist[index];
  const listing = applyListingAnalysis(current.listing, Object.fromEntries(formData.entries()));

  await withBusy(async () => {
    const row = await state.repository.update("watchlist", state.user.id, rowId, {
      listing,
      updated_at: new Date().toISOString(),
    });
    state.workspace.watchlist[index] = row;
    state.listings = state.listings.map((item) => item.id === listing.id ? listing : item);
    state.compare = state.compare.map((item) => item.id === listing.id ? listing : item);
    notify("Landed-cost analysis saved.");
  });
}

async function saveSearch(formData) {
  await withBusy(async () => {
    const row = await state.repository.insert("saved_searches", state.user.id, {
      name: String(formData.get("name") || state.search.query),
      query: state.search.query,
      source: state.search.source,
      filters: { region: state.search.region },
    });
    state.workspace.savedSearches.unshift(row);
    notify("Search saved.");
  });
}

async function runSavedSearch(rowId) {
  const row = state.workspace.savedSearches.find((item) => item.id === rowId);
  if (!row) return;
  state.route = "discover";
  state.search = { source: row.source, query: row.query, region: row.filters?.region ?? "" };
  render();
  const data = new FormData();
  data.set("source", state.search.source);
  data.set("query", state.search.query);
  data.set("region", state.search.region);
  await runSearch(data);
}

async function saveComparison() {
  await withBusy(async () => {
    const row = await state.repository.insert("comparisons", state.user.id, {
      name: `Comparison ${new Date().toLocaleDateString()}`,
      listings: state.compare,
    });
    state.workspace.comparisons.unshift(row);
    notify("Comparison saved.");
  });
}

async function createAlert(formData) {
  const listingId = String(formData.get("listingId"));
  const listing = findListing(listingId);
  if (!listing) throw new Error("Select a watchlist listing.");
  await withBusy(async () => {
    const row = await state.repository.insert("alerts", state.user.id, {
      listing_id: listing.id,
      rule: {
        type: String(formData.get("type")),
        value: Number(formData.get("value")),
      },
      enabled: true,
    });
    state.workspace.alerts.unshift(row);
    notify("Alert created.");
  });
}

async function evaluateAndPersistAlerts() {
  await withBusy(async () => {
    let triggered = 0;
    for (const alert of state.workspace.alerts.filter((item) => item.enabled)) {
      const listing = findListing(alert.listing_id);
      const result = evaluateAlert(alert, listing);
      if (!result.triggered) continue;
      triggered += 1;
      const observedValue = alert.rule?.type === "score_above"
        ? listing?.dealScore
        : listing?.totalLandedCost ?? listing?.costs?.itemPrice ?? null;
      const event = await state.repository.insert("alert_events", state.user.id, {
        alert_id: alert.id,
        listing_id: alert.listing_id,
        message: result.reason,
        observed_value: observedValue,
      });
      const updatedAlert = await state.repository.update("alerts", state.user.id, alert.id, {
        last_triggered_at: new Date().toISOString(),
      });
      const alertIndex = state.workspace.alerts.findIndex((item) => item.id === alert.id);
      if (alertIndex >= 0) state.workspace.alerts[alertIndex] = updatedAlert;
      state.workspace.alertEvents.unshift(event);
    }
    notify(triggered ? `${triggered} alert${triggered === 1 ? "" : "s"} triggered.` : "No alert thresholds were met.");
  });
}

async function importListings(formData) {
  const source = String(formData.get("source") || "manual");
  const listings = parseManualImport(formData.get("payload"), source);
  await withBusy(async () => {
    for (const listing of listings) {
      const row = await state.repository.insert("manual_imports", state.user.id, {
        source,
        listing,
      });
      state.workspace.manualImports.unshift(row);
    }
    notify(`${listings.length} listing${listings.length === 1 ? "" : "s"} imported.`);
  });
}

async function saveSettings(formData) {
  const preferences = normalizePreferences(Object.fromEntries(formData.entries()));
  await withBusy(async () => {
    await state.repository.saveSettings(state.user.id, preferences);
    state.workspace.settings = preferences;
    if (!state.search.region) state.search.region = preferences.defaultRegion;
    notify("Settings saved.");
  });
}

async function deleteRow(table, id) {
  await withBusy(async () => {
    await state.repository.remove(table, state.user.id, id);
    const property = {
      watchlist: "watchlist",
      saved_searches: "savedSearches",
      alerts: "alerts",
      comparisons: "comparisons",
      manual_imports: "manualImports",
    }[table];
    if (property) state.workspace[property] = state.workspace[property].filter((row) => row.id !== id);
    notify("Record removed.");
  });
}

async function withBusy(operation) {
  state.busy = true;
  state.message = null;
  render();
  try {
    await operation();
  } finally {
    state.busy = false;
    render();
  }
}

function refreshListingIndex() {
  state.listingIndex = new Map();
  const listings = [
    ...state.listings,
    ...state.workspace.watchlist.map((row) => row.listing),
    ...state.workspace.manualImports.map((row) => row.listing),
    ...state.compare,
  ];
  for (const listing of listings) {
    if (listing?.id) state.listingIndex.set(listing.id, listing);
  }
}

function findListing(id) {
  refreshListingIndex();
  return state.listingIndex.get(id);
}

function matchesSearch(listing, query, region) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${listing.title} ${listing.description} ${listing.category} ${listing.source}`.toLowerCase();
  const matchesTerms = terms.every((term) => haystack.includes(term));
  const matchesRegion = !region || listing.location?.state === region;
  return matchesTerms && matchesRegion;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}.`);
  return body;
}

function emptyWorkspace() {
  return { watchlist: [], savedSearches: [], settings: {}, alerts: [], comparisons: [], manualImports: [], alertEvents: [] };
}

function emptyState(title, body) {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
}

function notify(message, error = false) {
  const region = document.querySelector("#toast-region");
  const toast = document.createElement("div");
  toast.className = `toast ${error ? "error" : ""}`;
  toast.textContent = message;
  region.append(toast);
  setTimeout(() => toast.remove(), 4200);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(number);
}

function numberInputValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? escapeAttr(number) : "";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function truncate(value, length) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
