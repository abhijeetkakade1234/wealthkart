-- Contract monitoring (Phase 3, ADR 0041). One row per problem seen; re-checks update it.
CREATE TABLE IF NOT EXISTS alerts (
  address    TEXT    NOT NULL,
  kind       TEXT    NOT NULL,
  detail     TEXT    NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  resolved   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (address, kind)
);
