//go:build darwin

package license

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

// MachineID returns a stable per-machine identifier for license activation.
// On macOS this is sha256(IOPlatformUUID) — the hardware UUID exposed by
// IOPlatformExpertDevice. Hashing keeps the raw UUID off the wire.
//
// The hostname is appended only to MachineName (display only); the ID itself
// is purely UUID-derived so a rename doesn't invalidate the activation.
func MachineID() (string, error) {
	uuid, err := readPlatformUUID()
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(uuid))
	return hex.EncodeToString(sum[:]), nil
}

// MachineName returns a human-friendly label for the activation (shown back
// to the user on the website). Best-effort — falls back to "Mac".
func MachineName() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "Mac"
	}
	return strings.TrimSuffix(name, ".local")
}

var uuidRe = regexp.MustCompile(`"IOPlatformUUID"\s*=\s*"([^"]+)"`)

func readPlatformUUID() (string, error) {
	out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
	if err != nil {
		return "", fmt.Errorf("license: ioreg: %w", err)
	}
	m := uuidRe.FindSubmatch(out)
	if len(m) < 2 {
		return "", fmt.Errorf("license: IOPlatformUUID not in ioreg output")
	}
	return string(m[1]), nil
}
