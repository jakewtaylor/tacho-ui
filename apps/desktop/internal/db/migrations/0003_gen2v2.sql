-- Gen2v2-only data introduced by Reg. (EU) 2021/1228.
-- Three new top-level tables for events the VU logs (border transitions,
-- cargo load/unload presses, cargo-type changes), plus two augment columns
-- on existing tables for the GNSS authentication-status side-records.

-- Border crossings: VU-detected changes of country. Joined to imports
-- via source_import_id like every other per-driver record.
CREATE TABLE border_crossings (
    driver_card_number TEXT NOT NULL,
    crossed_at TEXT NOT NULL,
    country_left INTEGER NOT NULL,
    country_entered INTEGER NOT NULL,
    latitude REAL,
    longitude REAL,
    authentication_status TEXT NOT NULL DEFAULT 'unknown',
    odometer INTEGER NOT NULL DEFAULT 0,
    source_import_id INTEGER NOT NULL,
    PRIMARY KEY (driver_card_number, crossed_at, country_left, country_entered),
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number),
    FOREIGN KEY (source_import_id) REFERENCES imports(id) ON DELETE CASCADE
);
CREATE INDEX idx_border_crossings_driver_time
    ON border_crossings(driver_card_number, crossed_at);

-- Load/unload operations: driver-entered cargo events with GNSS position.
CREATE TABLE load_unload_ops (
    driver_card_number TEXT NOT NULL,
    operation_at TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('load', 'unload', 'simultaneous', 'unknown')),
    latitude REAL,
    longitude REAL,
    authentication_status TEXT NOT NULL DEFAULT 'unknown',
    odometer INTEGER NOT NULL DEFAULT 0,
    source_import_id INTEGER NOT NULL,
    PRIMARY KEY (driver_card_number, operation_at, operation_type),
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number),
    FOREIGN KEY (source_import_id) REFERENCES imports(id) ON DELETE CASCADE
);
CREATE INDEX idx_load_unload_driver_time
    ON load_unload_ops(driver_card_number, operation_at);

-- Load-type entries: every time the driver changes cargo kind.
CREATE TABLE load_type_entries (
    driver_card_number TEXT NOT NULL,
    entered_at TEXT NOT NULL,
    load_type TEXT NOT NULL CHECK (load_type IN ('undefined', 'goods', 'passengers', 'unknown')),
    source_import_id INTEGER NOT NULL,
    PRIMARY KEY (driver_card_number, entered_at),
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number),
    FOREIGN KEY (source_import_id) REFERENCES imports(id) ON DELETE CASCADE
);
CREATE INDEX idx_load_type_driver_time
    ON load_type_entries(driver_card_number, entered_at);

-- GNSS authentication status (Gen2v2 only) — joined to existing rows
-- by timestamp. Stored inline rather than in a side table because
-- there's a 1-to-at-most-1 relationship and the auth flag rendered
-- inline is what the UI actually needs.
ALTER TABLE place_records
    ADD COLUMN authentication_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE gnss_points
    ADD COLUMN authentication_status TEXT NOT NULL DEFAULT 'unknown';
