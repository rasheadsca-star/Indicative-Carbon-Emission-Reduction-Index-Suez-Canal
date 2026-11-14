-- CERI-SC durable AIS + official-traffic store (PostgreSQL 15+, optional PostGIS).
-- Target: a private, access-controlled server. NEVER the public GitHub repo or Pages.
-- Raw positions/identities are licensed provider data: retention and publication follow the licence.

CREATE TABLE provider (
  provider_id        TEXT PRIMARY KEY,              -- e.g. 'aisstream', 'spire', 'sca-internal'
  licence_ref        TEXT NOT NULL,                 -- contract / ToS document id or URL
  licence_accepted_by TEXT NOT NULL,                -- person/role who accepted terms
  coverage_status    TEXT NOT NULL CHECK (coverage_status IN ('UNVERIFIED','TRIAL','VERIFIED_FOR_PERIOD')),
  coverage_evidence  TEXT,                          -- link to trial report when not UNVERIFIED
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalised position reports (partition by day; retention per licence, e.g. 90 days).
CREATE TABLE ais_position (
  provider_id  TEXT NOT NULL REFERENCES provider,
  mmsi         CHAR(9) NOT NULL CHECK (mmsi ~ '^[2-7][0-9]{8}$'),
  ts_utc       TIMESTAMPTZ NOT NULL,                -- explicit UTC from source; naive timestamps are rejected upstream
  received_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat          DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon          DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
  sog_kn       REAL, cog_deg REAL, heading_deg REAL, nav_status SMALLINT,
  zone         TEXT NOT NULL CHECK (zone IN ('north','canal','south','outside')),
  PRIMARY KEY (mmsi, ts_utc, provider_id)          -- exact-duplicate guard
) PARTITION BY RANGE (ts_utc);

CREATE TABLE ingest_reject (
  provider_id TEXT NOT NULL, received_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE provider_health (
  provider_id TEXT NOT NULL REFERENCES provider, sampled_utc TIMESTAMPTZ NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('DISCONNECTED','CONNECTED_BUT_SILENT','FLOWING')),
  msgs_last_10min INTEGER NOT NULL, distinct_mmsi_last_10min INTEGER NOT NULL, reconnects INTEGER NOT NULL,
  PRIMARY KEY (provider_id, sampled_utc)
);

-- Static particulars: source-tagged, never silently merged across sources.
CREATE TABLE vessel_static (
  mmsi CHAR(9) NOT NULL, imo CHAR(7), name TEXT, ship_type SMALLINT, length_m REAL, beam_m REAL,
  source TEXT NOT NULL,                             -- 'AIS msg 5', 'IHS', 'SCA register', 'Wikidata (unverified)'
  verified BOOLEAN NOT NULL DEFAULT false, observed_utc TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (mmsi, source, observed_utc)
);

-- FSM output: AIS-inferred candidates only.
CREATE TABLE transit_candidate (
  transit_id TEXT PRIMARY KEY,                      -- '<mmsi>-<N|S>-<last canal fix UTC>'
  mmsi CHAR(9) NOT NULL, direction TEXT NOT NULL CHECK (direction IN ('Northbound','Southbound')),
  entry_window_start TIMESTAMPTZ NOT NULL, entry_window_end TIMESTAMPTZ NOT NULL,
  exit_window_start  TIMESTAMPTZ NOT NULL, exit_window_end  TIMESTAMPTZ NOT NULL,
  canal_hours_lower REAL NOT NULL, canal_hours_upper REAL NOT NULL, max_gap_hours REAL NOT NULL,
  lat_coverage REAL NOT NULL, confidence TEXT NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  flags TEXT[] NOT NULL DEFAULT '{}', providers TEXT[] NOT NULL,
  fsm_version TEXT NOT NULL, geofence_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AIS_INFERRED_CANDIDATE_NOT_OFFICIAL',
  created_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Official SCA data: one row per published value, with full provenance. Restricted internal registers stay here, not in Git.
CREATE TABLE official_release (
  release_id TEXT PRIMARY KEY, publisher TEXT NOT NULL, source_url_or_doc TEXT NOT NULL,
  publication_date DATE NOT NULL, acquired_utc TIMESTAMPTZ NOT NULL, content_sha256 CHAR(64) NOT NULL,
  access_class TEXT NOT NULL CHECK (access_class IN ('PUBLIC','SCA_INTERNAL')), approval_ref TEXT
);
CREATE TABLE official_value (
  release_id TEXT NOT NULL REFERENCES official_release, metric TEXT NOT NULL,   -- 'vessels','net_tonnage','revenue_usd'
  period_start DATE NOT NULL, period_end DATE NOT NULL, granularity TEXT NOT NULL CHECK (granularity IN ('day','week','month','quarter','year','other')),
  value NUMERIC NOT NULL, unit TEXT NOT NULL, rounding TEXT NOT NULL, scope TEXT NOT NULL,
  PRIMARY KEY (release_id, metric, period_start, period_end, scope)
);
-- Ship-level official register (SCA_INTERNAL only; needed for precision/recall).
CREATE TABLE official_passage (
  release_id TEXT NOT NULL REFERENCES official_release, mmsi CHAR(9), imo CHAR(7),
  direction TEXT NOT NULL, exit_utc TIMESTAMPTZ NOT NULL, convoy TEXT, net_tonnage NUMERIC,
  PRIMARY KEY (release_id, imo, exit_utc)
);

CREATE TABLE reconciliation_run (
  run_id TEXT PRIMARY KEY, period_start DATE NOT NULL, period_end DATE NOT NULL,
  reference_release_id TEXT NOT NULL REFERENCES official_release,
  reference_complete BOOLEAN NOT NULL,              -- precision/recall are NULL unless true
  tolerance_minutes INTEGER NOT NULL, matched INTEGER NOT NULL, ais_only INTEGER NOT NULL, reference_only INTEGER NOT NULL,
  precision NUMERIC, recall NUMERIC, run_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reference_complete OR (precision IS NULL AND recall IS NULL))
);

CREATE TABLE audit_event (
  id BIGSERIAL PRIMARY KEY, at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), actor TEXT NOT NULL,
  action TEXT NOT NULL, object_ref TEXT NOT NULL, detail JSONB NOT NULL
);
