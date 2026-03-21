# Plugin Development Guide

## Plugin Architecture

AlgerClipboard plugins consist of two optional parts:

- **Frontend** (`frontend/index.js`): A JavaScript bundle loaded at runtime in the Spotlight window
- **Backend** (`src/lib.rs` + `Cargo.toml`): A Rust native library (.dll/.so/.dylib) loaded via C ABI

A plugin can have both, or just one.

## manifest.json

Every plugin must have a `manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": "Your Name",
  "icon": "ph:icon-name",
  "api_version": "1",
  "frontend": {
    "entry": "frontend/index.js"
  },
  "backend": {
    "library": "backend/my_plugin"
  },
  "permissions": [
    "clipboard:read",
    "network:http"
  ],
  "spotlight_modes": [
    {
      "id": "my-mode",
      "prefix": "mm"
    }
  ],
  "hooks": [],
  "settings": {
    "api_key": { "type": "string", "label": "API Key", "secret": true }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (kebab-case) |
| `name` | Yes | Display name |
| `version` | Yes | Semver version |
| `api_version` | Yes | Host API version (currently `"1"`) |
| `frontend.entry` | No | Path to JS bundle |
| `backend.library` | No | Library name without platform extension |
| `permissions` | No | Required permissions |
| `spotlight_modes` | No | Spotlight mode declarations with prefixes |
| `settings` | No | Plugin-specific settings (auto-rendered in Settings UI) |

### Permissions

| Permission | Grants |
|------------|--------|
| `clipboard:read` | Read clipboard content |
| `clipboard:write` | Write to clipboard |
| `network:http` | Make HTTP requests |
| `filesystem:read` | Read files |
| `filesystem:write` | Write files |
| `shell:execute` | Execute shell commands |
| `notification:send` | Show system notifications |
| `settings:read` | Read app settings |
| `settings:write` | Modify app settings |

## Frontend API

Plugin JS accesses the host via `window.AlgerPlugin.create("plugin-id")`:

```javascript
var api = window.AlgerPlugin.create("my-plugin");

// Register a Spotlight mode
api.registerMode({
  id: "my-mode",
  name: "My Mode",
  icon: "ph:star",
  placeholder: "Search...",
  debounceMs: 200,
  onQuery: function(query) {
    return api.invokeBackend("search", { query });
  },
  onSelect: function(result) {
    return api.invokeBackend("open", { id: result.id });
  },
});

// Register context menu item
api.registerContextMenu({
  id: "my-action",
  label: "My Action",
  icon: "ph:lightning",
  handler: async function(entry) {
    await api.invokeBackend("process", { text: entry.content });
  },
});

// Plugin settings
var value = await api.getSetting("api_key");
await api.setSetting("api_key", "new-value");

// Call host commands
var apps = await api.invokeHost("search_applications", { keyword: "Code" });

// Listen to events
api.on("some-event", function(payload) { ... });
```

## Rust Backend (C ABI)

If your plugin needs native capabilities, implement these C exports:

```rust
#[no_mangle]
pub extern "C" fn plugin_init(host: *const HostVTable) -> i32 {
    // Store host pointer, register commands
    // Return 0 for success
}

#[no_mangle]
pub extern "C" fn plugin_on_command(
    command: *const c_char,
    args: *const c_char,
) -> *mut c_char {
    // Handle commands from frontend's api.invokeBackend()
    // Return JSON string (caller frees via plugin_free_string)
}

#[no_mangle]
pub extern "C" fn plugin_on_event(
    event_type: *const c_char,
    payload: *const c_char,
) -> *mut c_char { std::ptr::null_mut() }

#[no_mangle]
pub extern "C" fn plugin_destroy() { }

#[no_mangle]
pub extern "C" fn plugin_free_string(s: *mut c_char) {
    if !s.is_null() { unsafe { drop(CString::from_raw(s)); } }
}
```

### Cargo.toml

```toml
[package]
name = "my-plugin"
version = "1.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
opt-level = "s"
lto = true
strip = true
```

## Local Development

1. Build: `./scripts/build.sh my-plugin`
2. Package: `./scripts/package.sh my-plugin`
3. Copy the output zip contents to `{app_data_dir}/plugins/my-plugin/`
4. Restart AlgerClipboard and enable in Settings > Plugins

## Submitting a Plugin

1. Fork this repo
2. Create your plugin under `plugins/your-plugin/`
3. Test locally
4. Submit a PR with description of what the plugin does
