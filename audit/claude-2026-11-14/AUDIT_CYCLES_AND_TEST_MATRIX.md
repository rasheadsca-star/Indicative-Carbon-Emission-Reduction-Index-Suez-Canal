# Ten adversarial audit cycles, headline provenance and test matrix — 2026-11-14

Reviewer: Claude, one pass per failure emphasis. This is an AI review of GPT-authored code, **not** an independent human or institutional review. Defect IDs → `DEFECT_REGISTER.json`.

## 1. Headline numbers → source → tier
| UI headline | Where | Source / equation | Tier |
|---|---|---|---|
| Oct 2026: 1,490 vessels, 88 Mt net, $724 M (vs 1,128 / 47 Mt / $373 M) | V9 2026 view, Official Statistics, Decision Room | SCA press release 5 Nov 2026 (`data/sca-2026-official-announcements.json`); press-corroborated | [OFFICIAL] rounded |
| Jul–Sep 2026 container segment 166 vs 16 | same | SCA 13 Oct 2026 | [OFFICIAL] segment only |
| 16 Sep 2026: 39 vessels | same | SCA 16 Sep 2026 | [OFFICIAL] single day |
| Annual vessels 2023–2025, monthly 2023–2025 | Official Statistics, V9 history | SCA annual reports Tables 1–2; monthly sums reconcile | [OFFICIAL] |
| Annual vessels 2015–2022 | V9 history | `index.html` Y{} citing SCA reports | [OFFICIAL] not re-verified here |
| Avoided CO₂ 2021 = 31.0 Mt, 2023 = 55.4 Mt | V9 | SCA announcements (counterfactual vs alternative routes) | [ESTIMATED] by SCA, not inventory |
| Avoided CO₂ other years | V9 history, cumulative | transits × mean(1,498; 2,096) = 1,796.9 t/vessel; band = min–max rate | [MODELLED] illustrative index |
| Cumulative 2015→2025 ≈ 369.5 Mt (was ≈ 391.6 Mt incl. fabricated 2026) | V9 | Σ of above | [MODELLED] |
| "Daily / monthly average" tCO₂ | V9 KPI | annual ÷ 365 / ÷ 12, labelled | [MODELLED] arithmetic |
| B20 1,624 tCO₂ (anchored 24 Jun 2026); solar 3,840 tCO₂/yr | Green projects | internal project figures in code; no evidence file in repo | [ESTIMATED] — evidence [MISSING] |
| AIS 4–9 MMSI per snapshot | AIS Lab, Decision Room | Open Waters 30-min regional snapshot | [OBSERVED AIS] partial, not transits |
| Single-voyage TTW Δ CO₂ | Decision Room, Voyage Evidence | (Cape − Suez fuel) × EF, default inputs synthetic | [MODELLED] synthetic |
| 2026 annual traffic / CO₂ | — | none exists | [MISSING] (now shown as such) |

## 2. Audit cycles
| # | Emphasis | Hypothesis tested | Evidence / method | Result | Defects / tests |
|---|---|---|---|---|---|
| 1 | Source & licensing | Official figures trace to SCA URLs; non-SCA URLs rejected | Read data JSON + validators; web-search corroboration of Oct 2026 | Pass for Oct 2026 (two independent outlets match). Primary pages not fetchable from sandbox. Jul/Aug 2026 exist only as secondary reports → not ingested | New `provenance-manifest.test.mjs` pins SHA-256 + SCA-domain URLs |
| 2 | Completeness & periods | Partial-period data presented as full period | Grep for annualisation, `fracYr`, period constants | **Fail**: 2026 = 39-day annualisation (DEF-001); engine frozen to Oct (DEF-004); annual years hard-wired (DEF-011) | DEF-001 fixed + smoke regression; DEF-004 engine fixed + 3 tests |
| 3 | AIS signal validation | Invalid/sentinel/spoofed messages accepted | Wrote server normaliser; tests with lat 91, MMSI 111111111/970…/992…, 100 km/min jump | Lab filters 9-digit only (accepts coast/AtoN MMSIs); backend filters ship MMSIs + jumps | backend tests (MMSI, sentinel, jump) |
| 4 | Passage FSM / duplicates | Same ship counted twice; anchorage wait counted as transit time | Read `ais-lab/core.mjs`; built FSM with lower/upper bounds | Lab elapsed time includes anchorage (DEF-005). Backend: dup/late/conflict counted; two passages → two ids; same-side exit ≠ transit; no-exit → OPEN_INCOMPLETE | 8 FSM tests |
| 5 | Reference join | Join on weak keys; naive time strings | Read `reconciliation.mjs` | Pass: MMSI+direction+exact-Z timestamp, one-to-one, tolerance ≤ 360 min, no name matching. FSM CSV verified parseable by it | replay→reconciliation test |
| 6 | Marine fuel model | Unrealistic defaults presented as results | Read `voyage-audit.mjs`, decision-room defaults | Pass with caveat: constant-speed daily-burn model, inputs synthetic and labelled; no speed–power curve, no weather | none new; WP4 blocked on data |
| 7 | GHG boundaries | WtW uplift or zero-carbon fuels | Smoke checks + grep | Pass: WtW blocked; "ammonia/hydrogen do not mean zero" text present | existing smoke asserts |
| 8 | Uncertainty & aggregation | Summing snapshots; dropping negative savings | Ran `computeVoyageScenario` with Suez longer → Δ = −93.6 t kept; reviewed `evaluateQuality` | Pass: snapshots never summed; ratios null until window mature; sensitivity labelled "not a CI" | existing tests |
| 9 | Security / PII | Secrets or licensed AIS in repo/Pages | Regex scan for keys/tokens; inspected data files, worker auth | Pass: no secrets; aggregate-only AIS data; worker uses HMAC session + same-origin. Dead `/api/vessel` → Wikidata fallback (DEF-009). Bot pushes to main (DEF-010) | aisstream key read from env only; test refuses start without key |
| 10 | Deployment regression | Broken build can reach Pages | Read workflows; CI history | **Fail**: no test gate before deploy (DEF-002); npm test incomplete (DEF-003); hourly cron unproven (DEF-006). SW is network-only (no stale cache) | DEF-002/003 fixed |

## 3. Test matrix (`npm test`, 2026-11-14, Node 22)
| Suite | Tests | Covers |
|---|---|---|
| `tests/smoke.mjs` (jsdom) | 1 script, ~60 asserts | V9 render, 2026 official view, no fabricated 2026 annual, WtW block, print report |
| `ais-lab/*.test.mjs` | existing | Lab tracker, diagnostics, reconciliation |
| `src/*.test.mjs` | existing + 3 new | quality history, voyage audit, pipeline, traffic insights (any-month) |
| `sca-stats/*.test.mjs` | existing | monthly/annual reconciliation, announcements, archive parser |
| `backend/*.test.mjs` | 19 new | normaliser, timestamps, MMSI, FSM (N/S, visit, dup, late, jump, fast, gap, dwell, repeat, open, future), provider adapter, replay→reconciliation |
| `tests/decision-room.test.mjs`, `tests/provenance-manifest.test.mjs` | 2 + 2 new | Decision Room logic; data SHA-256 pinning |
| **Total** | **80 pass / 0 fail** | |

Not covered by any automated test (and cannot be without external inputs): live provider coverage, SCA register precision/recall, vessel-specific fuel calibration, WtW pathway factors, screenshot of deployed Pages after merge.
