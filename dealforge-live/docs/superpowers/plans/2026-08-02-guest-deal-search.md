# DealForge Guest Deal Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, unauthenticated read-only deal search that finds and ranks source-backed 1TB M.2 NVMe SSD listings near Burien or at a low shipped price.

**Architecture:** Store verified deal observations in a public read-only Supabase table protected by RLS. Query it through a Vercel API that performs deterministic normalization, filtering, effective-price calculation, and ranking. Render guest results on the signed-out screen while preserving all private workspace write gates.

**Tech Stack:** Node.js ES modules, Vercel Functions, Supabase REST/PostgreSQL/RLS, browser JavaScript, Node test runner.

## Global Constraints

- Guest access is SELECT-only and cannot write any personal or workspace data.
- Results must be real-or-empty and source-backed; no fabricated fallback listings.
- Advertised unit price must not hide shipping or minimum-purchase requirements.
- Private authentication and RLS behavior remain unchanged.
- Every production change follows red-green TDD and fresh full verification.

---

### Task 1: Search domain and ranking

**Files:**
- Create: `dealforge-live/lib/deal-search.js`
- Create: `dealforge-live/tests/deal-search.test.js`

**Interfaces:**
- Produces: `normalizeDealQuery(input)`, `effectiveDealPrice(snapshot)`, `matchesDeal(snapshot, criteria, now)`, and `rankDeals(snapshots, criteria, now)`.

- [ ] **Step 1: Write failing domain tests** for query normalization, 1TB/M.2/NVMe matching, minimum-purchase effective price, expiration exclusion, radius filtering, and ranking the Redmond $60/$100-minimum snapshot ahead of more expensive alternatives while preserving its warning.
- [ ] **Step 2: Run** `node --test tests/deal-search.test.js` and verify failures are caused by missing domain functions.
- [ ] **Step 3: Implement minimal pure functions** with no network or database dependency. Ranking must return score components and sort deterministically by score, effective price, observation time, then ID.
- [ ] **Step 4: Run** `node --test tests/deal-search.test.js` and verify all domain tests pass.
- [ ] **Step 5: Commit** `test/feat: add deterministic guest deal ranking`.

### Task 2: Read-only database and API

**Files:**
- Create: `dealforge-live/supabase/migrations/003_public_deal_snapshots.sql`
- Create: `dealforge-live/api/deals.js`
- Create: `dealforge-live/tests/deals-api.test.js`
- Modify: `dealforge-live/scripts/smoke.mjs`

**Interfaces:**
- Consumes: `normalizeDealQuery` and `rankDeals`.
- Produces: `GET /api/deals` returning `{ dataMode, query, filters, returnedCount, listings, generatedAt }`.

- [ ] **Step 1: Write failing API tests** for required query validation, numeric limits, successful ranking, empty results, expired-row exclusion, and upstream failure returning HTTP 503.
- [ ] **Step 2: Run** `node --test tests/deals-api.test.js` and verify the endpoint is missing.
- [ ] **Step 3: Add migration** creating `public.deal_snapshots`, indexes, RLS, a SELECT policy for active non-expired rows, SELECT grants to `anon` and `authenticated`, and no write grants.
- [ ] **Step 4: Implement API** using the public Supabase configuration and dependency-injectable fetch for tests. Retrieve a bounded set of active rows, rank in application code, and never return seeded code fallback data.
- [ ] **Step 5: Extend smoke checks** to require the API, migration, and guest-search markers.
- [ ] **Step 6: Run** API tests and `npm run check`.
- [ ] **Step 7: Commit** `feat: add read-only guest deal API`.

### Task 3: Guest search user interface

**Files:**
- Modify: `dealforge-live/web/app.js`
- Modify: `dealforge-live/web/styles.css`
- Create: `dealforge-live/tests/guest-search-ui.test.js`

**Interfaces:**
- Consumes: `GET /api/deals`.
- Produces: signed-out search form `#guest-deal-search-form` and source-backed result cards.

- [ ] **Step 1: Write failing UI tests** asserting the form, default SSD query, Burien/radius inputs, effective-spend copy, warnings, freshness, source links, and absence of private write actions in guest cards.
- [ ] **Step 2: Run** `node --test tests/guest-search-ui.test.js` and verify failures reflect missing UI.
- [ ] **Step 3: Add guest state and form** to the signed-out screen. Keep the private authentication section separate and label it unavailable when the live provider is disabled.
- [ ] **Step 4: Implement search submission** calling `/api/deals`, rendering loading, empty, error, and results states. Use text escaping for all source data.
- [ ] **Step 5: Add responsive styles** without changing authenticated workspace layouts.
- [ ] **Step 6: Run** UI tests and `npm run check`.
- [ ] **Step 7: Commit** `feat: add guest deal finder UI`.

### Task 4: Seed verified SSD evidence

**Files:**
- Create: `dealforge-live/supabase/seeds/001_verified_ssd_deals.sql`
- Create: `dealforge-live/tests/ssd-acceptance.test.js`

**Interfaces:**
- Consumes: `rankDeals`.
- Produces: idempotent upserts for the verified Craigslist, Newegg, and Best Buy observations.

- [ ] **Step 1: Write failing acceptance test** loading seed fixtures and asserting `m.2 ssd 1 tb`, 1000GB, NVMe, 40-mile criteria returns the Redmond snapshot and at least one shipped alternative, with the $100 minimum-purchase warning preserved.
- [ ] **Step 2: Run** `node --test tests/ssd-acceptance.test.js` and verify seed file/fixtures are absent.
- [ ] **Step 3: Add idempotent seed SQL** with exact source URLs, observation timestamps, expiration timestamps, evidence, and warnings from the design. Do not claim guaranteed stock for Best Buy.
- [ ] **Step 4: Run** the acceptance test and full suite.
- [ ] **Step 5: Commit** `data: add verified 1TB NVMe deal snapshots`.

### Task 5: Database application, deployment, and live acceptance

**Files:**
- Modify: `dealforge-live/VERIFICATION.md`

**Interfaces:**
- Consumes: migration, seed, feature branch.
- Produces: production deployment and verification record.

- [ ] **Step 1: Run fresh** `npm run check` and record exact pass counts.
- [ ] **Step 2: Apply migration and seed** to the connected DealForge database, then query policy/grant metadata to verify anonymous SELECT-only access and zero guest writes.
- [ ] **Step 3: Merge or fast-forward** the reviewed feature branch to `dealforge-live`.
- [ ] **Step 4: Deploy production** with the existing immutable-source bootstrap plus `api/deals.js` placeholder.
- [ ] **Step 5: Verify live API** using `q=m.2 ssd 1 tb`, `capacityGb=1000`, `interface=nvme`, and `radiusMiles=40`; require HTTP 200, at least one local result, one cheap alternative, source URLs, warnings, and no expired rows.
- [ ] **Step 6: Verify frontend bundle** contains the guest form and renders the acceptance result.
- [ ] **Step 7: Check production health and Vercel runtime errors** after requests.
- [ ] **Step 8: Update verification record and commit** only with the observed deployment ID, source commit, test count, API result summary, database policy result, and remaining provider limitations.