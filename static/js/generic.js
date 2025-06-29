/**
 * An assortment of functions that are expected to be required across contexts.
 * These generally have no inherent dependencies, everything is injected.
 */


// generic utility functions and helpers
window.utils = (function()
{
  /**
   * Map values between 0 and 100 to min-max logarithmically or exponentially.
   * @param {number} min output at 0%
   * @param {number} max output at 100%
   * @param {number} percent input 0–100
   * @param {number} [curve=4] 1 = linear, higher = more resolution near min
   * @returns {number} scaled value
   */
  function percentToExp(min, max, percent, curve = 4) {
    if (min >= max || percent < 0 || percent > 100) {
      throw new Error(`invalid params: ${min}-${max}, ${percent}`);
    }

    const t = percent / 100;
    const adjusted = Math.pow(t, curve);
    return min + (max - min) * adjusted;
  }


  /**
   * Map exponential values between min-max to 0–100 slider percentage.
   * @param {number} min input min -> 0
   * @param {number} max input max -> 100
   * @param {number} value actual value
   * @param {number} [curve=4] 1 = linear, higher = more resolution near min
   * @returns {number} slider percent (0–100)
   */
  function expToPercent(min, max, value, curve = 4) {
    if (min >= max || value < min || value > max) {
      throw new Error(`invalid params: ${min}-${max}, ${value}`);
    }

    const linearT = (value - min) / (max - min);
    const percent = Math.pow(linearT, 1 / curve);
    return percent * 100;
  }


  /**
   * Transform a range value to a text input value.
   * @param {number} val current range input value
   * @param {{min: number, max: number }|null} logScaling parameters for log scaling; null = linear
   * @param {number|null} decimals fixed number of decimals, null = not applied
   * @returns {number}
   */
  function rangeToText(val, logScaling=null, decimals=null) {
    const resolvedValue =
      logScaling
      ? percentToExp(logScaling.min, logScaling.max, val)
      : Number(val);
    return (
      decimals === null
      ? resolvedValue
      : resolvedValue.toFixed(decimals)
    );
  }


  /**
   * Attempt to map a text input value to a range value. Returns null on invalid input.
   * @param {string} val current text input value
   * @param {number} min lowest permissible value
   * @param {number} max highest permissible value
   * @param {boolean} isLog whether to apply logarithmic scaling
   * @param {number|null} decimals fixed number of decimals, null = not applied
   * @returns {number|null} null on failure
   */
  function textToRange(val, min, max, isLog=false, decimals=null) {
    const numVal = Number(val);
    if (isNaN(numVal) || numVal < min || numVal > max) {
      ui.makeToast("error", `Value must be a number between ${min} and ${max}!`);
      return null;
    }
    const resolvedValue =
      isLog
      ? expToPercent(min, max, numVal)
      : numVal;
    return (
      decimals === null
      ? resolvedValue
      : resolvedValue.toFixed(decimals)
    );
  }


  return {
    qs: (sel) => document.querySelector(sel),
    qsa: (sel) => document.querySelectorAll(sel),
    rangeToText,
    textToRange,
  }
})();


// functionality related to the user interface
window.ui = (function()
{
  let _toastFadeTimeout = null;
  let _toastKillTimeout = null;

  /**
   * Create a floating notification.
   * 
   * @param {"error"|"success"|null} type affects stripe colour only
   * @param {string} msg arbitrary text
   * @param {number} timeout how long to show in ms, negative numbers -> indefinitely
   */
  function makeToast(type, msg, timeout = 2500) {
    removeToast();
    const tst = document.createElement("div");
    tst.className = "break-word toast" + (type === "error" ? " toast-err" : (type === "success" ? " toast-ok" : ""));
    tst.innerHTML = msg.replaceAll("\n", "<br />");
    utils.qs(".toast-container").appendChild(tst);
    if (timeout >= 0) {
      _toastFadeTimeout = setTimeout(() => {
        utils.qs(".toast").classList.add("fading");
      }, timeout);
      _toastKillTimeout = setTimeout(() => {
        removeToast();
      }, timeout + 500);
    }
  }


  /** Remove any existing notifications. */
  function removeToast() {
    utils.qsa(".toast").forEach(el => el.remove());
    if (_toastFadeTimeout !== null) {
      clearTimeout(_toastFadeTimeout);
      _toastFadeTimeout = null;
    }
    if (_toastKillTimeout !== null) {
      clearTimeout(_toastKillTimeout);
      _toastKillTimeout = null;
    }
  }


  /**
   * Create a custom alert/confirm modal. Returns a Promise if successful,
   * or false if another such window is open.
   * 
   * @param {"alert"|"confirm"} type 'alert' or 'confirm'
   * @param {string} msg the main text
   * @param {string|null} title optional heading
   * @returns {Promise<Boolean>|false}
   */
  function makePopup(type, msg, title = null) {
    if (utils.qs(".modal-bg")) {
      console.error("Tried to open a modal while one was already present.");
      return false;
    }

    return new Promise(resolve => {
      const bg = document.createElement("div");
      bg.className = "modal-bg flex-c f-a-c";
      const fg = document.createElement("div");
      fg.className = "modal-fg flex-c f-a-c";

      let html = "";
      if (title) html += `<h3>${title}</h3>`;
      html += `<p>${msg}</p>`;
      html += `<div class="flex-r f-j-c f-g8">`;
      html += `<button type="button" class="btn" id="modal-ok-btn">Ok</button>`;
      if (type === "confirm") {
        html += `<button type="button" class="btn" id="modal-cancel-btn">Cancel</button>`;
      }
      html += `</div>`;

      fg.innerHTML = html;
      bg.appendChild(fg);
      document.body.append(bg);

      fg.querySelector("#modal-ok-btn").onclick = () => {
        bg.remove();
        resolve(true);
      }
      if (type === "confirm") {
        fg.querySelector("#modal-cancel-btn").onclick = () => {
          bg.remove();
          resolve(false);
        }
      }
    });
  }


  /**
   * Prepare a linked range & text input pair for DOM insertion.
   * 
   * @param {string} valueName used for element IDs - will create "value-name-range" & "value-name-text"
   * @param {string} title display name of the UI element
   * @param {{
   *  bounds: { min: number, max: number },
   *  step: number,
   *  value: number,
   *  scaling: ("linear"|"logarithmic"),
   *  textInputClassOverride?: (string|null),
   * }} config sets how the range-textinput pair should behave
   * @param {string} [labelClass=""] additional classes to apply to the label 
   * @returns {string} HTML string
   */
  function makeRangeTextInputPair(valueName, title, config, labelClass="") {
    // create elements
    const label = document.createElement("label");
    label.setAttribute("for", valueName+"-text");
    label.className = "range-text-pair" + (labelClass ? ` ${labelClass}` : "");
    label.insertAdjacentHTML("beforeend", `<span>${title}</span>`);

    const inputWrapper = document.createElement("div");
    inputWrapper.className = "flex-r f-g16";

    const rangeInput = document.createElement("input");
    rangeInput.setAttribute("type", "range");
    rangeInput.id = valueName + "-range";
    rangeInput.className = "f-grow";

    const textInput = document.createElement("input");
    textInput.setAttribute("type", "text");
    textInput.id = valueName + "-text";
    textInput.className = "w4ch";

    // apply config
    if (config.textInputClassOverride !== undefined && config.textInputClassOverride !== null) {
      textInput.className = config.textInputClassOverride;
    }
    try {
      const minScaled = config.bounds.min;
      const maxScaled = config.bounds.max;
      const step = (config.step || 1).toString();
      const stepDecimals = step.split(".")[1]?.length || 0;
      const usesLogScaling = config.scaling === "logarithmic";

      label.dataset.min = minScaled;
      label.dataset.max = maxScaled;
      label.dataset.step = config.step || 1;
      label.dataset.log = usesLogScaling ? "1" : "";

      textInput.setAttribute("value", Number(config.value).toFixed(stepDecimals));
      rangeInput.setAttribute("value", utils.textToRange(
        config.value, minScaled, maxScaled, usesLogScaling,
        usesLogScaling ? 1 : stepDecimals)
      );
      rangeInput.setAttribute("min", usesLogScaling ? 0 : minScaled);
      rangeInput.setAttribute("max", usesLogScaling ? 100 : maxScaled);
      rangeInput.setAttribute("step", usesLogScaling ? 0.1 : step);
    } catch (err) {
      console.error("Invalid config passed to makeRangeTextInputPair.", config, err);
      return "";
    }

    // put it all together and return the HTML
    inputWrapper.appendChild(rangeInput);
    inputWrapper.appendChild(textInput);
    label.appendChild(inputWrapper);
    return label.outerHTML;
  }


  /** Call this once on DOM load to link range & text input pairs. */
  function initRangeTextPairLinks() {
    // range -> text
    document.addEventListener("input", function(e) {
      const rangeInput = e.target.closest(".range-text-pair input[type=range]");
      if (!rangeInput) return;

      const pairWrapper = rangeInput.closest(".range-text-pair");
      const minVal = Number(pairWrapper.dataset.min);
      const maxVal = Number(pairWrapper.dataset.max);
      const decimals = pairWrapper.dataset.step.split(".")[1]?.length || 0;
      const isLog = Boolean(pairWrapper.dataset.log);

      const textInput = pairWrapper.querySelector("input[type=text]");
      // apply scaled value to text input
      textInput.value = utils.rangeToText(rangeInput.value,
        isLog ? { min: minVal, max: maxVal } : null,
        decimals
      );
    });
    // text -> range
    document.addEventListener("change", function(e) {
      const textInput = e.target.closest(".range-text-pair input[type=text]");
      if (!textInput) return;

      const pairWrapper = textInput.closest(".range-text-pair");
      const minVal = Number(pairWrapper.dataset.min);
      const maxVal = Number(pairWrapper.dataset.max);
      const decimals = pairWrapper.dataset.step.split(".")[1]?.length || 0;
      const isLog = Boolean(pairWrapper.dataset.log);

      const rangeInput = pairWrapper.querySelector("input[type=range]");

      const newVal = utils.textToRange(textInput.value,
        minVal, maxVal, isLog, isLog ? 1 : decimals
      );
      if (newVal === null) {
        // revert text input to range value, which should by definition be safe
        textInput.value = utils.rangeToText(rangeInput.value,
          isLog ? { min: minVal, max: maxVal } : null,
          decimals
        );
      } else {
        // apply scaled value to range slider
        rangeInput.value = newVal;
      }
    });
  }


  // public API
  return {
    makeToast,
    removeToast,
    makePopup,
    makeRangeTextInputPair,
    initRangeTextPairLinks,
  }
})();


// functions for adding, updating and removing "entries" (boxes that show named data collections)
window.entries = (function()
{
  /**
   * Update or create a data entry.
   * 
   * @param {string} parentSelector immediate parent for the entry
   * @param {string} entryId key identifying the list entry
   * @param {string} header heading of the section
   * @param {object} data key-value data pairs
   * @param {"Healthy"|"Struggling"|"Broken"|"Inactive"|null} health optional, draws a coloured circle in the header
   * @param {string|null} lastError arbitrary error message to append to the entry
   */
  /*
  function createOrUpdate(parentSelector, entryId, header, data, health = null, lastError = null) {
    const container = utils.qs(parentSelector);
    if (!container) {
      console.error("Tried to edit entries of '" + parentSelector + "', but it does not exist.");
      return;
    }

    const existing = container.querySelector(`.entry-wrapper[data-entry-id="${entryId}"]`);
    let el;
    if (existing) {
      el = existing;
    } else { // create the entry if it does not exist yet
      el = document.createElement("div");
      el.className = "entry-wrapper";
      el.dataset.entryId = entryId;
      el.innerHTML = `
      <div class="entry-header flex-r f-a-c">
        <span>${header}</span>
        ${health ? '<span class="health f-noshrink mla"></span>' : ''}
      </div>
      <div class="entry-items"></div>
      <div class="entry-error"></div>`;
      container.appendChild(el);
    }

    // update health
    if (health) {
      const healthSpan = el.querySelector(".health");
      if (healthSpan) {
        healthSpan.className = "health " + health.toLowerCase() + " f-noshrink mla";
      }
    }
    // update items
    const items = el.querySelector(".entry-items");
    let newHtml = "";
    for (const [key, value] of Object.entries(data)) {
      newHtml += `
      <div class="entry-item flex-r">
        <span class="entry-item-key">${key}</span>
        <span class="entry-item-value">${value}</span>
      </div>`;
    }
    items.innerHTML = newHtml;
    // update error
    if (lastError) {
      const errorDiv = el.querySelector(".entry-error");
      if (errorDiv) {
        errorDiv.innerText = lastError;
      }
    }
  }
  */


  /**
   * Iterate over existing entries in the DOM and remove ones not on the list.
   * 
   * @param {string} parentSelector immediate parent for entries
   * @param {Array<string>} liveEntryIds entry IDs to keep
   */
  /*
  function cleanUpDangling(parentSelector, liveEntryIds) {
    const container = utils.qs(parentSelector);
    if (!container) {
      console.error("Tried to edit entries of '" + parentSelector + "', but it does not exist.");
      return;
    }

    container.querySelectorAll(".entry-wrapper").forEach(el => {
      if (!liveEntryIds.includes(el.dataset.entryId)) {
        el.remove();
      }
    });
  }
  */


  /**
   * New system: use the (n+1)-th entry if available, otherwise create one 
   * 
   * @param {string} parentSelector immediate parent for the entry
   * @param {number} n index of the entry
   * @param {string} header heading of the section
   * @param {object} data key-value data pairs
   * @param {"Healthy"|"Struggling"|"Broken"|"Inactive"|null} health optional, draws a coloured circle in the header
   * @param {string|null} lastError arbitrary error message to append to the entry
   */
  function reuseOrCreate(parentSelector, n, header, data, health=null, lastError=null) {
    const container = utils.qs(parentSelector);
    if (!container) {
      console.error("Tried to edit entries of '"+parentSelector+"', which does not exist.");
      return;
    }

    const existing = container.querySelectorAll(".entry-wrapper");
    let entry;
    if (n < existing.length) {
      entry = existing[n];
    } else { // create new entry
      entry = document.createElement("div");
      entry.className = "entry-wrapper";
      entry.innerHTML = `
      <div class="entry-header flex-r f-a-c">
        <span>${header}</span>
      </div>
      <div class="entry-items"></div>
      <div class="entry-error"></div>`;
      container.appendChild(entry);
    }

    // update header & health
    const healthClassName = health ? ("health "+health.toLowerCase()+" f-noshrink mla") : "";
    entry.querySelector(".entry-header").innerHTML = `
    <span>${header}</span>
    ${health ? '<span class="'+healthClassName+'"></span>' : ''}`;

    // update items
    const items = entry.querySelector(".entry-items");
    let newHtml = "";
    for (const [key, value] of Object.entries(data)) {
      newHtml += `
      <div class="entry-item flex-r">
        <span class="entry-item-key">${key}</span>
        <span class="entry-item-value">${value}</span>
      </div>`;
    }
    items.innerHTML = newHtml;

    // update error
    entry.querySelector(".entry-error").innerText = lastError || "";
  }


  /**
   * New system: remove UI entries that extend beyond the specified length.
   * 
   * @param {string} parentSelector immediate parent for the entries
   * @param {number} maxLength how many entries to keep in the DOM
   */
  function trimList(parentSelector, maxLength) {
    const container = utils.qs(parentSelector);
    if (!container) {
      console.error("Tried to edit entries of '" + parentSelector + "', which does not exist.");
      return;
    }

    const entries = container.querySelectorAll(".entry-wrapper");
    if (maxLength >= entries.length) {
      return; // no trimming needed
    }

    for (let i = maxLength; i < entries.length; i++) {
      entries[i].remove();
    }
  }
  

  // public API
  return {
    //createOrUpdate,
    //cleanUpDangling,
    reuseOrCreate,
    trimList,
  }
})();


// event handling
window.events = (function()
{
  /** Connect to the backend server's event dispatcher.
   * @param {object} globalServer backend - will be updated
   */
  function openStream(globalServer) {
    closeStream(globalServer);
    globalServer.eventStream = new EventSource(globalServer.baseurl + "/events/");
    globalServer.eventStream.onmessage = (msg) => {
      let asJson = null;
      try {
        asJson = JSON.parse(msg.data);
      } catch (err) {
        console.error("Event source received a message that's not valid JSON.", msg, err);
        return;
      }

      if (asJson.Events && asJson.Events.length) {
        _processEvents(asJson.Events);
      }
    }
  }


  /** Handle any events that came with a message from the backend.
   * @param {array<string>} eventArray
   */
  function _processEvents(eventArray) {
    for (const backendEvent of eventArray) {
      switch (backendEvent) {
        case "AvailableSerialPortsChanged":
          pages.settings.updateArduinoSettings();
          break;
      }
    }
  }


  /** Close an open event stream.
   * @param {object} globalServer backend - will be updated
   */
  function closeStream(globalServer) {
    if (globalServer.eventStream) {
      globalServer.eventStream?.close();
      globalServer.eventStream = null;
    }
  }


  // public API
  return {
    openStream,
    closeStream,
  }
})();