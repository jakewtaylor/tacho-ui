CREATE TABLE IF NOT EXISTS licenses (
  id                          SERIAL PRIMARY KEY,
  key                         TEXT NOT NULL UNIQUE,
  email                       TEXT NOT NULL,
  stripe_customer_id          TEXT,
  stripe_session_id           TEXT UNIQUE,
  issued_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  update_window_expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at                  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS activations (
  id              SERIAL PRIMARY KEY,
  license_id      INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  machine_id      TEXT NOT NULL,
  machine_name    TEXT,
  app_build_date  DATE NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS activations_license_machine_uq
  ON activations (license_id, machine_id);
