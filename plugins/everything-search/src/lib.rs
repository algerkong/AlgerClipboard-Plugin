use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::sync::Mutex;

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

// ---- Everything SDK FFI ----

type DWORD = u32;
type BOOL = i32;
type LPCWSTR = *const u16;

const EVERYTHING_REQUEST_FILE_NAME: DWORD = 0x00000001;
const EVERYTHING_REQUEST_PATH: DWORD = 0x00000002;
const EVERYTHING_REQUEST_SIZE: DWORD = 0x00000010;
const EVERYTHING_REQUEST_DATE_MODIFIED: DWORD = 0x00000040;

const EVERYTHING_OK: DWORD = 0;
const EVERYTHING_SORT_DATE_MODIFIED_DESCENDING: DWORD = 14;

struct EverythingApi {
    _lib: libloading::Library,
    set_search: unsafe extern "C" fn(LPCWSTR),
    set_request_flags: unsafe extern "C" fn(DWORD),
    set_max: unsafe extern "C" fn(DWORD),
    set_sort: unsafe extern "C" fn(DWORD),
    query: unsafe extern "C" fn(BOOL) -> BOOL,
    get_num_results: unsafe extern "C" fn() -> DWORD,
    get_result_file_name: unsafe extern "C" fn(DWORD) -> LPCWSTR,
    get_result_path: unsafe extern "C" fn(DWORD) -> LPCWSTR,
    get_result_size: unsafe extern "C" fn(DWORD, *mut i64) -> BOOL,
    get_result_date_modified: unsafe extern "C" fn(DWORD, *mut u64) -> BOOL,
    is_folder_result: unsafe extern "C" fn(DWORD) -> BOOL,
    get_last_error: unsafe extern "C" fn() -> DWORD,
}

unsafe impl Send for EverythingApi {}

impl EverythingApi {
    fn load(dll_path: &str) -> Result<Self, String> {
        unsafe {
            let lib = libloading::Library::new(dll_path)
                .map_err(|e| format!("Failed to load Everything64.dll from '{}': {}", dll_path, e))?;

            macro_rules! load_fn {
                ($lib:expr, $name:expr) => {
                    *$lib.get::<unsafe extern "C" fn()>(concat!($name, "\0").as_bytes())
                        .map_err(|e| format!("Symbol '{}' not found: {}", $name, e))?
                };
            }

            // We need to transmute since the function signatures differ
            let set_search: unsafe extern "C" fn(LPCWSTR) = std::mem::transmute(load_fn!(lib, "Everything_SetSearchW"));
            let set_request_flags: unsafe extern "C" fn(DWORD) = std::mem::transmute(load_fn!(lib, "Everything_SetRequestFlags"));
            let set_max: unsafe extern "C" fn(DWORD) = std::mem::transmute(load_fn!(lib, "Everything_SetMax"));
            let set_sort: unsafe extern "C" fn(DWORD) = std::mem::transmute(load_fn!(lib, "Everything_SetSort"));
            let query: unsafe extern "C" fn(BOOL) -> BOOL = std::mem::transmute(load_fn!(lib, "Everything_QueryW"));
            let get_num_results: unsafe extern "C" fn() -> DWORD = std::mem::transmute(load_fn!(lib, "Everything_GetNumResults"));
            let get_result_file_name: unsafe extern "C" fn(DWORD) -> LPCWSTR = std::mem::transmute(load_fn!(lib, "Everything_GetResultFileNameW"));
            let get_result_path: unsafe extern "C" fn(DWORD) -> LPCWSTR = std::mem::transmute(load_fn!(lib, "Everything_GetResultPathW"));
            let get_result_size: unsafe extern "C" fn(DWORD, *mut i64) -> BOOL = std::mem::transmute(load_fn!(lib, "Everything_GetResultSize"));
            let get_result_date_modified: unsafe extern "C" fn(DWORD, *mut u64) -> BOOL = std::mem::transmute(load_fn!(lib, "Everything_GetResultDateModified"));
            let is_folder_result: unsafe extern "C" fn(DWORD) -> BOOL = std::mem::transmute(load_fn!(lib, "Everything_IsFolderResult"));
            let get_last_error: unsafe extern "C" fn() -> DWORD = std::mem::transmute(load_fn!(lib, "Everything_GetLastError"));

            Ok(EverythingApi {
                _lib: lib,
                set_search,
                set_request_flags,
                set_max,
                set_sort,
                query,
                get_num_results,
                get_result_file_name,
                get_result_path,
                get_result_size,
                get_result_date_modified,
                is_folder_result,
                get_last_error,
            })
        }
    }

    fn search(&self, query: &str, max_results: u32) -> Result<Vec<SearchResult>, String> {
        unsafe {
            let wide: Vec<u16> = query.encode_utf16().chain(std::iter::once(0)).collect();
            (self.set_search)(wide.as_ptr());
            (self.set_request_flags)(
                EVERYTHING_REQUEST_FILE_NAME
                | EVERYTHING_REQUEST_PATH
                | EVERYTHING_REQUEST_SIZE
                | EVERYTHING_REQUEST_DATE_MODIFIED
            );
            (self.set_max)(max_results);
            (self.set_sort)(EVERYTHING_SORT_DATE_MODIFIED_DESCENDING);

            let ok = (self.query)(1); // bWait = TRUE
            if ok == 0 {
                let err = (self.get_last_error)();
                return Err(match err {
                    2 => "Everything is not running. Please start Everything first.".to_string(),
                    _ => format!("Everything query failed (error code: {})", err),
                });
            }

            let count = (self.get_num_results)();
            let mut results = Vec::with_capacity(count as usize);

            for i in 0..count {
                let name_ptr = (self.get_result_file_name)(i);
                let path_ptr = (self.get_result_path)(i);

                let name = wstr_to_string(name_ptr);
                let dir = wstr_to_string(path_ptr);
                let full_path = if dir.is_empty() {
                    name.clone()
                } else {
                    format!("{}\\{}", dir, name)
                };

                let is_dir = (self.is_folder_result)(i) != 0;

                let mut size: i64 = 0;
                (self.get_result_size)(i, &mut size);

                let mut date_modified: u64 = 0;
                (self.get_result_date_modified)(i, &mut date_modified);

                results.push(SearchResult {
                    name,
                    path: full_path,
                    is_dir,
                    size: if is_dir { 0 } else { size as u64 },
                    date_modified: filetime_to_unix(date_modified),
                });
            }

            Ok(results)
        }
    }
}

fn wstr_to_string(ptr: LPCWSTR) -> String {
    if ptr.is_null() {
        return String::new();
    }
    unsafe {
        let mut len = 0;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
    }
}

/// Convert Windows FILETIME (100-ns intervals since 1601-01-01) to Unix timestamp (seconds since 1970-01-01)
fn filetime_to_unix(ft: u64) -> u64 {
    if ft == 0 { return 0; }
    // Difference between 1601 and 1970 in 100-ns intervals
    const EPOCH_DIFF: u64 = 116_444_736_000_000_000;
    if ft > EPOCH_DIFF {
        (ft - EPOCH_DIFF) / 10_000_000
    } else {
        0
    }
}

#[derive(serde::Serialize)]
struct SearchResult {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    date_modified: u64,
}

static API: Mutex<Option<EverythingApi>> = Mutex::new(None);

fn find_everything_dll() -> Result<String, String> {
    let dll_names = ["Everything64.dll", "Everything32.dll"];

    // 1. User-configured custom path
    if let Some(custom) = host_get_setting("plugin:everything-search:everything_path") {
        let custom = custom.trim().trim_matches('"').to_string();
        if !custom.is_empty() && std::path::Path::new(&custom).exists() {
            return Ok(custom);
        }
    }

    // 2. Bundled with plugin — same directory as this DLL
    if let Some(path) = find_dll_next_to_self(&dll_names) {
        return Ok(path);
    }

    // 3. Next to the running Everything.exe process
    #[cfg(windows)]
    if let Some(path) = find_dll_from_process(&dll_names) {
        return Ok(path);
    }

    // 4. Common install paths on all drive letters
    let drives: Vec<String> = ('C'..='Z')
        .map(|c| format!("{}:", c))
        .filter(|d| std::path::Path::new(&format!("{}\\", d)).exists())
        .collect();
    let subdirs = [
        r"Program Files\Everything",
        r"Program Files (x86)\Everything",
        r"Program Files\Everything 1.5a",
        r"Program Files (x86)\Everything 1.5a",
    ];
    for drive in &drives {
        for subdir in &subdirs {
            for name in &dll_names {
                let p = std::path::Path::new(drive).join(subdir).join(name);
                if p.exists() { return Ok(p.to_string_lossy().into_owned()); }
            }
        }
    }

    // 5. Windows registry
    #[cfg(windows)]
    if let Some(path) = find_dll_from_registry(&dll_names) {
        return Ok(path);
    }

    // 6. Fallback — let the OS search DLL load paths
    Ok("Everything64.dll".to_string())
}

/// Find Everything DLL next to our own plugin DLL
fn find_dll_next_to_self(dll_names: &[&str]) -> Option<String> {
    // Get the path of the currently loaded DLL (ourselves)
    #[cfg(windows)]
    {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        extern "system" {
            fn GetModuleHandleW(name: *const u16) -> *mut std::ffi::c_void;
            fn GetModuleFileNameW(module: *mut std::ffi::c_void, buf: *mut u16, size: u32) -> u32;
        }

        let self_name: Vec<u16> = "everything_search_plugin.dll\0".encode_utf16().collect();
        let module = unsafe { GetModuleHandleW(self_name.as_ptr()) };
        if module.is_null() { return None; }

        let mut buf = [0u16; 1024];
        let len = unsafe { GetModuleFileNameW(module, buf.as_mut_ptr(), buf.len() as u32) };
        if len == 0 { return None; }

        let path = OsString::from_wide(&buf[..len as usize]);
        let self_path = std::path::PathBuf::from(path);
        let dir = self_path.parent()?;

        for name in dll_names {
            let p = dir.join(name);
            if p.exists() { return Some(p.to_string_lossy().into_owned()); }
        }
    }
    None
}

/// Find DLL next to a running Everything.exe process
#[cfg(windows)]
fn find_dll_from_process(dll_names: &[&str]) -> Option<String> {
    let output = std::process::Command::new("wmic")
        .args(["process", "where", "name like '%Everything%'", "get", "ExecutablePath", "/format:list"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        let line = line.trim();
        if let Some(path) = line.strip_prefix("ExecutablePath=") {
            let path = path.trim();
            if let Some(dir) = std::path::Path::new(path).parent() {
                for name in dll_names {
                    let p = dir.join(name);
                    if p.exists() { return Some(p.to_string_lossy().into_owned()); }
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn find_dll_from_registry(dll_names: &[&str]) -> Option<String> {
    for subkey in &[
        r"HKLM\SOFTWARE\voidtools\Everything",
        r"HKLM\SOFTWARE\WOW6432Node\voidtools\Everything",
    ] {
        let output = std::process::Command::new("reg")
            .args(["query", subkey, "/v", "InstallFolder"])
            .output()
            .ok()?;

        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("InstallFolder") {
                    // Parse: "    InstallFolder    REG_SZ    C:\...\Everything\"
                    if let Some(pos) = line.find("REG_SZ") {
                        let install_path = line[pos + 6..].trim();
                        for name in dll_names {
                            let p = std::path::Path::new(install_path).join(name);
                            if p.exists() { return Some(p.to_string_lossy().into_owned()); }
                        }
                    }
                }
            }
        }
    }
    None
}

fn ensure_api() -> Result<(), String> {
    let mut guard = API.lock().map_err(|e| format!("Lock error: {}", e))?;
    if guard.is_some() {
        return Ok(());
    }

    let dll_path = find_everything_dll()?;
    host_log(2, &format!("Loading Everything SDK from: {}", dll_path));
    let api = EverythingApi::load(&dll_path)?;
    *guard = Some(api);
    Ok(())
}

fn do_search(query: &str, max_results: u32) -> Result<Vec<SearchResult>, String> {
    ensure_api()?;
    let guard = API.lock().map_err(|e| format!("Lock error: {}", e))?;
    let api = guard.as_ref().unwrap();
    api.search(query, max_results)
}

fn do_open(path: &str, action: &str) -> Result<String, String> {
    match action {
        "open" => {
            #[cfg(windows)]
            {
                std::process::Command::new("cmd")
                    .args(["/c", "start", "", path])
                    .spawn()
                    .map_err(|e| format!("Failed to open '{}': {}", path, e))?;
            }
            #[cfg(not(windows))]
            {
                std::process::Command::new("xdg-open")
                    .arg(path)
                    .spawn()
                    .map_err(|e| format!("Failed to open '{}': {}", path, e))?;
            }
            Ok(r#"{"ok":true}"#.to_string())
        }
        "locate" => {
            #[cfg(windows)]
            {
                std::process::Command::new("explorer")
                    .args(["/select,", path])
                    .spawn()
                    .map_err(|e| format!("Failed to locate '{}': {}", path, e))?;
            }
            Ok(r#"{"ok":true}"#.to_string())
        }
        "copy_path" => {
            // Copy path to clipboard via host API
            unsafe {
                if !HOST.is_null() {
                    if let Ok(cs) = CString::new(path) {
                        ((*HOST).write_clipboard)((*HOST).ctx, cs.as_ptr());
                    }
                }
            }
            Ok(r#"{"ok":true}"#.to_string())
        }
        _ => Err(format!("Unknown action: {}", action)),
    }
}

// ---- Plugin C ABI exports ----

#[no_mangle]
pub extern "C" fn plugin_init(host: *const HostVTable) -> c_int {
    unsafe { HOST = host; }
    let cmds = ["search", "open"];
    for cmd in &cmds {
        if let Ok(cs) = CString::new(*cmd) {
            unsafe { ((*HOST).register_command)((*HOST).ctx, cs.as_ptr()); }
        }
    }
    host_log(2, "Everything Search plugin initialized");
    0
}

#[no_mangle]
pub extern "C" fn plugin_on_command(command: *const c_char, args: *const c_char) -> *mut c_char {
    let cmd = unsafe { CStr::from_ptr(command) }.to_str().unwrap_or("");
    let args_str = unsafe { CStr::from_ptr(args) }.to_str().unwrap_or("{}");

    let result = match cmd {
        "search" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let query = parsed.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let max_results = parsed.get("max_results").and_then(|v| v.as_u64()).unwrap_or(20) as u32;

            if query.is_empty() {
                "[]".to_string()
            } else {
                match do_search(query, max_results) {
                    Ok(results) => serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string()),
                    Err(e) => {
                        host_log(3, &format!("Search error: {}", e));
                        format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\""))
                    }
                }
            }
        }
        "open" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let path = parsed.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let action = parsed.get("action").and_then(|v| v.as_str()).unwrap_or("open");

            match do_open(path, action) {
                Ok(r) => r,
                Err(e) => format!(r#"{{"ok":false,"error":"{}"}}"#, e.replace('"', "\\\"")),
            }
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
    let mut guard = API.lock().unwrap_or_else(|e| e.into_inner());
    *guard = None;
    host_log(2, "Everything Search plugin destroyed");
}

#[no_mangle]
pub extern "C" fn plugin_free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe { drop(CString::from_raw(s)); }
    }
}
