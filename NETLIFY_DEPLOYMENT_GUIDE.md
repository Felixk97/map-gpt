# Lapan Malaysia — Netlify deployment and rail planner guide

**Edition:** V6 rail planner prototype, adapted for GitHub → Netlify  
**Source:** the user-supplied `lapan-malaysia-main.zip` project.  
**Hosting:** Netlify; no Supabase or Cloudflare account is needed for the core site and rail endpoint.

## 1. What is included

The project retains the existing Lapan map, search, road-routing UI, road tools, and static assets. It adds a **Road / Rail** switch, rail travel date/time controls, scheduled rail journey results, and a rail map overlay.

The rail endpoint is `GET /api/rail?from=...&to=...&date=YYYY-MM-DD&time=HH:MM`.

Its source feeds are:

- KTMB: https://api.data.gov.my/gtfs-static/ktmb
- Prasarana Rapid Rail KL: https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl

The server downloads GTFS ZIPs on demand, reads `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, `calendar.txt`, `calendar_dates.txt` and optional `shapes.txt`, and caches parsed data for up to 60 minutes **per warm function instance**. A new or cold function instance may download the feeds again.

## 2. Upload to GitHub

1. Download and **extract** `lapan-malaysia-netlify-v6.zip` on your computer.
2. Open the extracted `lapan-malaysia-main` folder.
3. Create a new GitHub repository, preferably private until the site has been tested.
4. Upload **the contents of `lapan-malaysia-main`** to the repository root. Do not upload only the ZIP as a single file. The repository root must contain `package.json`, `netlify.toml`, `scripts/`, `web/`, `worker/`, and `netlify/`.
5. Commit the files. Never commit real API keys or passwords.

If you use Git locally, run `git init`, `git add .`, `git commit -m "Netlify rail planner prototype"`, then connect/push to the new repository using the URL GitHub provides.

## 3. Connect GitHub to Netlify

1. In Netlify, choose **Add new project** → **Import an existing project** → **GitHub**.
2. Authorize GitHub and choose the repository.
3. Set the **Base directory** to the repository root (leave it blank if the files are at root).
4. Netlify should detect `netlify.toml`. Confirm:
   - **Build command:** `npm run build:netlify`
   - **Publish directory:** `dist/netlify-public`
   - **Functions directory:** `netlify/functions`
5. Choose **Deploy** and wait for the build to finish.
6. Open the generated `*.netlify.app` address.

The project routes all incoming requests to one Netlify Function (`netlify/functions/app.mjs`), which runs the existing Lapan application bundle. This includes HTML, JavaScript, CSS, images and API endpoints. This design avoids rewriting the original Cloudflare Worker APIs individually, but does increase function bundle size and can cause cold-start latency.

## 4. Environment variables

In Netlify, open **Project configuration → Environment variables** (menu names may vary). Add the following only when needed:

| Variable | Needed? | Purpose |
| --- | --- | --- |
| `TOMTOM_API_KEY` | For TomTom live road routing | Private server-side key; **do not put it in GitHub** |
| `HERE_API_KEY` | Optional | Private HERE routing key |
| `TOMTOM_ROUTING_DISABLED` | Recommended `true` if no TomTom key | Uses the application's OSRM fallback policy instead of promising TomTom availability |
| `TOMTOM_SEARCH_ENABLED` | Optional, default `false` | Enables optional TomTom search if configured |
| `LAPAN_ENVIRONMENT` | Optional | Use `production` for normal deployment |

**Rail GTFS access does not need an API key** in this implementation. Netlify environment variables must be scoped to Functions at runtime where applicable. Redeploy after changing variables.

## 5. Test after deployment

1. Load the home page. Confirm the map and search panel appear.
2. Click **Rail**. Confirm the date and departure time controls appear.
3. Enter the exact names of two stations **within the same operator's GTFS feed**, select a travel date and departure time, and click **Find rail journey**.
4. If the feed and timetable are available, the app should display a scheduled journey and a map route. Click **Show this rail route on map**.
5. Open `https://YOUR-SITE.netlify.app/api/rail?from=KL%20Sentral` and verify that it returns a JSON validation error (this proves the endpoint is being reached, not that a live GTFS download succeeds).
6. Check **Netlify → Logs → Functions** if the rail request fails, times out or returns a 502 error.
7. Test a normal road route separately. Without a paid routing key, live traffic and road closures cannot be guaranteed.

**Important:** The integration was checked locally for build, bundled page/assets and endpoint validation, and the original automated test suite passed. Live production GTFS fetching and actual passenger journey accuracy have **not** been verified against the current feeds.

## 6. Current rail-planner limitations

This is a **prototype**, not a complete Google Maps Transit replacement:

- **Cross-agency transfers:** The current graph searches each feed separately. It does not yet calculate an end-to-end KTMB ↔ Prasarana interchange journey.
- **Transfer instructions:** The interface lists train changes within a feed but does not calculate platform-to-platform walking times, accessibility or minimum interchange times.
- **Fares:** No reliable complete ticket fare calculator is provided. When official usable fare tables are absent, the app displays a verification message rather than inventing prices.
- **Route geometry:** GTFS `shapes.txt` is used when available; otherwise the map connects scheduled stops and is not verified track geometry.
- **Schedule accuracy:** Static GTFS is not real-time. Delays, disruptions, cancellations, live arrivals and platform assignments are not included.
- **Timetable search:** This is an initial earliest-arrival prototype. Complex interchange cases, stop-platform matching, frequency-based services and trips crossing midnight require further validation.
- **Serverless limits:** Downloading and processing both official GTFS ZIP feeds in a cold Netlify Function can exceed function duration or memory limits, especially on larger feeds. A production-scale deployment should preprocess the feeds on a schedule and serve compact cached data.
- **Station selection:** The initial UI accepts typed station names and matches them approximately. Use official names for best results.

## 7. Features that need separate migration

The original Lapan project uses a Cloudflare D1 binding (`DB`) for visitor statistics and an optional Cloudflare rate-limiter binding (`RATE_LIMITER`). Netlify does not provide those bindings automatically:

- **Visitor statistics** currently return a 503/unavailable response until replaced with a supported database service.
- **Cloudflare rate limiting** is not active on Netlify; add a Netlify-compatible protection mechanism if publishing publicly.
- Routing-provider administrative settings that were stored in D1 will not persist through this adapter without an alternate storage implementation. The existing server defaults and environment variables remain available.

The main map and rail planner do **not** need Supabase. If you later want cross-instance caching, shared persistent GTFS data, admin settings or visitor statistics, choose an appropriate storage solution deliberately.

## 8. Troubleshooting

**Build failed:** Confirm `netlify.toml` and `package.json` are at the repository root. Use a current Node.js runtime (Node 22 recommended). Check Netlify build logs.

**Page shows 404:** Confirm the catch-all redirect in `netlify.toml`, the Functions directory and that `npm run build:netlify` completed.

**Rail returns 502 / times out:** Check Functions logs. The official GTFS server may be unavailable, a ZIP format may differ from expectations, or cold-start processing may exceed Netlify limits. A scheduled preprocessing approach is the recommended next step for reliability.

**Map appears but rail results do not:** Confirm `rail.js` loads and `/api/rail` responds. Check station spelling and service date. Inspect browser developer tools and Functions logs.

**Road routes fail:** Configure the provider's secret key or use the existing explicit basic-routing fallback. Do not expose API keys in the browser.

**Visitor statistics unavailable:** Expected until the Cloudflare D1 dependency is replaced.

## 9. File layout

- `netlify.toml` — Netlify build, Functions and catch-all rewrite.
- `netlify/functions/app.mjs` — Netlify adapter for the existing Worker bundle.
- `scripts/build-netlify.mjs` — produces `dist/server/index.mjs` and the Netlify publish folder.
- `scripts/build.mjs` — original application bundler, extended to include the rail endpoint.
- `worker/rail.js` — official static GTFS download, parsing and journey search.
- `web/rail.js` — rail mode UI and map overlay.
- `web/index.html` — Road/Rail switch and rail controls.
- `web/app.js` — exposes the existing Leaflet map to the rail overlay.
- `web/i18n-ms.js` — Bahasa Malaysia translations for the new controls.
- `README.md` and `RAIL_PLANNER_IMPLEMENTATION.md` — original documentation and technical notes.

## 10. Privacy, licensing and attribution

Keep provider keys server-side in Netlify settings. The public map uses third-party services and their own terms. Attribute OpenStreetMap and the GTFS data publishers. The original Lapan repository's README notes that it has no general source-code license grant; verify your rights to redistribute and host the original source. This guide does not grant rights to any third-party code or data.

## 11. Recommended next version

For a dependable Google Maps-style public transit planner, implement a scheduled GTFS import, normalized station IDs and walking interchanges, a time-dependent multi-agency graph, validated shape slicing per journey leg, GTFS Fares v1/v2 or verified operator fare APIs, and integration tests using known journeys and feed snapshots. These improvements are **not claimed to be completed in V6**.
