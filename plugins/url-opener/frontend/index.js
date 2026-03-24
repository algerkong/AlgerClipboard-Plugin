// URL Opener Plugin - Detect URLs and open them in browser
(function () {
  var api = window.AlgerPlugin.create("url-opener");

  // i18n
  var i18n = {
    en: {
      openInBrowser: "Open in Browser",
      copyUrl: "Copy URL",
      placeholder: "Enter a URL to open...",
      modeName: "URL Opener",
      badgeOpen: "Open",
      badgeCopy: "Copy",
    },
    "zh-CN": {
      openInBrowser: "在浏览器中打开",
      copyUrl: "复制链接",
      placeholder: "输入网址以打开...",
      modeName: "URL 快开",
      badgeOpen: "打开",
      badgeCopy: "复制",
    },
  };

  function t(key) {
    var locale = (api.getEnv && api.getEnv().locale) || "en";
    var msgs = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    return (msgs && msgs[key]) || i18n["en"][key] || key;
  }

  // Known TLD list (~60 common TLDs)
  var KNOWN_TLDS = [
    "com", "net", "org", "io", "dev", "app",
    "cn", "jp", "uk", "de", "fr", "ru", "br", "in", "au", "ca",
    "kr", "nl", "se", "no", "fi", "dk", "ch", "at", "be",
    "pl", "pt", "es", "it", "co", "me", "tv", "cc",
    "info", "biz", "xyz", "site", "online", "tech", "ai",
    "gg", "sh", "ly", "to", "im", "is", "ws", "us", "eu",
    "asia", "edu", "gov", "mil", "int",
    "club", "store", "blog", "news", "link", "live", "pro",
  ];

  var TLD_SET = {};
  for (var i = 0; i < KNOWN_TLDS.length; i++) {
    TLD_SET[KNOWN_TLDS[i]] = true;
  }

  // Settings
  var defaultAction = "open";

  api.getSetting("default_action").then(function (val) {
    if (val !== null && val !== undefined) defaultAction = val;
  });

  api.onSettingChanged("default_action", function (newVal) {
    defaultAction = newVal;
  });

  /**
   * Detect whether the input string looks like a URL.
   * Returns the normalized URL (with scheme) or null.
   */
  function detectUrl(input) {
    if (!input || !input.trim()) return null;
    var s = input.trim();

    // mailto:
    if (/^mailto:/i.test(s)) return s;

    // Full URL with http/https
    if (/^https?:\/\//i.test(s)) {
      // basic sanity: must have something after ://
      if (s.length > 8) return s;
      return null;
    }

    // www. prefix
    if (/^www\./i.test(s)) return "https://" + s;

    // localhost with optional port, optional path
    if (/^localhost(:\d+)?(\/.*)?$/i.test(s)) return "http://" + s;

    // 127.0.0.1 with optional port, optional path
    if (/^127\.0\.0\.1(:\d+)?(\/.*)?$/.test(s)) return "http://" + s;

    // domain.tld format: e.g. "example.com", "foo.io/bar"
    // Extract hostname part (before first slash or query)
    var hostPart = s.split("/")[0].split("?")[0].split("#")[0];
    var dotIdx = hostPart.lastIndexOf(".");
    if (dotIdx !== -1) {
      var tld = hostPart.slice(dotIdx + 1).toLowerCase();
      // Strip port from tld if present (e.g. "com:8080" -> "com")
      tld = tld.split(":")[0];
      if (TLD_SET[tld]) return "https://" + s;
    }

    return null;
  }

  api.registerMode({
    id: "url-opener",
    name: t("modeName"),
    icon: "ph:globe",
    placeholder: t("placeholder"),
    debounceMs: 80,

    onQuery: function (query) {
      var normalizedUrl = detectUrl(query);
      if (!normalizedUrl) return Promise.resolve([]);

      var results = [];

      // Result 1: Open in browser
      results.push({
        id: "open:" + normalizedUrl,
        title: normalizedUrl,
        subtitle: t("openInBrowser"),
        icon: "ph:globe",
        badge: t("badgeOpen"),
        score: 1.0,
      });

      // Result 2: Copy URL
      results.push({
        id: "copy:" + normalizedUrl,
        title: normalizedUrl,
        subtitle: t("copyUrl"),
        icon: "ph:copy",
        badge: t("badgeCopy"),
        score: 1.0,
      });

      // Reorder based on default_action setting
      if (defaultAction === "copy") {
        results.reverse();
      }

      return Promise.resolve(results);
    },

    onSelect: function (result, modifiers) {
      var parts = result.id.split(":");
      // id format: "open:https://..." or "copy:https://..."
      // The URL itself may contain ":", so rejoin from index 1
      var action = parts[0];
      var url = parts.slice(1).join(":");

      // Ctrl+Enter flips the action
      if (modifiers && modifiers.ctrlKey) {
        action = action === "open" ? "copy" : "open";
      }

      if (action === "open") {
        return api.invokeHost("open_url", { url: url }).catch(function (err) {
          console.error("[url-opener] open_url failed:", err);
        });
      } else {
        return navigator.clipboard.writeText(url).catch(function (err) {
          console.error("[url-opener] clipboard write failed:", err);
        });
      }
    },

    footerHints: [
      { key: "Enter", label: { en: "Default action", "zh-CN": "默认操作" } },
      { key: "Ctrl+Enter", label: { en: "Alternate action", "zh-CN": "备选操作" } },
    ],
  });
})();
