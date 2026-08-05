# CERI-SC Intelligence Platform V9.0

**Indicative Carbon Emission Reduction Index — Suez Canal**

A bilingual decision-support platform that preserves the six-module command-centre structure while making model status, uncertainty, lifecycle boundaries and data governance explicit.

## Protected application

https://ceri-sc.rasheadsca.workers.dev/

## Modules

- Executive overview with official/modelled status, compact values and sensitivity bands
- One canonical single-vessel Suez versus Cape simulator
- Historical intelligence with method status by year
- Alternative fuels with separated Tank-to-Wake and lifecycle boundaries
- Green-project register and roadmap: short term 2025–2028, medium term 2029–2032, long term 2033–2050
- Administration, roles, evidence fields, versions, audit trail and in-app feedback

## Security and storage

- `ACCESS_PASSWORD` protects the application. When `ADMIN_PASSWORD` is configured, it grants the admin role; otherwise the access password retains admin compatibility.
- Sessions are signed, `HttpOnly`, `Secure`, `SameSite=Strict` and expire after eight hours.
- The Worker applies same-origin checks, a best-effort login throttle and security headers.
- The interface reports D1 as active only when a `DB` binding is present. Otherwise it is visibly read-only.

To enable durable administration, create a Cloudflare D1 database, bind it as `DB` in `wrangler.jsonc`, and apply `migrations/0001_governance.sql`. The Worker also creates missing tables safely on first use.

## Reporting and quality checks

The dashboard print control generates exactly four A4 pages with a white background, green text, light panels and 12-point body copy.

Run the repeatable checks with:

```bash
npm test
```

## Important notice

Results are indicative modelled estimates. They are not navigation advice, an official toll quotation, a measured inventory, an approved MRV statement or a carbon credit. Avoided emissions and carbon removals are not aggregated as one verified performance value.

© 2026 CERI-SC V9.0
