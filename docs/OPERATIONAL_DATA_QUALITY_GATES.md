# Operational data quality — research gate

This branch introduces a **periodic source-health sampler**, not a continuous certified AIS tracking service.

## Implemented
- Scheduled GitHub Actions checks hourly at minute 17 UTC (execution may be delayed by GitHub).
- Calls Open Waters `/health` and a public 30-minute GeoJSON snapshot of the Suez area.
- Saves ONLY aggregate counts, availability status, errors and UTC sampling time in `data/ais-source-health.json`. No individual MMSI, NMEA, names or vessel positions are persisted.
- Displays source health separately on the AIS Lab page, explicitly rejecting inference of official transit counts.
- Flags stale samples older than 150 minutes, missing reports, and any source outage as **unknown**, never zero vessels.

## Acceptance criteria before claiming an operational system
1. Obtain legitimate institutional AIS data supply and use rights, with reliable Suez coverage.
2. Run an authorized 24/7 collector in a persistent backend with encrypted credentials, retries, durable audit logs, and source-switching failover. GitHub Actions are **periodic**, not 24/7 streaming.
3. Reconcile AIS-inferred transit events to actual SCA daily/directional vessel registry over a pre-agreed validation period. Measure precision, recall, missed transits, duplicate rates, geographic and time sensitivity.
4. Import authoritative vessel IMO/GT/DWT/engine and fuel particulars before generating route-emission estimates. Validate TtW/WtW factors and uncertainty by fuel pathway, speed, loading, meteorological conditions and wait/transit time.
5. Only issue non-certified Green Transit draft assessments pending verifier credentials and institutional procedures. Do not treat avoided emissions as MRV Scope 1/2/3 reductions or carbon credits.
6. Confirm IMF PortWatch licence before systematic automated downloads; useful as *lagged* independent benchmark, not a realtime ground truth.
7. Real browser and endpoint checks, including correct live source and historical-report timestamps.

## Technical notes
- Source health API `/health` reflects provider-wide traffic, not Suez coverage. Regional snapshot is partial.
- The public diagnostic JSON is not a voyage register, cannot be used to reconstruct transits, and cannot calculate CO2.
- Users' existing main dashboard calculation models are not overwritten.
