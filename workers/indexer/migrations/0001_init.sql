-- WealthKart indexer schema (ADR 0036). Public chain data only; addresses are lowercase hex.

-- Key/value state, e.g. the last block fully indexed.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Every circle the factory created.
CREATE TABLE IF NOT EXISTS circles (
  address       TEXT PRIMARY KEY,
  created_block INTEGER NOT NULL
);

-- Decoded circle events. Re-indexing a block is harmless: the primary key ignores duplicates.
CREATE TABLE IF NOT EXISTS logs (
  address   TEXT    NOT NULL,
  block     INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  tx        TEXT    NOT NULL,
  event     TEXT    NOT NULL,
  args      TEXT    NOT NULL,
  PRIMARY KEY (address, block, log_index)
);

CREATE INDEX IF NOT EXISTS logs_by_address_block ON logs (address, block, log_index);
