#!/usr/bin/env python3
"""Build or merge a plugin registry entry.

Usage:
  update_registry.py entry <plugin_dir> <version> <download_url> <size> <sha256> <output_file>
      Write the registry entry JSON for a plugin to <output_file>.
  update_registry.py merge <entry_file> <registry_file>
      Merge the entry into registry/plugins.json in place.
"""
import json
import sys


def build_entry(plugin_dir, version, download_url, size, sha256):
    with open(f"{plugin_dir}/manifest.json", encoding="utf-8") as f:
        manifest = json.load(f)
    return {
        "id": manifest["id"],
        "name": manifest["name"],
        "description": manifest.get("description", ""),
        "author": manifest.get("author", ""),
        "version": version,
        "icon": manifest.get("icon", ""),
        "api_version": manifest.get("api_version", "1"),
        "platforms": ["windows-x64", "macos-universal", "linux-x64"],
        "download_url": download_url,
        "size": int(size),
        "sha256": sha256,
    }


def merge(entry_path, registry_path):
    with open(entry_path, encoding="utf-8") as f:
        entry = json.load(f)
    with open(registry_path, encoding="utf-8") as f:
        registry = json.load(f)

    plugins = registry["plugins"]
    index = next((i for i, p in enumerate(plugins) if p["id"] == entry["id"]), None)
    if index is None:
        plugins.append(entry)
    else:
        plugins[index] = entry
    plugins.sort(key=lambda p: p["id"])

    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    if len(sys.argv) == 8 and sys.argv[1] == "entry":
        entry = build_entry(*sys.argv[2:7])
        with open(sys.argv[7], "w", encoding="utf-8") as f:
            json.dump(entry, f, indent=2, ensure_ascii=False)
            f.write("\n")
    elif len(sys.argv) == 4 and sys.argv[1] == "merge":
        merge(sys.argv[2], sys.argv[3])
    else:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
