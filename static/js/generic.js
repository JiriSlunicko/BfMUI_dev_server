/**
 * An assortment of functions that are expected to be required across contexts.
 * These generally have no inherent dependencies, everything is injected.
 */


// generic utility functions and helpers
window.utils = (function()
{
  /**
   * Map values between 0 and 100 to min-max logarithmically.
   * 
   * @param {number} min output value for input 0 (must be >0)
   * @param {number} max output value for input 100
   * @param {number} actual input value
   * @returns {number}
   */
  function percentToLog(min, max, actual) {
    if (min <= 0 || max <= min || actual < 0 || actual > 100) {
      throw new Error(`invalid parameters: ${min}-${max}, ${actual}`);
    }
    const minLog = Math.log10(min);
    const maxLog = Math.log10(max);
    const actualFrac = actual / 100;
    const logVal = Math.pow(10, minLog + (maxLog - minLog) * actualFrac);
    return logVal.toFixed(2);
  }


  /**
   * Map logarithmically distributed values between min and max to 0-100.
   * 
   * @param {number} min input value for output 0 (must be >0)
   * @param {number} max input value for output 100
   * @param {number} actual input value
   * @returns {number}
   */
  function logToPercent(min, max, actual) {
    if (min <= 0 || max <= min || actual < min || actual > max) {
      throw new Error(`invalid parameters: ${min}-${max}, ${actual}`);
    }
    const minLog = Math.log10(min);
    const maxLog = Math.log10(max);
    const logVal = Math.log10(actual);
    const scale = (logVal - minLog) / (maxLog - minLog);
    return Math.min(100, Math.max(0, scale * 100));
  }

  return {
    qs: (sel) => document.querySelector(sel),
    qsa: (sel) => document.querySelectorAll(sel),
    percentToLog,
    logToPercent,
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


  // public API
  return {
    makeToast,
    removeToast,
    makePopup,
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
    if (globalServer.eventStream) {
      globalServer.eventStream.close();
    }
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


  // public API
  return {
    openStream,
  }
})();