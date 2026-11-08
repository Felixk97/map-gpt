# Lapan Malaysia — Official GTFS Integration & Netlify Deployment

## What is implemented

This release integrates an **official GTFS static data overlay** into the existing Lapan rail map. The rail panel includes **Show official GTFS lines & stations on map**. The overlay draws station markers and route shapes for KTMB, Rapid Rail KL, Rapid Bus KL, MRT feeder buses and Rapid Bus Penang.

The project includes `scripts/update-official-gtfs.py`, which downloads official ZIP feeds from Malaysia's Open API and converts them into `data/official-gtfs-map.json`. A scheduled GitHub Actions workflow (`.github/workflows/update-gtfs.yml`) refreshes the dataset daily at **04:20 Malaysia time**. The Netlify build embeds the generated JSON as `/official-gtfs-map.json`.

**Important:** This package does not contain downloaded GTFS data because the official API could not be reached from the build environment. Run the workflow in GitHub after uploading the project. Until then the map displays an informative *data not imported* message. Never treat the placeholder as actual station data.

## Official source URLs

- KTMB: `https://api.data.gov.my/gtfs-static/ktmb`
- Rapid Rail KL: `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl`
- Rapid Bus KL: `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl`
- MRT feeder buses: `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder`
- Rapid Bus Penang: `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-penang`

Documentation: https://developer.data.gov.my/realtime-api/gtfs-static.en

Attribution: **GTFS data © KTMB, Prasarana, via Malaysia's Official Open API (data.gov.my), CC BY 4.0.**

## Upload to GitHub and deploy on Netlify

1. Extract this ZIP and upload the contents of `lapan-malaysia-main` to the root of a GitHub repository. Include hidden `.github` directory.
2. Open GitHub → **Actions** → **Refresh official Malaysia GTFS map** → **Run workflow**.
3. Wait for the workflow to complete and commit `data/official-gtfs-map.json`. Check the logs to see which feeds succeeded.
4. On Netlify, create a project from the same GitHub repository. Netlify reads `netlify.toml`: build command `npm run build:netlify`, publish directory `dist/netlify-public`, functions directory `netlify/functions`.
5. Once GitHub commits the data, Netlify should redeploy automatically. Open `/official-gtfs-map.json` on your site and verify `generatedAt` and `feeds`.
6. Open Lapan, select **Rail**, and enable **Show official GTFS lines & stations on map**.

The map overlay is static, not realtime. When `shapes.txt` is missing, a dashed straight-line schematic is drawn between consecutive stops and explicitly labelled schematic. It must not be presented as an actual rail alignment.

## Update manually

With Python 3.10+ and internet access:

```bash
python scripts/update-official-gtfs.py
npm run build:netlify
```

## What is *not* complete

- Existing `/api/rail` timetable planner still downloads and processes KTMB and Rapid Rail KL feeds at request time. It has **not** been fully validated against live official ZIPs in this environment.
- Cross-operator transfer routing, platform-level walking connections, bus+rail itinerary search and fare calculations are **not** completed by this map overlay.
- Vehicle positions are not displayed. Official realtime feeds require protobuf parsing and trip matching; Rapid Rail KL does not have a stable public realtime feed.
- Netlify function bundle sizes and runtime performance with full live GTFS must be tested after the GitHub workflow runs.
- The existing Cloudflare D1 visitor-statistics feature remains unavailable without a Netlify-compatible database.

## Troubleshooting

**No official data imported:** Run the GitHub Actions workflow and ensure the `data/official-gtfs-map.json` commit reaches the branch deployed by Netlify.

**GitHub Actions permission denied:** Repository Settings → Actions → General → Workflow permissions → **Read and write permissions**, or allow the workflow to create a pull request instead.

**Some feeds missing:** Check Actions logs. The importer preserves successful feeds and lists failures. Re-run after the source recovers.

**No lines, but stations appear:** The source may lack valid `shapes.txt` or usable stop times. Check GTFS archive contents.

**Netlify deployment fails:** Confirm Node.js 22+, repository root contains `netlify.toml`, and build logs show `Built Netlify Functions adapter + bundled Lapan app`.

**Data freshness:** KTMB static GTFS is updated daily; other feeds update as required. The GitHub schedule refreshes once daily but GitHub schedules can be delayed.

## Security and attribution

The importer uses only fixed official endpoints, has a 90 MB per-feed download cap, and does not require API keys. No GPS coordinates are uploaded by the importer. Browser location permission is requested only for the separate optional nearest-station feature. Keep the attribution visible in the application and in redistributed datasets.
