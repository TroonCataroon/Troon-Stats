# DealForge Guest Deal Search Design

## Objective

Allow DealForge to search and rank current, source-backed deal snapshots without requiring authentication, while keeping every personal-data and workspace write path fail-closed until private authentication is operational.

The acceptance search is `m.2 ssd 1 tb` near Burien, Washington. The result set must include a current local or inexpensive listing and explain price, distance, freshness, condition, and limitations.

## Selected approach

Use a dedicated read-only `public.deal_snapshots` table in the existing Supabase database. A Vercel function queries active, non-expired rows through the publishable key. Anonymous users receive read-only search results; no anonymous insert, update, delete, RPC, watchlist, settings, comparison, alert, or import operation is added.

This is preferred over weakening authentication, restoring browser-local persistence, scraping marketplaces at request time, or embedding a static result in the frontend. The table can be refreshed by controlled ingestion jobs or verified administrative writes without changing the guest API.

## Data model

Each snapshot stores:

- `id` UUID primary key.
- `source` and `source_listing_id`.
- `url`, `title`, `description`, and `category`.
- `item_price`, `shipping_cost`, `minimum_purchase`, and `estimated_landed_cost`.
- `condition`, `seller_name`, and `seller_confidence` from 0 to 100.
- `city`, `state`, `distance_miles`, and `pickup_available`.
- `capacity_gb`, `form_factor`, and `interface` for hardware filtering.
- `warnings` JSON array and `evidence` JSON object.
- `observed_at`, `expires_at`, and `active`.

RLS is enabled. `anon` and `authenticated` receive SELECT only for rows where `active = true` and `expires_at > now()`. They receive no write privileges.

## Search API

`GET /api/deals` accepts:

- `q`, required, maximum 120 characters.
- `capacityGb`, optional integer from 1 to 100000.
- `formFactor`, optional normalized string such as `m.2 2280`.
- `interface`, optional normalized string such as `nvme`.
- `radiusMiles`, optional number from 1 to 500.
- `maxPrice`, optional number from 0 to 100000.
- `limit`, optional integer from 1 to 50, default 20.

The API retrieves active snapshots, applies deterministic query matching, filtering, and ranking in application code, and returns `real-or-empty` data. It never invents listings or prices.

## Ranking

Ranking is deterministic and independently testable:

1. Required query term and hardware compatibility match.
2. Freshness, with newer observations favored.
3. Locality, with pickup and lower distance favored when a radius is supplied.
4. Effective price, using `max(item_price + shipping_cost, minimum_purchase)` when a minimum purchase applies.
5. Seller and evidence confidence.
6. Penalties for warnings, partial price evidence, or stale observations.

Every result exposes the score components and warnings. A low advertised unit price with a minimum-order constraint must not be represented as the complete spend.

## Frontend

The signed-out screen gains a guest search form and result cards. Private workspace login remains visually separate. Guest cards show:

- Advertised price and effective minimum spend.
- Pickup location and approximate distance.
- Observation date and expiration state.
- Condition, capacity, interface, form factor, and source.
- Warnings such as minimum purchase, used condition, stock not guaranteed, or shipping unknown.
- A source link.

The default example query is `m.2 ssd 1 tb`; location defaults to Burien, WA and radius to 40 miles for this private deployment.

## Seed evidence for acceptance verification

The acceptance dataset includes independently verified snapshots:

- Craigslist Redmond: 1TB PCIe 3 NVMe drives advertised from $60, updated 2026-07-17, approximately 24.6 driving miles from Burien, with a $100 minimum purchase and used-condition warning.
- Newegg: ADATA LEGEND 710 1TB M.2 2280 NVMe advertised at $139.99 with free shipping, observed from the current search page.
- Best Buy: Crucial P310 1TB PCIe Gen4 NVMe M.2 advertised at $179.99; local pickup must be labeled as store-dependent rather than guaranteed.

## Failure behavior

- Invalid parameters return HTTP 400 with a concise error.
- Supabase or network failure returns HTTP 503 and no fabricated fallback rows.
- No matches return HTTP 200 with an empty list and filter metadata.
- Expired or inactive rows are never returned.
- Guest search cannot access private tables.

## Testing and verification

Test-first work must cover:

- Query normalization and M.2/1TB/NVMe matching.
- Effective price with minimum purchase.
- Local-distance and freshness ranking.
- Exclusion of expired and incompatible rows.
- API validation and real-or-empty response behavior.
- Signed-out UI containing a usable guest search form without enabling private writes.

Completion requires a fresh full test suite, production build, smoke checks, deployment, live `/api/deals?q=m.2%20ssd%201%20tb&capacityGb=1000&interface=nvme&radiusMiles=40` verification, frontend verification, database policy verification, and zero new Vercel runtime errors.