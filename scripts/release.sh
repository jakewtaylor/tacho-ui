#!/usr/bin/env bash
# Build, sign, notarize, and staple a release build of tacho-ui.
#
# Prereqs (one-time):
#   1. Apple Developer ID Application cert installed in your login keychain.
#   2. App-specific password stored as a notarytool keychain profile:
#        xcrun notarytool store-credentials "tacho-ui-notarize" \
#          --apple-id "you@example.com" --team-id "TEAMID"
#
# What it does:
#   - wails build -platform darwin/universal -trimpath
#   - codesign with Hardened Runtime + build/darwin/entitlements.plist
#   - zip the .app, submit to Apple's notary service (synchronous, ~2-10 min)
#   - staple the notarization ticket onto the .app
#   - run `spctl --assess` as a final sanity check
#
# Output: build/bin/tacho-ui.app (signed + notarized + stapled), plus
#         build/bin/tacho-ui.zip (the notarization upload archive).

set -euo pipefail

# -- config -------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="tacho-ui"
APP_PATH="$REPO_ROOT/build/bin/$APP_NAME.app"
ZIP_PATH="$REPO_ROOT/build/bin/$APP_NAME.zip"
ENTITLEMENTS="$REPO_ROOT/build/darwin/entitlements.plist"
NOTARY_PROFILE="${NOTARY_PROFILE:-tacho-ui-notarize}"
SPARKLE_FRAMEWORK="$REPO_ROOT/third_party/Sparkle/Sparkle.framework"

# Auto-discover the Developer ID Application signing identity. Override by
# exporting SIGNING_IDENTITY if you have multiple Developer ID certs and want
# to pick a specific one.
SIGNING_IDENTITY="${SIGNING_IDENTITY:-$(security find-identity -v -p codesigning \
    | awk -F'"' '/Developer ID Application/ {print $2; exit}')}"

if [[ -z "$SIGNING_IDENTITY" ]]; then
    echo "error: no 'Developer ID Application' identity in keychain." >&2
    echo "       run \`security find-identity -v -p codesigning\` to inspect." >&2
    exit 1
fi

if [[ ! -f "$ENTITLEMENTS" ]]; then
    echo "error: entitlements file missing: $ENTITLEMENTS" >&2
    exit 1
fi

if [[ ! -d "$SPARKLE_FRAMEWORK" ]]; then
    echo "error: Sparkle.framework missing at $SPARKLE_FRAMEWORK" >&2
    echo "       download Sparkle 2.x from sparkle-project.org and extract into third_party/Sparkle/" >&2
    exit 1
fi

cd "$REPO_ROOT"

# Version: prefer the exact tag, fall back to `<tag>-<n>-g<sha>` for between-tag
# builds, fall back to a short sha for repos with no tags. Strip leading `v` for
# CFBundleShortVersionString (which expects "1.2.3", not "v1.2.3"); keep it on
# the Go-side Version const so it matches `git describe` output.
VERSION="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
VERSION_PLIST="${VERSION#v}"

echo "→ identity:     $SIGNING_IDENTITY"
echo "→ entitlements: $ENTITLEMENTS"
echo "→ notary:       $NOTARY_PROFILE"
echo "→ version:      $VERSION  (plist: $VERSION_PLIST)"
echo

# -- build --------------------------------------------------------------------

# Patch wails.json's info.productVersion so Wails templates the right
# CFBundleShortVersionString / CFBundleVersion into Info.plist. The trap
# restores wails.json on ANY exit — including the case where we later `exec`
# into finish-release.sh below, which we deliberately don't do until the
# restore has run.
cp wails.json wails.json.bak
restore_wails_json() {
    if [[ -f wails.json.bak ]]; then
        mv wails.json.bak wails.json
    fi
}
trap restore_wails_json EXIT
python3 -c "
import json, sys
d = json.load(open('wails.json'))
d.setdefault('info', {})['productVersion'] = '$VERSION_PLIST'
json.dump(d, open('wails.json', 'w'), indent=2)
open('wails.json', 'a').write('\n')
"

# Regenerate TS bindings BEFORE the sparkle-tagged build, using a non-sparkle
# build of the bindings scanner. Wails' build step normally re-generates
# bindings by spawning a temp binary linked with our build flags — with
# -tags sparkle that temp binary tries to load Sparkle.framework from a
# missing rpath at scan time. -skipbindings on the real build sidesteps it.
echo "==> regenerate TS bindings (no sparkle tag)"
wails generate module

echo
echo "==> wails build (universal, sparkle tag)"
wails build -platform darwin/universal -trimpath -clean -skipbindings \
    -tags sparkle \
    -ldflags "-X main.Version=$VERSION"

# -- crisp app icon -----------------------------------------------------------

# Wails generated iconfile.icns by downsampling build/appicon.png. Replace it
# (and the .ddd document icon) with a hand-tuned multi-resolution .icns built
# by iconutil from the per-size PNGs in icons/. Must happen before codesign,
# which seals Contents/Resources/.
echo
echo "==> swapping in hand-tuned .icns"
"$REPO_ROOT/scripts/build-icns.sh"
RESOURCES_DIR="$APP_PATH/Contents/Resources"
cp -f "$REPO_ROOT/build/darwin/appicon.icns" "$RESOURCES_DIR/iconfile.icns"
cp -f "$REPO_ROOT/build/darwin/appicon.icns" "$RESOURCES_DIR/dddFileIcon.icns"

# -- embed Sparkle.framework --------------------------------------------------

echo
echo "==> embedding Sparkle.framework"
# Wipe any prior framework so the copy is hermetic on re-runs (clean wails
# build empties the .app but be defensive).
FRAMEWORKS_DIR="$APP_PATH/Contents/Frameworks"
mkdir -p "$FRAMEWORKS_DIR"
rm -rf "$FRAMEWORKS_DIR/Sparkle.framework"
# Preserve symlinks inside the framework (Versions/Current → A).
ditto "$SPARKLE_FRAMEWORK" "$FRAMEWORKS_DIR/Sparkle.framework"

# Teach dyld where to look for Sparkle at runtime. CGo's flag-allowlist blocks
# -rpath at link time, so we patch the binary post-build instead.
echo "==> patching rpath"
BINARY="$APP_PATH/Contents/MacOS/$APP_NAME"
# Idempotent: ignore "already contains LC_RPATH" errors on re-runs.
install_name_tool -add_rpath "@executable_path/../Frameworks" "$BINARY" 2>/dev/null || true

# -- sign ---------------------------------------------------------------------

echo
echo "==> codesign"
# Sign Sparkle's nested helpers + XPC services first, then the main app over
# the top. --deep on the .app catches any stragglers. --timestamp embeds a
# secure timestamp (required for notarization). --options runtime enables
# Hardened Runtime. Sparkle's own helpers don't get our entitlements.
codesign \
    --force \
    --timestamp \
    --options runtime \
    --sign "$SIGNING_IDENTITY" \
    "$FRAMEWORKS_DIR/Sparkle.framework/Versions/B/XPCServices/Installer.xpc" \
    "$FRAMEWORKS_DIR/Sparkle.framework/Versions/B/XPCServices/Downloader.xpc" \
    "$FRAMEWORKS_DIR/Sparkle.framework/Versions/B/Autoupdate" \
    "$FRAMEWORKS_DIR/Sparkle.framework/Versions/B/Updater.app" \
    "$FRAMEWORKS_DIR/Sparkle.framework" \
    2>/dev/null || true

codesign \
    --deep \
    --force \
    --timestamp \
    --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$SIGNING_IDENTITY" \
    "$APP_PATH"

echo
echo "==> verify signature"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

# -- notarize -----------------------------------------------------------------

echo
echo "==> packaging for notarization"
rm -f "$ZIP_PATH"
# ditto preserves resource forks + extended attributes that plain `zip` strips.
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo
echo "==> submitting to Apple notary service"
# Submit WITHOUT --wait so we can stash the submission ID before polling. If
# the polling step is interrupted (laptop sleeps, network drops, Ctrl-C), the
# notarization continues server-side and ./scripts/finish-release.sh resumes.
ID_FILE="$REPO_ROOT/.notarization-id"
submit_out="$(xcrun notarytool submit "$ZIP_PATH" --keychain-profile "$NOTARY_PROFILE" 2>&1)"
echo "$submit_out"
SUB_ID="$(echo "$submit_out" | awk -F': ' '/^[[:space:]]*id:/ {print $2; exit}')"
if [[ -z "$SUB_ID" ]]; then
    echo "error: could not extract submission ID from notarytool output." >&2
    exit 1
fi
echo "$SUB_ID" > "$ID_FILE"
echo
echo "→ submission ID stashed in $ID_FILE"
echo "  if anything below this point fails, resume with:"
echo "      ./scripts/finish-release.sh"

# -- wait + staple + verify (delegated, so this flow can be resumed) ----------

# Restore wails.json BEFORE exec, because exec replaces this shell process
# and any trap registered above won't fire afterwards.
restore_wails_json
trap - EXIT

exec "$REPO_ROOT/scripts/finish-release.sh" "$SUB_ID"
