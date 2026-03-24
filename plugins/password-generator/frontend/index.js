// Password Generator Plugin - Generate secure passwords in multiple styles
(function () {
  var api = window.AlgerPlugin.create("password-generator");
  var locale = api.getEnv().locale || "en";
  var defaultLength = 16;
  var includeSymbols = true;

  var i18n = {
    "en": {
      placeholder: "Enter length (e.g. 20) or leave empty for default...",
      strong: "Strong",
      alphanumeric: "Alphanumeric",
      pin: "PIN",
      memorable: "Memorable",
      hex: "Hex",
      strongDesc: "Uppercase, lowercase, numbers, symbols",
      alphanumDesc: "Uppercase, lowercase, numbers only",
      pinDesc: "Numeric PIN code",
      memorableDesc: "Word combination, easy to remember",
      hexDesc: "Hexadecimal string",
      copied: "Copied",
      copyHint: "Copy to clipboard",
      regenerate: "Regenerate",
      badgeStrong: "Strong",
      badgeAlphanum: "Alphanum",
      badgePIN: "PIN",
      badgeMemorable: "Memorable",
      badgeHex: "Hex",
    },
    "zh-CN": {
      placeholder: "输入长度（如 20）或留空使用默认长度...",
      strong: "高强度",
      alphanumeric: "字母数字",
      pin: "数字 PIN",
      memorable: "易记密码",
      hex: "十六进制",
      strongDesc: "大小写字母 + 数字 + 特殊字符",
      alphanumDesc: "大小写字母 + 数字",
      pinDesc: "纯数字 PIN 码",
      memorableDesc: "单词组合，易于记忆",
      hexDesc: "十六进制字符串",
      copied: "已复制",
      copyHint: "复制到剪贴板",
      regenerate: "重新生成",
      badgeStrong: "Strong",
      badgeAlphanum: "Alphanum",
      badgePIN: "PIN",
      badgeMemorable: "Memorable",
      badgeHex: "Hex",
    },
  };

  function t(key) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    return (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
  }

  // Load initial settings
  api.getSetting("default_length").then(function (val) {
    if (val !== null && val !== "") {
      var n = parseInt(val, 10);
      if (!isNaN(n) && n >= 4 && n <= 128) defaultLength = n;
    }
  });
  api.getSetting("include_symbols").then(function (val) {
    if (val !== null) includeSymbols = val !== "false" && val !== false;
  });

  api.onSettingChanged("default_length", function (newVal) {
    var n = parseInt(newVal, 10);
    if (!isNaN(n) && n >= 4 && n <= 128) defaultLength = n;
  });
  api.onSettingChanged("include_symbols", function (newVal) {
    includeSymbols = newVal !== "false" && newVal !== false;
  });

  // Secure random integer in [0, max)
  function secureRandInt(max) {
    var arr = new Uint32Array(1);
    var limit = Math.floor(0x100000000 / max) * max;
    do {
      crypto.getRandomValues(arr);
    } while (arr[0] >= limit);
    return arr[0] % max;
  }

  // Shuffle array in place using Fisher-Yates with crypto random
  function secureShuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = secureRandInt(i + 1);
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function pickRandom(str, n) {
    var result = [];
    for (var i = 0; i < n; i++) {
      result.push(str[secureRandInt(str.length)]);
    }
    return result;
  }

  // --- Password generators ---

  function generateStrong(length, withSymbols) {
    var upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var lower = "abcdefghijklmnopqrstuvwxyz";
    var digits = "0123456789";
    var symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?";

    var charset = upper + lower + digits + (withSymbols ? symbols : "");
    // Guarantee at least one of each required category
    var required = [
      upper[secureRandInt(upper.length)],
      lower[secureRandInt(lower.length)],
      digits[secureRandInt(digits.length)],
    ];
    if (withSymbols) required.push(symbols[secureRandInt(symbols.length)]);

    var rest = pickRandom(charset, length - required.length);
    return secureShuffleArray(required.concat(rest)).join("");
  }

  function generateAlphanumeric(length) {
    var charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var lower = "abcdefghijklmnopqrstuvwxyz";
    var digits = "0123456789";
    var required = [
      upper[secureRandInt(upper.length)],
      lower[secureRandInt(lower.length)],
      digits[secureRandInt(digits.length)],
    ];
    var rest = pickRandom(charset, length - required.length);
    return secureShuffleArray(required.concat(rest)).join("");
  }

  function generatePIN(length) {
    return pickRandom("0123456789", length).join("");
  }

  // ~300 common short English words (4-6 letters)
  var WORD_LIST = [
    "able","acid","aged","also","area","army","away","baby","back","ball",
    "band","bank","base","bath","bear","beat","been","bell","best","bird",
    "blow","blue","boat","body","bomb","bond","bone","book","born","both",
    "bred","bulb","burn","busy","cage","cake","calm","camp","card","care",
    "cart","case","cash","cast","cave","cent","chip","cite","city","clam",
    "clan","clap","clay","clip","clue","coat","code","cold","cole","come",
    "cool","copy","cord","core","corn","cost","coup","crew","crop","cube",
    "cure","cute","dark","data","date","dawn","dead","deal","dean","dear",
    "debt","deed","deer","deny","desk","dial","diet","disc","disk","dock",
    "dome","done","door","dose","down","draw","drip","drop","drum","dual",
    "dumb","dump","dune","dust","duty","each","earl","earn","ease","east",
    "edge","else","emit","epic","even","ever","evil","exam","exit","face",
    "fact","fail","fair","fall","fame","farm","fast","fate","fear","feat",
    "feed","feel","feet","file","fill","film","find","fine","fire","firm",
    "fish","fist","flag","flat","flew","flip","flow","foam","fold","folk",
    "fond","font","food","foot","fork","form","fort","foul","four","free",
    "frog","from","fuel","full","fund","fuse","gain","game","gang","gate",
    "gave","gear","gene","gift","give","glad","glow","glue","goal","goes",
    "gold","golf","good","grab","gray","grew","grid","grin","grip","grow",
    "gulf","guru","gust","guts","hack","hair","half","hall","hand","hang",
    "hard","harm","harp","hash","have","head","heal","heap","hear","heat",
    "heel","help","herb","hero","hide","high","hill","hint","hire","hold",
    "hole","holy","home","hood","hook","hope","horn","host","hour","huge",
    "hunt","hurt","idea","idle","imam","inch","info","into","iron","jack",
    "jade","jail","jazz","join","joke","jump","just","keen","keep","kern",
    "kick","kind","king","knee","knit","know","lace","lake","lamp","land",
    "lane","last","late","lead","lean","leap","left","lend","lens","link",
    "lion","list","live","load","lock","loft","logo","long","look","loop",
    "lore","loss","loud","love","luck","lung","made","main","make","male",
    "mall","malt","many","mark","mask","math","meal","mean","meet","melt",
    "mesh","mild","mile","milk","mill","mind","mine","mist","mode","mood",
    "moon","more","most","move","much","mute","nail","name","near","neck",
    "need","nest","news","next","nice","node","none","noon","norm","note",
    "noun","null","oath","obey","odds","once","open","oral","oven","pack",
    "page","paid","pain","pair","palm","park","part","past","path","pave",
    "peak","peel","peer","pick","pile","pill","pine","pink","pipe","plan",
    "play","plot","plow","plug","plum","plus","poem","poet","poll","pond",
    "poor","pope","pore","port","pose","post","pour","prep","prey","prod",
    "prop","pull","pump","pure","push","quad","race","rage","raid","rail",
    "rain","rake","ramp","rank","rate","read","real","reap","reef","rent",
    "rest","rice","rich","ride","ring","riot","rise","risk","road","roam",
    "roar","rock","role","roll","roof","room","root","rope","rose","rout",
    "rule","rush","rust","safe","sage","sail","sake","salt","sand","save",
    "scan","seal","seam","seed","seek","self","sell","send","shed","ship",
    "shop","shot","show","shut","side","sign","silk","sing","sink","site",
    "size","skin","skip","slam","slim","slip","slot","slow","slug","snap",
    "snow","soap","sock","soft","soil","sold","sole","some","song","sort",
    "soul","soup","span","spin","spot","star","stay","stem","step","stop",
    "stub","such","suit","sung","swap","swim","tail","tale","talk","tall",
    "tank","tape","task","team","tear","tech","tell","tend","tent","term",
    "test","text","than","then","they","thin","this","tile","time","tiny",
    "tire","toad","told","toll","tomb","tone","tool","torn","toss","tour",
    "town","trap","tree","trim","trip","true","tube","tune","turn","twin",
    "type","unit","upon","used","user","vain","vast","verb","very","vest",
    "view","vine","void","vote","wade","wake","walk","wall","warm","warn",
    "warp","wary","wave","weak","weed","well","went","were","west","what",
    "when","whom","wide","wild","will","wilt","wind","wine","wing","wire",
    "wise","wish","with","wolf","wood","wool","word","wore","work","worn",
    "wrap","wren","writ","yard","year","your","zero","zone","zoom"
  ];

  function generateMemorable(wordCount) {
    var words = [];
    for (var i = 0; i < wordCount; i++) {
      words.push(WORD_LIST[secureRandInt(WORD_LIST.length)]);
    }
    return words.join("-");
  }

  function generateHex(length) {
    var chars = "0123456789abcdef";
    return pickRandom(chars, length).join("");
  }

  // Build all 5 password results for a given length
  function buildResults(length) {
    // Memorable uses word count derived from length: 3 words if length < 20, else 4
    var wordCount = length < 20 ? 3 : 4;

    var specs = [
      {
        kind: "strong",
        title: t("strong"),
        desc: t("strongDesc"),
        badge: t("badgeStrong"),
        gen: function () { return generateStrong(length, includeSymbols); },
      },
      {
        kind: "alphanumeric",
        title: t("alphanumeric"),
        desc: t("alphanumDesc"),
        badge: t("badgeAlphanum"),
        gen: function () { return generateAlphanumeric(length); },
      },
      {
        kind: "pin",
        title: t("pin"),
        desc: t("pinDesc"),
        badge: t("badgePIN"),
        gen: function () { return generatePIN(length); },
      },
      {
        kind: "memorable",
        title: t("memorable"),
        desc: t("memorableDesc"),
        badge: t("badgeMemorable"),
        gen: function () { return generateMemorable(wordCount); },
      },
      {
        kind: "hex",
        title: t("hex"),
        desc: t("hexDesc"),
        badge: t("badgeHex"),
        gen: function () { return generateHex(length); },
      },
    ];

    return specs.map(function (spec) {
      var password = spec.gen();
      return {
        id: spec.kind + ":" + password,
        title: password,
        subtitle: spec.title + "  \u00B7  " + spec.desc,
        icon: "ph:key",
        badge: spec.badge,
        copyValue: password,
      };
    });
  }

  api.registerMode({
    id: "password-generator",
    name: locale === "zh-CN" ? "\u5BC6\u7801\u751F\u6210\u5668" : "Password Generator",
    icon: "ph:key",
    placeholder: t("placeholder"),
    debounceMs: 0,

    footerHints: [
      { kbd: "\u21B5", label: t("copyHint") },
      { kbd: "Tab", label: t("regenerate") },
    ],

    onQuery: function (query) {
      var length = defaultLength;
      if (query && query.trim()) {
        var n = parseInt(query.trim(), 10);
        if (!isNaN(n) && n >= 4 && n <= 128) {
          length = n;
        }
      }
      return Promise.resolve(buildResults(length));
    },

    onSelect: function (result) {
      if (!result || !result.copyValue) return Promise.resolve();
      return api.writeClipboard(result.copyValue).catch(function (err) {
        console.error("Password Generator: failed to copy", err);
      });
    },
  });
})();
