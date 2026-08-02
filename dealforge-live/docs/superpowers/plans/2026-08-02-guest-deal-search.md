# DealForge Private Deal Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private owner-only deal search that finds and ranks source-backed 1TB M.2 NVMe SSD listings near Burien or at a low shipped price.

**Architecture:** Store verified deal observations in a Supabase table with no direct client-role access. A security-definer RPC validates a high-entropy owner token stored only as a hash, then returns active snapshots to a Vercel API. The browser imports the token from a one-time URL fragment and sends it only through the Authorization header.

**Tech Stack:** Node.js ES modules, Vercel Functions, Supabase REST/PostgreSQL/RLS/security-definer RPC, browser JavaScript, Node test runner.

## Global Constraints

- Only the sole owner may search or view deal snapshots.
- The cleartext owner token must never appear in source control, public JavaScript, migrations, seeds, tests, API responses, or logs.
- `anon` and `authenticated` receive no direct privileges on `deal_snapshots`.
- Results must be real-or-empty and source-backed; no fabricated fallback listings.
- Advertised unit price must not hide shipping or minimum-purchase requirements.
- Existing private workspace tables and RLS behavior remain unchanged.
- Every production change follows red-green TDD and fresh full verification.

---

### Task 1: Search domain and ranking

**Files:**
- Create: `dealforge-live/lib/deal-search.js`
- Create: `dealforge-live/tests/deal-search.test.js`

**Interfaces:**
- Produces: `normalizeDealQuery(input)`, `effectiveDealPrice(snapshot)`, `matchesDeal(snapshot, criteria, now)`, and `rankDeals(snapshots, criteria, now)`.

- [x] **Step 1: Write failing domain tests** for query normalization, 1TB/M.2/NVMe matching, minimum-purchase effective price, expiration exclusion, radius filtering, and ranking the Redmond $60/$100-minimum snapshot ahead of more expensive alternatives while preserving its warning.
- [x] **Step 2: Run** `node --test tests/deal-search.test.js` and verify failures are caused by missing domain functions.
- [x] **Step 3: Implement minimal pure functions** with no network or database dependency.
- [x] **Step 4: Run** `node --test tests/deal-search.test.js` and verify all domain tests pass.

### Task 2: Private database access and API

**Files:**
- Create: `dealforge-live/supabase/migrations/003_private_deal_snapshots.sql`
- Create: `dealforge-live/api/deals.js`
- Modify: `dealforge-live/tests/deals-api.test.js`
- Modify: `dealforge-live/scripts/smoke.mjs`

**Interfaces:**
- Consumes: `normalizeDealQuery` and `rankDeals`.
- Produces: `GET /api/deals` returning `{ dataMode, query, filters, returnedCount, listings, generatedAt }` only for a valid owner Bearer token.

- [ ] **Step 1: Replace the pre-implementation API test** with failing tests for 401 without a token, 403 for a rejected token, validation, successful ranking with a valid token, empty results, and upstream failure returning HTTP 503.
- [ ] **Step 2: Run** `node --test tests/deals-api.test.js` and verify failures are caused by the missing endpoint.
- [ ] **Step 3: Add migration** creating `public.deal_snapshots`, `private.deal_search_owner`, indexes, forced RLS, no direct client-role grants, and `public.private_deal_snapshots(p_access_token text)` as the only read path.
- [ ] **Step 4: Implement API** requiring `Authorization: Bearer`, calling the token-validating RPC through the publishable key, ranking in application code, and never logging or returning the token.
- [ ] **Step 5: Extend smoke checks** to require the API, migration, private RPC, Authorization marker, and absence of direct table SELECT grants.
- [ ] **Step 6: Run** API tests and `npm run check`.

### Task 3: Owner-link search user interface

**Files:**
- Modify: `dealforge-live/web/app.js`
- Modify: `dealforge-live/web/styles.css`
- Create: `dealforge-live/tests/private-search-ui.test.js`
- Create: `dealforge-live/lib/private-access.js`
- Create: `dealforge-live/tests/private-access.test.js`

**Interfaces:**
- Consumes: `GET /api/deals` and an owner token from `#access=<token>`.
- Produces: owner-only search form `#private-deal-search-form`, local token storage, fragment clearing, and source-backed result cards.

- [ ] **Step 1: Write failing token tests** asserting fragment import, strict token validation, storage, fragment removal, and Authorization-header construction.
- [ ] **Step 2: Write failing UI tests** asserting private-access-required state, default SSD query, Burien/radius inputs, effective-spend copy, warnings, freshness, source links, and no public or private-write actions in result cards.
- [ ] **Step 3: Run both focused test files** and verify failures reflect missing implementation.
- [ ] **Step 4: Add token helper and private search state**. Never render or log the token.
- [ ] **Step 5: Implement search submission** calling `/api/deals` with the Bearer token and rendering loading, empty, error, and results states.
- [ ] **Step 6: Add responsive styles** without changing authenticated workspace layouts.
- [ ] **Step 7: Run** focused tests and `npm run check`.

### Task 4: Seed verified SSD evidence

**Files:**
- Create: `dealforge-live/supabase/seeds/001_verified_ssd_deals.sql`
- Create: `dealforge-live/tests/ssd-acceptance.test.js`

**Interfaces:**
- Consumes: `rankDeals`.
- Produces: idempotent upserts for verified Craigslist and retailer observations.

- [ ] **Step 1: Write failing acceptance test** loading seed fixtures and asserting `m.2 ssd 1 tb`, 1000GB, NVMe, 40-mile criteria returns the Redmond snapshot and at least one shipped alternative, with the $100 minimum-purchase warning preserved.
- [ ] **Step 2: Run** `node --test tests/ssd-acceptance.test.js` and verify seed file/fixtures are absent.
- [ ] **Step 3: Add idempotent seed SQL** with exact source URLs, observation timestamps, expiration timestamps, evidence, and warnings. Do not claim guaranteed stock or local pickup where the source does not prove it.
- [ ] **Step 4: Run** the acceptance test and full suite.

### Task 5: Owner token provisioning, database application, deployment, and live acceptance

**Files:**
- Modify: `dealforge-live/VERIFICATION.md`

**Interfaces:**
- Consumes: migration, seed, private feature branch, and a generated high-entropy owner token.
- Produces: one private owner link, production deployment, and verification record.

- [ ] **Step 1: Run fresh** `npm run check` and record exact pass counts.
- [ ] **Step 2: Apply migration and seed** to the connected DealForge database.
- [ ] **Step 3: Generate one 256-bit owner token**, store only its SHA-256 hash in `private.deal_search_owner`, and retain the cleartext token only for the final private owner link.
- [ ] **Step 4: Query privilege metadata** proving `anon` and `authenticated` have no direct snapshot table privileges and can execute only the guarded RPC.
- [ ] **Step 5: Fast-forward** the reviewed feature branch to `dealforge-live`.
- [ ] **Step 6: Deploy production** with the existing immutable-source bootstrap plus `api/deals.js` placeholder.
- [ ] **Step 7: Verify unauthorized API access** returns HTTP 401 and no listing data.
- [ ] **Step 8: Verify authorized live API** using the owner token and `q=m.2 ssd 1 tb`, `capacityGb=1000`, `interface=nvme`, and `radiusMiles=40`; require HTTP 200, at least one local result, one alternative, source URLs, warnings, and no expired rows.
- [ ] **Step 9: Verify frontend through the private owner link** imports and clears the token, runs the acceptance search, and does not expose the token in HTML, API responses, or logs.
- [ ] **Step 10: Check production health and Vercel runtime errors** after requests.
- [ ] **Step 11: Update verification record** with the observed deployment ID, source commit, test count, API result summary, database privilege result, and remaining provider limitations.