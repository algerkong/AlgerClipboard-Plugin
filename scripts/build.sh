#!/usr/bin/env bash
set -euo pipefail

# Build a plugin's Rust backend
# Usage: ./scripts/build.sh <plugin-id>

PLUGIN_ID="${1:?Usage: build.sh <plugin-id>}"
PLUGIN_DIR="plugins/${PLUGIN_ID}"

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "Error: Plugin directory '$PLUGIN_DIR' not found"
  exit 1
fi

if [ -f "$PLUGIN_DIR/Cargo.toml" ]; then
  echo "Building Rust backend for '$PLUGIN_ID'..."
  cd "$PLUGIN_DIR"
  cargo build --release
  echo "Build complete: target/release/"
else
  echo "No Cargo.toml found — skipping Rust build (frontend-only plugin)"
fi
