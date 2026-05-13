package license

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// DefaultAPIBaseURL is the production licensing endpoint. Override at build
// time with -ldflags "-X tacho-ui/internal/license.apiBaseURL=https://staging…"
// or at runtime with the TACHOLENS_API_URL env var (dev convenience).
var apiBaseURL = "https://tacholens.com"

func APIBaseURL() string {
	if v := os.Getenv("TACHOLENS_API_URL"); v != "" {
		return v
	}
	return apiBaseURL
}

type activateRequest struct {
	LicenseKey   string `json:"license_key"`
	MachineID    string `json:"machine_id"`
	MachineName  string `json:"machine_name,omitempty"`
	AppBuildDate string `json:"app_build_date"`
}

type activateResponse struct {
	JWT                   string `json:"jwt"`
	LicenseKey            string `json:"license_key"`
	Email                 string `json:"email"`
	UpdateWindowExpiresAt string `json:"update_window_expires_at"`
	MachinesAllowed       int    `json:"machines_allowed"`
}

type heartbeatRequest struct {
	LicenseKey string `json:"license_key"`
	MachineID  string `json:"machine_id"`
}

type heartbeatResponse struct {
	JWT                   string `json:"jwt"`
	LicenseKey            string `json:"license_key"`
	Email                 string `json:"email"`
	UpdateWindowExpiresAt string `json:"update_window_expires_at"`
}

// APIError is returned for non-2xx responses; the server's error/message
// payload is preserved so the UI can show it verbatim.
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"error"`
	Message string `json:"message"`
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Code != "" {
		return e.Code
	}
	return fmt.Sprintf("license server returned %d", e.Status)
}

var httpClient = &http.Client{Timeout: 15 * time.Second}

func doJSON(ctx context.Context, path string, body any, out any) error {
	buf, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("license: marshal request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, APIBaseURL()+path, bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("license: build request: %w", err)
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("user-agent", "TachoLens-desktop")
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("license: http: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		apiErr := &APIError{Status: resp.StatusCode}
		_ = json.Unmarshal(respBody, apiErr)
		return apiErr
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("license: decode response: %w", err)
	}
	return nil
}

// activate calls /api/license/activate. Returns the signed JWT or an *APIError.
func activate(ctx context.Context, req activateRequest) (*activateResponse, error) {
	out := &activateResponse{}
	if err := doJSON(ctx, "/api/license/activate", req, out); err != nil {
		return nil, err
	}
	return out, nil
}

// heartbeat calls /api/license/heartbeat. Returns a refreshed JWT.
func heartbeat(ctx context.Context, req heartbeatRequest) (*heartbeatResponse, error) {
	out := &heartbeatResponse{}
	if err := doJSON(ctx, "/api/license/heartbeat", req, out); err != nil {
		return nil, err
	}
	return out, nil
}
