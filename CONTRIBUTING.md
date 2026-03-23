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
  "name": { "en": "My Plugin", "zh-CN": "我的插件" },
  "version": "1.0.0",
  "description": { "en": "What this plugin does", "zh-CN": "插件功能描述" },
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
    "api_key": {
      "type": "string",
      "label": { "en": "API Key", "zh-CN": "API 密钥" },
      "secret": true
    },
    "max_results": {
      "type": "number",
      "label": { "en": "Max Results", "zh-CN": "最大结果数" },
      "default": 20,
      "min": 5,
      "max": 100,
      "description": { "en": "Maximum results to show", "zh-CN": "显示的最大结果数" }
    },
    "theme": {
      "type": "select",
      "label": { "en": "Theme", "zh-CN": "主题" },
      "default": "auto",
      "options": [
        { "label": { "en": "Auto", "zh-CN": "自动" }, "value": "auto" },
        { "label": { "en": "Light", "zh-CN": "浅色" }, "value": "light" },
        { "label": { "en": "Dark", "zh-CN": "深色" }, "value": "dark" }
      ]
    },
    "show_preview": {
      "type": "boolean",
      "label": { "en": "Show Preview", "zh-CN": "显示预览" },
      "default": true
    },
    "hotkey": {
      "type": "shortcut",
      "label": { "en": "Shortcut", "zh-CN": "快捷键" },
      "default": "Alt+Shift+M"
    },
    "search_paths": {
      "type": "array",
      "label": { "en": "Search Paths", "zh-CN": "搜索路径" },
      "item_type": "string"
    }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (kebab-case) |
| `name` | Yes | Display name (string or I18nString) |
| `version` | Yes | Semver version |
| `api_version` | Yes | Host API version (currently `"1"`) |
| `frontend.entry` | No | Path to JS bundle |
| `backend.library` | No | Library name without platform extension |
| `permissions` | No | Required permissions |
| `spotlight_modes` | No | Spotlight mode declarations with prefixes |
| `settings` | No | Plugin-specific settings (auto-rendered in Settings UI) |

### I18nString

All text-facing fields (`name`, `description`, settings `label`/`description`/`options.label`) support two formats:

- Plain string: `"My Plugin"`
- Locale map: `{ "en": "My Plugin", "zh-CN": "我的插件" }`

Resolution order: exact locale match → language prefix (e.g. `zh` for `zh-CN`) → `en` → first value.

### Settings Types

| Type | Control | Extra Fields |
|------|---------|-------------|
| `string` | Text input | `secret?: boolean` |
| `number` | Number input | `min?, max?, step?` |
| `boolean` | Toggle switch | — |
| `select` | Dropdown | `options: {label: I18nString, value: string}[]` |
| `shortcut` | Shortcut recorder | — |
| `array` | Add/remove list | `item_type: "string"` |

All types support optional `description` (I18nString) for help text below the control.

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
var locale = api.getEnv().locale; // "zh-CN" or "en"

// ── i18n helper ──
var i18n = {
  "en": { placeholder: "Search...", openFolder: "Show in Explorer" },
  "zh-CN": { placeholder: "搜索...", openFolder: "在资源管理器中显示" },
};
function t(key) {
  var lang = i18n[locale] || i18n["en"];
  return (lang && lang[key]) || key;
}

// ── Register a Spotlight mode ──
api.registerMode({
  id: "my-mode",
  name: t("modeName"),
  icon: "ph:star",
  placeholder: t("placeholder"),
  debounceMs: 200,

  // Footer shortcut hints (shown at bottom of Spotlight)
  footerHints: [
    { kbd: "Ctrl+↵", label: t("openFolder") },
    { kbd: "Shift+↵", label: t("copyPath") },
  ],

  onQuery: function(query) {
    return api.invokeBackend("search", { query: query }).then(function(results) {
      return results.map(function(r) {
        return {
          id: r.id,
          title: r.name,
          subtitle: r.path,
          icon: "ph:file",
          // Action buttons on each result row
          actions: [
            {
              id: "locate",
              label: "ph:folder-open",       // Phosphor icon name as label
              shortcut: t("openFolder"),       // Tooltip text
              handler: function() {
                return api.invokeBackend("locate", { path: r.path });
              },
            },
          ],
        };
      });
    });
  },

  // modifiers: { ctrlKey, shiftKey, altKey } — from keyboard event
  onSelect: function(result, modifiers) {
    if (modifiers && modifiers.ctrlKey) {
      return api.invokeBackend("locate", { id: result.id });
    }
    return api.invokeBackend("open", { id: result.id });
  },
});

// ── Settings ──
var value = await api.getSetting("api_key");
await api.setSetting("api_key", "new-value");

// Listen for setting changes (from Settings UI)
api.onSettingChanged("api_key", function(newValue, oldValue) {
  // React to config change
});
// Listen to all setting changes
api.onSettingChanged("*", function(key, newValue, oldValue) { });

// ── Context menu ──
api.registerContextMenu({
  id: "my-action",
  label: "My Action",
  icon: "ph:lightning",
  handler: async function(entry) {
    await api.invokeBackend("process", { text: entry.content });
  },
});

// ── Custom settings UI (vanilla DOM) ──
api.registerSettingsSection({
  id: "advanced",
  label: "Advanced",
  render: function(container, helpers) {
    container.appendChild(helpers.createToggle({
      label: "Enable feature",
      value: true,
      onChange: function(v) { api.setSetting("feature", v); },
    }));
    container.appendChild(helpers.createInput({
      label: "Custom value",
      value: "",
      onChange: function(v) { api.setSetting("custom", v); },
    }));
    container.appendChild(helpers.createSelect({
      label: "Mode",
      value: "fast",
      options: [{ label: "Fast", value: "fast" }, { label: "Accurate", value: "accurate" }],
      onChange: function(v) { api.setSetting("mode", v); },
    }));
  },
});

// ── Other APIs ──
var apps = await api.invokeHost("search_applications", { keyword: "Code" });
api.on("some-event", function(payload) { });
api.emit("my-event", { data: 123 });
var url = api.getAssetPath("images/icon.png"); // convertFileSrc for plugin assets
var env = api.getEnv(); // { theme, locale, platform }
```

### Full API Reference

| Method | Description |
|--------|-------------|
| `registerMode(mode)` | Register a Spotlight search mode |
| `registerContextMenu(item)` | Add context menu item for clipboard entries |
| `registerSettingsSection(section)` | Inject custom settings UI (vanilla DOM) |
| `registerTrayMenuItem(item)` | Add system tray menu item |
| `invokeBackend(command, args?)` | Call plugin's Rust backend command |
| `invokeHost(command, args?)` | Call host app's Rust command directly |
| `getSetting(key)` | Read plugin setting value |
| `setSetting(key, value)` | Write plugin setting value |
| `onSettingChanged(key, handler)` | Listen for setting changes (`"*"` for all) |
| `on(event, handler)` | Listen for plugin-scoped events |
| `emit(event, payload?)` | Emit plugin-scoped event |
| `onHook(event, handler)` | Register a hook handler |
| `getAssetPath(relativePath)` | Get URL for a plugin asset file |
| `getEnv()` | Get `{ theme, locale, platform }` |

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

### HostVTable

The `host` pointer provides these functions:

| Function | Description |
|----------|-------------|
| `get_setting(key)` | Read setting from DB |
| `set_setting(key, value)` | Write setting to DB |
| `read_clipboard()` | Read current clipboard text |
| `write_clipboard(text)` | Write text to clipboard |
| `http_request(method, url, headers, body)` | Make HTTP request |
| `emit_event(event, payload)` | Emit event to frontend |
| `register_command(name)` | Register a command name |
| `log(level, message)` | Log message (1=debug, 2=info, 3=warn, 4=error) |

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

## Plugin Installation

Plugins are installed to `{app_data_dir}/plugins/{plugin-id}/`:

```
plugins/my-plugin/
  manifest.json
  frontend/
    index.js
  backend/
    my_plugin.dll      (Windows)
    libmy_plugin.dylib (macOS)
    libmy_plugin.so    (Linux)
```

After installation, enable in **Settings > Plugins**. Plugins are hot-reloaded — no app restart needed.

## Local Development

1. Build backend: `cd plugins/my-plugin && cargo build --release`
2. Copy DLL: `cp target/release/my_plugin.dll backend/`
3. Install: copy `manifest.json`, `frontend/`, `backend/` to `{app_data_dir}/plugins/my-plugin/`
4. Enable in Settings > Plugins

For frontend-only changes, just update the `frontend/index.js` file and toggle the plugin off/on.

## Submitting a Plugin

1. Fork this repo
2. Create your plugin under `plugins/your-plugin/`
3. Test locally
4. Submit a PR with description of what the plugin does
