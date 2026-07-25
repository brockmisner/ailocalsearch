# Stakeout AI — Real Android Local Rank Tracker

Production-shaped MVP for local grid rank tracking with native Android cloud devices rather than desktop geolocation emulation.

## Stack

- Next.js 16 / Node on Vercel
- Supabase Postgres, Auth, RLS, and result storage
- DuoPlus cloud Android devices and RPA templates
- Proxy Seller residential proxy lists
- Stripe subscription checkout

## Today’s deployment path

1. Create a Supabase project and run `supabase/migrations/202607250001_initial.sql`.
2. In DuoPlus, create one RPA template that opens Google Maps, searches `{{keyword}}`, finds `{{target_name}}`, captures a screenshot, and POSTs the parsed result to `{{callback_url}}` with `run_id`, `rank`, `matched_name`, and geo verification values.
3. Add each DuoPlus phone to `devices` with its provider ID in `external_id` and set `status='ready'`.
4. Create a Proxy Seller residential package/list and store the API key in Vercel. The included provider adapter can create city-targeted sticky lists.
5. Create a Stripe recurring Price and add its ID.
6. Import the repository into Vercel and set all variables from `.env.example`.
7. Deploy. Create organizations/projects/keywords through Supabase initially, then POST `/api/runs` to queue a grid.

## Core API

- `POST /api/runs` — generate a 3×3 to 15×15 geo grid and queue its points.
- `POST /api/worker/dispatch` — claim one queued point and start a DuoPlus RPA task. Protected by `CRON_SECRET`.
- `POST /api/webhooks/duoplus` — receive device-observed rank, screenshot, and verified coordinates.
- `POST /api/billing/checkout` — create a Stripe subscription Checkout Session.

## Important DuoPlus configuration

DuoPlus API naming can vary by account/API release. `DUOPLUS_RPA_CREATE_PATH` is configurable, and all provider calls are isolated in `src/lib/providers.ts`. Confirm the task-creation endpoint and exact field names against the API access enabled in your DuoPlus account before the first live scan.

## Next production increments

Auth UI, organization onboarding, device leasing with atomic claims, proxy credential encryption, retries/dead-letter handling, Stripe webhooks/entitlements, scan scheduling, screenshot ingestion into Supabase Storage, Maps UI parser versioning, heatmap history, PDF/CSV reports, and agency white-labeling.
