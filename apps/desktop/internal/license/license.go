// Package license owns the desktop side of the licensing flow:
//
//   - reads/writes a JSON file containing the signed JWT issued by the
//     activation server,
//   - verifies the JWT locally using the embedded Ed25519 public key,
//   - exposes the current license State to app.go and the bound methods,
//   - performs first-time activation and periodic heartbeats against the
//     web app's /api/license/* endpoints.
//
// The license file lives at:  os.UserConfigDir()/tacho-ui/license.json
package license

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	licenseFileName     = "license.json"
	heartbeatInterval   = 24 * time.Hour * 7  // weekly
	heartbeatGracePeriod = 24 * time.Hour * 7 // refuse to keep running licensed if no heartbeat in 14 days total
)

// File is the on-disk representation. We persist the raw JWT plus a snapshot
// of the verified claims so the UI can render status without re-verifying on
// every render. The JWT is the source of truth on launch.
type File struct {
	JWT                   string    `json:"jwt"`
	LicenseKey            string    `json:"license_key"`
	Email                 string    `json:"email"`
	MachineID             string    `json:"machine_id"`
	UpdateWindowExpiresAt time.Time `json:"update_window_expires_at"`
	LastHeartbeatAt       time.Time `json:"last_heartbeat_at"`
}

// State is the runtime view of the license. Mutations go through Activate or
// the heartbeat loop. All methods are safe for concurrent use.
type State struct {
	mu          sync.RWMutex
	configDir   string
	buildDate   string // YYYY-MM-DD, baked at compile time
	file        *File  // nil => trial mode
	lastErr     error  // most recent activation/heartbeat error, for UI surfacing
}

// New constructs a State, attempts to load + verify any persisted license,
// and starts a background heartbeat loop. Call Stop on shutdown.
//
// buildDate is the YYYY-MM-DD the desktop binary was built on (baked via
// ldflags). An empty or "dev" buildDate is treated as today's date so dev
// builds can still activate.
func New(configDir, buildDate string) *State {
	s := &State{
		configDir: configDir,
		buildDate: normalizeBuildDate(buildDate),
	}
	s.load()
	return s
}

func normalizeBuildDate(s string) string {
	if s == "" || s == "dev" {
		return time.Now().UTC().Format("2006-01-02")
	}
	return s
}

func (s *State) filePath() string {
	return filepath.Join(s.configDir, licenseFileName)
}

// load reads license.json (if any), verifies the JWT, and stores the result.
// A missing file is the trial-mode default — not an error. Verification
// failure (tampered, expired beyond grace, wrong issuer) reverts to trial.
func (s *State) load() {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, err := os.ReadFile(s.filePath())
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			s.lastErr = fmt.Errorf("read license file: %w", err)
		}
		return
	}
	var f File
	if err := json.Unmarshal(raw, &f); err != nil {
		s.lastErr = fmt.Errorf("parse license file: %w", err)
		return
	}
	claims, err := Verify(f.JWT)
	if err != nil {
		s.lastErr = err
		return
	}
	if time.Since(f.LastHeartbeatAt) > heartbeatInterval+heartbeatGracePeriod {
		s.lastErr = errors.New("license heartbeat overdue — please re-check connection")
		return
	}
	f.LicenseKey = claims.LicenseKey
	f.Email = claims.Email
	f.UpdateWindowExpiresAt = claims.UpdateWindowExpiresAt
	s.file = &f
}

func (s *State) save() error {
	if s.file == nil {
		return nil
	}
	body, err := json.MarshalIndent(s.file, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal license file: %w", err)
	}
	if err := os.MkdirAll(s.configDir, 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	if err := os.WriteFile(s.filePath(), body, 0o600); err != nil {
		return fmt.Errorf("write license file: %w", err)
	}
	return nil
}

// Status is a snapshot for the UI.
type Status struct {
	Licensed              bool      `json:"licensed"`
	Email                 string    `json:"email,omitempty"`
	LicenseKey            string    `json:"licenseKey,omitempty"`
	UpdateWindowExpiresAt time.Time `json:"updateWindowExpiresAt,omitzero"`
	MachinesAllowed       int       `json:"machinesAllowed"`
	BuildDate             string    `json:"buildDate"`
	LastError             string    `json:"lastError,omitempty"`
}

// Snapshot returns the current state in a JSON-friendly shape for bindings.
func (s *State) Snapshot() Status {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := Status{
		MachinesAllowed: 3,
		BuildDate:       s.buildDate,
	}
	if s.lastErr != nil {
		out.LastError = s.lastErr.Error()
	}
	if s.file != nil {
		out.Licensed = true
		out.Email = s.file.Email
		out.LicenseKey = s.file.LicenseKey
		out.UpdateWindowExpiresAt = s.file.UpdateWindowExpiresAt
	}
	return out
}

// Licensed reports whether the app currently has a valid license file.
func (s *State) Licensed() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.file != nil
}

// Activate exchanges a user-entered license key for a signed JWT, writes the
// result to disk, and updates state in-memory. Returns the new Status.
func (s *State) Activate(ctx context.Context, key string) (Status, error) {
	machineID, err := MachineID()
	if err != nil {
		return s.Snapshot(), fmt.Errorf("read machine id: %w", err)
	}
	resp, err := activate(ctx, activateRequest{
		LicenseKey:   key,
		MachineID:    machineID,
		MachineName:  MachineName(),
		AppBuildDate: s.buildDate,
	})
	if err != nil {
		s.mu.Lock()
		s.lastErr = err
		s.mu.Unlock()
		return s.Snapshot(), err
	}
	claims, err := Verify(resp.JWT)
	if err != nil {
		s.mu.Lock()
		s.lastErr = err
		s.mu.Unlock()
		return s.Snapshot(), err
	}
	s.mu.Lock()
	s.file = &File{
		JWT:                   resp.JWT,
		LicenseKey:            claims.LicenseKey,
		Email:                 claims.Email,
		MachineID:             machineID,
		UpdateWindowExpiresAt: claims.UpdateWindowExpiresAt,
		LastHeartbeatAt:       time.Now().UTC(),
	}
	s.lastErr = nil
	saveErr := s.save()
	s.mu.Unlock()
	if saveErr != nil {
		return s.Snapshot(), saveErr
	}
	return s.Snapshot(), nil
}

// Deactivate removes the local license file. The activation row on the server
// is left intact (no remote API call) — re-activation on the same machine
// just refreshes the JWT.
func (s *State) Deactivate() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	err := os.Remove(s.filePath())
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove license file: %w", err)
	}
	s.file = nil
	s.lastErr = nil
	return nil
}

// Heartbeat is invoked periodically to refresh the JWT (and update lastSeen
// on the server). Failure is non-fatal — the cached JWT keeps working until
// it expires beyond grace, then the next Snapshot reports trial.
func (s *State) Heartbeat(ctx context.Context) error {
	s.mu.RLock()
	if s.file == nil {
		s.mu.RUnlock()
		return errors.New("not licensed")
	}
	key := s.file.LicenseKey
	machineID := s.file.MachineID
	s.mu.RUnlock()

	resp, err := heartbeat(ctx, heartbeatRequest{LicenseKey: key, MachineID: machineID})
	if err != nil {
		s.mu.Lock()
		s.lastErr = err
		// Revoked or unknown → drop into trial mode at next launch.
		if apiErr, ok := err.(*APIError); ok && (apiErr.Status == 404 || apiErr.Status == 410) {
			s.file = nil
			_ = os.Remove(s.filePath())
		}
		s.mu.Unlock()
		return err
	}
	claims, err := Verify(resp.JWT)
	if err != nil {
		s.mu.Lock()
		s.lastErr = err
		s.mu.Unlock()
		return err
	}
	s.mu.Lock()
	s.file.JWT = resp.JWT
	s.file.Email = claims.Email
	s.file.UpdateWindowExpiresAt = claims.UpdateWindowExpiresAt
	s.file.LastHeartbeatAt = time.Now().UTC()
	s.lastErr = nil
	saveErr := s.save()
	s.mu.Unlock()
	return saveErr
}

// StartHeartbeatLoop kicks off a goroutine that calls Heartbeat once on
// launch (if the cached JWT is older than 6 days) and then weekly. The
// returned cancel func should be called on shutdown.
func (s *State) StartHeartbeatLoop(ctx context.Context) context.CancelFunc {
	ctx, cancel := context.WithCancel(ctx)
	go func() {
		// Run an initial check shortly after launch if we're due.
		select {
		case <-ctx.Done():
			return
		case <-time.After(30 * time.Second):
		}
		s.maybeHeartbeat(ctx)
		ticker := time.NewTicker(heartbeatInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.maybeHeartbeat(ctx)
			}
		}
	}()
	return cancel
}

func (s *State) maybeHeartbeat(ctx context.Context) {
	s.mu.RLock()
	due := s.file != nil && time.Since(s.file.LastHeartbeatAt) > heartbeatInterval-12*time.Hour
	s.mu.RUnlock()
	if !due {
		return
	}
	_ = s.Heartbeat(ctx)
}
