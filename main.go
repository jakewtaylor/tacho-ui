package main

import (
	"embed"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "Tachograph Viewer",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		// SingleInstanceLock ensures that double-clicking a .ddd file while
		// the app is already running hands the path to the existing window
		// (via OnSecondInstanceLaunch) instead of spawning a duplicate.
		// macOS routes file-opens through Mac.OnFileOpen below regardless;
		// this is mostly for Windows + the command-line `tacho-ui foo.ddd`
		// case on any platform.
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "tacho-ui.jake-taylor.file-association",
			OnSecondInstanceLaunch: func(data options.SecondInstanceData) {
				app.handleOpenedFiles(filterDDDPaths(data.Args))
			},
		},
		Mac: &mac.Options{
			// Wails v2 hands us one path per invocation; multi-file selects on
			// macOS get coalesced into N sequential callbacks by the OS.
			OnFileOpen: func(filePath string) {
				app.handleOpenedFiles([]string{filePath})
			},
		},
		Bind: []any{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

// filterDDDPaths keeps only argv entries that look like file paths to a .ddd
// file. Wails' SingleInstanceLock hands us the raw os.Args of the second
// instance, which on Windows includes flags / launcher artifacts.
func filterDDDPaths(args []string) []string {
	out := make([]string, 0, len(args))
	for _, a := range args {
		if strings.HasSuffix(strings.ToLower(a), ".ddd") {
			out = append(out, a)
		}
	}
	return out
}
