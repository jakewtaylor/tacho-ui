//go:build darwin && sparkle

// Objective-C glue between Go (via CGo) and Sparkle's SPUStandardUpdaterController.
//
// We use the "standard" controller because it ships with a sensible default
// user driver — Sparkle handles all the UI (update-available dialog, download
// progress, install-and-relaunch confirmation) natively. We're not embedding
// a custom-skinned updater inside the WebView.
//
// Both Sparkle_Start and Sparkle_CheckForUpdates dispatch onto the main queue
// because SPUStandardUpdaterController must be created and called from the
// main thread; CGo callbacks land on whatever Go thread happens to invoke them.

#import <Sparkle/Sparkle.h>
#import "sparkle_darwin.h"

static SPUStandardUpdaterController *gUpdaterController = nil;

static void ensureController(void) {
    if (gUpdaterController != nil) return;
    // initWithStartingUpdater:YES means Sparkle reads SUEnableAutomaticChecks
    // and the SUScheduledCheckInterval from Info.plist and starts the timer.
    gUpdaterController = [[SPUStandardUpdaterController alloc]
        initWithStartingUpdater:YES
                updaterDelegate:nil
             userDriverDelegate:nil];
}

void Sparkle_Start(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        ensureController();
    });
}

void Sparkle_CheckForUpdates(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        ensureController();
        [gUpdaterController checkForUpdates:nil];
    });
}
