-- One row per distinct driver card seen. card_number is the natural ID.
CREATE TABLE drivers (
    card_number TEXT PRIMARY KEY,
    surname TEXT,
    first_names TEXT,
    birth_date TEXT,
    issuing_state INTEGER,
    card_issue_date TEXT,
    card_expiry_date TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

-- Vehicles ever associated with a driver. PK = (registration, registration_nation)
-- because the registration string alone isn't unique across countries.
CREATE TABLE vehicles (
    registration TEXT NOT NULL,
    registration_nation INTEGER NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (registration, registration_nation)
);

-- Each file we've ingested. Dedup by SHA256 of the raw .ddd bytes.
-- (raw_json column added in 0001 and dropped in 0002.)
CREATE TABLE imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('card', 'vu')),
    file_sha256 TEXT NOT NULL UNIQUE,
    driver_card_number TEXT,
    imported_at TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    raw_json BLOB,
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number)
);
CREATE INDEX idx_imports_driver ON imports(driver_card_number, imported_at DESC);

-- Driver → vehicle usage windows. Used to attach a vehicle reg to a shift
-- via time-range overlap. Multiple windows per (driver, vehicle) are possible.
CREATE TABLE driver_vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_card_number TEXT NOT NULL,
    registration TEXT NOT NULL,
    registration_nation INTEGER NOT NULL,
    first_use_at TEXT NOT NULL,
    last_use_at TEXT NOT NULL,
    first_use_odometer INTEGER NOT NULL DEFAULT 0,
    last_use_odometer INTEGER NOT NULL DEFAULT 0,
    source_import_id INTEGER NOT NULL,
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number),
    FOREIGN KEY (registration, registration_nation)
        REFERENCES vehicles(registration, registration_nation),
    FOREIGN KEY (source_import_id) REFERENCES imports(id) ON DELETE CASCADE
);
CREATE INDEX idx_driver_vehicles_driver ON driver_vehicles(driver_card_number, first_use_at);

-- One row per (driver, date). Holds the activity_change_info events as JSON
-- so we don't lose ordering / structure. The Gen1 buffer covers ~337 days on
-- our sample card; Gen2 covers ~273. We always prefer Gen1 (longer history)
-- but fall back to Gen2 if Gen1 is empty.
CREATE TABLE daily_records (
    driver_card_number TEXT NOT NULL,
    date TEXT NOT NULL,
    distance_km INTEGER NOT NULL DEFAULT 0,
    activity_change_info_json TEXT NOT NULL,
    source_import_id INTEGER NOT NULL,
    PRIMARY KEY (driver_card_number, date),
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number),
    FOREIGN KEY (source_import_id) REFERENCES imports(id) ON DELETE CASCADE
);
CREATE INDEX idx_daily_records_driver ON daily_records(driver_card_number, date DESC);

-- Place records (shift begin/end markers).
CREATE TABLE place_records (
    driver_card_number TEXT NOT NULL,
    entry_time TEXT NOT NULL,
    entry_type INTEGER NOT NULL,
    country INTEGER NOT NULL DEFAULT 0,
    region INTEGER NOT NULL DEFAULT 0,
    odometer INTEGER NOT NULL DEFAULT 0,
    source_import_id INTEGER NOT NULL,
    PRIMARY KEY (driver_card_number, entry_time, entry_type),
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number),
    FOREIGN KEY (source_import_id) REFERENCES imports(id) ON DELETE CASCADE
);
CREATE INDEX idx_place_records_driver_time ON place_records(driver_card_number, entry_time);

-- GNSS samples (Gen2 only — Gen1 cards don't store these).
CREATE TABLE gnss_points (
    driver_card_number TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    odometer INTEGER NOT NULL DEFAULT 0,
    source_import_id INTEGER NOT NULL,
    PRIMARY KEY (driver_card_number, timestamp),
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number),
    FOREIGN KEY (source_import_id) REFERENCES imports(id) ON DELETE CASCADE
);
CREATE INDEX idx_gnss_driver_time ON gnss_points(driver_card_number, timestamp);

-- Events & faults (recording-equipment faults, security breaches, etc.).
CREATE TABLE events_faults (
    driver_card_number TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('event', 'fault')),
    event_type INTEGER NOT NULL,
    begin_time TEXT NOT NULL,
    end_time TEXT,
    vehicle_registration TEXT,
    source_import_id INTEGER NOT NULL,
    PRIMARY KEY (driver_card_number, kind, event_type, begin_time),
    FOREIGN KEY (driver_card_number) REFERENCES drivers(card_number),
    FOREIGN KEY (source_import_id) REFERENCES imports(id) ON DELETE CASCADE
);
CREATE INDEX idx_events_faults_driver ON events_faults(driver_card_number, begin_time DESC);
