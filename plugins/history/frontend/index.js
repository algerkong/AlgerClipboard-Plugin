// History Plugin - Search previously selected Spotlight results
(function () {
  var api = window.AlgerPlugin.create("history");
  var locale = api.getEnv().locale || "en";
  var maxHistory = 200;

  var i18n = {
    "en": {
      placeholder: "Search history...",
      noHistory: "No history yet",
      noResults: "No matching history",
      copyTitle: "Copy",
      deleteTitle: "Delete from history",
      justNow: "just now",
      minutesAgo: "m ago",
      hoursAgo: "h ago",
      daysAgo: "d ago",
      badge: {
        clipboard: "Clipboard",
        app: "App",
        translate: "Translate",
      },
      footerEnter: "Copy",
      footerShiftEnter: "Delete",
    },
    "zh-CN": {
      placeholder: "搜索历史记录...",
      noHistory: "暂无历史记录",
      noResults: "未找到匹配记录",
      copyTitle: "复制",
      deleteTitle: "从历史中删除",
      justNow: "刚刚",
      minutesAgo: "分钟前",
      hoursAgo: "小时前",
      daysAgo: "天前",
      badge: {
        clipboard: "剪贴板",
        app: "应用",
        translate: "翻译",
      },
      footerEnter: "复制",
      footerShiftEnter: "删除",
    },
  };

  function t(key) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    if (key.indexOf(".") !== -1) {
      var parts = key.split(".");
      var obj = lang;
      for (var i = 0; i < parts.length; i++) {
        obj = obj && obj[parts[i]];
      }
      if (obj !== undefined) return obj;
      obj = i18n["en"];
      for (var j = 0; j < parts.length; j++) {
        obj = obj && obj[parts[j]];
      }
      return obj || key;
    }
    return (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
  }

  function formatTimeAgo(timestamp) {
    var now = Date.now();
    var diffMs = now - timestamp;
    var diffSec = Math.floor(diffMs / 1000);
    var diffMin = Math.floor(diffSec / 60);
    var diffHour = Math.floor(diffMin / 60);
    var diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return t("justNow");
    if (diffMin < 60) return diffMin + t("minutesAgo");
    if (diffHour < 24) return diffHour + t("hoursAgo");
    return diffDay + t("daysAgo");
  }

  function getModeLabel(modeId, modeName) {
    // Try to get a localized badge label for known built-in modes
    var knownKey = "badge." + modeId;
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    var badgeMap = lang && lang["badge"];
    if (badgeMap && badgeMap[modeId]) {
      return badgeMap[modeId];
    }
    // Fall back to the mode_name provided by the backend
    return modeName || modeId;
  }

  // Compute a time-decay score: newest = 1.0, decays toward 0 over 30 days
  function computeScore(timestamp) {
    var now = Date.now();
    var ageMs = now - timestamp;
    var thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    var ratio = ageMs / thirtyDaysMs;
    return Math.max(0.01, 1.0 - ratio);
  }

  // Simple fuzzy match: checks if all characters of needle appear in haystack in order
  function fuzzyMatch(haystack, needle) {
    if (!needle) return true;
    haystack = (haystack || "").toLowerCase();
    needle = needle.toLowerCase();
    var hi = 0;
    var ni = 0;
    while (hi < haystack.length && ni < needle.length) {
      if (haystack[hi] === needle[ni]) ni++;
      hi++;
    }
    return ni === needle.length;
  }

  // Load settings then register the mode
  api.getSetting("max_history").then(function (val) {
    if (val !== null && val !== undefined && !isNaN(Number(val))) {
      maxHistory = Number(val);
    }
  });

  api.onSettingChanged(function (key, value) {
    if (key === "max_history" && !isNaN(Number(value))) {
      maxHistory = Number(value);
    }
  });

  api.registerMode({
    id: "history",
    name: locale === "zh-CN" ? "历史记录" : "History",
    icon: "ph:clock-counter-clockwise",
    prefix: "!!",
    placeholder: t("placeholder"),
    priority: 50,

    footerHints: [
      { key: "Enter", label: t("footerEnter") },
      { key: "Shift+Enter", label: t("footerShiftEnter") },
    ],

    onQuery: function (query) {
      var limit = query ? maxHistory : 20;

      return api.invokeHost("get_spotlight_history", { query: query || "", limit: limit })
        .then(function (items) {
          if (!items || items.length === 0) {
            return [{
              id: "__empty__",
              title: query ? t("noResults") : t("noHistory"),
              subtitle: "",
              badge: "",
              score: 0,
              data: null,
            }];
          }

          var results = [];
          for (var i = 0; i < items.length; i++) {
            var item = items[i];

            // Client-side fuzzy filter when query is present (backend may do its own,
            // but we apply it again for consistency)
            if (query) {
              var titleMatch = fuzzyMatch(item.title, query);
              var subtitleMatch = fuzzyMatch(item.subtitle, query);
              if (!titleMatch && !subtitleMatch) continue;
            }

            var modeLabel = getModeLabel(item.mode_id, item.mode_name);
            var timeAgo = formatTimeAgo(item.timestamp);
            var score = computeScore(item.timestamp);

            results.push({
              id: "history-" + item.id,
              title: item.title,
              subtitle: modeLabel + " · " + timeAgo,
              badge: modeLabel,
              score: score,
              data: {
                historyId: item.id,
                originalTitle: item.title,
                originalResultId: item.original_result_id,
                modeId: item.mode_id,
                query: item.query,
              },
            });
          }

          if (results.length === 0) {
            return [{
              id: "__empty__",
              title: t("noResults"),
              subtitle: "",
              badge: "",
              score: 0,
              data: null,
            }];
          }

          return results;
        })
        .catch(function (err) {
          return [{
            id: "__error__",
            title: String(err),
            subtitle: "",
            badge: "",
            score: 0,
            data: null,
          }];
        });
    },

    onSelect: function (result, modifiers) {
      // Ignore placeholder results
      if (!result.data) return;

      var historyId = result.data.historyId;
      var titleText = result.data.originalTitle;

      if (modifiers && modifiers.shiftKey) {
        // Shift+Enter: delete this entry from history
        return api.invokeHost("remove_spotlight_history", { id: historyId })
          .then(function () {
            // Return a signal to refresh the results list
            return { refresh: true };
          })
          .catch(function (err) {
            console.error("[history plugin] remove_spotlight_history failed:", err);
          });
      }

      // Enter: copy the title text to clipboard
      return api.invokeHost("write_clipboard_text", { text: titleText })
        .catch(function (err) {
          console.error("[history plugin] write_clipboard_text failed:", err);
        });
    },
  });

})();
