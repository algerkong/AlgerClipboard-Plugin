// Network Info Plugin - View IP addresses, DNS lookup, and network information
(function () {
  var api = window.AlgerPlugin.create("network-info");
  var locale = api.getEnv().locale || "en";
  var showIpv6 = true;
  var publicIpApi = "ipinfo";

  var i18n = {
    "en": {
      placeholder: "ip / domain / IP address / ping host",
      localIp: "Local IP",
      publicIp: "Public IP",
      loading: "Loading public IP...",
      dnsResult: "DNS Result",
      geoIp: "GeoIP",
      pingResult: "Ping Result",
      copyInfo: "Copy",
      local: "Local",
      pub: "Public",
      dns: "DNS",
      geo: "GeoIP",
      ping: "Ping",
      noIface: "No network interfaces found",
      errorTitle: "Error",
      ms: "ms",
      loss: "loss",
      noAddresses: "No addresses resolved",
    },
    "zh-CN": {
      placeholder: "ip / 域名 / IP 地址 / ping 主机",
      localIp: "本地 IP",
      publicIp: "公网 IP",
      loading: "正在获取公网 IP...",
      dnsResult: "DNS 解析结果",
      geoIp: "IP 归属地",
      pingResult: "Ping 结果",
      copyInfo: "复制",
      local: "本地",
      pub: "公网",
      dns: "DNS",
      geo: "GeoIP",
      ping: "Ping",
      noIface: "未找到网络接口",
      errorTitle: "错误",
      ms: "ms",
      loss: "丢包",
      noAddresses: "未解析到地址",
    },
  };

  function t(key) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    return (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
  }

  // Load initial settings
  api.getSetting("show_ipv6").then(function (val) {
    if (val !== null && val !== "") showIpv6 = val !== "false" && val !== false;
  });
  api.getSetting("public_ip_api").then(function (val) {
    if (val !== null && val !== "") publicIpApi = val;
  });

  api.onSettingChanged("show_ipv6", function (newVal) {
    showIpv6 = newVal !== "false" && newVal !== false;
  });
  api.onSettingChanged("public_ip_api", function (newVal) {
    publicIpApi = newVal || "ipinfo";
  });

  // ---- helpers ----

  var IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
  var IPV6_RE = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;

  function isIpv4(s) { return IPV4_RE.test(s.trim()); }
  function isIpv6(s) { return IPV6_RE.test(s.trim()) && s.indexOf(':') !== -1; }
  function isIp(s) { return isIpv4(s) || isIpv6(s); }

  // A "domain-like" string: contains a dot, no spaces, not an IP
  function isDomain(s) {
    var t2 = s.trim();
    return t2.indexOf('.') !== -1 && t2.indexOf(' ') === -1 && !isIp(t2);
  }

  function makePingSubtitle(r) {
    if (r.error) return r.error;
    return (
      "avg " + r.avg_ms.toFixed(1) + t("ms") +
      "  min " + r.min_ms.toFixed(1) + t("ms") +
      "  max " + r.max_ms.toFixed(1) + t("ms") +
      "  " + r.loss_percent.toFixed(0) + "% " + t("loss")
    );
  }

  // ---- query handler ----

  function onQuery(query) {
    var q = (query || "").trim();

    // --- ping mode ---
    if (q.toLowerCase().startsWith("ping ")) {
      var pingHost = q.slice(5).trim();
      if (!pingHost) return Promise.resolve([]);
      return api.invokeBackend("ping_host", { host: pingHost })
        .then(function (r) {
          if (r && r.error) {
            return [makeError(r.error)];
          }
          return [{
            id: "ping:" + pingHost + ":" + r.avg_ms,
            title: pingHost + "  avg " + r.avg_ms.toFixed(1) + t("ms"),
            subtitle: makePingSubtitle(r),
            icon: "lucide:activity",
            badge: t("ping"),
            score: 0.8,
          }];
        })
        .catch(function (e) { return [makeError(String(e))]; });
    }

    // --- IP geolocation mode ---
    if (isIp(q)) {
      return api.invokeBackend("ip_lookup", { ip: q })
        .then(function (r) {
          if (r && r.error) return [makeError(r.error)];
          var location = [r.city, r.country].filter(Boolean).join(" / ");
          return [{
            id: "geo:" + q,
            title: location || q,
            subtitle: r.isp || q,
            icon: "lucide:map-pin",
            badge: t("geo"),
            score: 0.8,
          }];
        })
        .catch(function (e) { return [makeError(String(e))]; });
    }

    // --- DNS lookup mode ---
    if (isDomain(q)) {
      var start = Date.now();
      return api.invokeBackend("dns_lookup", { domain: q })
        .then(function (r) {
          if (r && r.error) return [makeError(r.error)];
          if (!r.addresses || r.addresses.length === 0) {
            return [{
              id: "dns:noresult:" + q,
              title: t("noAddresses"),
              subtitle: q,
              icon: "ph:magnifying-glass-x",
              badge: t("dns"),
              score: 0.8,
            }];
          }
          return r.addresses.map(function (addr, idx) {
            return {
              id: "dns:" + q + ":" + addr,
              title: addr,
              subtitle: q + "  \u00B7  " + r.time_ms + t("ms"),
              icon: "lucide:server",
              badge: t("dns"),
              score: 0.8,
            };
          });
        })
        .catch(function (e) { return [makeError(String(e))]; });
    }

    // --- default: show local interfaces + async public IP ---
    return api.invokeBackend("get_local_network", { show_ipv6: showIpv6 })
      .then(function (ifaces) {
        if (!Array.isArray(ifaces) || ifaces.length === 0) {
          return [makeError(t("noIface"))];
        }

        var results = ifaces.map(function (iface) {
          return {
            id: "local:" + iface.name + ":" + iface.ip,
            title: iface.ip,
            subtitle: iface.name + (iface.mac ? "  \u00B7  " + iface.mac : ""),
            icon: iface.is_ipv6 ? "lucide:network" : "ph:wifi-high",
            badge: t("local"),
            score: 0.8,
          };
        });

        // Append a placeholder for public IP that will load async
        var publicIpPlaceholder = {
          id: "public:loading",
          title: t("loading"),
          subtitle: "",
          icon: "lucide:globe",
          badge: t("pub"),
          score: 0.8,
        };
        results.push(publicIpPlaceholder);

        // Also kick off the async public IP fetch; since we can't update
        // results in place, we return a second promise chain that will
        // replace the placeholder on next query cycle — however the
        // standard pattern is to return all results immediately.
        // We return local results + public IP once resolved via a merged promise.
        return api.invokeBackend("get_public_ip", {})
          .then(function (pub) {
            if (pub && pub.error) {
              // Replace placeholder with error entry
              results[results.length - 1] = makeError(pub.error);
              return results;
            }
            var location = [pub.city, pub.country].filter(Boolean).join(" / ");
            results[results.length - 1] = {
              id: "public:" + pub.ip,
              title: pub.ip,
              subtitle: (location ? location + "  \u00B7  " : "") + (pub.org || ""),
              icon: "lucide:globe",
              badge: t("pub"),
              score: 0.8,
            };
            return results;
          })
          .catch(function () {
            results[results.length - 1] = makeError("Failed to fetch public IP");
            return results;
          });
      })
      .catch(function (e) { return [makeError(String(e))]; });
  }

  function makeError(msg) {
    return {
      id: "__error__:" + msg,
      title: t("errorTitle"),
      subtitle: msg,
      icon: "lucide:alert-circle",
      badge: "",
      score: 0.5,
    };
  }

  // ---- mode registration ----

  api.registerMode({
    id: "network-info",
    name: locale === "zh-CN" ? "\u7F51\u7EDC\u4FE1\u606F" : "Network Info",
    icon: "ph:wifi-high",
    placeholder: t("placeholder"),
    debounceMs: 300,

    // Global search: match IPv4 and "ping " prefix
    match: function (query) {
      var q = (query || "").trim();
      return isIpv4(q) || q.toLowerCase().startsWith("ping ");
    },

    onQuery: onQuery,

    onSelect: function (result, modifiers) {
      if (!result || result.id.startsWith("__error__")) return Promise.resolve();
      if (result.id === "public:loading") return Promise.resolve();

      // Copy the title (IP / address / location) to clipboard
      var textToCopy = result.title;

      // For ping results use full subtitle for context
      if (result.id.startsWith("ping:")) {
        textToCopy = result.title + "\n" + result.subtitle;
      }

      return api.emit("write_clipboard", { text: textToCopy })
        .catch(function () {
          // Fallback: try navigator clipboard
          if (navigator && navigator.clipboard) {
            navigator.clipboard.writeText(textToCopy).catch(function () {});
          }
        });
    },
  });
})();
