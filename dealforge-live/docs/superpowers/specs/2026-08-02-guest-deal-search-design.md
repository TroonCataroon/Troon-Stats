# DealForge Private Deal Search Design

## Objective

Allow the sole owner of DealForge to search and rank current, source-backed deal snapshots while keeping the entire application private. No anonymous visitor may read deal data, call the search successfully, or access any workspace data.

The acceptance search is `m.2 ssd 1 tb` near Burien, Washington. The private result set must include a current local or inexpensive listing and explain price, distance, freshness, condition, and limitations.

## Selected approach

Use a dedicated `public.deal_snapshots` table in the existing Supabase database, but grant no direct table access to `anon` or `authenticated`. Store only a SHA-256 hash of one high-entropy owner access token in `private.deal_search_owner`. A security-definer RPC validates the supplied token and returns active, non-expired snapshots only when the hash matches.

The private Vercel endpoint requires `Authorization: Bearer <owner-token>`, forwards the token to the RPC, and ranks the returned snapshots. The token is never committed to source control, embedded in the public JavaScript bundle, returned by an API, or stored in a public database table.

The browser receives the token through a one-time URL fragment, stores it locally on the owner's device, removes the fragment from browser history, and sends it only in the Authorization header. A rotate function allows the token to be replaced if the private link is ever exposed.

This is preferred over anonymous read access, weakening Supabase RLS, browser-local deal persistence, public guest search, or embedding a secret in the public repository.

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

RLS is enabled and forced. `anon` and `authenticated` receive no SELECT, INSERT, UPDATE, or DELETE grant on `deal_snapshots`. Only `public.private_deal_snapshots(p_access_token text)` can return rows, and it returns an empty set for an invalid token.

`private.deal_search_owner` stores one token hash and rotation timestamp. The cleartext token never enters migrations, seeds, tests, commits, or logs.

## Search API

`GET /api/deals` requires a Bearer owner token and accepts:

- `q`, required, maximum 120 characters.
- `capacityGb`, optional integer from 1 to 100000.
- `formFactor`, optional normalized string such as `m.2 2280`.
- `interface`, optional normalized string such as `nvme`.
- `radiusMiles`, optional number from 1 to 500.
- `maxPrice`, optional number from 0 to 100000.
- `limit`, optional integer from 1 to 50, default 20.

Missing or malformed authorization returns HTTP 401. A rejected owner token returns HTTP 403. The API applies deterministic query matching, filtering, and ranking in application code and returns `real-or-empty` data. It never invents listings or prices.

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

The signed-out screen gains an owner-only deal search area. Without a valid locally stored owner token, it displays `Private access link required` and does not submit searches. Opening the one-time owner link imports the token from the URL fragment, clears the fragment, and automatically runs the default search.

Private result cards show:

- Advertised price and effective minimum spend.
- Pickup location and approximate distance.
- Observation date and expiration state.
- Condition, capacity, interface, form factor, and source.
- Warnings such as minimum purchase, used condition, stock not guaranteed, or shipping unknown.
- A source link.

The default query is `m.2 ssd 1 tb`; location defaults to Burien, WA and radius to 40 miles for this single-owner deployment.

## Seed evidence for acceptance verification

The acceptance dataset includes independently verified snapshots:

- Craigslist Redmond: 1TB PCIe 3 NVMe drives advertised from $60, updated 2026-07-17, with a $100 minimum purchase and used-condition warning.
- Best Buy: current 1TB M.2 NVMe offers from the retailer's search result, with local pickup labeled store-dependent rather than guaranteed.
- Additional shipped alternatives may be included only when their current source page and price are verified during implementation.

## Failure behavior

- Missing access token returns HTTP 401.
- Invalid access token returns HTTP 403 with no deal data.
- Invalid parameters return HTTP 400.
- Supabase or network failure returns HTTP 503 and no fabricated fallback rows.
- No matches return HTTP 200 with an empty list and filter metadata.
- Expired or inactive rows are never returned.
- No anonymous role can read or write the snapshot table directly.

## Testing and verification

Test-first work must cover:

- Query normalization and M.2/1TB/NVMe matching.
- Effective price with minimum purchase.
- Local-distance and freshness ranking.
- Exclusion of expired and incompatible rows.
- API 401, 403, validation, ranked response, empty response, and upstream failure.
- Token import from a URL fragment, fragment removal, and owner-only UI behavior.
- Database grants proving no direct anonymous or authenticated table access.
- Security-definer RPC returning rows only for the configured owner token.

Completion requires a fresh full test suite, production build, smoke checks, deployment, a live authorized `/api/deals` acceptance request, an unauthorized rejection check, frontend verification through the private owner link, database privilege verification, and zero new Vercel runtime errors.