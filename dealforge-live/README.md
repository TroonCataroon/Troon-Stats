# DealForge

DealForge is a private, single-user deal intelligence workspace for official public-auction APIs and user-provided listings.

## What works

- Google sign-in through Supabase Auth.
- First authenticated Google account claims the private workspace.
- PostgreSQL persistence with Row Level Security.
- Live GSA Auctions search using the official API.
- Live eBay Browse API search when production credentials are configured.
- Watchlists, saved searches, comparisons, alert rules, alert events, settings, and manual imports.
- Landed-cost and evidence-aware scoring that refuses to invent market value.
- Responsive desktop and mobile UI.
- Conventional local source files, with no compressed CDN bootstrap.

## Setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_dealforge.sql` in the SQL editor.
3. Enable Google under Supabase Authentication providers.
4. Add the production site URL and local URL to Supabase redirect URLs.
5. Configure the variables in `.env.example` in Vercel.
6. Set the Vercel project root directory to `dealforge-live` if this folder remains inside the parent repository.
7. Deploy and sign in with the intended owner Google account before sharing the URL.

The first authenticated account claims the singleton owner record. Later accounts are denied by the application and by database RLS.

## Commands

```bash
npm test
npm run build
npm run check
```

## Data-source policy

DealForge uses official APIs where available. ShopGoodwill, Craigslist, OfferUp, and Mercari remain user-provided imports because the project does not bypass access controls or deploy unauthorized scrapers.
