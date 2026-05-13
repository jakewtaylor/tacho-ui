// Package db owns the SQLite store: opening, schema migrations, and all CRUD
// for drivers, vehicles, imports, and per-driver records.
//
// Driver: modernc.org/sqlite (pure-Go port, no CGO needed — keeps Wails builds
// painless across platforms).
package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// DB wraps a *sql.DB plus the resolved on-disk path so callers (and tests)
// can introspect where data lives.
type DB struct {
	conn *sql.DB
	path string
}

// Open returns a DB rooted at the platform's user-config dir. Idempotent —
// safe to call on startup of every run. Creates the directory if missing and
// applies any unapplied migrations under internal/db/migrations.
func Open(ctx context.Context) (*DB, error) {
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("locate user config dir: %w", err)
	}
	dir := filepath.Join(cfgDir, "tacho-ui")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir %s: %w", dir, err)
	}
	return openAt(ctx, filepath.Join(dir, "tacho.db"))
}

// OpenAt opens (or creates) a DB at a specific file path. Used by tests.
func OpenAt(ctx context.Context, path string) (*DB, error) {
	return openAt(ctx, path)
}

// OpenInMemory opens an ephemeral in-memory DB. Used by the desktop app's
// trial mode: same migrations + same query surface, but everything vanishes
// when the process exits. Skips the WAL pragma (no on-disk WAL to write).
func OpenInMemory(ctx context.Context) (*DB, error) {
	return openDSN(ctx, ":memory:?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", ":memory:")
}

func openAt(ctx context.Context, path string) (*DB, error) {
	// Pragmas: WAL for concurrent reads, FK enforcement on, busy timeout for
	// transient contention. Set via DSN query so they apply per-connection.
	dsn := path + "?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	return openDSN(ctx, dsn, path)
}

func openDSN(ctx context.Context, dsn, path string) (*DB, error) {
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite %s: %w", path, err)
	}
	// modernc.org/sqlite ignores SetMaxOpenConns > 1 for write-heavy paths;
	// 1 connection is fine for a desktop app.
	conn.SetMaxOpenConns(1)
	if err := conn.PingContext(ctx); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	d := &DB{conn: conn, path: path}
	if err := d.migrate(ctx); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

// Path returns the on-disk DB file path.
func (d *DB) Path() string { return d.path }

// Conn exposes the raw *sql.DB for packages in this module that need to
// build queries directly (the importer, mostly).
func (d *DB) Conn() *sql.DB { return d.conn }

// Close releases the underlying connection. Safe to call multiple times.
func (d *DB) Close() error {
	if d == nil || d.conn == nil {
		return nil
	}
	return d.conn.Close()
}

// migrate applies any embedded migrations not yet recorded in schema_migrations.
// Migrations run in lexical order (file naming convention: NNNN_name.sql).
func (d *DB) migrate(ctx context.Context) error {
	if _, err := d.conn.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	applied := make(map[int]bool)
	rows, err := d.conn.QueryContext(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("read schema_migrations: %w", err)
	}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			rows.Close()
			return fmt.Errorf("scan schema_migrations: %w", err)
		}
		applied[v] = true
	}
	rows.Close()

	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".sql") {
			continue
		}
		version, err := parseMigrationVersion(name)
		if err != nil {
			return fmt.Errorf("parse migration version %q: %w", name, err)
		}
		if applied[version] {
			continue
		}
		body, err := fs.ReadFile(migrationsFS, "migrations/"+name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		// Run the migration in its own transaction so a failure half-way
		// through doesn't leave the schema in a torn state.
		tx, err := d.conn.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
			version, name, time.Now().UTC().Format(time.RFC3339),
		); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}
	return nil
}

// parseMigrationVersion extracts the leading integer from a filename like
// "0001_init.sql".
func parseMigrationVersion(name string) (int, error) {
	idx := strings.Index(name, "_")
	if idx <= 0 {
		return 0, fmt.Errorf("expected NNNN_name.sql, got %q", name)
	}
	var v int
	if _, err := fmt.Sscanf(name[:idx], "%d", &v); err != nil {
		return 0, err
	}
	return v, nil
}
