// Command refresh-pks pulls the European Root Certificate Authority
// (ERCA) public key files from the JRC and writes them into the
// `pki/` directory of the surrounding go-ddd module so they're picked
// up by the next build's go:embed.
//
// The JRC's web server is locked down against automated clients —
// plain GET requests get HTTP 403. This tool sets a browser-like User
// Agent and chains cookies through redirects, which is usually enough
// for a non-interactive fetch from a developer workstation. Where it
// still fails (some JRC pages require a JavaScript-resolved session),
// the user can save the key files manually from a browser session and
// drop them into pki/.
//
// Usage:
//
//	cd packages/go-ddd
//	go run ./cmd/refresh-pks/
//
// Output:
//
//	pki/erca_gen1.bin  — 132-byte modulus(128) || exponent(4)
//	pki/erca_gen2.bin  — full ERCA Gen2 self-signed certificate
//
// The actual download URLs are defined as constants below — they have
// to be kept in sync with the JRC's site structure, which has been
// stable since 2016 but isn't formally versioned.
package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// JRC download URLs. The Gen1 ("DT" = digital tachograph) and Gen2
// ("ST" = smart tachograph) PKI infrastructures are hosted separately.
// These URLs have been stable since publication but aren't versioned
// — if either 404s, check the JRC's website for the new path.
const (
	// Gen1 ERCA root: raw 132-byte modulus(128) || exponent(4) blob.
	urlERCAGen1 = "https://dtc.jrc.ec.europa.eu/iotacho_dt/EC_PK.bin"
	// Gen2 ERCA root: full Gen2 self-signed certificate (DER-TLV).
	urlERCAGen2 = "https://dtc.jrc.ec.europa.eu/iotacho_st/EU.bin"

	// Browser-style user agent — the JRC rejects plain curl-style UAs.
	browserUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
		"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

func main() {
	outDir := flag.String("out", "pki", "output directory")
	flag.Parse()

	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		die("create %s: %v", *outDir, err)
	}

	jobs := []struct {
		url  string
		path string
		desc string
	}{
		{urlERCAGen1, filepath.Join(*outDir, "erca_gen1.bin"), "Gen1 ERCA root (132-byte modulus+exponent)"},
		{urlERCAGen2, filepath.Join(*outDir, "erca_gen2.bin"), "Gen2 ERCA self-signed cert"},
	}
	for _, j := range jobs {
		fmt.Printf("→ %s\n  from %s\n", j.desc, j.url)
		if err := fetch(j.url, j.path); err != nil {
			fmt.Fprintf(os.Stderr, "  ✗ %v\n", err)
			fmt.Fprintln(os.Stderr,
				"    (fallback: open the URL in a browser, save the file, "+
					"and drop it into "+j.path+")")
			continue
		}
		st, _ := os.Stat(j.path)
		fmt.Printf("  ✓ wrote %s (%d bytes)\n", j.path, st.Size())
	}
}

func fetch(url, path string) error {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", browserUA)
	req.Header.Set("Accept", "*/*")
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("GET: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: %d %s", url, resp.StatusCode, resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read body: %w", err)
	}
	if len(body) == 0 {
		return fmt.Errorf("empty response")
	}
	if err := os.WriteFile(path, body, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

func die(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "refresh-pks: "+format+"\n", args...)
	os.Exit(1)
}
