/** Logging features.
 * 
 * The logger module prepends entries in the designated slot on the Home screen,
 * evicting old ones lazily when new ones are added. It also crossposts them to
 * the JS-native console.
*/


// arbitrary object -> string helper written by Claude
window.serialiser = (function()
{
  /**
   * @typedef {object} SerialisationOptions Defines options for the stringify function.
   * @property {number} [maxRecursionDepth]
   * @property {number} [maxArrayLength]
   * @property {number} [maxStringLength]
   * @property {number} [lineWidth]
   */

  const _defaultSerialisationOpts = {
    maxRecursionDepth: 6,
    maxArrayLength: 10,
    maxStringLength: 1024,
    lineWidth: 64,
  };


  /** Return a reasonable string representation of an arbitrary value.
   * 
   * @param {any} value
   * @param {SerialisationOptions} userOptions
   * 
   * @returns {string}
   */
  function stringify(value, userOptions, asHtml = false) {
    const opts = _.defaults({}, userOptions || {}, _defaultSerialisationOpts);
    try {
      const strval = _formatValue(value, opts, 0, [], true);
      return asHtml ? _toHtmlLineBreaks(strval) : strval;
    } catch (err) {
      try {
        const errmsg = err && err.message;
        return `[Unstringifiable value: ${asHtml ? _toHtmlLineBreaks(errmsg) : errmsg}]`;
      } catch (err2) {
        return "[Unstringifiable value]";
      }
    }
  }

  /** Central dispatch for all values.
   * 
   * @param {any} value 
   * @param {SerialisationOptions} opts 
   * @param {number} depth 
   * @param {any[]} stack 
   * @param {boolean} isTop 
   * @returns {string}
   */
  function _formatValue(value, opts, depth, stack, isTop) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    var type = typeof value;

    if (type === "string") {
      return isTop ? _truncateString(value, opts) : _quoteString(value, opts);
    }
    if (type === "number") return Object.is(value, -0) ? "-0" : String(value);
    if (type === "boolean") return String(value);
    if (type === "bigint") return `${value}n`;
    if (type === "symbol") return value.toString();
    if (type === "function") return _formatFunction(value);
    if (type !== "object") return String(value); // safety net for exotic host types

    // --- object-like values from here down ---

    if (stack.indexOf(value) !== -1) return "[Circular]";
    if (depth > opts.maxRecursionDepth) return _depthLimitLabel(value);

    if (_.isDate(value)) return _formatDate(value);
    if (_.isRegExp(value)) return value.toString();
    if (_.isError(value)) return _formatError(value, opts, depth, stack);

    if (typeof Promise !== "undefined" && value instanceof Promise) {
      return "Promise { <state unknown> }";
    }
    if (typeof WeakMap !== "undefined" && value instanceof WeakMap) {
      return "WeakMap { <items unknown> }";
    }
    if (typeof WeakSet !== "undefined" && value instanceof WeakSet) {
      return "WeakSet { <items unknown> }";
    }

    if (typeof Response !== "undefined" && value instanceof Response) {
      return _formatResponse(value);
    }
    if (typeof Request !== "undefined" && value instanceof Request) return _formatRequest(value);
    if (typeof Headers !== "undefined" && value instanceof Headers) return _formatHeaders(value);
    if (typeof URL !== "undefined" && value instanceof URL) return `URL { ${value.href} }`;
    if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) {
      return `URLSearchParams ${JSON.stringify(Object.fromEntries(value.entries()))}`;
    }
    if (typeof File !== "undefined" && value instanceof File) {
      return `File { name: ${JSON.stringify(value.name)}, size: ${value.size}, `
           + `type: ${JSON.stringify(value.type)} }`;
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return `Blob { size: ${value.size}, type: ${JSON.stringify(value.type)} }`;
    }
    if (typeof DataView !== "undefined" && value instanceof DataView) {
      return `DataView { byteLength: ${value.byteLength} }`;
    }
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
      return `ArrayBuffer { byteLength: ${value.byteLength} }`;
    }
    if (typeof Node !== "undefined" && value instanceof Node) return _formatDomNode(value);

    if (_.isMap(value)) return _formatMapOrSet(value, "Map", opts, depth, stack);
    if (_.isSet(value)) return _formatMapOrSet(value, "Set", opts, depth, stack);
    if (_.isTypedArray(value)) return _formatTypedArray(value, opts, depth, stack);
    if (_.isArray(value)) return _formatArray(value, opts, depth, stack);

    return _formatObject(value, opts, depth, stack);
  }


  // strings --------------------------------------------------------------------------------------
  function _truncateString(str, opts) {
    if (str.length <= opts.maxStringLength) return str;
    return `${str.slice(0, opts.maxStringLength)}... `
         + `(${str.length - opts.maxStringLength} more chars)`;
  }

  function _quoteString(str, opts) {
    var truncated = _truncateString(str, opts);
    var quote = (
      truncated.indexOf("\"") === -1
      ? "\""
      : (truncated.indexOf("'") === -1
        ? "'"
        : "\"")
    );
    var escaped = truncated
      .replace(/\\/g, "\\\\")
      .split(quote).join(`\\${quote}`)
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return quote + escaped + quote;
  }

  function _formatKey(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
  }

  function _toHtmlLineBreaks(str) {
    return str.replace("\n", "<br>");
  }


  // functions ------------------------------------------------------------------------------------
  function _formatFunction(fn) {
    var src = Function.prototype.toString.call(fn);
    var name = fn.name || "(anonymous)";
    if (/^\s*class[\s{]/.test(src)) return `[class ${name}]`;

    var kind = "Function";
    if (/^\s*async\s+function\*/.test(src)) kind = "AsyncGeneratorFunction";
    else if (/^\s*function\*/.test(src)) kind = "GeneratorFunction";
    else if (/^\s*async\s/.test(src)) kind = "AsyncFunction";

    return `[${kind}: ${name}]`;
  }


  // dates ----------------------------------------------------------------------------------------
  function _formatDate(value) {
    return isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }


  // errors ---------------------------------------------------------------------------------------
  function _formatError(value, opts, depth, stack) {
    var header = `${value.name}: ${value.message}`;
    var traceLines = (value.stack || "").split("\n");
    if (traceLines.length && traceLines[0].trim() === header.trim()) {
      traceLines = traceLines.slice(1);
    }
    var base = traceLines.length ? `${header}\n${traceLines.join("\n")}` : header;
    var standardKeys = { name: true, message: true, stack: true };
    var extraKeys = Object.keys(value).filter(function (k) { return !standardKeys[k]; });
    if (extraKeys.length === 0) return base;

    stack.push(value);
    var extras = extraKeys.map(function (k) {
      return `${_formatKey(k)}: ${_formatValue(value[k], opts, depth + 1, stack, false)}`;
    });
    stack.pop();
    return `${base} { ${extras.join(", ")} }`;
  }


  // web types ------------------------------------------------------------------------------------
  function _formatResponse(value) {
    return `Response { status: ${value.status}, statusText: ${JSON.stringify(value.statusText)}, `
         + `ok: ${value.ok}, url: ${JSON.stringify(value.url)}, `
         + `type: ${JSON.stringify(value.type)}, redirected: ${value.redirected}, `
         + `bodyUsed: ${value.bodyUsed} }`;
  }

  function _formatRequest(value) {
    return `Request { method: ${JSON.stringify(value.method)}, url: ${JSON.stringify(value.url)}, `
         + `mode: ${JSON.stringify(value.mode)}, `
         + `credentials: ${JSON.stringify(value.credentials)} }`;
  }

  function _formatHeaders(value) {
    var obj = {};
    value.forEach(function (v, k) { obj[k] = v; });
    return `Headers ${JSON.stringify(obj)}`;
  }

  function _formatDomNode(node) {
    if (node.nodeType === 3) { // Text
      var text = node.textContent.trim();
      var shown = text.length > 40 ? `${text.slice(0, 40)}…` : text;
      return `#text ${JSON.stringify(shown)}`;
    }
    if (node.nodeType === 8) { // Comment
      return `<!-- ${node.textContent.trim()} -->`;
    }
    if (node.nodeType === 1) { // Element
      var tag = node.tagName.toLowerCase();
      var id = node.id ? `#${node.id}` : "";
      var cls = node.className && typeof node.className === "string"
        ? `.${node.className.trim().split(/\s+/).join(".")}`
        : "";
      var childCount = node.childElementCount;
      return `<${tag}${id}${cls}>${childCount ? ` (${childCount} children)` : ""}`;
    }
    return node.nodeName || "Node";
  }


  // collections ----------------------------------------------------------------------------------
  function _formatArray(value, opts, depth, stack) {
    stack.push(value);
    var len = value.length;
    var items = value.slice(0, opts.maxArrayLength).map(function (el) {
      return _formatValue(el, opts, depth + 1, stack, false);
    });
    if (len > opts.maxArrayLength) items.push(`... ${len - opts.maxArrayLength} more items`);
    stack.pop();
    return _wrapEntries(items, "[", "]", depth, opts, "");
  }

  function _formatTypedArray(value, opts, depth, stack) {
    var name = value.constructor.name; // e.g. Uint8Array
    stack.push(value);
    var len = value.length;
    var items = Array.from(value.slice(0, opts.maxArrayLength)).map(function (v) {
      return _formatValue(v, opts, depth + 1, stack, false);
    });
    if (len > opts.maxArrayLength) items.push(`... ${len - opts.maxArrayLength} more items`);
    stack.pop();
    return _wrapEntries(items, "[", "]", depth, opts, `${name}(${len}) `);
  }

  function _formatMapOrSet(value, label, opts, depth, stack) {
    stack.push(value);
    var entries;
    if (label === "Map") {
      entries = Array.from(value.entries()).slice(0, opts.maxArrayLength).map(function (pair) {
        var k = pair[0], v = pair[1];
        return `${_formatValue(k, opts, depth + 1, stack, false)} => `
             + `${_formatValue(v, opts, depth + 1, stack, false)}`;
      });
    } else {
      entries = Array.from(value.values()).slice(0, opts.maxArrayLength).map(function (v) {
        return _formatValue(v, opts, depth + 1, stack, false);
      });
    }
    var total = value.size;
    if (total > opts.maxArrayLength) entries.push(`... ${total - opts.maxArrayLength} more items`);
    stack.pop();
    return _wrapEntries(entries, "{", "}", depth, opts, `${label}(${total}) `);
  }


  // plain objects --------------------------------------------------------------------------------
  function _getConstructorName(value) {
    var proto = Object.getPrototypeOf(value);
    if (proto === null) return null; // signals "null prototype" object
    var ctor = value.constructor;
    if (typeof ctor === "function" && ctor.name) return ctor.name;
    return "Object";
  }

  function _formatObject(value, opts, depth, stack) {
    var ctorName = _getConstructorName(value);
    var prefix;
    if (ctorName === null) {
      prefix = "[Object: null prototype] ";
    } else if (ctorName === "Object") {
      prefix = "";
    } else {
      prefix = `${ctorName} `;
    }

    stack.push(value);
    var keys = Object.keys(value);
    var entries = keys.slice(0, opts.maxArrayLength).map(function (key) {
      var valStr;
      try {
        valStr = _formatValue(value[key], opts, depth + 1, stack, false);
      } catch (err) {
        valStr = `[Getter threw: ${err && err.message}]`;
      }
      return `${_formatKey(key)}: ${valStr}`;
    });
    if (keys.length > opts.maxArrayLength) {
      entries.push(`... ${keys.length - opts.maxArrayLength} more keys`);
    }
    stack.pop();

    return _wrapEntries(entries, "{", "}", depth, opts, prefix);
  }

  function _depthLimitLabel(value) {
    if (_.isArray(value)) return "[Array]";
    if (_.isMap(value)) return "[Map]";
    if (_.isSet(value)) return "[Set]";
    var name = _getConstructorName(value);
    return `[${name === null ? "Object" : name}]`;
  }


  // auto-wrap long iterables ---------------------------------------------------------------------
  function _wrapEntries(entries, open, close, depth, opts, prefix) {
    if (entries.length === 0) return `${prefix}${open}${close}`;

    var oneLine = `${prefix}${open} ${entries.join(", ")} ${close}`;
    if (oneLine.length <= opts.lineWidth && oneLine.indexOf("\n") === -1) {
      return oneLine;
    }

    var innerIndent = new Array((depth + 1) * opts.indent + 1).join(" ");
    var closeIndent = new Array(depth * opts.indent + 1).join(" ");
    return `${prefix}${open}\n${innerIndent}${entries.join(`,\n${innerIndent}`)}\n${closeIndent}${close}`;
  }


  // public API
  return { stringify };
})();


// the actual logger
window.logger = (function()
{
  let _appLogEntryTTL = 10; // seconds
  let _appLogEntries = [];
  const _maxStoredEntries = 256;


  function _browserConsoleLog(severity, module, time, data) {
    const prefix = `[${time.toISOString().slice(11, 19)} `
                 + `${severity.toUpperCase()} in ${module}]`;
    switch (severity) {
      case "debug": return console.debug(prefix, ...data);
      case "info":  return console.log(prefix, ...data);
      case "warn":  return console.warn(prefix, ...data);
      case "error": return console.error(prefix, ...data);
      default:
        throw new Error(`Unsupported logging severity '${severity}'`);
    }
  }


  function _evictOldEntries(nowOverride = null) {
    const now = nowOverride ?? new Date();
    // delete old ones
    _appLogEntries = _appLogEntries.filter(x => {
      return (now - x.time) / 1000 <= _appLogEntryTTL;
    });
    // trim to max length if needed
    if (_appLogEntries.length > _maxStoredEntries) {
      _appLogEntries.splice(0, _appLogEntries.length - _maxStoredEntries);
    }
  }


  function appLoggerRender() {
    // skip the render if we're not actually on the page
    if (nav.getCurrentPage() !== "home") return;

    const logContainer = utils.qs("#home-log");
    utils.removeChildren(logContainer);
    for (const logEntry of _appLogEntries) {
      logContainer.append(logEntry.node);
    }
  }


  function _appLoggerLog(severity, module, time, data) {
    _evictOldEntries(time);

    const entryWrapper = document.createElement("div");
    entryWrapper.className = "desktop-panel log-entry";
    entryWrapper.classList.add(`log-entry-${severity}`);
    entryWrapper.dataset.time = time.toISOString();
    entryWrapper.insertAdjacentHTML("beforeend",
      `<div class="log-entry-header">
        <span class="log-entry-severity"><b>${severity.toUpperCase()}</b></span>
        at
        <span class="log-entry-timestamp">${time.toISOString().slice(11, 19)}</span>
        <p class="tiny-p log-entry-module"><span>${module}</span></p>
      </div>
      <details>
        <summary>Show details</summary>
        <div class="flex-c f-g8"></div>
      </details>`);
    const details = entryWrapper.querySelector("details div");
    let isFirst = true;
    for (const item of data) {
      if (!isFirst) details.insertAdjacentHTML("beforeend", "<hr>");
      details.insertAdjacentHTML("beforeend",
        `<pre>${serialiser.stringify(item, {}, true)}</pre>`
      );
      isFirst = false;
    }
    
    _appLogEntries.push({ time, severity, node: entryWrapper });
    appLoggerRender();
  }


  function init() {
    const container = utils.qs("#home-logging");

    // on clicking the sort button, toggle ASC / DESC
    container.querySelector(".log-sorter").addEventListener("click", function() {
      const newDir = this.dataset.dir === "desc" ? "asc" : "desc";
      this.dataset.dir = newDir;
      container.querySelector(".log-container").dataset.sort = newDir;
    });

    // severity filter
    container.querySelector(".log-filter").addEventListener("change", function() {
      const newFilter = this.value;
      container.querySelector(".log-container").dataset.show = newFilter;
    });
  }


  /** Log a message using the app's custom logger.
   * 
   * @param {string} module identifies the module asking for a
   *  logging operation
   * @param {any[]} data objects to pre-format and
   *  include in the message
   * @param {"debug"|"info"|"warn"|"error"} [severity="info"]
   */
  function log(module, data, severity = "info") {
    const now = new Date();
    _browserConsoleLog(severity, module, now, data);
    _appLoggerLog(severity, module, now, data);
  }


  /** @param {string} module @param {...any} data */
  function debug(module, ...data) { return log(module, data, "debug"); }

  /** @param {string} module @param {...any} data */
  function info(module, ...data) { return log(module, data, "info"); }

  /** @param {string} module @param {...any} data */
  function warn(module, ...data) { return log(module, data, "warn"); }

  /** @param {string} module @param {...any} data */
  function error(module, ...data) { return log(module, data, "error"); }


  // public API
  return {
    init,
    appLoggerRender,
    log,
    debug,
    info,
    warn,
    error,
  };
})();
