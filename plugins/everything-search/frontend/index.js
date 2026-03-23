// Everything Search Plugin - Search files globally using Everything by voidtools
(function () {
  var api = window.AlgerPlugin.create("everything-search");
  var maxResults = 20;
  var locale = api.getEnv().locale || "en";

  var i18n = {
    "en": {
      placeholder: "Search files with Everything...",
      error: "Everything Search Error",
      folder: "Folder",
      showInExplorer: "Show in Explorer",
      copyPath: "Copy Path",
    },
    "zh-CN": {
      placeholder: "使用 Everything 搜索文件...",
      error: "Everything 搜索错误",
      folder: "文件夹",
      showInExplorer: "在资源管理器中显示",
      copyPath: "复制路径",
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

  function formatSize(bytes) {
    if (bytes === 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }

  function getFileIcon(name, isDir) {
    if (isDir) return "ph:folder";

    var ext = name.lastIndexOf(".") > 0 ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";

    // Common file type icons
    var iconMap = {
      // Images
      png: "ph:image", jpg: "ph:image", jpeg: "ph:image", gif: "ph:image",
      bmp: "ph:image", svg: "ph:image", webp: "ph:image", ico: "ph:image",
      // Videos
      mp4: "ph:film-strip", avi: "ph:film-strip", mkv: "ph:film-strip",
      mov: "ph:film-strip", wmv: "ph:film-strip", flv: "ph:film-strip",
      // Audio
      mp3: "ph:music-note", wav: "ph:music-note", flac: "ph:music-note",
      aac: "ph:music-note", ogg: "ph:music-note", wma: "ph:music-note",
      // Documents
      pdf: "ph:file-pdf", doc: "ph:file-doc", docx: "ph:file-doc",
      xls: "ph:file-xls", xlsx: "ph:file-xls",
      ppt: "ph:file-ppt", pptx: "ph:file-ppt",
      txt: "ph:file-text", md: "ph:file-text", rtf: "ph:file-text",
      // Code
      js: "ph:file-code", ts: "ph:file-code", jsx: "ph:file-code", tsx: "ph:file-code",
      py: "ph:file-code", rs: "ph:file-code", go: "ph:file-code", java: "ph:file-code",
      c: "ph:file-code", cpp: "ph:file-code", h: "ph:file-code", hpp: "ph:file-code",
      cs: "ph:file-code", rb: "ph:file-code", php: "ph:file-code", swift: "ph:file-code",
      html: "ph:file-html", css: "ph:file-css", json: "ph:file-code",
      xml: "ph:file-code", yaml: "ph:file-code", yml: "ph:file-code", toml: "ph:file-code",
      // Archives
      zip: "ph:file-zip", rar: "ph:file-zip", "7z": "ph:file-zip",
      tar: "ph:file-zip", gz: "ph:file-zip",
      // Executables
      exe: "ph:app-window", msi: "ph:app-window", bat: "ph:terminal",
      cmd: "ph:terminal", ps1: "ph:terminal", sh: "ph:terminal",
    };

    return iconMap[ext] || "ph:file";
  }

  api.registerMode({
    id: "everything-search",
    name: locale === "zh-CN" ? "Everything \u641C\u7D22" : "Everything Search",
    icon: "ph:magnifying-glass",
    placeholder: t("placeholder"),
    debounceMs: 200,
    footerHints: [
      { kbd: "Ctrl+\u21B5", label: t("showInExplorer") },
      { kbd: "Shift+\u21B5", label: t("copyPath") },
    ],

    onQuery: function (query) {
      if (!query || !query.trim()) return Promise.resolve([]);

      return api.invokeBackend("search", {
        query: query.trim(),
        max_results: maxResults,
      }).then(function (results) {
        // Check if it's an error response
        if (results && results.error) {
          return [{
            id: "__error__",
            title: t("error"),
            subtitle: results.error,
            icon: "ph:warning-circle",
          }];
        }

        if (!Array.isArray(results)) return [];

        return results.map(function (r) {
          var sizeStr = r.is_dir ? t("folder") : formatSize(r.size);
          var subtitle = r.path;
          if (sizeStr) subtitle = sizeStr + "  \u00B7  " + r.path;
          var filePath = r.path;

          return {
            id: JSON.stringify({ path: r.path, is_dir: r.is_dir }),
            title: r.name,
            subtitle: subtitle,
            icon: getFileIcon(r.name, r.is_dir),
            actions: [
              {
                id: "locate",
                label: "ph:folder-open",
                shortcut: t("showInExplorer"),
                handler: function () {
                  return api.invokeBackend("open", { path: filePath, action: "locate" });
                },
              },
              {
                id: "copy_path",
                label: "ph:copy",
                shortcut: t("copyPath"),
                handler: function () {
                  return api.invokeBackend("open", { path: filePath, action: "copy_path" });
                },
              },
            ],
          };
        });
      }).catch(function (err) {
        console.error("Everything Search error:", err);
        return [{
          id: "__error__",
          title: "Everything Search Error",
          subtitle: String(err),
          icon: "ph:warning-circle",
        }];
      });
    },

    onSelect: function (result, modifiers) {
      if (result.id === "__error__") return Promise.resolve();

      var data;
      try { data = JSON.parse(result.id); } catch (e) { return Promise.resolve(); }

      var action = "open";
      if (modifiers && modifiers.ctrlKey) {
        action = "locate";
      } else if (modifiers && modifiers.shiftKey) {
        action = "copy_path";
      }

      return api.invokeBackend("open", {
        path: data.path,
        action: action,
      }).catch(function (err) {
        console.error("Failed to execute action:", err);
      });
    },
  });
})();
