use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::process::Command;
use std::time::Instant;

// ---- HostVTable ----

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

/// Perform an HTTP GET request via the host VTable.
/// Returns the response body as a string, or an error message.
fn host_http_get(url: &str) -> Result<String, String> {
    unsafe {
        if HOST.is_null() {
            return Err("Host not initialized".to_string());
        }
        let url_cs = CString::new(url).map_err(|e| e.to_string())?;
        let method_cs = CString::new("GET").map_err(|e| e.to_string())?;
        let headers_cs = CString::new("").map_err(|e| e.to_string())?;
        let body_cs = CString::new("").map_err(|e| e.to_string())?;

        let ptr = ((*HOST).http_request)(
            (*HOST).ctx,
            url_cs.as_ptr(),
            method_cs.as_ptr(),
            headers_cs.as_ptr(),
            body_cs.as_ptr(),
        );

        if ptr.is_null() {
            return Err("HTTP request returned null".to_string());
        }
        let result = CStr::from_ptr(ptr).to_str().map(|s| s.to_string())
            .map_err(|e| e.to_string());
        ((*HOST).free_string)((*HOST).ctx, ptr);
        result
    }
}

// ---- Data structures ----

#[derive(serde::Serialize)]
struct NetworkInterface {
    name: String,
    ip: String,
    mac: String,
    is_ipv6: bool,
}

#[derive(serde::Serialize)]
struct DnsResult {
    domain: String,
    addresses: Vec<String>,
    time_ms: u64,
}

#[derive(serde::Serialize)]
struct IpGeoResult {
    ip: String,
    country: String,
    city: String,
    isp: String,
}

#[derive(serde::Serialize)]
struct PingResult {
    host: String,
    avg_ms: f64,
    min_ms: f64,
    max_ms: f64,
    loss_percent: f64,
}

// ---- Command implementations ----

/// Parse `ipconfig /all` output and return a list of network interfaces.
/// We look for adapter blocks and extract IPv4/IPv6 addresses and MAC addresses.
fn cmd_get_local_network(show_ipv6: bool) -> Result<Vec<NetworkInterface>, String> {
    let output = Command::new("ipconfig")
        .arg("/all")
        .output()
        .map_err(|e| format!("Failed to run ipconfig: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    let mut interfaces: Vec<NetworkInterface> = Vec::new();

    let mut current_name = String::new();
    let mut current_mac = String::new();

    for line in text.lines() {
        // Adapter header lines look like: "Ethernet adapter Ethernet:" or
        // "Wireless LAN adapter Wi-Fi:" (they don't start with spaces)
        if !line.starts_with(' ') && !line.starts_with('\t') {
            if let Some(colon_pos) = line.rfind(':') {
                let header = &line[..colon_pos];
                // Strip "adapter" keyword prefix patterns
                let name = header
                    .trim_start_matches("Ethernet adapter ")
                    .trim_start_matches("Wireless LAN adapter ")
                    .trim_start_matches("PPP adapter ")
                    .trim_start_matches("Tunnel adapter ")
                    .trim();
                current_name = name.to_string();
                current_mac = String::new();
            }
            continue;
        }

        let trimmed = line.trim();

        // Physical Address (MAC)
        if trimmed.starts_with("Physical Address") {
            if let Some(val) = trimmed.splitn(2, ':').nth(1) {
                // The value part may start with ". . . . . . . . : XX-XX-XX..."
                // Strip leading dots and whitespace
                let mac_raw = val.trim_start_matches(". . . . . . . . ").trim_start_matches(". ").trim();
                if !mac_raw.is_empty() {
                    current_mac = mac_raw.to_string();
                }
            }
            continue;
        }

        // IPv4 Address
        if trimmed.starts_with("IPv4 Address") {
            if let Some(val) = trimmed.splitn(2, ':').nth(1) {
                let ip = val.trim().trim_end_matches("(Preferred)").trim().to_string();
                if !ip.is_empty() && !current_name.is_empty() {
                    interfaces.push(NetworkInterface {
                        name: current_name.clone(),
                        ip,
                        mac: current_mac.clone(),
                        is_ipv6: false,
                    });
                }
            }
            continue;
        }

        // IPv6 Address
        if show_ipv6 && (trimmed.starts_with("IPv6 Address") || trimmed.starts_with("Link-local IPv6 Address")) {
            if let Some(val) = trimmed.splitn(2, ':').nth(1) {
                let ip = val.trim()
                    .trim_end_matches("(Preferred)")
                    .trim_end_matches("(Tentative)")
                    .trim()
                    .to_string();
                if !ip.is_empty() && !current_name.is_empty() {
                    interfaces.push(NetworkInterface {
                        name: current_name.clone(),
                        ip,
                        mac: current_mac.clone(),
                        is_ipv6: true,
                    });
                }
            }
        }
    }

    Ok(interfaces)
}

/// Query public IP via the configured API provider.
/// Returns raw JSON string from the provider.
fn cmd_get_public_ip() -> Result<serde_json::Value, String> {
    let api = host_get_setting("plugin:network-info:public_ip_api")
        .unwrap_or_else(|| "ipinfo".to_string());

    let url = match api.as_str() {
        "ipapi"   => "http://ip-api.com/json",
        "ifconfig" => "https://ifconfig.me/all.json",
        _          => "https://ipinfo.io/json",   // default: ipinfo
    };

    let body = host_http_get(url)?;
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse public IP response: {}", e))?;

    // Normalise fields so the frontend always gets { ip, city, country, org }
    let ip = match api.as_str() {
        "ipapi"    => json.get("query").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        "ifconfig" => json.get("ip_addr").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        _          => json.get("ip").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    };

    let city = match api.as_str() {
        "ipapi"    => json.get("city").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        "ifconfig" => "".to_string(),
        _          => json.get("city").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    };

    let country = match api.as_str() {
        "ipapi"    => json.get("country").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        "ifconfig" => json.get("country").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        _          => json.get("country").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    };

    let org = match api.as_str() {
        "ipapi"    => json.get("isp").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        "ifconfig" => "".to_string(),
        _          => json.get("org").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    };

    Ok(serde_json::json!({
        "ip": ip,
        "city": city,
        "country": country,
        "org": org,
    }))
}

/// DNS lookup via `nslookup`.
fn cmd_dns_lookup(domain: &str) -> Result<DnsResult, String> {
    if domain.is_empty() {
        return Err("Domain is empty".to_string());
    }

    let start = Instant::now();
    let output = Command::new("nslookup")
        .arg(domain)
        .output()
        .map_err(|e| format!("Failed to run nslookup: {}", e))?;
    let elapsed = start.elapsed().as_millis() as u64;

    let text = String::from_utf8_lossy(&output.stdout).to_string();

    // nslookup output after the server header block looks like:
    //   Name:    google.com
    //   Addresses:  142.250.80.46
    //             2404:6800:4005:812::200e
    // We skip the first "Non-authoritative answer" section header and grab Address(es).

    let mut addresses: Vec<String> = Vec::new();
    let mut past_server_block = false;

    for line in text.lines() {
        let trimmed = line.trim();

        // The server/default server block ends before "Name:" appears
        if trimmed.starts_with("Name:") {
            past_server_block = true;
            continue;
        }

        if past_server_block {
            if trimmed.starts_with("Address:") || trimmed.starts_with("Addresses:") {
                // Grab everything after the colon
                if let Some(val) = trimmed.splitn(2, ':').nth(1) {
                    let addr = val.trim().to_string();
                    if !addr.is_empty() {
                        addresses.push(addr);
                    }
                }
            } else if !trimmed.is_empty() && !trimmed.starts_with("Aliases:") {
                // Continuation lines (additional IPs are indented)
                // Only add if it looks like an IP address or hostname
                let looks_like_addr = trimmed.chars().next()
                    .map(|c| c.is_ascii_digit() || c == ':')
                    .unwrap_or(false);
                if looks_like_addr {
                    addresses.push(trimmed.to_string());
                }
            }
        }
    }

    // Deduplicate while preserving order
    let mut seen = std::collections::HashSet::new();
    addresses.retain(|a| seen.insert(a.clone()));

    Ok(DnsResult {
        domain: domain.to_string(),
        addresses,
        time_ms: elapsed,
    })
}

/// IP geolocation via ip-api.com.
fn cmd_ip_lookup(ip: &str) -> Result<IpGeoResult, String> {
    if ip.is_empty() {
        return Err("IP is empty".to_string());
    }

    let url = format!("http://ip-api.com/json/{}", ip);
    let body = host_http_get(&url)?;
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse ip-api response: {}", e))?;

    let status = json.get("status").and_then(|v| v.as_str()).unwrap_or("fail");
    if status == "fail" {
        let message = json.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error");
        return Err(format!("ip-api error: {}", message));
    }

    Ok(IpGeoResult {
        ip: ip.to_string(),
        country: json.get("country").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        city: json.get("city").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        isp: json.get("isp").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    })
}

/// Ping a host using the system `ping` command.
fn cmd_ping_host(host: &str) -> Result<PingResult, String> {
    if host.is_empty() {
        return Err("Host is empty".to_string());
    }

    let output = Command::new("ping")
        .args(["-n", "4", host])
        .output()
        .map_err(|e| format!("Failed to run ping: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout).to_string();

    // Parse Windows ping output.
    // Summary line example:
    //   Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),
    // RTT line example:
    //   Minimum = 12ms, Maximum = 15ms, Average = 13ms

    let mut min_ms: f64 = 0.0;
    let mut max_ms: f64 = 0.0;
    let mut avg_ms: f64 = 0.0;
    let mut loss_percent: f64 = 0.0;

    for line in text.lines() {
        let trimmed = line.trim();

        // Loss percentage
        if trimmed.contains("Lost") && trimmed.contains('%') {
            // "Packets: Sent = 4, Received = 3, Lost = 1 (25% loss)"
            if let Some(paren_start) = trimmed.find('(') {
                if let Some(paren_end) = trimmed.find('%') {
                    let percent_str = trimmed[paren_start + 1..paren_end].trim();
                    if let Ok(p) = percent_str.parse::<f64>() {
                        loss_percent = p;
                    }
                }
            }
        }

        // RTT stats
        if trimmed.starts_with("Minimum") || trimmed.starts_with("Minimum") {
            // "Minimum = 12ms, Maximum = 15ms, Average = 13ms"
            let parse_ms = |label: &str| -> f64 {
                if let Some(pos) = trimmed.find(label) {
                    let rest = &trimmed[pos + label.len()..];
                    // skip " = "
                    if let Some(eq_pos) = rest.find('=') {
                        let val_part = rest[eq_pos + 1..].trim();
                        let num: String = val_part.chars().take_while(|c| c.is_ascii_digit()).collect();
                        return num.parse::<f64>().unwrap_or(0.0);
                    }
                }
                0.0
            };
            min_ms = parse_ms("Minimum");
            max_ms = parse_ms("Maximum");
            avg_ms = parse_ms("Average");
        }
    }

    Ok(PingResult {
        host: host.to_string(),
        avg_ms,
        min_ms,
        max_ms,
        loss_percent,
    })
}

// ---- Plugin C ABI exports ----

#[no_mangle]
pub extern "C" fn plugin_init(host: *const HostVTable) -> c_int {
    unsafe { HOST = host; }

    let cmds = [
        "get_local_network",
        "get_public_ip",
        "dns_lookup",
        "ip_lookup",
        "ping_host",
    ];
    for cmd in &cmds {
        if let Ok(cs) = CString::new(*cmd) {
            unsafe { ((*HOST).register_command)((*HOST).ctx, cs.as_ptr()); }
        }
    }

    host_log(2, "Network Info plugin initialized");
    0
}

#[no_mangle]
pub extern "C" fn plugin_on_command(command: *const c_char, args: *const c_char) -> *mut c_char {
    let cmd = unsafe { CStr::from_ptr(command) }.to_str().unwrap_or("");
    let args_str = unsafe { CStr::from_ptr(args) }.to_str().unwrap_or("{}");

    let result = match cmd {
        "get_local_network" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let show_ipv6 = parsed.get("show_ipv6").and_then(|v| v.as_bool()).unwrap_or(true);

            match cmd_get_local_network(show_ipv6) {
                Ok(ifaces) => serde_json::to_string(&ifaces)
                    .unwrap_or_else(|_| "[]".to_string()),
                Err(e) => {
                    host_log(3, &format!("get_local_network error: {}", e));
                    format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\""))
                }
            }
        }

        "get_public_ip" => {
            match cmd_get_public_ip() {
                Ok(v) => serde_json::to_string(&v)
                    .unwrap_or_else(|_| r#"{"error":"serialization failed"}"#.to_string()),
                Err(e) => {
                    host_log(3, &format!("get_public_ip error: {}", e));
                    format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\""))
                }
            }
        }

        "dns_lookup" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let domain = parsed.get("domain").and_then(|v| v.as_str()).unwrap_or("");

            match cmd_dns_lookup(domain) {
                Ok(r) => serde_json::to_string(&r)
                    .unwrap_or_else(|_| r#"{"error":"serialization failed"}"#.to_string()),
                Err(e) => {
                    host_log(3, &format!("dns_lookup error: {}", e));
                    format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\""))
                }
            }
        }

        "ip_lookup" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let ip = parsed.get("ip").and_then(|v| v.as_str()).unwrap_or("");

            match cmd_ip_lookup(ip) {
                Ok(r) => serde_json::to_string(&r)
                    .unwrap_or_else(|_| r#"{"error":"serialization failed"}"#.to_string()),
                Err(e) => {
                    host_log(3, &format!("ip_lookup error: {}", e));
                    format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\""))
                }
            }
        }

        "ping_host" => {
            let parsed: serde_json::Value = serde_json::from_str(args_str).unwrap_or_default();
            let host = parsed.get("host").and_then(|v| v.as_str()).unwrap_or("");

            match cmd_ping_host(host) {
                Ok(r) => serde_json::to_string(&r)
                    .unwrap_or_else(|_| r#"{"error":"serialization failed"}"#.to_string()),
                Err(e) => {
                    host_log(3, &format!("ping_host error: {}", e));
                    format!(r#"{{"error":"{}"}}"#, e.replace('"', "\\\""))
                }
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
    host_log(2, "Network Info plugin destroyed");
}

#[no_mangle]
pub extern "C" fn plugin_free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe { drop(CString::from_raw(s)); }
    }
}
