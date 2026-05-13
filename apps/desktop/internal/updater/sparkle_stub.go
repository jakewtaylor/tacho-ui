//go:build !darwin || !sparkle

// Stub implementation used:
//   - On non-darwin (Sparkle is macOS-only)
//   - On darwin without the `sparkle` build tag (i.e. `wails dev` and any
//     un-packaged binary that would crash on launch when dyld can't find
//     Sparkle.framework)
//
// Calls become no-ops; the menu item still appears in dev but does nothing
// useful. release.sh enables the real path by building with `-tags sparkle`.
package updater

func Start()           {}
func CheckForUpdates() {}
