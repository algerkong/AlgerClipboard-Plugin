// Timestamp Plugin - Convert timestamps, dates, and time zones
(function () {
  var api = window.AlgerPlugin.create("timestamp");
  var locale = api.getEnv().locale || "en";
  var extraTimezone = "";

  var i18n = {
    "en": {
      badge: "Timestamp",
      unixSec: "Unix (seconds)",
      unixMs: "Unix (milliseconds)",
      iso8601: "ISO 8601",
      localTime: "Local time",
      utcTime: "UTC time",
      daysApart: "days apart",
      weeks: "weeks",
      workdays: "workdays",
      dateDiff: "Date difference",
      fromTs: "From timestamp",
      toTimestamp: "To timestamp",
      invalidDate: "Invalid date",
      invalidTs: "Invalid timestamp",
      now: "Current time",
      extraTz: "Extra timezone",
      tzConvert: "Timezone conversion",
    },
    "zh-CN": {
      badge: "时间戳",
      unixSec: "Unix（秒）",
      unixMs: "Unix（毫秒）",
      iso8601: "ISO 8601",
      localTime: "本地时间",
      utcTime: "UTC 时间",
      daysApart: "天相差",
      weeks: "周",
      workdays: "个工作日",
      dateDiff: "日期差",
      fromTs: "时间戳转换",
      toTimestamp: "转为时间戳",
      invalidDate: "无效日期",
      invalidTs: "无效时间戳",
      now: "当前时间",
      extraTz: "额外时区",
      tzConvert: "时区转换",
    },
  };

  function t(key) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    return (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
  }

  // Load initial settings
  api.getSetting("default_timezone").then(function (val) {
    if (val !== null && val !== "") extraTimezone = val;
  });

  api.onSettingChanged("default_timezone", function (newVal) {
    extraTimezone = newVal || "";
  });

  // Timezone alias map
  var TZ_ALIASES = {
    "PST": "America/Los_Angeles",
    "PDT": "America/Los_Angeles",
    "MST": "America/Denver",
    "MDT": "America/Denver",
    "CST": "America/Chicago",
    "CDT": "America/Chicago",
    "EST": "America/New_York",
    "EDT": "America/New_York",
    "GMT": "UTC",
    "UTC": "UTC",
    "BST": "Europe/London",
    "CET": "Europe/Paris",
    "CEST": "Europe/Paris",
    "EET": "Europe/Helsinki",
    "EEST": "Europe/Helsinki",
    "IST": "Asia/Kolkata",
    "CST-CN": "Asia/Shanghai",
    "HKT": "Asia/Hong_Kong",
    "JST": "Asia/Tokyo",
    "KST": "Asia/Seoul",
    "AEST": "Australia/Sydney",
    "AEDT": "Australia/Sydney",
    "NZST": "Pacific/Auckland",
    "NZDT": "Pacific/Auckland",
  };

  // Resolve timezone string: alias, IANA, or UTC+N offset
  function resolveTimezone(tzStr) {
    if (!tzStr) return null;
    var upper = tzStr.trim().toUpperCase();

    // UTC+N / UTC-N
    var offsetMatch = upper.match(/^UTC([+-]\d{1,2})(?::(\d{2}))?$/);
    if (offsetMatch) {
      var hours = parseInt(offsetMatch[1], 10);
      var mins = parseInt(offsetMatch[2] || "0", 10);
      // Build a fixed-offset timezone via Etc/GMT (note: Etc/GMT sign is inverted)
      // Fallback: return as-is and let Intl handle it, or build manually
      var totalMinutes = hours * 60 + (hours < 0 ? -mins : mins);
      // Use Etc/GMT only for whole-hour offsets; otherwise use custom formatting
      if (mins === 0 && hours >= -12 && hours <= 14) {
        // Etc/GMT sign convention is opposite
        return "Etc/GMT" + (-hours >= 0 ? "+" : "") + (-hours);
      }
      // Return a synthetic object for sub-hour offsets
      return { offsetMinutes: totalMinutes };
    }

    if (TZ_ALIASES[upper]) return TZ_ALIASES[upper];

    // Try as-is (IANA name)
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tzStr });
      return tzStr;
    } catch (e) {
      return null;
    }
  }

  // Format a Date in a given timezone
  function formatInTimezone(date, tzStr, resolved) {
    var tz = resolved !== undefined ? resolved : resolveTimezone(tzStr);
    if (!tz) return null;

    if (typeof tz === "object" && tz.offsetMinutes !== undefined) {
      // Manual offset
      var utcMs = date.getTime() + tz.offsetMinutes * 60000;
      var d = new Date(utcMs);
      var sign = tz.offsetMinutes >= 0 ? "+" : "-";
      var absMin = Math.abs(tz.offsetMinutes);
      var h = Math.floor(absMin / 60);
      var m = absMin % 60;
      var offsetLabel = "UTC" + sign + pad(h) + ":" + pad(m);
      return formatDateManual(d, true) + " " + offsetLabel;
    }

    try {
      var fmt = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short",
      });
      return fmt.format(date);
    } catch (e) {
      return null;
    }
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function formatDateManual(d, utcMode) {
    var y, mo, day, h, mi, s;
    if (utcMode) {
      y = d.getUTCFullYear(); mo = d.getUTCMonth() + 1; day = d.getUTCDate();
      h = d.getUTCHours(); mi = d.getUTCMinutes(); s = d.getUTCSeconds();
    } else {
      y = d.getFullYear(); mo = d.getMonth() + 1; day = d.getDate();
      h = d.getHours(); mi = d.getMinutes(); s = d.getSeconds();
    }
    return y + "-" + pad(mo) + "-" + pad(day) + " " + pad(h) + ":" + pad(mi) + ":" + pad(s);
  }

  // Parse a date string into a Date object
  function parseDate(str) {
    str = str.trim();

    // ISO/numeric: YYYY-MM-DD or YYYY/MM/DD with optional time
    var m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      var d = new Date(
        parseInt(m[1], 10),
        parseInt(m[2], 10) - 1,
        parseInt(m[3], 10),
        m[4] ? parseInt(m[4], 10) : 0,
        m[5] ? parseInt(m[5], 10) : 0,
        m[6] ? parseInt(m[6], 10) : 0
      );
      if (!isNaN(d.getTime())) return d;
    }

    // Month name: "Mar 23 2026" or "23 Mar 2026" or "March 23, 2026"
    var d2 = new Date(str);
    if (!isNaN(d2.getTime())) return d2;

    return null;
  }

  // Count weekdays between two dates (exclusive of end)
  function countWorkdays(start, end) {
    var count = 0;
    var cur = new Date(start.getTime());
    var endMs = end.getTime();
    // Ensure we go in the right direction
    var sign = endMs >= cur.getTime() ? 1 : -1;
    while ((sign === 1 && cur.getTime() < endMs) || (sign === -1 && cur.getTime() > endMs)) {
      var dow = cur.getDay();
      if (dow !== 0 && dow !== 6) count++;
      cur.setDate(cur.getDate() + sign);
    }
    return count;
  }

  // Build results for "current time" display
  function resultsForNow(date) {
    var results = [];
    var secTs = Math.floor(date.getTime() / 1000);
    var msTs = date.getTime();
    var iso = date.toISOString();
    var localStr = formatDateManual(date, false);
    var utcStr = formatDateManual(date, true) + " UTC";

    results.push({ label: t("unixSec"), value: "" + secTs, description: t("now") });
    results.push({ label: t("unixMs"), value: "" + msTs, description: t("now") });
    results.push({ label: t("iso8601"), value: iso, description: t("now") });
    results.push({ label: t("localTime"), value: localStr, description: t("now") });
    results.push({ label: t("utcTime"), value: utcStr, description: t("now") });

    if (extraTimezone) {
      var resolved = resolveTimezone(extraTimezone);
      var tzStr = formatInTimezone(date, extraTimezone, resolved);
      if (tzStr) {
        results.push({ label: t("extraTz") + " (" + extraTimezone + ")", value: tzStr, description: t("now") });
      }
    }

    return results;
  }

  // Build results for a numeric timestamp
  function resultsForTimestamp(numStr) {
    var num = parseInt(numStr, 10);
    if (isNaN(num)) return [];

    var date;
    if (numStr.length <= 10) {
      date = new Date(num * 1000);
    } else {
      date = new Date(num);
    }

    if (isNaN(date.getTime())) return [];

    var results = [];
    var localStr = formatDateManual(date, false);
    var utcStr = formatDateManual(date, true) + " UTC";
    var iso = date.toISOString();
    var desc = t("fromTs");

    results.push({ label: t("localTime"), value: localStr, description: desc });
    results.push({ label: t("utcTime"), value: utcStr, description: desc });
    results.push({ label: t("iso8601"), value: iso, description: desc });

    if (extraTimezone) {
      var resolved = resolveTimezone(extraTimezone);
      var tzStr = formatInTimezone(date, extraTimezone, resolved);
      if (tzStr) {
        results.push({ label: t("extraTz") + " (" + extraTimezone + ")", value: tzStr, description: desc });
      }
    }

    return results;
  }

  // Build results for a date string (convert to timestamps)
  function resultsForDateStr(str) {
    var date = parseDate(str);
    if (!date) return [];

    var results = [];
    var secTs = Math.floor(date.getTime() / 1000);
    var msTs = date.getTime();
    var iso = date.toISOString();
    var desc = t("toTimestamp");

    results.push({ label: t("unixSec"), value: "" + secTs, description: desc });
    results.push({ label: t("unixMs"), value: "" + msTs, description: desc });
    results.push({ label: t("iso8601"), value: iso, description: desc });
    results.push({ label: t("localTime"), value: formatDateManual(date, false), description: desc });
    results.push({ label: t("utcTime"), value: formatDateManual(date, true) + " UTC", description: desc });

    return results;
  }

  // Build results for date diff: "2026-01-01 to 2026-03-23"
  function resultsForDateDiff(str) {
    var parts = str.match(/^(.+?)\s+to\s+(.+)$/i);
    if (!parts) return [];

    var d1 = parseDate(parts[1].trim());
    var d2 = parseDate(parts[2].trim());
    if (!d1 || !d2) return [];

    var msPerDay = 24 * 3600 * 1000;
    // Normalize to midnight
    var start = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
    var end = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
    var diffMs = end.getTime() - start.getTime();
    var diffDays = Math.round(diffMs / msPerDay);
    var absDays = Math.abs(diffDays);
    var weeks = (absDays / 7).toFixed(1);
    var workdays = countWorkdays(start, end);
    var desc = t("dateDiff");

    return [
      { label: t("daysApart"), value: diffDays + " days", description: desc },
      { label: t("weeks"), value: weeks + " weeks", description: desc },
      { label: t("workdays"), value: workdays + " workdays", description: desc },
    ];
  }

  // Build results for timezone conversion: "now in PST" or "2026-03-23 in UTC+9"
  function resultsForTzConvert(str) {
    var m = str.match(/^(.+?)\s+in\s+(\S+)$/i);
    if (!m) return [];

    var datePart = m[1].trim();
    var tzPart = m[2].trim();

    var date;
    if (datePart.toLowerCase() === "now") {
      date = new Date();
    } else if (/^\d{10,13}$/.test(datePart)) {
      date = datePart.length <= 10 ? new Date(parseInt(datePart, 10) * 1000) : new Date(parseInt(datePart, 10));
    } else {
      date = parseDate(datePart);
    }

    if (!date || isNaN(date.getTime())) return [];

    var resolved = resolveTimezone(tzPart);
    if (!resolved) return [];

    var tzStr = formatInTimezone(date, tzPart, resolved);
    if (!tzStr) return [];

    return [
      { label: tzPart.toUpperCase(), value: tzStr, description: t("tzConvert") },
    ];
  }

  // Check if a string looks like a date for global match
  function looksLikeDate(str) {
    return /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(str.trim());
  }

  // Check if string contains " to " with date-like parts on both sides
  function looksLikeDateDiff(str) {
    var m = str.match(/^(.+?)\s+to\s+(.+)$/i);
    if (!m) return false;
    return looksLikeDate(m[1].trim()) || looksLikeDate(m[2].trim());
  }

  // Determine which handler to use and return results
  function getResults(query, prefixMode) {
    var q = query.trim();

    // Empty or "now" in prefix mode
    if (prefixMode && (q === "" || q.toLowerCase() === "now")) {
      return resultsForNow(new Date());
    }

    // Timezone conversion: "... in TZ"
    if (/\s+in\s+\S/i.test(q)) {
      var tzResults = resultsForTzConvert(q);
      if (tzResults.length > 0) return tzResults;
    }

    // Date diff: "date to date"
    if (looksLikeDateDiff(q)) {
      return resultsForDateDiff(q);
    }

    // Pure numeric timestamp (10-13 digits)
    if (/^\d{10,13}$/.test(q)) {
      return resultsForTimestamp(q);
    }

    // Date string
    if (looksLikeDate(q) || q.toLowerCase() === "now") {
      if (q.toLowerCase() === "now") return resultsForNow(new Date());
      return resultsForDateStr(q);
    }

    // Try parsing any freeform date string in prefix mode
    if (prefixMode) {
      var parsed = parseDate(q);
      if (parsed) return resultsForDateStr(q);
    }

    return [];
  }

  // Convert raw results array to SpotlightResult format
  function toSpotlightResults(items) {
    return items.map(function (item) {
      return {
        id: item.label,
        title: item.value,
        subtitle: item.label,
        badge: t("badge"),
        score: 1.0,
        data: { value: item.value, description: item.description },
        icon: "ph:clock",
      };
    });
  }

  api.registerMode({
    id: "timestamp",
    name: locale === "zh-CN" ? "时间工具" : "Timestamp",
    icon: "ph:clock",
    prefix: "ts",
    placeholder: { en: "Enter timestamp, date, or 'now'...", "zh-CN": "输入时间戳、日期或 'now'..." },
    footerHints: [
      { key: "Enter", label: { en: "Copy value", "zh-CN": "复制值" } },
    ],

    onQuery: function (query) {
      var results = getResults(query, true);
      return Promise.resolve(toSpotlightResults(results));
    },

    onSelect: function (result) {
      if (result && result.data && result.data.value) {
        api.emit("copy-to-clipboard", { text: result.data.value });
      }
    },

    match: function (query) {
      var q = query.trim();
      if (!q) return false;
      // 10-13 digit pure number (timestamp)
      if (/^\d{10,13}$/.test(q)) return true;
      // YYYY-MM-DD or YYYY/MM/DD
      if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(q)) return true;
      // "now"
      if (q.toLowerCase() === "now") return true;
      // "date to date" diff
      if (looksLikeDateDiff(q)) return true;
      return false;
    },

    onGlobalSearch: function (query) {
      var results = getResults(query, false);
      return Promise.resolve(toSpotlightResults(results));
    },
  });
})();
