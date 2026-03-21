# AlgerClipboard Plugins

Official plugin repository for [AlgerClipboard](https://github.com/algerkong/AlgerClipboard).

[中文](./README.zh-CN.md) | English

## Available Plugins

| Plugin | Description | Prefix |
|--------|-------------|--------|
| [IDE Projects](./plugins/ide-projects/) | Search and open recent projects from VS Code, Cursor, Windsurf, Trae, Antigravity, Zed | `\|` |

## Installation

1. Download the plugin `.zip` from [Releases](https://github.com/algerkong/AlgerClipboard-Plugin/releases)
2. Extract to `{app_data_dir}/plugins/` (e.g., `%APPDATA%/com.alger.clipboard/plugins/` on Windows)
3. Restart AlgerClipboard
4. Enable the plugin in **Settings > Plugins**

Or open the plugins folder directly from **Settings > Plugins > Open plugins folder**.

## Plugin Registry

The [plugin registry](./registry/plugins.json) contains metadata for all available plugins. AlgerClipboard can use this to discover and download plugins in future versions.

Registry URL:
```
https://raw.githubusercontent.com/algerkong/AlgerClipboard-Plugin/main/registry/plugins.json
```

## Developing Plugins

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the plugin development guide.

### Quick Start

1. Create a new directory under `plugins/`
2. Add `manifest.json`, `frontend/index.js`, and optionally a Rust backend
3. Build and test locally
4. Submit a PR

### Plugin Structure

```
plugins/my-plugin/
├── manifest.json           # Plugin metadata and permissions
├── Cargo.toml              # Rust backend (optional)
├── src/
│   └── lib.rs              # C ABI plugin implementation
└── frontend/
    └── index.js            # Frontend JS bundle
```

### Building

```bash
# Build a specific plugin
./scripts/build.sh ide-projects

# Package a plugin into a zip
./scripts/package.sh ide-projects
```

## Release Process

Push a tag in the format `<plugin-id>-v<version>` to trigger automated build and release:

```bash
git tag ide-projects-v1.0.0
git push origin ide-projects-v1.0.0
```

This will:
1. Build the Rust backend on Windows, macOS, and Linux
2. Package all platform binaries + frontend + manifest into a single zip
3. Create a GitHub Release with the zip
4. Update `registry/plugins.json`

## License

[GPL-3.0](LICENSE)
