# CERI-SC complete handoff package

**Baseline:** 2026-11-14, Suez Canal Authority green transition research project. Repository `rasheadsca-star/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal`; original repository is canonical.

## Quick start for Claude
1. Read [CLAUDE_MASTER_PROMPT.md](CLAUDE_MASTER_PROMPT.md) in full. Treat all assertions as hypotheses until rechecked against actual source and code.
2. Read [STATE_AND_BLOCKERS.md](STATE_AND_BLOCKERS.md), [DATA_SOURCES.md](DATA_SOURCES.md), and [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md).
3. Inspect the actual project: `index.html`, `decision-room.html`, `voyage-evidence.html`, `ais-lab/`, `src/`, `sca-stats/`, `data/`, `.github/workflows/`, `docs/`, `tests/`, `next/`.
4. Use `npm ci` then `npm test` and `node --test ais-lab/*.test.mjs src/*.test.mjs sca-stats/*.test.mjs tests/decision-room.test.mjs`. Inspect current GitHub check runs and Pages.
5. Create a new branch based on inspected `main`; prepare targeted PRs, no force-push or direct `main` rewrites.

## Package contents
This README is inside the **complete repository bundle**, not an isolated text prompt. Repository archive includes:
- **Application:** main V9 HTML, Next prototype, AIS Lab, Official Statistics, Decision Room, Voyage Evidence importer.
- **Engine code:** all current JavaScript/ES module logic and independent tests.
- **Public data snapshots:** current `data/` reports, associated dates and provenance. These are *snapshots*, not guaranteed real-time or complete authoritative voyage records.
- **Deployment:** GitHub Actions workflows, Cloudflare worker and wrangler config.
- **Documentation:** `docs/`, this `CLAUDE_HANDOFF/` folder, package README and acceptance criteria.
- **Synthetic fixtures:** all `examples/` CSVs; NOT actual Suez vessel records.
- **Binary images:** `next/` reference images and logos checked into Git.

The package deliberately **excludes** `.git` history (use GitHub repository URL to get full history), machine-local `node_modules`, secrets and credentials. It **does not claim** to contain confidential SCA navigation logs or a certified AIS data feed.

## One-step archive download
Full source ZIP (current main, including this handoff):
https://github.com/rasheadsca-star/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/archive/refs/heads/main.zip

GitHub source:
https://github.com/rasheadsca-star/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal

For a **frozen, reproducible snapshot**, use the associated merged commit SHA in GitHub's source archive URL:
`https://github.com/rasheadsca-star/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/archive/<SHA>.zip`
The online `main.zip` may change as development continues.

A CI workflow builds a distinct delivery ZIP named `CERI-SC-CLAUDE-HANDOFF.zip` and creates `MANIFEST-SHA256.txt`. Verify `bundle-content.txt` and checksums before handing the ZIP to Claude.

## Operational outcome requested by user
**Not** another dashboard with only two AIS targets, unknown 2026 data or unvalidated annual CO₂ projection. The final goal is actual, continuous, verifiable maritime traffic and route-environment intelligence. The present project is a useful research codebase and public official-statistics display; it is not yet an institutionally certified operational system.

## Primary URLs
- V9: https://rasheadsca-star.github.io/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/
- Decision room: https://rasheadsca-star.github.io/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/decision-room.html
- SCA official statistics: https://rasheadsca-star.github.io/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/official-statistics.html
- AIS Lab: https://rasheadsca-star.github.io/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/ais-lab/
- Voyage Evidence: https://rasheadsca-star.github.io/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/voyage-evidence.html
