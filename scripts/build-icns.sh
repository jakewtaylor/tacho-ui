#!/usr/bin/env bash
# Build a multi-resolution .icns file from the per-size PNGs Bakery exports.
#
# Source: icons/mac{16,32,64,128,256,512,1024}.png
# Output: build/darwin/appicon.icns
#
# Why: Wails' default `build/appicon.png` flow takes a single 1024×1024 PNG
# and downsamples it for every Finder size. The result looks soft at 16×16
# and 32×32. Bakery (and any decent icon tool) produces hand-tuned artwork
# at each size; Apple's `iconutil` assembles those into an .icns with the
# proper hinting metadata. The release script swaps this file into the
# .app bundle after `wails build`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/icons"
ICONSET="$REPO_ROOT/build/darwin/appicon.iconset"
OUT="$REPO_ROOT/build/darwin/appicon.icns"

# Apple's iconutil expects this exact naming inside .iconset. The mapping
# from Bakery's filenames to Apple's spec is purely about labels — the
# pixel dimensions on the right are what matters in the file.
declare -a MAPPINGS=(
    "mac16.png:icon_16x16.png"
    "mac32.png:icon_16x16@2x.png"      # 32px → @2x of 16
    "mac32.png:icon_32x32.png"
    "mac64.png:icon_32x32@2x.png"      # 64px → @2x of 32
    "mac128.png:icon_128x128.png"
    "mac256.png:icon_128x128@2x.png"   # 256px → @2x of 128
    "mac256.png:icon_256x256.png"
    "mac512.png:icon_256x256@2x.png"   # 512px → @2x of 256
    "mac512.png:icon_512x512.png"
    "mac1024.png:icon_512x512@2x.png"  # 1024px → @2x of 512
)

for entry in "${MAPPINGS[@]}"; do
    src_name="${entry%%:*}"
    if [[ ! -f "$SRC/$src_name" ]]; then
        echo "error: missing $SRC/$src_name (run Bakery export first)" >&2
        exit 1
    fi
done

# Fresh iconset each run so deleted Bakery sizes don't linger.
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

for entry in "${MAPPINGS[@]}"; do
    src_name="${entry%%:*}"
    dst_name="${entry##*:}"
    cp "$SRC/$src_name" "$ICONSET/$dst_name"
done

iconutil -c icns -o "$OUT" "$ICONSET"

# Clean up the staging iconset; only the .icns is consumed downstream.
rm -rf "$ICONSET"

echo "✓ built $OUT"
