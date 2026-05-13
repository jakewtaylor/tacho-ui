//go:build darwin && sparkle

#ifndef TACHO_UI_SPARKLE_DARWIN_H
#define TACHO_UI_SPARKLE_DARWIN_H

// Initialise the Sparkle updater controller. Safe to call multiple times; only
// the first call constructs the controller. Idempotent. Reads SUFeedURL,
// SUPublicEDKey, SUEnableAutomaticChecks etc. from the running bundle's
// Info.plist.
void Sparkle_Start(void);

// Trigger a user-initiated update check. Shows UI either way ("an update is
// available" or "you're up to date"). Suitable for the "Check for Updates…"
// menu item.
void Sparkle_CheckForUpdates(void);

#endif
