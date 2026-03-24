// GitHub Search Plugin - Search GitHub repositories, users, and issues
(function () {
  var api = window.AlgerPlugin.create("github-search");
  var locale = api.getEnv().locale || "en";
  var defaultAction = "open";
  var maxResults = 10;

  var i18n = {
    "en": {
      placeholder: "Search repos, @user, my, owner/repo#...",
      openBrowser: "Open in browser",
      copyUrl: "Copy URL",
      cloneCmd: "Copy clone command",
      stars: "stars",
      badgeUser: "User",
      badgeRepo: "Repo",
      badgeIssue: "Issue",
      badgeTrending: "Trending",
      errNoToken: "GitHub token required. Set it in plugin settings.",
      errRequest: "Request failed",
      hintUser: "Tip: prefix @username to search users",
      hintMy: "Tip: type 'my' to list your repos (token required)",
      hintIssues: "Tip: type owner/repo# to list issues",
    },
    "zh-CN": {
      placeholder: "搜索仓库、@用户、my、owner/repo#...",
      openBrowser: "在浏览器中打开",
      copyUrl: "复制链接",
      cloneCmd: "复制 clone 命令",
      stars: "星",
      badgeUser: "用户",
      badgeRepo: "仓库",
      badgeIssue: "Issue",
      badgeTrending: "热门",
      errNoToken: "需要 GitHub Token，请在插件设置中填写。",
      errRequest: "请求失败",
      hintUser: "提示：输入 @用户名 可搜索用户",
      hintMy: "提示：输入 my 可列出你的仓库（需要 token）",
      hintIssues: "提示：输入 owner/repo# 可列出 Issues",
    },
  };

  function t(key) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    return (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
  }

  // ---- Load settings ----

  api.getSetting("default_action").then(function (val) {
    if (val === "open" || val === "copy") defaultAction = val;
  });
  api.getSetting("max_results").then(function (val) {
    if (val !== null && val !== "") {
      var n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) maxResults = n;
    }
  });

  api.onSettingChanged("default_action", function (val) {
    if (val === "open" || val === "copy") defaultAction = val;
  });
  api.onSettingChanged("max_results", function (val) {
    var n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) maxResults = n;
  });

  // ---- Input routing ----

  // Returns one of: "users", "my_repos", "issues", "trending", "repos"
  // and parsed params
  function parseQuery(raw) {
    var q = raw ? raw.trim() : "";

    // @username  — search users
    if (q.charAt(0) === "@") {
      return { type: "users", query: q.slice(1).trim() };
    }

    // my  — authenticated user repos
    if (q.toLowerCase() === "my") {
      return { type: "my_repos" };
    }

    // owner/repo#  — issues for that repo
    var issueMatch = q.match(/^([^/\s]+)\/([^#\s]+)#\s*$/);
    if (issueMatch) {
      return { type: "issues", owner: issueMatch[1], repo: issueMatch[2] };
    }

    // trending  — repos with stars:>1000
    if (q.toLowerCase() === "trending") {
      return { type: "trending" };
    }

    // default: repo search
    return { type: "repos", query: q };
  }

  // ---- Result builders ----

  function formatStars(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k " + t("stars");
    return n + " " + t("stars");
  }

  function reposToResults(repos, badge) {
    return repos.map(function (r, idx) {
      var subtitle = r.description || r.html_url;
      if (r.language) subtitle = r.language + "  \u00B7  " + subtitle;
      return {
        id: JSON.stringify({ type: "repo", url: r.html_url, full_name: r.full_name }),
        title: r.full_name,
        subtitle: subtitle,
        badge: badge || (formatStars(r.stars)),
        score: 1 - idx * 0.01,
      };
    });
  }

  function usersToResults(users) {
    return users.map(function (u, idx) {
      return {
        id: JSON.stringify({ type: "user", url: u.html_url }),
        title: u.login,
        subtitle: u.html_url,
        badge: t("badgeUser"),
        score: 1 - idx * 0.01,
      };
    });
  }

  function issuesToResults(issues) {
    return issues.map(function (issue, idx) {
      var subtitle = issue.state + "  \u00B7  " + issue.user_login;
      return {
        id: JSON.stringify({ type: "issue", url: issue.html_url }),
        title: "#" + issue.number + "  " + issue.title,
        subtitle: subtitle,
        badge: issue.state,
        score: 1 - idx * 0.01,
      };
    });
  }

  function errorResult(msg) {
    return [{
      id: "__error__",
      title: t("errRequest"),
      subtitle: msg,
      icon: "lucide:alert-circle",
      score: 0,
    }];
  }

  // ---- onQuery ----

  function handleQuery(query) {
    var parsed = parseQuery(query);

    if (parsed.type === "users") {
      if (!parsed.query) return Promise.resolve([]);
      return api.invokeBackend("search_users", { query: parsed.query })
        .then(function (res) {
          if (res && res.error) return errorResult(res.error);
          if (!Array.isArray(res)) return [];
          return usersToResults(res);
        });
    }

    if (parsed.type === "my_repos") {
      return api.invokeBackend("get_user_repos", {})
        .then(function (res) {
          if (res && res.error) return errorResult(res.error);
          if (!Array.isArray(res)) return [];
          return reposToResults(res, t("badgeRepo"));
        });
    }

    if (parsed.type === "issues") {
      return api.invokeBackend("get_repo_issues", { owner: parsed.owner, repo: parsed.repo })
        .then(function (res) {
          if (res && res.error) return errorResult(res.error);
          if (!Array.isArray(res)) return [];
          return issuesToResults(res);
        });
    }

    if (parsed.type === "trending") {
      return api.invokeBackend("search_repos", { query: "stars:>1000" })
        .then(function (res) {
          if (res && res.error) return errorResult(res.error);
          if (!Array.isArray(res)) return [];
          return reposToResults(res, t("badgeTrending"));
        });
    }

    // repos (default)
    if (!parsed.query) return Promise.resolve([]);
    return api.invokeBackend("search_repos", { query: parsed.query })
      .then(function (res) {
        if (res && res.error) return errorResult(res.error);
        if (!Array.isArray(res)) return [];
        return reposToResults(res);
      });
  }

  // ---- onSelect ----

  function getUrl(result) {
    try {
      var data = JSON.parse(result.id);
      return data.url || "";
    } catch (e) {
      return "";
    }
  }

  function getFullName(result) {
    try {
      var data = JSON.parse(result.id);
      return data.full_name || "";
    } catch (e) {
      return "";
    }
  }

  function openUrl(url) {
    return api.invokeHost("open_url", { url: url }).catch(function () {});
  }

  function copyText(text) {
    return api.emit("write-clipboard", { text: text }).catch(function () {});
  }

  // ---- Register mode ----

  api.registerMode({
    id: "github-search",
    name: locale === "zh-CN" ? "GitHub \u641C\u7D22" : "GitHub Search",
    icon: "ph:github-logo",
    placeholder: t("placeholder"),
    debounceMs: 300,
    footerHints: [
      { kbd: "\u21B5", label: t("openBrowser") },
      { kbd: "Ctrl+\u21B5", label: t("copyUrl") },
      { kbd: "Shift+\u21B5", label: t("cloneCmd") },
    ],

    onQuery: function (query) {
      return handleQuery(query).catch(function (err) {
        console.error("GitHub Search error:", err);
        return errorResult(String(err));
      });
    },

    onSelect: function (result, modifiers) {
      if (result.id === "__error__") return Promise.resolve();

      var url = getUrl(result);
      if (!url) return Promise.resolve();

      // Shift+Enter: copy git clone command (repos only)
      if (modifiers && modifiers.shiftKey) {
        var fullName = getFullName(result);
        if (fullName) {
          return copyText("git clone https://github.com/" + fullName + ".git");
        }
        return copyText(url);
      }

      // Ctrl+Enter: copy URL
      if (modifiers && modifiers.ctrlKey) {
        return copyText(url);
      }

      // Enter: respect default_action setting
      if (defaultAction === "copy") {
        return copyText(url);
      }
      return openUrl(url);
    },
  });


})();
