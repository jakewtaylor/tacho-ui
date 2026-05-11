package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/traconiq/tachoparser/pkg/decoder"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

type ParseResult struct {
	Filename string `json:"filename"`
	FileType string `json:"fileType"`
	JSON     string `json:"json"`
}

// OpenAndParseDDD shows a file picker, then parses the chosen .ddd file.
// Returns nil result with nil error if the user cancels.
func (a *App) OpenAndParseDDD() (*ParseResult, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a tachograph file",
		Filters: []runtime.FileFilter{{
			DisplayName: "Tachograph files (*.ddd)",
			Pattern:     "*.ddd;*.DDD",
		}},
	})
	if err != nil {
		return nil, fmt.Errorf("open dialog: %w", err)
	}
	if path == "" {
		return nil, nil
	}
	return parseFile(path)
}

// ParseDDDBytes parses raw bytes; isCard=true for driver-card data, false for VU data.
// Reserved for callers that already have bytes in hand.
func (a *App) ParseDDDBytes(filename string, data []byte, isCard bool) (*ParseResult, error) {
	return parseBytes(filename, data, isCard)
}

// ParseDDDFromPath reads + parses a file by absolute path. Used by the Wails
// native file-drop handler on the frontend.
func (a *App) ParseDDDFromPath(path string) (*ParseResult, error) {
	return parseFile(path)
}

// PrintWindow triggers the native OS print dialog for the Wails window.
// Wails v2's bundled JS runtime doesn't expose runtime.WindowPrint, so this
// thin binding lets the frontend call it via the generated Go bindings.
// See https://github.com/wailsapp/wails/pull/2822.
func (a *App) PrintWindow() {
	runtime.WindowPrint(a.ctx)
}

func parseFile(path string) (*ParseResult, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}
	name := filepath.Base(path)
	isCard := looksLikeCard(name)
	return parseBytes(name, data, isCard)
}

func looksLikeCard(filename string) bool {
	upper := strings.ToUpper(filename)
	return strings.HasPrefix(upper, "C_")
}

func parseBytes(filename string, data []byte, isCard bool) (*ParseResult, error) {
	var parsed any
	var fileType string

	if isCard {
		var c decoder.Card
		if _, err := decoder.UnmarshalTLV(data, &c); err != nil {
			return nil, fmt.Errorf("parse card: %w", err)
		}
		parsed = c
		fileType = "card"
	} else {
		var v decoder.Vu
		if _, err := decoder.UnmarshalTV(data, &v); err != nil {
			return nil, fmt.Errorf("parse vu: %w", err)
		}
		parsed = v
		fileType = "vu"
	}

	raw, err := json.MarshalIndent(parsed, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal json: %w", err)
	}
	return &ParseResult{
		Filename: filename,
		FileType: fileType,
		JSON:     string(raw),
	}, nil
}
