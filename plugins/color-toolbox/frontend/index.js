// Color Toolbox Plugin - Parse and convert colors between HEX, RGB, HSL formats
(function () {
  var api = window.AlgerPlugin.create("color-toolbox");
  var locale = api.getEnv().locale || "en";
  var defaultFormat = "hex";

  api.getSetting("default_format").then(function (val) {
    if (val) defaultFormat = val;
  });
  api.onSettingChanged("default_format", function (newVal) {
    if (newVal) defaultFormat = newVal;
  });

  // ---------------------------------------------------------------------------
  // i18n
  // ---------------------------------------------------------------------------
  var i18n = {
    "en": {
      placeholder: "Enter a color (HEX, RGB, HSL, CSS name, Tailwind)...",
      hex: "HEX",
      rgb: "RGB",
      hsl: "HSL",
      tailwind: "Tailwind",
      copyAll: "Ctrl+Enter to copy all formats",
      complement: "Complement",
      subtitle_complement: "Complement: ",
      tailwind_nearest: "Nearest Tailwind color",
    },
    "zh-CN": {
      placeholder: "输入颜色（HEX、RGB、HSL、CSS 颜色名、Tailwind）...",
      hex: "HEX",
      rgb: "RGB",
      hsl: "HSL",
      tailwind: "Tailwind",
      copyAll: "Ctrl+Enter 复制所有格式",
      complement: "互补色",
      subtitle_complement: "互补色：",
      tailwind_nearest: "最近 Tailwind 颜色",
    },
  };

  function t(key) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    return (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
  }

  // ---------------------------------------------------------------------------
  // CSS named colors (148 entries)
  // ---------------------------------------------------------------------------
  var CSS_COLORS = {
    aliceblue: "F0F8FF", antiquewhite: "FAEBD7", aqua: "00FFFF",
    aquamarine: "7FFFD4", azure: "F0FFFF", beige: "F5F5DC",
    bisque: "FFE4C4", black: "000000", blanchedalmond: "FFEBCD",
    blue: "0000FF", blueviolet: "8A2BE2", brown: "A52A2A",
    burlywood: "DEB887", cadetblue: "5F9EA0", chartreuse: "7FFF00",
    chocolate: "D2691E", coral: "FF7F50", cornflowerblue: "6495ED",
    cornsilk: "FFF8DC", crimson: "DC143C", cyan: "00FFFF",
    darkblue: "00008B", darkcyan: "008B8B", darkgoldenrod: "B8860B",
    darkgray: "A9A9A9", darkgreen: "006400", darkgrey: "A9A9A9",
    darkkhaki: "BDB76B", darkmagenta: "8B008B", darkolivegreen: "556B2F",
    darkorange: "FF8C00", darkorchid: "9932CC", darkred: "8B0000",
    darksalmon: "E9967A", darkseagreen: "8FBC8F", darkslateblue: "483D8B",
    darkslategray: "2F4F4F", darkslategrey: "2F4F4F", darkturquoise: "00CED1",
    darkviolet: "9400D3", deeppink: "FF1493", deepskyblue: "00BFFF",
    dimgray: "696969", dimgrey: "696969", dodgerblue: "1E90FF",
    firebrick: "B22222", floralwhite: "FFFAF0", forestgreen: "228B22",
    fuchsia: "FF00FF", gainsboro: "DCDCDC", ghostwhite: "F8F8FF",
    gold: "FFD700", goldenrod: "DAA520", gray: "808080",
    green: "008000", greenyellow: "ADFF2F", grey: "808080",
    honeydew: "F0FFF0", hotpink: "FF69B4", indianred: "CD5C5C",
    indigo: "4B0082", ivory: "FFFFF0", khaki: "F0E68C",
    lavender: "E6E6FA", lavenderblush: "FFF0F5", lawngreen: "7CFC00",
    lemonchiffon: "FFFACD", lightblue: "ADD8E6", lightcoral: "F08080",
    lightcyan: "E0FFFF", lightgoldenrodyellow: "FAFAD2", lightgray: "D3D3D3",
    lightgreen: "90EE90", lightgrey: "D3D3D3", lightpink: "FFB6C1",
    lightsalmon: "FFA07A", lightseagreen: "20B2AA", lightskyblue: "87CEFA",
    lightslategray: "778899", lightslategrey: "778899", lightsteelblue: "B0C4DE",
    lightyellow: "FFFFE0", lime: "00FF00", limegreen: "32CD32",
    linen: "FAF0E6", magenta: "FF00FF", maroon: "800000",
    mediumaquamarine: "66CDAA", mediumblue: "0000CD", mediumorchid: "BA55D3",
    mediumpurple: "9370DB", mediumseagreen: "3CB371", mediumslateblue: "7B68EE",
    mediumspringgreen: "00FA9A", mediumturquoise: "48D1CC", mediumvioletred: "C71585",
    midnightblue: "191970", mintcream: "F5FFFA", mistyrose: "FFE4E1",
    moccasin: "FFE4B5", navajowhite: "FFDEAD", navy: "000080",
    oldlace: "FDF5E6", olive: "808000", olivedrab: "6B8E23",
    orange: "FFA500", orangered: "FF4500", orchid: "DA70D6",
    palegoldenrod: "EEE8AA", palegreen: "98FB98", paleturquoise: "AFEEEE",
    palevioletred: "DB7093", papayawhip: "FFEFD5", peachpuff: "FFDAB9",
    peru: "CD853F", pink: "FFC0CB", plum: "DDA0DD",
    powderblue: "B0E0E6", purple: "800080", rebeccapurple: "663399",
    red: "FF0000", rosybrown: "BC8F8F", royalblue: "4169E1",
    saddlebrown: "8B4513", salmon: "FA8072", sandybrown: "F4A460",
    seagreen: "2E8B57", seashell: "FFF5EE", sienna: "A0522D",
    silver: "C0C0C0", skyblue: "87CEEB", slateblue: "6A5ACD",
    slategray: "708090", slategrey: "708090", snow: "FFFAFA",
    springgreen: "00FF7F", steelblue: "4682B4", tan: "D2B48C",
    teal: "008080", thistle: "D8BFD8", tomato: "FF6347",
    turquoise: "40E0D0", violet: "EE82EE", wheat: "F5DEB3",
    white: "FFFFFF", whitesmoke: "F5F5F5", yellow: "FFFF00",
    yellowgreen: "9ACD32",
  };

  // ---------------------------------------------------------------------------
  // Tailwind color palette (slate, gray, zinc, neutral, stone, red, orange,
  // amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo,
  // violet, purple, fuchsia, pink, rose)
  // ---------------------------------------------------------------------------
  var TAILWIND = {
    "slate-50": "F8FAFC", "slate-100": "F1F5F9", "slate-200": "E2E8F0",
    "slate-300": "CBD5E1", "slate-400": "94A3B8", "slate-500": "64748B",
    "slate-600": "475569", "slate-700": "334155", "slate-800": "1E293B",
    "slate-900": "0F172A", "slate-950": "020617",
    "gray-50": "F9FAFB", "gray-100": "F3F4F6", "gray-200": "E5E7EB",
    "gray-300": "D1D5DB", "gray-400": "9CA3AF", "gray-500": "6B7280",
    "gray-600": "4B5563", "gray-700": "374151", "gray-800": "1F2937",
    "gray-900": "111827", "gray-950": "030712",
    "zinc-50": "FAFAFA", "zinc-100": "F4F4F5", "zinc-200": "E4E4E7",
    "zinc-300": "D4D4D8", "zinc-400": "A1A1AA", "zinc-500": "71717A",
    "zinc-600": "52525B", "zinc-700": "3F3F46", "zinc-800": "27272A",
    "zinc-900": "18181B", "zinc-950": "09090B",
    "neutral-50": "FAFAFA", "neutral-100": "F5F5F5", "neutral-200": "E5E5E5",
    "neutral-300": "D4D4D4", "neutral-400": "A3A3A3", "neutral-500": "737373",
    "neutral-600": "525252", "neutral-700": "404040", "neutral-800": "262626",
    "neutral-900": "171717", "neutral-950": "0A0A0A",
    "stone-50": "FAFAF9", "stone-100": "F5F5F4", "stone-200": "E7E5E4",
    "stone-300": "D6D3D1", "stone-400": "A8A29E", "stone-500": "78716C",
    "stone-600": "57534E", "stone-700": "44403C", "stone-800": "292524",
    "stone-900": "1C1917", "stone-950": "0C0A09",
    "red-50": "FEF2F2", "red-100": "FEE2E2", "red-200": "FECACA",
    "red-300": "FCA5A5", "red-400": "F87171", "red-500": "EF4444",
    "red-600": "DC2626", "red-700": "B91C1C", "red-800": "991B1B",
    "red-900": "7F1D1D", "red-950": "450A0A",
    "orange-50": "FFF7ED", "orange-100": "FFEDD5", "orange-200": "FED7AA",
    "orange-300": "FDBA74", "orange-400": "FB923C", "orange-500": "F97316",
    "orange-600": "EA580C", "orange-700": "C2410C", "orange-800": "9A3412",
    "orange-900": "7C2D12", "orange-950": "431407",
    "amber-50": "FFFBEB", "amber-100": "FEF3C7", "amber-200": "FDE68A",
    "amber-300": "FCD34D", "amber-400": "FBBF24", "amber-500": "F59E0B",
    "amber-600": "D97706", "amber-700": "B45309", "amber-800": "92400E",
    "amber-900": "78350F", "amber-950": "451A03",
    "yellow-50": "FEFCE8", "yellow-100": "FEF9C3", "yellow-200": "FEF08A",
    "yellow-300": "FDE047", "yellow-400": "FACC15", "yellow-500": "EAB308",
    "yellow-600": "CA8A04", "yellow-700": "A16207", "yellow-800": "854D0E",
    "yellow-900": "713F12", "yellow-950": "422006",
    "lime-50": "F7FEE7", "lime-100": "ECFCCB", "lime-200": "D9F99D",
    "lime-300": "BEF264", "lime-400": "A3E635", "lime-500": "84CC16",
    "lime-600": "65A30D", "lime-700": "4D7C0F", "lime-800": "3F6212",
    "lime-900": "365314", "lime-950": "1A2E05",
    "green-50": "F0FDF4", "green-100": "DCFCE7", "green-200": "BBF7D0",
    "green-300": "86EFAC", "green-400": "4ADE80", "green-500": "22C55E",
    "green-600": "16A34A", "green-700": "15803D", "green-800": "166534",
    "green-900": "14532D", "green-950": "052E16",
    "emerald-50": "ECFDF5", "emerald-100": "D1FAE5", "emerald-200": "A7F3D0",
    "emerald-300": "6EE7B7", "emerald-400": "34D399", "emerald-500": "10B981",
    "emerald-600": "059669", "emerald-700": "047857", "emerald-800": "065F46",
    "emerald-900": "064E3B", "emerald-950": "022C22",
    "teal-50": "F0FDFA", "teal-100": "CCFBF1", "teal-200": "99F6E4",
    "teal-300": "5EEAD4", "teal-400": "2DD4BF", "teal-500": "14B8A6",
    "teal-600": "0D9488", "teal-700": "0F766E", "teal-800": "115E59",
    "teal-900": "134E4A", "teal-950": "042F2E",
    "cyan-50": "ECFEFF", "cyan-100": "CFFAFE", "cyan-200": "A5F3FC",
    "cyan-300": "67E8F9", "cyan-400": "22D3EE", "cyan-500": "06B6D4",
    "cyan-600": "0891B2", "cyan-700": "0E7490", "cyan-800": "155E75",
    "cyan-900": "164E63", "cyan-950": "083344",
    "sky-50": "F0F9FF", "sky-100": "E0F2FE", "sky-200": "BAE6FD",
    "sky-300": "7DD3FC", "sky-400": "38BDF8", "sky-500": "0EA5E9",
    "sky-600": "0284C7", "sky-700": "0369A1", "sky-800": "075985",
    "sky-900": "0C4A6E", "sky-950": "082F49",
    "blue-50": "EFF6FF", "blue-100": "DBEAFE", "blue-200": "BFDBFE",
    "blue-300": "93C5FD", "blue-400": "60A5FA", "blue-500": "3B82F6",
    "blue-600": "2563EB", "blue-700": "1D4ED8", "blue-800": "1E40AF",
    "blue-900": "1E3A8A", "blue-950": "172554",
    "indigo-50": "EEF2FF", "indigo-100": "E0E7FF", "indigo-200": "C7D2FE",
    "indigo-300": "A5B4FC", "indigo-400": "818CF8", "indigo-500": "6366F1",
    "indigo-600": "4F46E5", "indigo-700": "4338CA", "indigo-800": "3730A3",
    "indigo-900": "312E81", "indigo-950": "1E1B4B",
    "violet-50": "F5F3FF", "violet-100": "EDE9FE", "violet-200": "DDD6FE",
    "violet-300": "C4B5FD", "violet-400": "A78BFA", "violet-500": "8B5CF6",
    "violet-600": "7C3AED", "violet-700": "6D28D9", "violet-800": "5B21B6",
    "violet-900": "4C1D95", "violet-950": "2E1065",
    "purple-50": "FAF5FF", "purple-100": "F3E8FF", "purple-200": "E9D5FF",
    "purple-300": "D8B4FE", "purple-400": "C084FC", "purple-500": "A855F7",
    "purple-600": "9333EA", "purple-700": "7E22CE", "purple-800": "6B21A8",
    "purple-900": "581C87", "purple-950": "3B0764",
    "fuchsia-50": "FDF4FF", "fuchsia-100": "FAE8FF", "fuchsia-200": "F0ABFC",
    "fuchsia-300": "E879F9", "fuchsia-400": "D946EF", "fuchsia-500": "C026D3",
    "fuchsia-600": "A21CAF", "fuchsia-700": "86198F", "fuchsia-800": "701A75",
    "fuchsia-900": "4A044E", "fuchsia-950": "2D0037",
    "pink-50": "FDF2F8", "pink-100": "FCE7F3", "pink-200": "FBCFE8",
    "pink-300": "F9A8D4", "pink-400": "F472B6", "pink-500": "EC4899",
    "pink-600": "DB2777", "pink-700": "BE185D", "pink-800": "9D174D",
    "pink-900": "831843", "pink-950": "500724",
    "rose-50": "FFF1F2", "rose-100": "FFE4E6", "rose-200": "FECDD3",
    "rose-300": "FDA4AF", "rose-400": "FB7185", "rose-500": "F43F5E",
    "rose-600": "E11D48", "rose-700": "BE123C", "rose-800": "9F1239",
    "rose-900": "881337", "rose-950": "4C0519",
  };

  // ---------------------------------------------------------------------------
  // Color math utilities
  // ---------------------------------------------------------------------------

  // Parse 6-digit hex string (no #) to {r,g,b} 0-255
  function hexToRgb(hex) {
    var h = hex.replace(/^#/, "");
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length === 8) h = h.slice(0, 6); // strip alpha
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }

  function rgbToHex(r, g, b) {
    function pad(n) { var s = n.toString(16); return s.length === 1 ? "0" + s : s; }
    return "#" + pad(r) + pad(g) + pad(b);
  }

  // rgb 0-255 -> hsl h:0-360, s:0-100, l:0-100
  function rgbToHsl(r, g, b) {
    var rn = r / 255, gn = g / 255, bn = b / 255;
    var max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    var h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
        case gn: h = ((bn - rn) / d + 2) / 6; break;
        default: h = ((rn - gn) / d + 4) / 6; break;
      }
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  function hslToRgb(h, s, l) {
    var hn = h / 360, sn = s / 100, ln = l / 100;
    var r, g, b;
    if (sn === 0) {
      r = g = b = ln;
    } else {
      function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      }
      var q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
      var p = 2 * ln - q;
      r = hue2rgb(p, q, hn + 1 / 3);
      g = hue2rgb(p, q, hn);
      b = hue2rgb(p, q, hn - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  // Complement: rotate hue by 180 deg
  function complementHex(hex) {
    var rgb = hexToRgb(hex);
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var ch = (hsl.h + 180) % 360;
    var crgb = hslToRgb(ch, hsl.s, hsl.l);
    return rgbToHex(crgb.r, crgb.g, crgb.b).toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // Color swatch: generate a 1x1 PNG data URI using raw binary
  // ---------------------------------------------------------------------------
  function makePngDataUri(hex) {
    var rgb = hexToRgb(hex);
    var r = rgb.r, g = rgb.g, b = rgb.b;

    // Build a minimal 1x1 RGBA PNG in pure JS
    // PNG signature
    var sig = [137, 80, 78, 71, 13, 10, 26, 10];

    // IHDR chunk: 1x1, 8-bit, RGB (colorType=2)
    function u32(n) {
      return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    }
    var ihdrData = [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0];
    var ihdrCrc = crc32([73, 72, 68, 82].concat(ihdrData));
    var ihdrChunk = [0, 0, 0, 13, 73, 72, 68, 82].concat(ihdrData).concat(u32(ihdrCrc));

    // IDAT chunk: deflate of filter-byte(0) + r + g + b
    // We use a minimal stored (non-compressed) deflate block
    var raw = [0, r, g, b]; // filter 0 + 3 bytes
    // zlib header: CMF=0x78 FLG=0x01 (deflate, no dict, check bits)
    // stored block: BFINAL=1, BTYPE=00, LEN=4, NLEN=~4
    var len = raw.length; // 4
    var nlen = (~len) & 0xffff;
    var deflated = [0x78, 0x01,
      0x01,
      len & 0xff, (len >> 8) & 0xff,
      nlen & 0xff, (nlen >> 8) & 0xff
    ].concat(raw);

    // Adler-32 of raw data
    var a = 1, b2 = 0;
    for (var i = 0; i < raw.length; i++) {
      a = (a + raw[i]) % 65521;
      b2 = (b2 + a) % 65521;
    }
    deflated = deflated.concat([(b2 >> 8) & 0xff, b2 & 0xff, (a >> 8) & 0xff, a & 0xff]);

    var idatLen = deflated.length;
    var idatType = [73, 68, 65, 84]; // "IDAT"
    var idatCrc = crc32(idatType.concat(deflated));
    var idatChunk = u32(idatLen).concat(idatType).concat(deflated).concat(u32(idatCrc));

    // IEND chunk
    var iendCrc = crc32([73, 69, 78, 68]);
    var iendChunk = [0, 0, 0, 0, 73, 69, 78, 68].concat(u32(iendCrc));

    var all = sig.concat(ihdrChunk).concat(idatChunk).concat(iendChunk);
    return "data:image/png;base64," + bytesToBase64(all);
  }

  // CRC-32 table
  var CRC_TABLE = (function () {
    var t = [];
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[i] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function bytesToBase64(bytes) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var result = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i], b1 = bytes[i + 1] || 0, b2 = bytes[i + 2] || 0;
      var n = (b0 << 16) | (b1 << 8) | b2;
      result += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] +
        (i + 1 < bytes.length ? chars[(n >> 6) & 63] : "=") +
        (i + 2 < bytes.length ? chars[n & 63] : "=");
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Parse input -> normalized 6-digit uppercase hex or null
  // ---------------------------------------------------------------------------
  function parseColor(input) {
    if (!input) return null;
    var s = input.trim();

    // HEX: #RGB, #RGBA, #RRGGBB, #RRGGBBAA, or bare hex
    var hexMatch = s.match(/^#?([0-9A-Fa-f]{3,8})$/);
    if (hexMatch) {
      var h = hexMatch[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
      if (h.length === 8) h = h.slice(0, 6); // drop alpha
      if (h.length === 6) return h.toUpperCase();
      return null;
    }

    // RGB: rgb(r, g, b) or rgb(r g b)
    var rgbMatch = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (rgbMatch) {
      var r = Math.min(255, parseInt(rgbMatch[1], 10));
      var g = Math.min(255, parseInt(rgbMatch[2], 10));
      var b = Math.min(255, parseInt(rgbMatch[3], 10));
      return rgbToHex(r, g, b).slice(1).toUpperCase();
    }

    // HSL: hsl(h, s%, l%) or hsl(h s% l%)
    var hslMatch = s.match(/^hsla?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)%?[,\s]+(\d+(?:\.\d+)?)%?/i);
    if (hslMatch) {
      var hh = parseFloat(hslMatch[1]) % 360;
      var ss = Math.min(100, parseFloat(hslMatch[2]));
      var ll = Math.min(100, parseFloat(hslMatch[3]));
      var rgb2 = hslToRgb(hh, ss, ll);
      return rgbToHex(rgb2.r, rgb2.g, rgb2.b).slice(1).toUpperCase();
    }

    // Tailwind: e.g. blue-500
    var twKey = s.toLowerCase();
    if (TAILWIND[twKey]) return TAILWIND[twKey].toUpperCase();

    // CSS color name
    var cssKey = s.toLowerCase().replace(/\s+/g, "");
    if (CSS_COLORS[cssKey]) return CSS_COLORS[cssKey].toUpperCase();

    return null;
  }

  // ---------------------------------------------------------------------------
  // Match function: decide whether to activate for this query
  // ---------------------------------------------------------------------------
  function matchesColor(query) {
    if (!query) return false;
    var s = query.trim();
    if (!s) return false;

    // Starts with # followed by 3/6/4/8 hex digits
    if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{1,5})?$/.test(s)) return true;
    // Bare 6-digit hex
    if (/^[0-9A-Fa-f]{6}$/.test(s)) return true;
    // Bare 3-digit hex
    if (/^[0-9A-Fa-f]{3}$/.test(s)) return true;
    // rgb( / hsl(
    if (/^rgba?\s*\(/i.test(s)) return true;
    if (/^hsla?\s*\(/i.test(s)) return true;
    // CSS name
    if (CSS_COLORS[s.toLowerCase()]) return true;
    // Tailwind: word-number
    if (/^[a-z]+-\d{2,3}$/.test(s) && TAILWIND[s.toLowerCase()]) return true;

    return false;
  }

  // ---------------------------------------------------------------------------
  // Find nearest Tailwind color (minimum Euclidean distance in RGB space)
  // ---------------------------------------------------------------------------
  function nearestTailwind(hex) {
    var rgb = hexToRgb(hex);
    var best = null, bestDist = Infinity;
    for (var key in TAILWIND) {
      if (!Object.prototype.hasOwnProperty.call(TAILWIND, key)) continue;
      var tRgb = hexToRgb(TAILWIND[key]);
      var dr = rgb.r - tRgb.r, dg = rgb.g - tRgb.g, db = rgb.b - tRgb.b;
      var dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; best = key; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Build result list from a parsed hex color
  // ---------------------------------------------------------------------------
  function buildResults(hex, query) {
    var rgb = hexToRgb(hex);
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var twKey = nearestTailwind(hex);
    var twHex = TAILWIND[twKey] ? TAILWIND[twKey].toUpperCase() : hex;
    var compHex = complementHex(hex);

    var hexStr  = "#" + hex;
    var rgbStr  = "rgb(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ")";
    var hslStr  = "hsl(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%)";
    var twStr   = twKey;

    var compSuffix = "  ·  " + t("subtitle_complement") + "#" + compHex;

    var hexIcon = makePngDataUri(hex);
    var twIcon  = makePngDataUri(twHex);
    var compIcon = makePngDataUri(compHex);

    return [
      {
        id: "hex",
        title: hexStr,
        subtitle: t("copyAll") + compSuffix,
        icon: hexIcon,
        badge: t("hex"),
        score: 1.0,
        meta: { value: hexStr, hex: hex, compHex: compHex, all: [hexStr, rgbStr, hslStr, twStr] },
      },
      {
        id: "rgb",
        title: rgbStr,
        subtitle: compSuffix.trim(),
        icon: hexIcon,
        badge: t("rgb"),
        score: 1.0,
        meta: { value: rgbStr, hex: hex, compHex: compHex, all: [hexStr, rgbStr, hslStr, twStr] },
      },
      {
        id: "hsl",
        title: hslStr,
        subtitle: compSuffix.trim(),
        icon: hexIcon,
        badge: t("hsl"),
        score: 1.0,
        meta: { value: hslStr, hex: hex, compHex: compHex, all: [hexStr, rgbStr, hslStr, twStr] },
      },
      {
        id: "tailwind",
        title: twStr,
        subtitle: "#" + twHex + compSuffix,
        icon: twIcon,
        badge: t("tailwind"),
        score: 1.0,
        meta: { value: twStr, hex: twHex, compHex: compHex, all: [hexStr, rgbStr, hslStr, twStr] },
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Register Spotlight mode
  // ---------------------------------------------------------------------------
  api.registerMode({
    id: "color-toolbox",
    name: locale === "zh-CN" ? "颜色工具" : "Color Toolbox",
    icon: "ph:palette",
    placeholder: t("placeholder"),
    debounceMs: 80,

    match: function (query) {
      return matchesColor(query);
    },

    onQuery: function (query) {
      var s = query ? query.trim() : "";
      if (!s) return Promise.resolve([]);
      var hex = parseColor(s);
      if (!hex) return Promise.resolve([]);
      try {
        return Promise.resolve(buildResults(hex, s));
      } catch (e) {
        console.error("[color-toolbox] onQuery error:", e);
        return Promise.resolve([]);
      }
    },

    onSelect: function (result, modifiers) {
      if (!result || !result.meta) return Promise.resolve();

      // Ctrl+Enter: copy all formats joined by newline
      if (modifiers && modifiers.ctrlKey) {
        var all = result.meta.all || [];
        return api.writeClipboard(all.join("\n")).catch(function (e) {
          console.error("[color-toolbox] writeClipboard error:", e);
        });
      }

      // Default: copy selected format value
      var value = result.meta.value || result.title;
      return api.writeClipboard(value).catch(function (e) {
        console.error("[color-toolbox] writeClipboard error:", e);
      });
    },

    footerHints: [
      { key: "Enter", label: { en: "Copy", "zh-CN": "复制" } },
      { key: "Ctrl+Enter", label: { en: "Copy All Formats", "zh-CN": "复制所有格式" } },
    ],
  });
})();
