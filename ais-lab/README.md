# CERI-SC AIS Live Traffic Lab — Pilot 0.1

**Public pilot page after merge:** https://rasheadsca-star.github.io/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/ais-lab/

This pilot adds a separate, non-invasive observation module. The established CERI-SC V9.0 calculator, protected Cloudflare Worker and NEXT model are unchanged.

## Features implemented
- Direct anonymous WebSocket streaming from Open Waters AIS, scoped to the Suez Canal bounding box, plus GeoJSON snapshot fallback.
- Research-only geographical zoning: northern approach / approximate canal corridor / southern approach.
- Only fresh, nonsynthesized **live position reports** advance a candidate transit sequence (north→canal→south or south→canal→north), with a 3–48 hour duration check.
- Source/message provenance and original-source attribution, local-Cairo display time, ship-type mapping, live freshness, filtering, mobile-friendly map, and CSV export of inferred passages.
- Failed feed -> visible error and exponential reconnect; no fabricated traffic or emissions numbers. The UI works with zero data.
- Input validation, event deduplication, impossible-jump rejection and max in-memory record caps.

## Operational caveats
**Not official statistics.** AIS sources can have material gaps around the canal. A visible position does not prove transit; even an inferred crossing is **unverified** without operator records. Snapshots and historical backfill never count as crossings. A long gap can make a real transit impossible to infer. Browser-only operation means the page must remain open and there is **no server-side storage, no daily 24-hour feed, no guaranteed coverage and no automatic Green Transit Certificate**.

**Not measured emissions.** AIS alone does not contain verified fuel use, IMO identification for every message, propulsion specifications, engine loads or carbon intensity. Integration with the CERI-SC emissions estimator needs ship particulars, validated route boundaries and explicit methodology, including uncertainty bands, and comparison against official SCA traffic statistics.

**Licensing:** Open Waters currently permits anonymous/personal experimental access, but upstream data carries source-specific licensing and commercial products require provider agreement. Preserve source/station and vessel-list attribution; see https://openwaters.io/ais/ and https://openwaters.io/api/ais/. Do not put AISStream keys in public HTML/JavaScript. AISStream's official service needs a server-side credential and has not been activated in this pilot.

**Access/security:** The GitHub Pages pilot is publicly accessible; do not ingest protected SCA records or private credentials. CERI-SC's protected Worker authentication is not the authentication for this public lab.

## Use
1. Open the AIS Lab page, allow outbound HTTPS/WSS access to ais.openwaters.io.
2. The app connects to WebSocket and fetches a snapshot automatically. You can pause, restart, or refresh the snapshot. It is truthful when zero messages are available.
3. Observe the last live message and vessel/source freshness. Filter the live table. Export an AIS-inferred passage log if and only if any passage is inferred during the current browser session.
4. Treat all inferred crossings as unverified until checked against an authoritative SCA passage roster.

## Test
Run: node --test ais-lab/core.test.mjs. The separate CI job runs the same tests. These are synthetic test events only: never shown as live traffic.

## Next phase (not claimed as completed)
- Independent backend with durable append-only AIS evidence, source licence approval, server-side AISStream secret, provider failover and controlled access.
- Calibrate north/south gates and canal corridor against GIS records and SCA official transit times and classifications.
- Reconcile each candidate event using IMO/MMSI identity, ship class, DWT/GT, movement direction and data-quality rules.
- Connect verified ship profile + route assumptions to the CERI-SC emissions calculator with uncertainty bounds and provenance. Never turn model estimates into certified savings automatically.
