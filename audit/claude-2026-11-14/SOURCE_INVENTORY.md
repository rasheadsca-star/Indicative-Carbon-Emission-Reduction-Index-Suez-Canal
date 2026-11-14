# WP1 — Source inventory and access (checked 2026-11-14)

Network note: from the audit sandbox, direct fetches of suezcanal.gov.eg and IMF ArcGIS endpoints were blocked or required approval that was not available; findings below come from web search snippets. **Nothing below has been added to `data/`.**

## A. Official SCA traffic — what exists publicly
| Granularity | Source | Status in repo | Notes |
|---|---|---|---|
| Annual 2008–2025 | SCA annual report archive (PDF) | 2023–2025 transcribed + reconciled; 2015–2022 counts in `index.html` not re-verified in this audit | `sca-annual-archive-watch` sees 2025 as latest |
| Monthly 2023–2025 | Annual reports, Table 2 | In `data/`, sums = annual totals (re-verified: 26,434 / 13,213 / 12,758 vessels; 1,568,257 / 524,527 / 522,084 k net t) | |
| Monthly Oct 2026 | SCA press release 5 Nov 2026 | In `data/` | 1,490 vessels / 88 Mt / $724 M vs 1,128 / 47 Mt / $373 M — corroborated by EgyptToday and Akhbar El-Yom (5 Nov 2026) |
| Monthly Jul & Aug 2026 | Chairman statements, **secondary-reported** (FreightWaves) | **NOT ingested — CANDIDATE** | Jul 1,340 vessels / $505 M; Aug 1,358 vs 1,070 (Aug 2025) / $567.1 M. Note Aug 2025 = 1,070 matches the annual-report table → consistent. Needs the SCA primary URL before ingestion. |
| Since-1-Jul-2026 cumulative | Xinhua via Hellenic Shipping News | Not ingested | 5,874 vessels / $1.97 bn "since July 1" — end date not stated in snippet → cannot be used as a period total |
| 1 Jan–8 Feb 2026 | SCA chairman (Shipping Telegraph) | Was the basis of the removed 12,300 annualisation (DEF-001) | 1,315 vessels / 56 Mt / $449 M — a 39-day period total, not an annual figure |
| Daily | Sporadic press items only (e.g. 16 Sep 2026: 39 vessels) | One day in `data/` | **No public complete daily or weekly series** |
| Ship-level register | SCA internal (navigation / VTMS) | Absent | Required for AIS precision/recall; must stay off the public repo |

**Recommendation:** add the Jul/Aug/Sep 2026 monthly releases only after the user (or GPT) supplies the SCA primary press-release URLs; DEF-004's engine change already accepts any `YYYY-MM`.

## B. Independent (non-official) traffic benchmark
| Source | What | Latency | Licence | Use |
|---|---|---|---|---|
| IMF PortWatch "Daily_Chokepoints_Data" (ArcGIS FeatureServer, 1,000 records/call) | Daily AIS-derived transit calls + capacity by vessel type for Suez, Bab el-Mandeb, Cape | Published weekly, several days lag | IMF terms — confirm before systematic download | **Lagged daily benchmark**, labelled EXTERNAL_ESTIMATE; never official |

## C. AIS providers for north approach + canal + south approach
| Provider | Collection | Suez-specific claim | API / delivery | Cost / terms | Fit |
|---|---|---|---|---|---|
| Open Waters (current) | Community | none demonstrated; 1–9 MMSI per 30-min snapshot | WS + snapshot | free | Diagnostic only |
| AISStream.io | Community terrestrial | none; bbox subscription | WebSocket only, free API key | free, no SLA | Cheapest **proof-of-coverage trial**; adapter written (`backend/providers/aisstream.mjs`) |
| AISHub | Community exchange | depends on contributors | raw/JSON | free **only if you contribute an NMEA feed** | Viable if SCA contributes a receiver |
| Spire Maritime | Satellite + terrestrial + "Enhanced Satellite AIS" | markets Enhanced S-AIS for congested zones incl. Suez | GraphQL/REST, TCP stream | paid; public price list | Commercial candidate |
| Kpler / MarineTraffic | Hybrid | global | API | paid | Commercial candidate |
| S&P Global AIS Platinum | 2,000+ terrestrial stations + exactEarth satellites | global | API/stream | paid | Commercial candidate |
| Lloyd's List Intelligence (SeaOrbis) | Global | regional TCP stream filtering, invalid-message filtering | TCP | paid | Commercial candidate |
| **SCA VTMS / own AIS base stations** | Shore stations along the canal (to confirm with SCA navigation dept.) | Direct canal coverage | internal | institutional approval | **Best fit** for completeness and for the official register join |

**No provider has been contacted, trialled or paid.** Coverage for all rows is UNVERIFIED until a ≥ 7-day trial is reconciled.

## D. Credentials / approvals the user or SCA must obtain
1. Decision whether the trial runs under the user personally or SCA (terms acceptance).
2. AISStream API key (free) **or** commercial trial key — stored as a server secret.
3. An always-on host (SCA data centre or approved cloud VM).
4. SCA approval to use (internally) a ship-level daily register for the trial week(s).
5. Primary URLs for Jul–Sep 2026 monthly announcements.
