// Web Search Plugin - Search the web with multiple search engines
(function () {
  var api = window.AlgerPlugin.create("web-search");
  var locale = api.getEnv().locale || "en";
  var defaultEngine = "google";

  var i18n = {
    "en": {
      placeholder: "Search the web...",
      badge: "Web Search",
      openBrowser: "Open in browser",
      copyUrl: "Copy URL",
      searchWith: "Search with",
      homepage: "Open homepage",
    },
    "zh-CN": {
      placeholder: "搜索网页...",
      badge: "网页搜索",
      openBrowser: "在浏览器中打开",
      copyUrl: "复制链接",
      searchWith: "使用 {engine} 搜索",
      homepage: "打开主页",
    },
  };

  function t(key, vars) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    var text = (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
    if (vars) {
      for (var k in vars) {
        text = text.replace("{" + k + "}", vars[k]);
      }
    }
    return text;
  }

  // ─── Engine Definitions ───────────────────────────────────────────────────────

  var ENGINE_ORDER = ["google", "bing", "baidu", "duckduckgo", "github", "stackoverflow"];

  var ENGINES = {
    google: {
      name: "Google",
      searchUrl: "https://www.google.com/search?q={query}",
      homeUrl: "https://www.google.com",
    },
    bing: {
      name: "Bing",
      searchUrl: "https://www.bing.com/search?q={query}",
      homeUrl: "https://www.bing.com",
    },
    baidu: {
      name: "Baidu",
      searchUrl: "https://www.baidu.com/s?wd={query}",
      homeUrl: "https://www.baidu.com",
    },
    duckduckgo: {
      name: "DuckDuckGo",
      searchUrl: "https://duckduckgo.com/?q={query}",
      homeUrl: "https://duckduckgo.com",
    },
    github: {
      name: "GitHub",
      searchUrl: "https://github.com/search?q={query}&type=repositories",
      homeUrl: "https://github.com",
    },
    stackoverflow: {
      name: "Stack Overflow",
      searchUrl: "https://stackoverflow.com/search?q={query}",
      homeUrl: "https://stackoverflow.com",
    },
  };

  // ─── URL Builder ──────────────────────────────────────────────────────────────

  function buildUrl(engineId, query) {
    var engine = ENGINES[engineId];
    if (!engine) return null;
    if (!query || !query.trim()) return engine.homeUrl;
    return engine.searchUrl.replace("{query}", encodeURIComponent(query.trim()));
  }

  // ─── Load Settings ────────────────────────────────────────────────────────────

  api.getSetting("default_engine").then(function (val) {
    if (val && ENGINES[val]) {
      defaultEngine = val;
    }
  });

  api.onSettingChanged("default_engine", function (newVal) {
    if (newVal && ENGINES[newVal]) {
      defaultEngine = newVal;
    }
  });

  // ─── Build Results ────────────────────────────────────────────────────────────

  function buildResults(query) {
    var results = [];
    var query_trimmed = query ? query.trim() : "";

    // Determine engine order: default engine first, then the rest
    var ordered = [defaultEngine];
    for (var i = 0; i < ENGINE_ORDER.length; i++) {
      if (ENGINE_ORDER[i] !== defaultEngine) {
        ordered.push(ENGINE_ORDER[i]);
      }
    }

    for (var j = 0; j < ordered.length; j++) {
      var engineId = ordered[j];
      var engine = ENGINES[engineId];
      if (!engine) continue;

      var url = buildUrl(engineId, query_trimmed);
      var isDefault = (engineId === defaultEngine);
      var score = isDefault ? 0.8 : 0.6;

      var title, subtitle;
      if (!query_trimmed) {
        title = engine.name;
        subtitle = engine.homeUrl;
      } else {
        title = engine.name + ": " + query_trimmed;
        subtitle = url;
      }

      results.push({
        id: "web-search:" + engineId + ":" + query_trimmed,
        title: title,
        subtitle: subtitle,
        badge: engine.name,
        score: score,
        // carry url as extra data via id prefix for onSelect to decode
        _url: url,
        _engineId: engineId,
      });
    }

    return results;
  }

  // ─── Register Mode ────────────────────────────────────────────────────────────

  api.registerMode({
    id: "web-search",
    name: locale === "zh-CN" ? "\u7F51\u9875\u641C\u7D22" : "Web Search",
    icon: "ph:magnifying-glass",
    placeholder: t("placeholder"),
    debounceMs: 150,
    footerHints: [
      { kbd: "\u21B5", label: t("openBrowser") },
      { kbd: "Ctrl+\u21B5", label: t("copyUrl") },
    ],

    onQuery: function (query) {
      return Promise.resolve(buildResults(query));
    },

    onSelect: function (result, modifiers) {
      var url = result._url || result.subtitle;

      if (modifiers && modifiers.ctrlKey) {
        // Ctrl+Enter: copy URL to clipboard
        return api.emit("write-clipboard", { text: url }).catch(function () {});
      }

      // Enter: open in browser
      return api.invokeHost("open_url", { url: url }).catch(function () {});
    },
  });
})();
