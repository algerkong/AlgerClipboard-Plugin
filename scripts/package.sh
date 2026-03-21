#!/usr/bin/env bash
set -euo pipefail

# Package a plugin into a distributable zip
# Usage: ./scripts/package.sh <plugin-id> [--platform <windows|macos|linux>]
#
# Without --platform: packages frontend + manifest only (no backend binary)
# With --platform: also copies the backend binary for that platform

PLUGIN_ID="${1:?Usage: package.sh <plugin-id> [--platform <windows|macos|linux>]}"
PLUGIN_DIR="plugins/${PLUGIN_ID}"
PLATFORM=""

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "Error: Plugin directory '$PLUGIN_DIR' not found"
  exit 1
fi

if [ ! -f "$PLUGIN_DIR/manifest.json" ]; then
  echo "Error: manifest.json not found in '$PLUGIN_DIR'"
  exit 1
fi

# Read version from manifest
VERSION=$(python3 -c "import json; print(json.load(open('$PLUGIN_DIR/manifest.json'))['version'])" 2>/dev/null || echo "0.0.0")

OUTPUT_DIR="dist"
STAGING_DIR="dist/${PLUGIN_ID}"
ZIP_NAME="${PLUGIN_ID}-${VERSION}.zip"

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# Copy manifest
cp "$PLUGIN_DIR/manifest.json" "$STAGING_DIR/"

# Copy frontend
if [ -d "$PLUGIN_DIR/frontend" ]; then
  cp -r "$PLUGIN_DIR/frontend" "$STAGING_DIR/"
fi

# Copy backend binary if available
if [ -f "$PLUGIN_DIR/Cargo.toml" ]; then
  mkdir -p "$STAGING_DIR/backend"
  LIB_NAME=$(python3 -c "
import re
with open('$PLUGIN_DIR/Cargo.toml') as f:
    content = f.read()
m = re.search(r'name\s*=\s*\"(.+?)\"', content)
print(m.group(1).replace('-', '_') if m else '$PLUGIN_ID')
" 2>/dev/null || echo "${PLUGIN_ID//-/_}")

  # Copy platform-specific binary
  RELEASE_DIR="$PLUGIN_DIR/target/release"
  if [ "$PLATFORM" = "windows" ] && [ -f "$RELEASE_DIR/${LIB_NAME}.dll" ]; then
    cp "$RELEASE_DIR/${LIB_NAME}.dll" "$STAGING_DIR/backend/"
  elif [ "$PLATFORM" = "macos" ] && [ -f "$RELEASE_DIR/lib${LIB_NAME}.dylib" ]; then
    cp "$RELEASE_DIR/lib${LIB_NAME}.dylib" "$STAGING_DIR/backend/"
  elif [ "$PLATFORM" = "linux" ] && [ -f "$RELEASE_DIR/lib${LIB_NAME}.so" ]; then
    cp "$RELEASE_DIR/lib${LIB_NAME}.so" "$STAGING_DIR/backend/"
  elif [ -z "$PLATFORM" ]; then
    # Copy whatever exists
    for ext in dll dylib so; do
      find "$RELEASE_DIR" -maxdepth 1 -name "*${LIB_NAME}*.$ext" -exec cp {} "$STAGING_DIR/backend/" \; 2>/dev/null || true
    done
  fi
fi

# Create zip
cd dist
rm -f "$ZIP_NAME"
zip -r "$ZIP_NAME" "$PLUGIN_ID/"
cd ..

echo "Packaged: dist/$ZIP_NAME"
ls -lh "dist/$ZIP_NAME"
