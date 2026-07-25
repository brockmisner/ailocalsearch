# Android Local Keyword Tracker SaaS

## Purpose

A measurement-only local rank tracker that executes Google Maps searches on DuoPlus Android cloud devices. It does not click listings, simulate customer engagement, post reviews, or manipulate rankings.

## Runtime flow

1. An authenticated user creates a campaign and starts a scan.
2. The API generates a square latitude/longitude matrix and atomically reserves one credit per point.
3. Scan jobs are persisted before any provider call.
4. A protected worker claims queued jobs, allocates a healthy Android device, obtains a residential proxy session, applies proxy/GPS/locale through DuoPlus-supported APIs, and launches a prebuilt RPA template.
5. The RPA template opens the native Google Maps app, searches the keyword, captures a screenshot and structured UI export, and returns its task report.
6. A signed webhook stores observed listings, determines the target rank, records evidence provenance, and finalizes aggregate metrics.

## Important correction

DuoPlus hardware class and API behavior must be verified against the active account. The system records `device_kind` as provider-reported evidence and does not claim a physical handset unless DuoPlus explicitly reports one.

## Safety and accuracy gates

- No ADB usage.
- No interaction intended to alter Google behavioral signals.
- Device location and proxy location are independently recorded.
- A point is excluded from verified metrics unless the geo verification distance is within the configured tolerance.
- Screenshots and UI exports are hashed and stored as evidence.
- Provider callbacks are treated as untrusted input and schema-validated.
- Webhooks are idempotent.
- Device locks prevent concurrent mutation of one phone.
- Credits are reserved atomically and refunded for terminal provider failures.

## Required DuoPlus RPA template

The template should accept `keyword`, `latitude`, `longitude`, `scanPointId`, and `callbackUrl`; open `com.google.android.apps.maps`; search without clicking a result; capture the visible list; export structured UI nodes when available; upload artifacts; and return a normalized list of observed businesses.

## Deployment

1. Run `supabase/schema.sql` in the target Supabase project.
2. Create a private Storage bucket named `scan-evidence`.
3. Configure all variables in `.env.example` on Vercel.
4. Register `/api/webhooks/duoplus` and `/api/webhooks/stripe` with their providers.
5. Configure a Vercel Cron call to `/api/worker/dispatch` every minute with `Authorization: Bearer $CRON_SECRET`.
6. Build the DuoPlus RPA template in the DuoPlus console and set `DUOPLUS_MAPS_TEMPLATE_ID`.

## MVP boundaries

The checked-in provider clients isolate assumptions because DuoPlus and Proxy Seller payloads can vary by account/product. Update only the adapter mapping after validating live API responses; the database and application contracts should remain stable.
