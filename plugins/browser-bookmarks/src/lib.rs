use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[repr(C)]
pub struct HostVTable {
    pub ctx: *mut c_void,
    pub get_setting: extern "C" fn(*mut c_void, *const c_char) -> *mut c_char,
    pub set_setting: extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int,
    pub read_clipboard: extern "C" fn(*mut c_void) -> *mut c_char,
    pub write_clipboard: extern "C" fn(*mut c_void, *const c_char) -> c_int,
    pub http_request: extern "C" fn(*mut c_void, *const c_char, *const c_char, *const c_char, *const c_char) -> *mut c_char,
    pub emit_event: extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int,
    pub register_command: extern "C" fn(*mut c_void, *const c_char) -> c_int,
    pub log: extern "C" fn(*mut c_void, c_int, *const c_char),
    pub free_string: extern "C" fn(*mut c_void, *mut c_char),
}

static mut HOST: *const HostVTable = std::ptr::null();

fn host_log(level: c_int, msg: &str) {
    unsafe {
        if !HOST.is_null() {
            if let Ok(cs) = CString::new(msg) {
                ((*HOST).log)((*HOST).ctx, level, cs.as_ptr());
            }
        }
    }
}

fn host_get_setting(key: &str) -> Option<String> {
    unsafe {
        if HOST.is_null() { return None; }
        let cs = CString::new(key).ok()?;
        let ptr = ((*HOST).get_setting)((*HOST).ctx, cs.as_ptr());
        if ptr.is_null() { return None; }
        let val = CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string());
        ((*HOST).free_string)((*HOST).ctx, ptr);
        val
    }
}

// ---- Data structures ----

#[derive(serde::Serialize, Clone)]
struct Bookmark {
    title: String,
    url: String,
    browser: String,
    folder: String,
}

struct BookmarkCache {
    bookmarks: Vec<Bookmark>,
    loaded_at: u64, // Unix seconds
}

static CACHE: Mutex<Option<BookmarkCache>> = Mutex::new(None);

// ---- Bookmark loading ----

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn get_cache_ttl_secs() -> u64 {
    let ttl_min = host_get_setting("plugin:browser-bookmarks:cache_ttl")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(5);
    ttl_min * 60
}

fn get_max_results() -> usize {
    host_get_setting("plugin:browser-bookmarks:max_results")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(20)
}

/// Expand an environment variable placeholder like %LOCALAPPDATA% or %APPDATA%.
fn expand_env(path: &str) -> String {
    let mut result = path.to_string();
    // Only the two variables we need
    for (var, key) in &[("%LOCALAPPDATA%", "LOCALAPPDATA"), ("%APPDATA%", "APPDATA")] {
        if result.contains(*var) {
            if let Ok(val) = std::env::var(key) {
                result = result.replace(*var, &val);
            }
        }
    }
    result
}

/// Recursively walk a Chromium bookmark JSON node, collecting bookmarks.
fn collect_chromium_bookmarks(node: &serde_json::Value, browser: &str, folder_path: &str, out: &mut Vec<Bookmark>) {
    let node_type = node.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match node_type {
        "url" => {
            let title = node.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let url = node.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !url.is_empty() {
                out.push(Bookmark {
                    title,
                    url,
                    browser: browser.to_string(),
                    folder: folder_path.to_string(),
                });
            }
        }
        "folder" => {
            let name = node.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let new_path = if folder_path.is_empty() {
                name.to_string()
            } else {
                format!("{}/{}", folder_path, name)
            };
            if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
                for child in children {
                    collect_chromium_bookmarks(child, browser, &new_path, out);
                }
            }
        }
        _ => {}
    }
}

/// Load bookmarks from a single Chromium-based browser.
fn load_chromium_bookmarks(file_path: &str, browser: &str, out: &mut Vec<Bookmark>) {
    let path = expand_env(file_path);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            host_log(1, &format!("[browser-bookmarks] Cannot read {}: {}", path, e));
            return;
        }
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            host_log(1, &format!("[browser-bookmarks] JSON parse error for {}: {}", path, e));
            return;
        }
    };
    let roots = match json.get("roots") {
        Some(r) => r,
        None => {
            host_log(1, &format!("[browser-bookmarks] No 'roots' in {}", path));
            return;
        }
    };

    // Standard root folders
    for root_key in &["bookmark_bar", "other", "synced"] {
        if let Some(root_node) = roots.get(root_key) {
            // Use the node's own name as the top-level folder label (e.g. "Bookmarks bar")
            let root_name = root_node.get("name").and_then(|v| v.as_str()).unwrap_or(root_key);
            if let Some(children) = root_node.get("children").and_then(|v| v.as_array()) {
                for child in children {
                    collect_chromium_bookmarks(child, browser, root_name, out);
                }
            }
        }
    }
}

/// Load all bookmarks from all supported browsers.
fn load_all_bookmarks() -> Vec<Bookmark> {
    let mut all: Vec<Bookmark> = Vec::new();

    let browsers: &[(&str, &str)] = &[
        ("Chrome", r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks"),
        ("Edge",   r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Bookmarks"),
        ("Brave",  r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Bookmarks"),
    ];

    for (browser, path_template) in browsers {
        load_chromium_bookmarks(path_template, browser, &mut all);
    }

    host_log(2, &format!("[browser-bookmarks] Loaded {} bookmarks total", all.len()));
    all
}

/// Return cached bookmarks, refreshing if TTL expired.
fn get_bookmarks() -> Vec<Bookmark> {
    let mut guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let ttl = get_cache_ttl_secs();
    let now = now_secs();

    let needs_refresh = match guard.as_ref() {
        None => true,
        Some(cache) => now.saturating_sub(cache.loaded_at) >= ttl,
    };

    if needs_refresh {
        let bookmarks = load_all_bookmarks();
        *guard = Some(BookmarkCache { bookmarks, loaded_at: now });
    }

    guard.as_ref().unwrap().bookmarks.clone()
}

// ---- Search logic ----

fn search_bookmarks(query: &str, max_results: usize) -> Vec<Bookmark> {
    if query.is_empty() {
        return Vec::new();
    }
    let q = query.to_lowercase();
    let bookmarks = get_bookmarks();

    let mut results: Vec<Bookmark> = bookmarks
        .into_iter()
        .filter(|b| {
            b.title.to_lowercase().contains(&q) || b.url.to_lowercase().contains(&q)
        })
        .take(max_results)
        .collect();

    // Prioritise title matches over URL-only matches
    results.sort_by(|a, b| {
        let a_title = a.title.to_lowercase().contains(&q);
        let b_title = b.title.to_lowercase().contains(&q);
        b_title.cmp(&a_title)
    });

    results
}

// ---- Plugin C ABI exports ----

#[no_mangle]
pub extern "C" fn plugin_init(host: *const HostVTable) -> c_int {
    unsafe { HOST = host; }
    let cmds = ["search_bookmarks", "reload_cache"];
    for cmd in &cmds {
        if let Ok(cs) = CString::new(*cmd) {
            unsafe { ((*HOST).register_command)((*HOST).ctx, cs.as_ptr()); }
        }
    }
    host_log(2, "[browser-bookmarks] Plugin initialized");
    0
}

#[no_mangle]
pub extern "C" fn plugin_on_command(command: *const c_char, args: *const c_char) -> *mut c_char {
    let cmd = unsafe { CStr::from_ptr(command) }.to_str().unwrap_or("");
    let args_str = unsafe { CStr::from_ptr(args) }.to_str().unwrap_or("{}");

    let result = match cmd {
        "search_bookmarks" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let query = parsed.get("query").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let max_results = parsed
                .get("max_results")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize)
                .unwrap_or_else(get_max_results);

            if query.is_empty() {
                "[]".to_string()
            } else {
                match serde_json::to_string(&search_bookmarks(&query, max_results)) {
                    Ok(s) => s,
                    Err(e) => {
                        host_log(3, &format!("[browser-bookmarks] Serialize error: {}", e));
                        "[]".to_string()
                    }
                }
            }
        }
        "reload_cache" => {
            // Force cache invalidation
            {
                let mut guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
                *guard = None;
            }
            let bookmarks = get_bookmarks();
            format!(r#"{{"ok":true,"count":{}}}"#, bookmarks.len())
        }
        _ => r#"{"error":"unknown command"}"#.to_string(),
    };

    CString::new(result).map(|cs| cs.into_raw()).unwrap_or(std::ptr::null_mut())
}

#[no_mangle]
pub extern "C" fn plugin_on_event(_: *const c_char, _: *const c_char) -> *mut c_char {
    std::ptr::null_mut()
}

#[no_mangle]
pub extern "C" fn plugin_destroy() {
    let mut guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    *guard = None;
    host_log(2, "[browser-bookmarks] Plugin destroyed");
}

#[no_mangle]
pub extern "C" fn plugin_free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe { drop(CString::from_raw(s)); }
    }
}
