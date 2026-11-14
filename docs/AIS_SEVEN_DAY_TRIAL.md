# CERI-SC — Private Seven-Day AIS Trial

**Status: code prepared, NOT LIVE STARTED.** Requires provider key, approved data-use terms and a continuously running private host. No complete SCA official transit register is connected. The current geofence is provisional.

## Purpose
Collect licensed AIS positions privately for seven days; measure real message-flow hours, collector heartbeat hours, restarts, compression negotiation and provisional north/south transit candidates. Never treat received AIS positions, overlapping MMSIs, or the source connection as official SCA transits or a verified detection rate.

Provider candidate: https://www.aisstream.io/documentation . It requires a server-side API key, recommends permessage-deflate, has no uptime or replay guarantee, and cannot be used directly from the browser. Public redistribution rights must be confirmed by the operator.

## Prerequisites
1. Identify the legal/organizational data owner and review provider rights and retention. Do NOT assume that public messages are licensed for publishing or commercial reuse.
2. Obtain an AISStream API key from its account page. Never send it in chat, an issue, a commit, a script or logs.
3. Use an approved always-on private Linux server with Docker Compose, persistent encrypted/restricted storage, outbound WebSocket support and controlled staff access. GitHub Pages and Actions do not replace a 24/7 backend.
4. Keep any SCA ship-level register on institutional infrastructure; do not copy it into GitHub.

## Start on approved private Linux host

Run these commands in a shell after downloading the repository:

    git clone https://github.com/rasheadsca-star/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal.git
    cd Indicative-Carbon-Emission-Reduction-Index-Suez-Canal
    mkdir -p .secrets && chmod 700 .secrets
    umask 077
    read -rs -p 'AISStream API key (not echoed): ' AIS_KEY; printf '\n'
    printf '%s' "$AIS_KEY" > .secrets/aisstream_api_key.txt
    unset AIS_KEY
    chmod 600 .secrets/aisstream_api_key.txt
    # ONLY if authorized operator reviewed and accepted the provider rights:
    AIS_TERMS_ACCEPTED=yes docker compose -f compose.ais-trial.yml up -d --build

The key is mounted read-only at /run/secrets/aisstream_key; it is not checked in. The service has no inbound public ports and writes only to its own persistent Docker volume. The manifest retains the same seven-day window on container restart. A normally completed trial exits and is not automatically restarted.

## Inspect health and results privately

    docker compose -f compose.ais-trial.yml ps
    docker compose -f compose.ais-trial.yml logs --tail=70 ceri-ais-trial
    docker compose -f compose.ais-trial.yml exec ceri-ais-trial node backend/trial-report-cli.mjs /var/lib/ceri-ais

After the trial container exits, run a one-off report against its persistent volume:

    AIS_TERMS_ACCEPTED=yes docker compose -f compose.ais-trial.yml run --rm --no-deps ceri-ais-trial node backend/trial-report-cli.mjs /var/lib/ceri-ais

## Security and report meaning
- trial-manifest.json: private seven-day start/end UTC; NO traffic guarantee.
- position-YYYY-MM-DD.ndjson: raw normalized AIS positions with MMSIs; PRIVATE, potentially licensed. Never publish.
- candidate-YYYY-MM-DD.ndjson: unverified FSM candidate events; PRIVATE, includes identity in candidate ID.
- heartbeat-YYYY-MM-DD.ndjson: source and collector diagnostics; PRIVATE.
- trial-report-cli.mjs emits aggregate-only JSON; zero MMSI names or positions in output.
- Source geographic coverage, SCA official recall and precision remain NULL until independently reconciled to a complete SCA reference register.
- An AIS candidate is NOT an official transiting vessel and cannot justify a certified CO2 avoidance figure.

## Trial acceptance
After 168 elapsed hours, inspect: fraction of hourly slots with collector heartbeats, periods with actual valid AIS messages, source-silent intervals, connected/flowing status, restarts, confirmed WebSocket compression, rejected/spoofed/out-of-order events, geofence quality, and tentative passage direction.
Provisional operational readiness target: >=95% of hourly slots have health reports, no unexplained multi-hour source silence, no leaked raw data or secrets, and explain all source gaps. These thresholds are diagnostics, **not certified geographic coverage**. Compare with a legally obtained full SCA reference week only in a private environment before calculating transit detection precision/recall.

## Known limitations
- No API key, provider terms acceptance, host, live stream or SCA reference is provisioned by this pull request; trial has NOT started.
- Provisional AIS geofences also cover ports/anchorages and require validation against SCA/IHO charts.
- FSM continuity across a process restart is NOT automatically reconstructed; report counts collector restarts so these gaps can be flagged.
- No alternative-fuel WtW/certified avoided emissions are calculated by this trial.
- Always-on hosting, monitoring and a source-rights review must be arranged by the data owner.

## Reproduce software validation

    npm ci
    npm test
    node --test backend/trial.test.mjs
    docker build -f backend/ais-trial.Dockerfile -t ceri-ais-trial:test .

Build and regression workflow: .github/workflows/ais-seven-day-trial.yml. Tests use synthetic data only.
