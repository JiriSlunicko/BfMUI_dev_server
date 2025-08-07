/** Interface for 'entries', i.e. DOM representations of named key-value pair collections. */

window.entries = (function () {
  /** Use the (n+1)-th entry if available, otherwise create one 
   * @param {string} parentSelector immediate parent for the entry
   * @param {number} n index of the entry
   * @param {string} header heading of the section
   * @param {object} data key-value data pairs
   * @param {"Healthy"|"Struggling"|"Broken"|"Inactive"|null} health optional, draws a coloured circle in the header
   * @param {string|null} lastError arbitrary error message to append to the entry
   */
  function reuseOrCreate(parentSelector, n, header, data, health = null, lastError = null) {
    const container = utils.qs(parentSelector);
    if (!container) {
      console.error("Tried to edit entries of '" + parentSelector + "', which does not exist.");
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
    const healthClassName = health ? ("health " + health.toLowerCase() + " f-noshrink mla") : "";
    entry.querySelector(".entry-header").innerHTML = `
    <span>${header}</span>
    ${health ? '<span class="' + healthClassName + '">' + health +'</span>' : ''}`;

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


  /** Remove UI entries that extend beyond the specified length.
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
    reuseOrCreate,
    trimList,
  }
})();
