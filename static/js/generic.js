document.addEventListener("DOMContentLoaded", () => {
  const toastContainer = document.createElement("div");
  toastContainer.className = "toast-container";
  document.body.appendChild(toastContainer);
});

/**
 * Create a floating notification.
 * @param {"error"|"success"|null} type error -> red stripe, success -> green stripe, null -> neutral stripe
 * @param {string} msg arbitrary text
 * @param {Number} timeout how long to show in ms, negative numbers -> indefinitely
 */
function makeToast(type, msg, timeout=2500) {
  removeToast();
  const tst = document.createElement("div");
  tst.className = "break-word toast" + (type === "error" ? " toast-err" : (type === "success" ? " toast-ok" : ""));
  tst.innerHTML = msg.replaceAll("\n", "<br />");
  qs(".toast-container").appendChild(tst);
  if (timeout >= 0) {
    g.util.toastFadeTimeout = setTimeout(() => {
      qs(".toast").classList.add("fading");
    }, timeout);
    g.util.toastDieTimeout = setTimeout(() => {
      removeToast();
    }, timeout + 500);
  }
}
function removeToast() {
  qsa(".toast").forEach(el => el.remove());
  if (g.util.toastFadeTimeout !== null) {
    clearTimeout(g.util.toastFadeTimeout);
    g.util.toastFadeTimeout = null;
  }
  if (g.util.toastDieTimeout !== null) {
    clearTimeout(g.util.toastDieTimeout);
    g.util.toastDieTimeout = null;
  }
}

/**
 * Create a custom alert/confirm modal.
 * Returns a Promise if successful, or
 * false if another window is open.
 * @param {"alert"|"confirm"} type 'alert' or 'confirm'
 * @param {string} msg the main text
 * @param {string|null} title optional heading
 * @returns {Promise<Boolean>|false}
 */
function makePopup(type, msg, title=null) {
  if (qs(".modal-bg")) {
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
    html +=   `<button type="button" class="btn" id="modal-ok-btn">Ok</button>`;
    if (type === "confirm") {
      html += `<button type="button" class="btn" id="modal-cancel-btn">Cancel</button>`;
    }
    html += `</div>`

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
  })
}

/**
 * Attempt to fetch a resource, failing after a specified timeout.
 * @param {string} url 
 * @param {Number} [timeout=5000] time limit in ms, default 5000
 * @param {object} [opts={}] standard fetch API options object
 * @returns {Promise}
 */
async function fetchWithTimeout(url, timeout = 5000, opts = {}) {
  const ctrl = new AbortController();
  const signal = ctrl.signal;

  const timeoutId = setTimeout(() => ctrl.abort(), timeout);

  try {
    const raw = await fetch(url, { ...opts, signal });
    clearTimeout(timeoutId);
    return raw;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out at " + new Date());
    }
    throw err;
  }
}

/**
 * Attempt to make a POST request, failing after a specified timeout.
 * @param {string} url 
 * @param {object|Array|null} payload 
 * @param {Number} [timeout=5000]
 * @returns {Promise}
 */
async function postWithTimeout(url, payload, timeout = 5000) {
  return fetchWithTimeout(url, timeout, {
    method: "POST",
    body: JSON.stringify(payload),
    //headers: {"Content-Type": "application/json"}
  });
}

/**
 * Update or create a data entry.
 * @param {string} parentSelector immediate parent for the entry
 * @param {string} entryId key identifying the list entry
 * @param {string} header heading of the section
 * @param {object} data key-value data pairs
 * @param {"Healthy"|"Struggling"|"Broken"|"Inactive"|null} health optional, draws a coloured circle in the header
 * @param {string|null} lastError arbitrary error message to append to the entry
 */
function createOrUpdateEntry(parentSelector, entryId, header, data, health=null, lastError=null) {
  const container = qs(parentSelector);
  if (!container) {
    console.error("Tried to edit entries of '"+parentSelector+"', but it does not exist.");
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
        ${health ? '<span class="health f-noshrink"></span>' : ''}
      </div>
      <div class="entry-items"></div>
      <div class="entry-error"></div>`;
    container.appendChild(el);
  }

  // update health
  if (health) {
    const healthSpan = el.querySelector(".health");
    if (healthSpan) {
      healthSpan.className = "health " + health.toLowerCase() + " f-noshrink";
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

/**
 * Iterate over existing entries in the DOM and remove ones not on the list.
 * @param {string} parentSelector immediate parent for entries
 * @param {Array<string>} liveEntryIds entry IDs to keep
 */
function clearDeadEntries(parentSelector, liveEntryIds) {
  const container = qs(parentSelector);
  if (!container) {
    console.error("Tried to edit entries of '"+parentSelector+"', but it does not exist.");
    return;
  }

  container.querySelectorAll(".entry-wrapper").forEach(el => {
    if (!liveEntryIds.includes(el.dataset.entryId)) {
      el.remove();
    }
  });
}