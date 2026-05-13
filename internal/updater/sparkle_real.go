//go:build darwin && sparkle

// Package updater wraps Sparkle on macOS release builds. Behind a `sparkle`
// build tag because the linker pulls in Sparkle.framework, which dyld then
// expects to find under @executable_path/../Frameworks/ at startup. That path
// only exists inside a packaged .app bundle, so `wails dev` builds (no tag)
// get the stub implementation instead and Sparkle is wholly absent.
//
// release.sh sets the tag and runs `install_name_tool -add_rpath` on the
// built binary to teach dyld where to look at runtime. The framework itself
// is copied into Contents/Frameworks/ as part of the same release step.
package updater

/*
#cgo darwin CFLAGS: -x objective-c -fobjc-arc -fmodules -F${SRCDIR}/../../third_party/Sparkle
#cgo darwin LDFLAGS: -F${SRCDIR}/../../third_party/Sparkle -framework Sparkle -framework Foundation -framework AppKit

#include "sparkle_darwin.h"
*/
import "C"

// Start initialises Sparkle's updater controller and kicks off background
// checks per Info.plist (SUEnableAutomaticChecks, SUScheduledCheckInterval).
// Call once during app startup. Idempotent.
func Start() {
	C.Sparkle_Start()
}

// CheckForUpdates triggers a user-initiated check. Shows native UI whether
// or not an update is available. Wire this to the "Check for Updates…" menu
// item.
func CheckForUpdates() {
	C.Sparkle_CheckForUpdates()
}
