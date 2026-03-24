use std::ffi::{CStr, CString, c_char, c_int, c_void};

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

fn host_http_request(method: &str, url: &str, headers_json: &str, body: &str) -> Option<String> {
    unsafe {
        if HOST.is_null() { return None; }
        let cs_method = CString::new(method).ok()?;
        let cs_url = CString::new(url).ok()?;
        let cs_headers = CString::new(headers_json).ok()?;
        let cs_body = CString::new(body).ok()?;
        let ptr = ((*HOST).http_request)(
            (*HOST).ctx,
            cs_method.as_ptr(),
            cs_url.as_ptr(),
            cs_headers.as_ptr(),
            cs_body.as_ptr(),
        );
        if ptr.is_null() { return None; }
        let val = CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string());
        ((*HOST).free_string)((*HOST).ctx, ptr);
        val
    }
}

// ---- Helpers ----

fn get_token() -> String {
    host_get_setting("github_token")
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn get_max_results() -> u64 {
    host_get_setting("max_results")
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(10)
        .clamp(1, 100)
}

fn build_headers(token: &str) -> String {
    if token.is_empty() {
        r#"{"Accept":"application/vnd.github.v3+json","User-Agent":"AlgerClipboard"}"#.to_string()
    } else {
        format!(
            r#"{{"Accept":"application/vnd.github.v3+json","Authorization":"token {}","User-Agent":"AlgerClipboard"}}"#,
            token
        )
    }
}

fn escape_json_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

// ---- Command: search_repos ----

#[derive(serde::Serialize)]
struct RepoResult {
    name: String,
    full_name: String,
    description: String,
    stars: u64,
    language: String,
    html_url: String,
}

fn cmd_search_repos(query: &str) -> String {
    let max = get_max_results();
    let token = get_token();
    let headers = build_headers(&token);

    let encoded_query = url_encode(query);
    let url = format!(
        "https://api.github.com/search/repositories?q={}&per_page={}&sort=stars",
        encoded_query, max
    );

    let response = match host_http_request("GET", &url, &headers, "") {
        Some(r) => r,
        None => return r#"{"error":"HTTP request failed"}"#.to_string(),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&response) {
        Ok(v) => v,
        Err(e) => {
            host_log(3, &format!("search_repos parse error: {}", e));
            return r#"{"error":"Failed to parse GitHub response"}"#.to_string();
        }
    };

    // Check for API error message
    if let Some(msg) = parsed.get("message").and_then(|v| v.as_str()) {
        return format!(r#"{{"error":"{}"}}"#, escape_json_string(msg));
    }

    let items = match parsed.get("items").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return "[]".to_string(),
    };

    let mut results: Vec<RepoResult> = Vec::new();
    for item in items {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let full_name = item.get("full_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let description = item.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let stars = item.get("stargazers_count").and_then(|v| v.as_u64()).unwrap_or(0);
        let language = item.get("language").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let html_url = item.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string();

        results.push(RepoResult { name, full_name, description, stars, language, html_url });
    }

    serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
}

// ---- Command: search_users ----

#[derive(serde::Serialize)]
struct UserResult {
    login: String,
    html_url: String,
    avatar_url: String,
    user_type: String,
}

fn cmd_search_users(query: &str) -> String {
    let max = get_max_results();
    let token = get_token();
    let headers = build_headers(&token);

    let encoded_query = url_encode(query);
    let url = format!(
        "https://api.github.com/search/users?q={}&per_page={}",
        encoded_query, max
    );

    let response = match host_http_request("GET", &url, &headers, "") {
        Some(r) => r,
        None => return r#"{"error":"HTTP request failed"}"#.to_string(),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&response) {
        Ok(v) => v,
        Err(e) => {
            host_log(3, &format!("search_users parse error: {}", e));
            return r#"{"error":"Failed to parse GitHub response"}"#.to_string();
        }
    };

    if let Some(msg) = parsed.get("message").and_then(|v| v.as_str()) {
        return format!(r#"{{"error":"{}"}}"#, escape_json_string(msg));
    }

    let items = match parsed.get("items").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return "[]".to_string(),
    };

    let mut results: Vec<UserResult> = Vec::new();
    for item in items {
        let login = item.get("login").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let html_url = item.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let avatar_url = item.get("avatar_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let user_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("User").to_string();

        results.push(UserResult { login, html_url, avatar_url, user_type });
    }

    serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
}

// ---- Command: get_user_repos ----

fn cmd_get_user_repos() -> String {
    let max = get_max_results();
    let token = get_token();
    if token.is_empty() {
        return r#"{"error":"GitHub token required for this feature"}"#.to_string();
    }
    let headers = build_headers(&token);

    let url = format!(
        "https://api.github.com/user/repos?sort=updated&per_page={}",
        max
    );

    let response = match host_http_request("GET", &url, &headers, "") {
        Some(r) => r,
        None => return r#"{"error":"HTTP request failed"}"#.to_string(),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&response) {
        Ok(v) => v,
        Err(e) => {
            host_log(3, &format!("get_user_repos parse error: {}", e));
            return r#"{"error":"Failed to parse GitHub response"}"#.to_string();
        }
    };

    // API error (e.g. 401)
    if let Some(msg) = parsed.get("message").and_then(|v| v.as_str()) {
        return format!(r#"{{"error":"{}"}}"#, escape_json_string(msg));
    }

    let items = match parsed.as_array() {
        Some(arr) => arr,
        None => return "[]".to_string(),
    };

    let mut results: Vec<RepoResult> = Vec::new();
    for item in items {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let full_name = item.get("full_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let description = item.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let stars = item.get("stargazers_count").and_then(|v| v.as_u64()).unwrap_or(0);
        let language = item.get("language").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let html_url = item.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string();

        results.push(RepoResult { name, full_name, description, stars, language, html_url });
    }

    serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
}

// ---- Command: get_repo_issues ----

#[derive(serde::Serialize)]
struct IssueResult {
    number: u64,
    title: String,
    state: String,
    html_url: String,
    user_login: String,
}

fn cmd_get_repo_issues(owner: &str, repo: &str) -> String {
    let max = get_max_results();
    let token = get_token();
    let headers = build_headers(&token);

    let url = format!(
        "https://api.github.com/repos/{}/{}/issues?per_page={}",
        owner, repo, max
    );

    let response = match host_http_request("GET", &url, &headers, "") {
        Some(r) => r,
        None => return r#"{"error":"HTTP request failed"}"#.to_string(),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&response) {
        Ok(v) => v,
        Err(e) => {
            host_log(3, &format!("get_repo_issues parse error: {}", e));
            return r#"{"error":"Failed to parse GitHub response"}"#.to_string();
        }
    };

    if let Some(msg) = parsed.get("message").and_then(|v| v.as_str()) {
        return format!(r#"{{"error":"{}"}}"#, escape_json_string(msg));
    }

    let items = match parsed.as_array() {
        Some(arr) => arr,
        None => return "[]".to_string(),
    };

    let mut results: Vec<IssueResult> = Vec::new();
    for item in items {
        let number = item.get("number").and_then(|v| v.as_u64()).unwrap_or(0);
        let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let state = item.get("state").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let html_url = item.get("html_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let user_login = item
            .get("user")
            .and_then(|u| u.get("login"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        results.push(IssueResult { number, title, state, html_url, user_login });
    }

    serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
}

// ---- URL encoding ----

fn url_encode(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 2);
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' => result.push(byte as char),
            b' ' => result.push('+'),
            b => result.push_str(&format!("%{:02X}", b)),
        }
    }
    result
}

// ---- Plugin C ABI exports ----

#[no_mangle]
pub extern "C" fn plugin_init(host: *const HostVTable) -> c_int {
    unsafe { HOST = host; }
    let cmds = ["search_repos", "search_users", "get_user_repos", "get_repo_issues"];
    for cmd in &cmds {
        if let Ok(cs) = CString::new(*cmd) {
            unsafe { ((*HOST).register_command)((*HOST).ctx, cs.as_ptr()); }
        }
    }
    host_log(2, "GitHub Search plugin initialized");
    0
}

#[no_mangle]
pub extern "C" fn plugin_on_command(command: *const c_char, args: *const c_char) -> *mut c_char {
    let cmd = unsafe { CStr::from_ptr(command) }.to_str().unwrap_or("");
    let args_str = unsafe { CStr::from_ptr(args) }.to_str().unwrap_or("{}");

    let result = match cmd {
        "search_repos" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let query = parsed.get("query").and_then(|v| v.as_str()).unwrap_or("");
            if query.is_empty() {
                "[]".to_string()
            } else {
                cmd_search_repos(query)
            }
        }
        "search_users" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let query = parsed.get("query").and_then(|v| v.as_str()).unwrap_or("");
            if query.is_empty() {
                "[]".to_string()
            } else {
                cmd_search_users(query)
            }
        }
        "get_user_repos" => {
            cmd_get_user_repos()
        }
        "get_repo_issues" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let owner = parsed.get("owner").and_then(|v| v.as_str()).unwrap_or("");
            let repo = parsed.get("repo").and_then(|v| v.as_str()).unwrap_or("");
            if owner.is_empty() || repo.is_empty() {
                "[]".to_string()
            } else {
                cmd_get_repo_issues(owner, repo)
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
    host_log(2, "GitHub Search plugin destroyed");
}

#[no_mangle]
pub extern "C" fn plugin_free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe { drop(CString::from_raw(s)); }
    }
}
