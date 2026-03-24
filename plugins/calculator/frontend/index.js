// Calculator Plugin - Quick calculator with unit conversion and base conversion
(function () {
  var api = window.AlgerPlugin.create("calculator");
  var locale = api.getEnv().locale || "en";
  var decimalPlaces = 6;

  var i18n = {
    "en": {
      placeholder: "e.g. 2^10, sqrt(144), 12kg to lb, 0xFF...",
      copyResult: "Copy Result",
      result: "Result",
      error: "Invalid Expression",
      badge: "Calculator",
      hex: "HEX",
      oct: "OCT",
      bin: "BIN",
      dec: "DEC",
      baseConversion: "Base Conversion",
    },
    "zh-CN": {
      placeholder: "例如 2^10, sqrt(144), 12kg to lb, 0xFF...",
      copyResult: "复制结果",
      result: "计算结果",
      error: "无效表达式",
      badge: "计算器",
      hex: "十六进制",
      oct: "八进制",
      bin: "二进制",
      dec: "十进制",
      baseConversion: "进制转换",
    },
  };

  function t(key) {
    var lang = i18n[locale] || i18n[locale.split("-")[0]] || i18n["en"];
    return (lang && lang[key]) || (i18n["en"] && i18n["en"][key]) || key;
  }

  // Load initial settings
  api.getSetting("decimal_places").then(function (val) {
    if (val !== null && val !== "") {
      var n = parseInt(val, 10);
      if (!isNaN(n) && n >= 0) decimalPlaces = n;
    }
  });

  api.onSettingChanged("decimal_places", function (newVal) {
    var n = parseInt(newVal, 10);
    if (!isNaN(n) && n >= 0) decimalPlaces = n;
  });

  // ─── Tokenizer ───────────────────────────────────────────────────────────────

  var TOKEN_NUM = "NUM";
  var TOKEN_OP = "OP";
  var TOKEN_LPAREN = "LPAREN";
  var TOKEN_RPAREN = "RPAREN";
  var TOKEN_FUNC = "FUNC";
  var TOKEN_COMMA = "COMMA";
  var TOKEN_END = "END";

  var FUNCTIONS = ["sqrt", "sin", "cos", "tan", "log", "ln", "abs", "ceil",
    "floor", "round", "exp", "pow", "min", "max", "rand"];
  var CONSTANTS = { pi: Math.PI, e: Math.E };

  function tokenize(expr) {
    var tokens = [];
    var i = 0;
    var s = expr.trim();

    while (i < s.length) {
      // skip whitespace
      if (s[i] === " " || s[i] === "\t") { i++; continue; }

      // hex literal
      if (s[i] === "0" && (s[i + 1] === "x" || s[i + 1] === "X")) {
        var start = i;
        i += 2;
        while (i < s.length && /[0-9a-fA-F]/.test(s[i])) i++;
        tokens.push({ type: TOKEN_NUM, value: parseInt(s.slice(start, i), 16) });
        continue;
      }

      // binary literal
      if (s[i] === "0" && (s[i + 1] === "b" || s[i + 1] === "B")) {
        var start2 = i;
        i += 2;
        while (i < s.length && (s[i] === "0" || s[i] === "1")) i++;
        tokens.push({ type: TOKEN_NUM, value: parseInt(s.slice(start2, i), 2) });
        continue;
      }

      // octal literal
      if (s[i] === "0" && (s[i + 1] === "o" || s[i + 1] === "O")) {
        var start3 = i;
        i += 2;
        while (i < s.length && /[0-7]/.test(s[i])) i++;
        tokens.push({ type: TOKEN_NUM, value: parseInt(s.slice(start3, i), 8) });
        continue;
      }

      // number (decimal)
      if (/[0-9]/.test(s[i]) || (s[i] === "." && /[0-9]/.test(s[i + 1] || ""))) {
        var start4 = i;
        while (i < s.length && /[0-9]/.test(s[i])) i++;
        if (i < s.length && s[i] === ".") {
          i++;
          while (i < s.length && /[0-9]/.test(s[i])) i++;
        }
        if (i < s.length && (s[i] === "e" || s[i] === "E")) {
          i++;
          if (s[i] === "+" || s[i] === "-") i++;
          while (i < s.length && /[0-9]/.test(s[i])) i++;
        }
        tokens.push({ type: TOKEN_NUM, value: parseFloat(s.slice(start4, i)) });
        continue;
      }

      // identifier: constant or function
      if (/[a-zA-Z_]/.test(s[i])) {
        var start5 = i;
        while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) i++;
        var word = s.slice(start5, i);
        var wordLower = word.toLowerCase();
        if (CONSTANTS[wordLower] !== undefined) {
          tokens.push({ type: TOKEN_NUM, value: CONSTANTS[wordLower] });
        } else if (FUNCTIONS.indexOf(wordLower) !== -1) {
          tokens.push({ type: TOKEN_FUNC, value: wordLower });
        } else {
          // unknown identifier — treat as 0 to avoid crash
          tokens.push({ type: TOKEN_NUM, value: 0 });
        }
        continue;
      }

      // operators
      if ("+-*/^%".indexOf(s[i]) !== -1) {
        tokens.push({ type: TOKEN_OP, value: s[i] });
        i++;
        continue;
      }

      if (s[i] === "(") { tokens.push({ type: TOKEN_LPAREN }); i++; continue; }
      if (s[i] === ")") { tokens.push({ type: TOKEN_RPAREN }); i++; continue; }
      if (s[i] === ",") { tokens.push({ type: TOKEN_COMMA }); i++; continue; }

      // unknown character — skip
      i++;
    }

    tokens.push({ type: TOKEN_END });
    return tokens;
  }

  // ─── Recursive Descent Parser ────────────────────────────────────────────────
  // Grammar (precedence low → high):
  //   expr    = term (('+' | '-') term)*
  //   term    = unary (('*' | '/') unary)*
  //   unary   = '-' unary | power
  //   power   = postfix ('^' unary)*
  //   postfix = primary ('%')?
  //   primary = NUM | FUNC '(' args ')' | '(' expr ')' | primary '(' args ')'  (implicit multiply)

  function Parser(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  Parser.prototype.peek = function () {
    return this.tokens[this.pos];
  };

  Parser.prototype.consume = function () {
    return this.tokens[this.pos++];
  };

  Parser.prototype.expect = function (type) {
    var tok = this.consume();
    if (tok.type !== type) throw new Error("Expected " + type + " got " + tok.type);
    return tok;
  };

  Parser.prototype.parse = function () {
    var val = this.parseExpr();
    if (this.peek().type !== TOKEN_END) throw new Error("Unexpected token");
    return val;
  };

  Parser.prototype.parseExpr = function () {
    var val = this.parseTerm();
    while (this.peek().type === TOKEN_OP &&
           (this.peek().value === "+" || this.peek().value === "-")) {
      var op = this.consume().value;
      var right = this.parseTerm();
      if (op === "+") val += right; else val -= right;
    }
    return val;
  };

  Parser.prototype.parseTerm = function () {
    var val = this.parseUnary();
    while (true) {
      var tok = this.peek();
      // explicit * /
      if (tok.type === TOKEN_OP && (tok.value === "*" || tok.value === "/")) {
        var op = this.consume().value;
        var right = this.parseUnary();
        if (op === "*") val *= right; else val /= right;
        continue;
      }
      // implicit multiply: number/constant followed by '(' e.g. 2(3+4)
      if (tok.type === TOKEN_LPAREN) {
        this.consume();
        var inner = this.parseExpr();
        this.expect(TOKEN_RPAREN);
        val *= inner;
        continue;
      }
      break;
    }
    return val;
  };

  Parser.prototype.parseUnary = function () {
    if (this.peek().type === TOKEN_OP && this.peek().value === "-") {
      this.consume();
      return -this.parseUnary();
    }
    if (this.peek().type === TOKEN_OP && this.peek().value === "+") {
      this.consume();
      return this.parseUnary();
    }
    return this.parsePower();
  };

  Parser.prototype.parsePower = function () {
    var base = this.parsePostfix();
    if (this.peek().type === TOKEN_OP && this.peek().value === "^") {
      this.consume();
      var exp = this.parseUnary(); // right-associative
      return Math.pow(base, exp);
    }
    return base;
  };

  Parser.prototype.parsePostfix = function () {
    var val = this.parsePrimary();
    // trailing % means divide by 100
    if (this.peek().type === TOKEN_OP && this.peek().value === "%") {
      this.consume();
      val = val / 100;
    }
    return val;
  };

  Parser.prototype.parsePrimary = function () {
    var tok = this.peek();

    // parenthesised expression
    if (tok.type === TOKEN_LPAREN) {
      this.consume();
      var val = this.parseExpr();
      this.expect(TOKEN_RPAREN);
      return val;
    }

    // number literal
    if (tok.type === TOKEN_NUM) {
      this.consume();
      return tok.value;
    }

    // function call
    if (tok.type === TOKEN_FUNC) {
      this.consume();
      this.expect(TOKEN_LPAREN);
      var args = this.parseArgs();
      this.expect(TOKEN_RPAREN);
      return callFunction(tok.value, args);
    }

    throw new Error("Unexpected token: " + tok.type);
  };

  Parser.prototype.parseArgs = function () {
    var args = [];
    if (this.peek().type === TOKEN_RPAREN) return args;
    args.push(this.parseExpr());
    while (this.peek().type === TOKEN_COMMA) {
      this.consume();
      args.push(this.parseExpr());
    }
    return args;
  };

  function callFunction(name, args) {
    var a = args[0];
    var b = args[1];
    switch (name) {
      case "sqrt":  return Math.sqrt(a);
      case "sin":   return Math.sin(a);
      case "cos":   return Math.cos(a);
      case "tan":   return Math.tan(a);
      case "log":   return (b !== undefined) ? Math.log(b) / Math.log(a) : Math.log10(a);
      case "ln":    return Math.log(a);
      case "abs":   return Math.abs(a);
      case "ceil":  return Math.ceil(a);
      case "floor": return Math.floor(a);
      case "round": return Math.round(a);
      case "exp":   return Math.exp(a);
      case "pow":   return Math.pow(a, b);
      case "min":   return Math.min.apply(null, args);
      case "max":   return Math.max.apply(null, args);
      case "rand":  return Math.random();
      default:      throw new Error("Unknown function: " + name);
    }
  }

  function evalExpr(expr) {
    var tokens = tokenize(expr);
    var parser = new Parser(tokens);
    return parser.parse();
  }

  // ─── Format Result ────────────────────────────────────────────────────────────

  function formatNumber(n, places) {
    if (!isFinite(n)) return String(n);
    // if integer, no decimal
    if (Number.isInteger(n)) return String(n);
    var fixed = parseFloat(n.toFixed(places));
    // trim trailing zeros
    return String(fixed);
  }

  // ─── Percentage Helpers ───────────────────────────────────────────────────────
  // "15% of 200"  →  30
  // "200 + 10%"   →  220
  // "200 - 10%"   →  180

  function tryPercentOf(expr) {
    var m = expr.match(/^([\d.]+)\s*%\s+of\s+([\d.]+)$/i);
    if (!m) return null;
    return (parseFloat(m[1]) / 100) * parseFloat(m[2]);
  }

  function tryPercentArithmetic(expr) {
    var m = expr.match(/^([\d.eE+\-()^*/]+)\s*([+\-])\s*([\d.]+)\s*%\s*$/i);
    if (!m) return null;
    var base = evalExpr(m[1]);
    var pct = parseFloat(m[3]) / 100;
    if (m[2] === "+") return base + base * pct;
    return base - base * pct;
  }

  // ─── Unit Conversion ──────────────────────────────────────────────────────────

  var unitGroups = {
    length: {
      km: 1000, m: 1, cm: 0.01, mm: 0.001,
      mi: 1609.344, ft: 0.3048, "in": 0.0254, yd: 0.9144,
    },
    weight: {
      kg: 1, g: 0.001, mg: 0.000001, lb: 0.45359237,
      oz: 0.028349523, t: 1000,
    },
    data: {
      b: 1, kb: 1024, mb: 1048576, gb: 1073741824,
      tb: 1099511627776, kib: 1024, mib: 1048576, gib: 1073741824,
    },
  };

  // Temperature handled separately
  function convertTemp(value, from, to) {
    var fromL = from.toLowerCase();
    var toL = to.toLowerCase();
    var celsius;
    if (fromL === "c") celsius = value;
    else if (fromL === "f") celsius = (value - 32) * 5 / 9;
    else if (fromL === "k") celsius = value - 273.15;
    else return null;
    if (toL === "c") return celsius;
    if (toL === "f") return celsius * 9 / 5 + 32;
    if (toL === "k") return celsius + 273.15;
    return null;
  }

  function findUnit(unit) {
    var u = unit.toLowerCase();
    for (var group in unitGroups) {
      if (unitGroups[group][u] !== undefined) {
        return { group: group, factor: unitGroups[group][u] };
      }
    }
    return null;
  }

  function tryUnitConversion(expr) {
    // e.g. "12 kg to lb" or "100 km in mi" or "98.6 F to C"
    var m = expr.match(/^([\d.eE+\-()^*/\s]+)\s*([\w]+)\s+(?:to|in)\s+([\w]+)$/i);
    if (!m) return null;
    var valueExpr = m[1].trim();
    var fromUnit = m[2];
    var toUnit = m[3];
    var value;
    try { value = evalExpr(valueExpr); } catch (e) { return null; }
    if (!isFinite(value)) return null;

    // temperature
    var tempUnits = ["c", "f", "k"];
    if (tempUnits.indexOf(fromUnit.toLowerCase()) !== -1 &&
        tempUnits.indexOf(toUnit.toLowerCase()) !== -1) {
      var result = convertTemp(value, fromUnit, toUnit);
      if (result === null) return null;
      return {
        value: result,
        label: valueExpr + " " + fromUnit + " = {result} " + toUnit,
      };
    }

    // other units
    var fromInfo = findUnit(fromUnit);
    var toInfo = findUnit(toUnit);
    if (!fromInfo || !toInfo || fromInfo.group !== toInfo.group) return null;

    var inBase = value * fromInfo.factor;
    var converted = inBase / toInfo.factor;
    return {
      value: converted,
      label: valueExpr + " " + fromUnit + " = {result} " + toUnit,
    };
  }

  // ─── Base Conversion ──────────────────────────────────────────────────────────

  function tryBaseConversion(expr) {
    var trimmed = expr.trim();
    // hex: 0xFF or FF (at least 2 hex chars, must look hexish)
    var hexM = trimmed.match(/^0[xX]([0-9a-fA-F]+)$/) ||
               trimmed.match(/^([0-9a-fA-F]{2,})$/) && /[a-fA-F]/.test(trimmed) && trimmed.match(/^([0-9a-fA-F]+)$/);
    var binM = trimmed.match(/^0[bB]([01]+)$/) || trimmed.match(/^([01]{4,})$/);
    var octM = trimmed.match(/^0[oO]([0-7]+)$/);

    var decimal;
    if (hexM) {
      decimal = parseInt(hexM[1] || hexM[0], 16);
    } else if (binM) {
      decimal = parseInt(binM[1] || binM[0], 2);
    } else if (octM) {
      decimal = parseInt(octM[1], 8);
    } else {
      return null;
    }

    if (!isFinite(decimal) || decimal < 0) return null;
    return decimal;
  }

  // ─── Main Evaluate ────────────────────────────────────────────────────────────

  function evaluate(query) {
    var expr = query.trim();

    // percentage "of"
    var pctOf = tryPercentOf(expr);
    if (pctOf !== null) {
      return { value: pctOf, type: "calc", expr: expr };
    }

    // percentage arithmetic
    var pctArith = tryPercentArithmetic(expr);
    if (pctArith !== null) {
      return { value: pctArith, type: "calc", expr: expr };
    }

    // unit conversion
    var unitResult = tryUnitConversion(expr);
    if (unitResult !== null) {
      return { value: unitResult.value, type: "unit", expr: expr, label: unitResult.label };
    }

    // base conversion
    var baseVal = tryBaseConversion(expr);
    if (baseVal !== null) {
      return { value: baseVal, type: "base", expr: expr };
    }

    // general math
    var val = evalExpr(expr);
    if (!isFinite(val)) return null;
    return { value: val, type: "calc", expr: expr };
  }

  // ─── Match (global search trigger) ───────────────────────────────────────────

  var UNIT_KEYWORDS = ["km", "mi", "ft", "in", "yd", "kg", "lb", "oz", "cm",
    "mm", "gb", "mb", "kb", "tb", "mib", "gib", "kib", "g", "m", "b", "t"];

  function matchQuery(query) {
    if (!query || query.trim().length === 0) return false;
    var s = query.trim();

    // hex/bin/oct literals
    if (/^0[xXbBoO]/.test(s)) return true;

    // unit conversion pattern
    if (/\bto\b|\bin\b/i.test(s) && /\d/.test(s)) {
      for (var ui = 0; ui < UNIT_KEYWORDS.length; ui++) {
        if (new RegExp("\\b" + UNIT_KEYWORDS[ui] + "\\b", "i").test(s)) return true;
      }
    }

    // contains a math function name
    for (var fi = 0; fi < FUNCTIONS.length; fi++) {
      if (s.toLowerCase().indexOf(FUNCTIONS[fi]) !== -1) return true;
    }

    // percentage pattern
    if (/\d\s*%/.test(s)) return true;

    // contains operator AND digit, but exclude pure 10-13 digit numbers (timestamps)
    if (/[+\-*/^]/.test(s) && /\d/.test(s)) {
      // exclude if it looks like a plain long number
      if (/^\d{10,13}$/.test(s)) return false;
      return true;
    }

    return false;
  }

  // ─── Build Results ────────────────────────────────────────────────────────────

  function buildResults(evalResult, places) {
    if (!evalResult) return [];

    var value = evalResult.value;
    var formatted = formatNumber(value, places);

    if (evalResult.type === "base") {
      // Show multiple base representations
      var decStr = String(Math.floor(value));
      var hexStr = "0x" + Math.floor(value).toString(16).toUpperCase();
      var octStr = "0o" + Math.floor(value).toString(8);
      var binStr = "0b" + Math.floor(value).toString(2);

      return [
        {
          id: "base_dec:" + decStr,
          title: decStr,
          subtitle: t("dec") + "  \u00B7  " + evalResult.expr,
          badge: t("badge"),
          icon: "ph:calculator",
          score: 1.0,
        },
        {
          id: "base_hex:" + hexStr,
          title: hexStr,
          subtitle: t("hex") + "  \u00B7  " + evalResult.expr,
          badge: t("badge"),
          icon: "ph:calculator",
          score: 0.99,
        },
        {
          id: "base_oct:" + octStr,
          title: octStr,
          subtitle: t("oct") + "  \u00B7  " + evalResult.expr,
          badge: t("badge"),
          icon: "ph:calculator",
          score: 0.98,
        },
        {
          id: "base_bin:" + binStr,
          title: binStr,
          subtitle: t("bin") + "  \u00B7  " + evalResult.expr,
          badge: t("badge"),
          icon: "ph:calculator",
          score: 0.97,
        },
      ];
    }

    if (evalResult.type === "unit") {
      var subtitle = evalResult.label.replace("{result}", formatted);
      return [{
        id: "result:" + formatted,
        title: formatted,
        subtitle: subtitle,
        badge: t("badge"),
        icon: "ph:calculator",
        score: 1.0,
      }];
    }

    // plain calc
    return [{
      id: "result:" + formatted,
      title: formatted,
      subtitle: evalResult.expr,
      badge: t("badge"),
      icon: "ph:calculator",
      score: 1.0,
    }];
  }

  // ─── Register Mode ────────────────────────────────────────────────────────────

  api.registerMode({
    id: "calculator",
    name: locale === "zh-CN" ? "\u8BA1\u7B97\u5668" : "Calculator",
    icon: "ph:calculator",
    placeholder: t("placeholder"),
    debounceMs: 0,
    footerHints: [
      { kbd: "\u21B5", label: t("copyResult") },
    ],

    match: function (query) {
      return matchQuery(query);
    },

    onQuery: function (query) {
      if (!query || !query.trim()) return Promise.resolve([]);

      var result;
      try {
        result = evaluate(query.trim());
      } catch (e) {
        return Promise.resolve([{
          id: "__error__",
          title: t("error"),
          subtitle: String(e.message || e),
          badge: t("badge"),
          icon: "ph:calculator",
          score: 0,
        }]);
      }

      if (result === null) {
        return Promise.resolve([{
          id: "__error__",
          title: t("error"),
          subtitle: query,
          badge: t("badge"),
          icon: "ph:calculator",
          score: 0,
        }]);
      }

      return Promise.resolve(buildResults(result, decimalPlaces));
    },

    onSelect: function (result) {
      if (result.id === "__error__") return Promise.resolve();

      // Extract the display title (the result value) and write to clipboard
      return api.emit("write-clipboard", { text: result.title }).catch(function () {
        // Fallback: try invoking a clipboard write if emit isn't wired for this
      });
    },
  });
})();
