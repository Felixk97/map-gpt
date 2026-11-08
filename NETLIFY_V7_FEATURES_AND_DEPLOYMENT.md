# Lapan Malaysia V7 — Netlify rail planner enhancement

## Deployment (GitHub → Netlify)

1. Extract the ZIP. Upload **the contents** of `lapan-malaysia-main` to a GitHub repository, retaining `netlify.toml`, `netlify/functions/app.mjs`, `web/`, `worker/`, and `scripts/`.
2. Netlify → Add new project → Import existing project → GitHub → select the repository.
3. Use repository root as base directory, build command `npm run build:netlify`, publish directory `dist/netlify-public`, functions directory `netlify/functions` (these are already in `netlify.toml`).
4. Add any routing-provider secrets required by your existing road-routing setup in Netlify's Environment Variables. Do not commit credentials.
5. Deploy. Verify `/`, `/rail.js`, `/api/rail/stations?q=KL`, and `/api/rail?from=...&to=...&date=YYYY-MM-DD&time=08:00` using actual station names.
6. Review function logs if the upstream GTFS feed fails, times out, or the platform limits execution. Redeploy after configuration changes.

## Features included

- Official GTFS Static rail feed adapter for KTMB and Rapid Rail KL (inherited from V6).
- Rail line rendering on the map where a route can be computed (inherited from V6).
- Station-name autocomplete with a local browser snapshot for repeat searches.
- Nearest station suggestions using browser location **only after the user clicks the button and grants permission**. Distances are straight-line, not walking distances.
- Swap origin and destination, saved rail journeys (device-local), and shareable journey URLs.
- Earliest-arrival vs fewest-transfers sorting for returned alternatives.
- Operator links for service updates, plus explicit accessibility and real-time data disclaimers.
- Malay translation coverage for new HTML controls.
- Station directory API: `GET /api/rail/stations?q=...`, optional `lat` and `lon` for nearby ordering.

## Not yet implemented / cannot be represented as verified

- **Cross-feed interchanges:** the GTFS journey engine still searches each operator feed separately; KTMB ↔ Rapid KL transfers are not fully supported.
- **Verified interchange walking and accessible routing:** no authoritative transfer walk-time or lift status integration.
- **Actual fares / cashless vs cash prices:** no reliable unified official fare matrix integrated; no prices are invented.
- **Rail + bus + pedestrian door-to-door routing:** not implemented; current planner is rail-only.
- **Live train arrival/disruption feed:** only static scheduled GTFS is consumed. Official operator links are provided instead.
- **True offline trip routing:** saved station-name snapshot is available when previously fetched; route calculation still requires a network connection.
- **Verified complete route geometry:** GTFS shape data is used when available; some shapes may include a full trip beyond the boarded segment.
- **Netlify D1 visitor statistics:** Cloudflare D1 is not portable and needs a separate storage service.

## Validation

- `npm run build:netlify` completed successfully.
- `node --check web/rail.js` completed successfully.
- New station endpoint returns a controlled JSON error when GTFS downloads are unreachable.
- 61 of 62 existing test files passed in this environment. The remaining `tests/analytics.mjs` test fails on an existing visitor-statistics unique-browser assertion unrelated to the new rail code. The previous V6 run had passed 62/62; this version must not be described as all tests passing.
- Live GTFS downloads and real journeys could not be verified in this offline execution environment. Test these after Netlify deployment before public release.

## Important privacy / operation

- Saved journeys and station snapshots are in localStorage on the user's device.
- Nearby station lookup requests browser geolocation on click and sends the location to your Netlify function, which uses it to sort station distances. No background GPS polling is added.
- External official timetable data can change, and static GTFS is not a live train-position service.
