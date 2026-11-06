# Rail planner implementation notes

## Request flow
1. Browser sends station names, local travel date and departure time to `GET /api/rail`.
2. Worker downloads official KTMB and Rapid Rail KL static GTFS ZIP feeds and caches parsed records in-memory for one hour.
3. GTFS `calendar.txt` and `calendar_dates.txt` determine which services operate on the requested weekday/date.
4. `trips.txt` + `stop_times.txt` form a time-dependent station graph. The search finds an earliest-arrival itinerary after the requested departure time.
5. `shapes.txt` is used for map geometry where available; otherwise scheduled stop coordinates are connected.
6. The UI lists scheduled legs and trip changes, and draws the selected geometry on the existing Leaflet map.

## Files changed
- `worker/rail.js`: feed retrieval, ZIP extraction, CSV parsing, service calendar, station matching and journey search.
- `web/rail.js`: rail-mode UI, API call, journey cards and map layer.
- `web/index.html`: Road/Rail switch and rail date/time/result panel.
- `web/app.js`: exposes the existing map as `window.LapanMap`.
- `scripts/build.mjs`: bundles the Worker rail handler and static browser asset.
- `README.md`: setup and limitations.

## Not yet equivalent to Google Maps
Cross-agency interchanges, platform-level walking paths, minimum transfer times, reliable ticket fares, real-time vehicle positions and disruption-aware rerouting need further data/integration. The current planner must be treated as a timetable prototype and not a guaranteed trip recommendation.
