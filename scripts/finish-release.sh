#!/usr/bin/env bash
# Finish a release after release.sh has uploaded for notarization.
#
# Use this when:
#   - release.sh got interrupted before staple (e.g. network drop while
#     notarytool was polling)
#   - You came back to a previously-submitted bundle and want to resume
#
# It does:
#   1. Poll Apple for status of the given submission ID (default reads from
#      .notarization-id at the repo root, which release.sh writes on submit).
#   2. On Accepted: staple, validate, spctl-assess.
#   3. On Invalid/Rejected: dump the notary log and exit non-zero.
#
# Usage:
#   ./scripts/finish-release.sh                       # uses .notarization-id
#   ./scripts/finish-release.sh <SUBMISSION_ID>       # explicit ID

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="$REPO_ROOT/build/bin/tacho-ui.app"
ID_FILE="$REPO_ROOT/.notarization-id"
NOTARY_PROFILE="${NOTARY_PROFILE:-tacho-ui-notarize}"

SUB_ID="${1:-}"
if [[ -z "$SUB_ID" ]]; then
    if [[ -f "$ID_FILE" ]]; then
        SUB_ID="$(cat "$ID_FILE")"
    else
        echo "error: no submission ID given and $ID_FILE not found." >&2
        echo "       run \`xcrun notarytool history --keychain-profile $NOTARY_PROFILE\` to list submissions." >&2
        exit 1
    fi
fi

if [[ ! -d "$APP_PATH" ]]; then
    echo "error: app bundle missing: $APP_PATH" >&2
    echo "       this script only staples — you need the original signed bundle on disk." >&2
    exit 1
fi

echo "→ submission: $SUB_ID"
echo "→ app:        $APP_PATH"
echo

# -- poll until terminal -------------------------------------------------------

echo "==> polling notarization status (Ctrl-C to abort; can be re-run safely)"
prev=""
while true; do
    out="$(xcrun notarytool info "$SUB_ID" --keychain-profile "$NOTARY_PROFILE" 2>&1)"
    cur="$(echo "$out" | awk -F': ' '/^[[:space:]]*status:/ {print $2}')"
    if [[ "$cur" != "$prev" ]]; then
        echo "$(date +%H:%M:%S) status=$cur"
        prev="$cur"
    fi
    case "$cur" in
        Accepted)
            break
            ;;
        Invalid|Rejected)
            echo
            echo "!! notarization failed — fetching log"
            xcrun notarytool log "$SUB_ID" --keychain-profile "$NOTARY_PROFILE" || true
            exit 1
            ;;
        "")
            # Empty cur usually means a transient network failure (e.g. offline
            # laptop). Sleep and retry rather than bail.
            sleep 30
            continue
            ;;
    esac
    sleep 30
done

# -- staple --------------------------------------------------------------------

echo
echo "==> stapling ticket"
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

echo
echo "==> spctl assessment"
spctl --assess --type execute --verbose=2 "$APP_PATH"

# -- DMG ----------------------------------------------------------------------

# Version detection mirrors release.sh — read it back from the bundle we just
# stapled so the DMG filename is deterministic from the build output, not the
# invocation context.
VERSION_PLIST=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP_PATH/Contents/Info.plist")
DMG_PATH="$REPO_ROOT/build/bin/tacho-ui-${VERSION_PLIST}.dmg"

if command -v create-dmg >/dev/null 2>&1; then
    echo
    echo "==> wrapping in DMG"
    rm -f "$DMG_PATH"
    # --skip-jenkins works around a known create-dmg quirk on Apple Silicon
    # where the AppleScript "set position" step can fail under CI conditions.
    create-dmg \
        --volname "tacho-ui ${VERSION_PLIST}" \
        --window-pos 200 120 \
        --window-size 600 380 \
        --icon-size 100 \
        --icon "tacho-ui.app" 175 190 \
        --hide-extension "tacho-ui.app" \
        --app-drop-link 425 190 \
        --skip-jenkins \
        "$DMG_PATH" \
        "$APP_PATH" \
        || {
            echo "warning: create-dmg failed; release is still valid (use the .app or .zip)" >&2
        }
else
    echo
    echo "(skipping DMG — install \`brew install create-dmg\` to enable)"
fi

echo
echo "✓ release ready"
echo "  app: $APP_PATH"
[[ -f "$DMG_PATH" ]] && echo "  dmg: $DMG_PATH"
echo "  zip: $REPO_ROOT/build/bin/tacho-ui.zip"
rm -f "$ID_FILE"
