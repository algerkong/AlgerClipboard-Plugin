// Browser Bookmarks Plugin - Search bookmarks from Chrome, Edge, Brave
(function () {
  var api = window.AlgerPlugin.create("browser-bookmarks");
  var maxResults = 20;
  var locale = api.getEnv().locale || "en";

  var i18n = {
    "en": {
      placeholder: "Search browser bookmarks...",
      copyUrl: "Copy URL",
      copyMarkdown: "Copy as Markdown",
      openUrl: "Open in browser",
      errorTitle: "Bookmark Search Error",
      noResults: "No bookmarks found",
    },
    "zh-CN": {
      placeholder: "搜索浏览器书签...",
      copyUrl: "复制链接",
      copyMarkdown: "复制为 Markdown",
      openUrl: "在浏览器中打开",
      errorTitle: "书签搜索出错",
      noResults: "未找到书签",
    },
  };

  function t(key) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    return (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
  }

  // Load initial settings
  api.getSetting("max_results").then(function (val) {
    if (val !== null && val !== "") {
      var n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) maxResults = n;
    }
  });

  api.onSettingChanged("max_results", function (newVal) {
    var n = parseInt(newVal, 10);
    if (!isNaN(n) && n > 0) maxResults = n;
  });

  function getBrowserIcon(browser) {
    switch (browser) {
      case "Chrome": return "lucide:chrome";
      case "Edge":   return "lucide:globe";
      case "Brave":  return "lucide:shield";
      default:       return "ph:bookmark";
    }
  }

  function copyToClipboard(text) {
    // Use the host write_clipboard API via invokeBackend is not available for clipboard;
    // fall back to document.execCommand / navigator.clipboard
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  api.registerMode({
    id: "browser-bookmarks",
    name: locale === "zh-CN" ? "\u6D4F\u89C8\u5668\u4E66\u7B7E" : "Browser Bookmarks",
    icon: "ph:bookmark",
    placeholder: t("placeholder"),
    debounceMs: 150,
    footerHints: [
      { kbd: "Ctrl+\u21B5", label: t("copyUrl") },
      { kbd: "Shift+\u21B5", label: t("copyMarkdown") },
    ],

    onQuery: function (query) {
      if (!query || !query.trim()) return Promise.resolve([]);

      return api.invokeBackend("search_bookmarks", {
        query: query.trim(),
        max_results: maxResults,
      }).then(function (results) {
        if (results && results.error) {
          return [{
            id: "__error__",
            title: t("errorTitle"),
            subtitle: results.error,
            icon: "lucide:alert-circle",
          }];
        }

        if (!Array.isArray(results)) return [];
        if (results.length === 0) return [];

        return results.map(function (r, idx) {
          var score = Math.max(0, 1.0 - idx * 0.05);
          var subtitle = r.url;
          if (r.folder) subtitle = r.folder + "  \u00B7  " + r.url;

          return {
            id: JSON.stringify({ url: r.url, title: r.title }),
            title: r.title || r.url,
            subtitle: subtitle,
            icon: getBrowserIcon(r.browser),
            badge: r.browser,
            score: score,
          };
        });
      }).catch(function (err) {
        console.error("[browser-bookmarks] onQuery error:", err);
        return [{
          id: "__error__",
          title: t("errorTitle"),
          subtitle: String(err),
          icon: "lucide:alert-circle",
        }];
      });
    },

    onSelect: function (result, modifiers) {
      if (result.id === "__error__") return Promise.resolve();

      var data;
      try { data = JSON.parse(result.id); } catch (e) { return Promise.resolve(); }

      // Ctrl+Enter: copy URL
      if (modifiers && modifiers.ctrlKey) {
        return copyToClipboard(data.url);
      }

      // Shift+Enter: copy as Markdown [title](url)
      if (modifiers && modifiers.shiftKey) {
        var md = "[" + (data.title || data.url) + "](" + data.url + ")";
        return copyToClipboard(md);
      }

      // Enter: open URL via host
      return api.invokeHost("open_url", { url: data.url }).catch(function (err) {
        // Fallback: try window.open if invokeHost is unavailable
        console.warn("[browser-bookmarks] invokeHost open_url failed, trying window.open:", err);
        try { window.open(data.url, "_blank"); } catch (e2) { /* ignore */ }
      });
    },
  });
})();
