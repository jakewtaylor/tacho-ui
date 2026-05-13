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

DESKTOP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# docs/appcast.xml lives at the monorepo root — its URL is baked into
# every shipped binary's Info.plist (SUFeedURL) and must stay there.
MONO_ROOT="$(cd "$DESKTOP_ROOT/../.." && pwd)"
APP_NAME="tacho-ui"
APP_PATH="$DESKTOP_ROOT/build/bin/$APP_NAME.app"
ZIP_PATH="$DESKTOP_ROOT/build/bin/$APP_NAME.zip"
RELEASES_DIR="$DESKTOP_ROOT/releases"
APPCAST_OUT="$MONO_ROOT/docs/appcast.xml"
GENERATE_APPCAST="$DESKTOP_ROOT/third_party/Sparkle/bin/generate_appcast"

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

# generate_appcast uses a SINGLE --download-url-prefix for every item in the
# feed. That doesn't fit GitHub Releases, which puts each version's assets at
# /releases/download/<tag>/<filename>. Workaround: pass a sentinel prefix here,
# then post-process the generated XML to rewrite each enclosure URL using the
# tag that matches its own <sparkle:shortVersionString>. Deltas have their
# *target* version baked into the filename (tacho-uiX.Y.Z-A.B.C.delta), so
# they get the same per-item tag as the full zip.
SENTINEL_PREFIX="https://sentinel.invalid/SENTINEL/"

echo "==> generate_appcast"
"$GENERATE_APPCAST" \
    --download-url-prefix "$SENTINEL_PREFIX" \
    --link "$LINK_URL" \
    "$RELEASES_DIR"

echo "==> rewriting per-item download URLs"
python3 - "$RELEASES_DIR/appcast.xml" "$DOWNLOAD_URL_PREFIX" "$SENTINEL_PREFIX" <<'PY'
import re, sys, xml.etree.ElementTree as ET

appcast_path, real_prefix, sentinel_prefix = sys.argv[1:4]
ET.register_namespace("sparkle", "http://www.andymatuschak.org/xml-namespaces/sparkle")
ns = {"sparkle": "http://www.andymatuschak.org/xml-namespaces/sparkle"}

tree = ET.parse(appcast_path)
for item in tree.getroot().iter("item"):
    short = item.find("sparkle:shortVersionString", ns)
    if short is None or not short.text:
        continue
    tag = f"v{short.text}/"
    for enclosure in item.iter("enclosure"):
        url = enclosure.get("url", "")
        enclosure.set("url", url.replace(sentinel_prefix, real_prefix + tag))
    for enclosure in item.iter("{http://www.andymatuschak.org/xml-namespaces/sparkle}deltas"):
        for d in enclosure.iter("enclosure"):
            url = d.get("url", "")
            d.set("url", url.replace(sentinel_prefix, real_prefix + tag))

tree.write(appcast_path, encoding="utf-8", xml_declaration=True)
PY

# Copy the produced appcast.xml back to docs/ for committing.
cp -f "$RELEASES_DIR/appcast.xml" "$APPCAST_OUT"

echo
echo "✓ appcast updated: $APPCAST_OUT"
echo
echo "Next steps:"
echo "  1. Upload $TAGGED_ZIP (and the .dmg if you made one) to a GitHub Release tagged v$VERSION"
echo "  2. git add docs/appcast.xml && git commit -m 'release v$VERSION'"
echo "  3. git push (so raw.githubusercontent.com serves the new feed)"
