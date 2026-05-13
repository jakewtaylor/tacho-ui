#!/usr/bin/env bash
# Update docs/appcast.xml with the latest release.
#
# Assumes you've just run scripts/release.sh and have a freshly signed +
# notarized + stapled bundle at build/bin/tacho-ui.app plus the matching zip
# at build/bin/tacho-ui.zip. We:
#
#   1. Stage a copy of the zip under releases/ named tacho-ui-<VERSION>.zip
#      (Sparkle's generate_appcast keys off the filename for ordering).
#   2. Run Sparkle's generate_appcast, which reads CFBundleShortVersionString
#      from inside the zip, signs the file with the EdDSA private key from
#      the macOS Keychain, and writes/updates an appcast.xml in-place.
#   3. Copy the produced appcast.xml to docs/appcast.xml (the path the app's
#      SUFeedURL points at via raw.githubusercontent).
#
# The zip itself doesn't get committed — it's uploaded to GitHub Releases.
# Only docs/appcast.xml goes into git.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="tacho-ui"
APP_PATH="$REPO_ROOT/build/bin/$APP_NAME.app"
ZIP_PATH="$REPO_ROOT/build/bin/$APP_NAME.zip"
RELEASES_DIR="$REPO_ROOT/releases"
APPCAST_OUT="$REPO_ROOT/docs/appcast.xml"
GENERATE_APPCAST="$REPO_ROOT/third_party/Sparkle/bin/generate_appcast"

# Public download URL prefix. generate_appcast prepends this to each item's
# zip filename when writing <enclosure url="..."> in the appcast. The release
# upload to GitHub puts the zip at exactly this path.
DOWNLOAD_URL_PREFIX="${DOWNLOAD_URL_PREFIX:-https://github.com/jakewtaylor/tacho-ui/releases/download/}"

# Link to the app's home page (shown by Sparkle in "Learn more" links).
LINK_URL="${LINK_URL:-https://github.com/jakewtaylor/tacho-ui}"

if [[ ! -d "$APP_PATH" ]]; then
    echo "error: $APP_PATH missing — run scripts/release.sh first." >&2
    exit 1
fi
if [[ ! -f "$ZIP_PATH" ]]; then
    echo "error: $ZIP_PATH missing — run scripts/release.sh first." >&2
    exit 1
fi
if [[ ! -x "$GENERATE_APPCAST" ]]; then
    echo "error: $GENERATE_APPCAST missing. (Re-extract third_party/Sparkle.)" >&2
    exit 1
fi

# Read the version from the just-built bundle so the script never disagrees
# with what release.sh actually produced.
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP_PATH/Contents/Info.plist")
TAGGED_ZIP="$RELEASES_DIR/$APP_NAME-$VERSION.zip"

echo "→ version:      $VERSION"
echo "→ staged zip:   $TAGGED_ZIP"
echo "→ appcast out:  $APPCAST_OUT"
echo "→ download URL: ${DOWNLOAD_URL_PREFIX}v${VERSION}/$(basename "$TAGGED_ZIP")"
echo

mkdir -p "$RELEASES_DIR" "$(dirname "$APPCAST_OUT")"

# Stage the zip with the version-tagged filename. generate_appcast uses the
# filename in the <enclosure url> attribute, so this is what users will see.
cp -f "$ZIP_PATH" "$TAGGED_ZIP"

# If a previous appcast exists at the destination, copy it INTO the staging
# directory so generate_appcast appends rather than starts fresh.
if [[ -f "$APPCAST_OUT" ]]; then
    cp -f "$APPCAST_OUT" "$RELEASES_DIR/appcast.xml"
fi

# The download URL prefix needs the version-prefixed tag path. GitHub Releases
# puts assets at /releases/download/<tag>/<filename>, where <tag> is "v1.2.3"
# but our filename and CFBundleShortVersionString are "1.2.3". generate_appcast
# concatenates the prefix and filename, so we encode the tag into the prefix.
PREFIX_WITH_TAG="${DOWNLOAD_URL_PREFIX}v${VERSION}/"

echo "==> generate_appcast"
"$GENERATE_APPCAST" \
    --download-url-prefix "$PREFIX_WITH_TAG" \
    --link "$LINK_URL" \
    "$RELEASES_DIR"

# Copy the produced appcast.xml back to docs/ for committing.
cp -f "$RELEASES_DIR/appcast.xml" "$APPCAST_OUT"

echo
echo "✓ appcast updated: $APPCAST_OUT"
echo
echo "Next steps:"
echo "  1. Upload $TAGGED_ZIP (and the .dmg if you made one) to a GitHub Release tagged v$VERSION"
echo "  2. git add docs/appcast.xml && git commit -m 'release v$VERSION'"
echo "  3. git push (so raw.githubusercontent.com serves the new feed)"
