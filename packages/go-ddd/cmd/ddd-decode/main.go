// ddd-decode parses a single .ddd file and prints its contents as JSON.
// Intended for one-shot inspection and as the diff target when comparing
// our parser against upstream implementations.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	ddd "github.com/jakewtaylor/go-ddd"
)

func main() {
	pretty := flag.Bool("pretty", true, "pretty-print JSON output")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [-pretty=false] [path]\n", os.Args[0])
		fmt.Fprintln(os.Stderr, "  If path is omitted, .ddd bytes are read from stdin.")
		flag.PrintDefaults()
	}
	flag.Parse()

	if err := run(flag.Args(), *pretty); err != nil {
		fmt.Fprintln(os.Stderr, "ddd-decode:", err)
		os.Exit(1)
	}
}

func run(args []string, pretty bool) error {
	var (
		data []byte
		err  error
	)
	switch len(args) {
	case 0:
		data, err = io.ReadAll(os.Stdin)
	case 1:
		data, err = os.ReadFile(args[0])
	default:
		return fmt.Errorf("expected 0 or 1 positional arg, got %d", len(args))
	}
	if err != nil {
		return fmt.Errorf("read input: %w", err)
	}

	card, err := ddd.ParseCard(data)
	if err != nil {
		return fmt.Errorf("parse: %w", err)
	}

	enc := json.NewEncoder(os.Stdout)
	if pretty {
		enc.SetIndent("", "  ")
	}
	if err := enc.Encode(card); err != nil {
		return fmt.Errorf("encode: %w", err)
	}
	return nil
}
