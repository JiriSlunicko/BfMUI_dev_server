/** An assortment of helpers for recurring UI features. */

window.ui = (function () {
  let _toastContainerInitialised = false;
  let _rangeTextPairsInitialised = false;

  let _toastFadeTimeout = null;
  let _toastKillTimeout = null;


  /** Call this once on app load. */
  function initToastContainer() {
    if (_toastContainerInitialised) return;

    const toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
    _toastContainerInitialised = true;
  }


  /** Create a floating notification.
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


  /** Create a custom alert/confirm modal.
   * Returns a Promise if successful, or false if another such window is open.
   * 
   * @param {"alert"|"confirm"|"prompt"} type which native popup to emulate
   * @param {string} msg the main text
   * @param {string|null} title optional heading
   * @returns {Promise<boolean>|Promise<string|null>|false}
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

      // title & main text
      let html = "";
      if (title) html += `<h3>${title}</h3>`;
      html += `<p>${msg.replaceAll("\n", "<br />")}</p>`;

      // prompt only: text input
      if (type === "prompt") {
        html += `<input type="text" id="modal-text-input" class="w100 mb16" placeholder="(your input here)" />`;
      }

      // button ribbon
      html += `<div class="flex-r f-j-c f-g8">`;
      html += `<button type="button" class="btn" id="modal-ok-btn">Ok</button>`;
      if (type !== "alert") {
        html += `<button type="button" class="btn" id="modal-cancel-btn">Cancel</button>`;
      }
      html += `</div>`;

      // assemble everything
      fg.innerHTML = html;
      bg.appendChild(fg);
      document.body.append(bg);

      const focusElement = type === "prompt"
        ? utils.qs("#modal-text-input")
        : utils.qs("#modal-ok-btn");
      focusElement.focus();

      // cancel by clicking the background
      if (type !== "alert") {
        bg.addEventListener("click", function(e) {
          if (e.target === this) {
            this.remove();
            resolve(type === "prompt" ? null : false);
          }
        });
      }
      // cancel via the cancel button
      if (type !== "alert") {
        fg.querySelector("#modal-cancel-btn").onclick = () => {
          bg.remove();
          resolve(type === "prompt" ? null : false);
        }
      }

      // submit
      fg.querySelector("#modal-ok-btn").onclick = () => {
        if (type === "prompt") {
          const userInput = utils.qs("#modal-text-input")?.value;
          if (userInput === undefined)
            console.error("Prompt modal resolved when it didn't exist.");

          bg.remove();
          resolve(userInput || "");
        } else {
          bg.remove();
          resolve(true);
        }
      }
    });
  }


  /** Prepare a linked range & text input pair for DOM insertion.
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
  function makeRangeTextInputPair(valueName, title, config, labelClass = "") {
    // create elements
    const label = document.createElement("label");
    label.setAttribute("for", valueName + "-text");
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
      rangeInput.setAttribute("value", utils.textInputToRange(
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
    if (_rangeTextPairsInitialised) return;

    // range -> text
    document.addEventListener("input", function (e) {
      const rangeInput = e.target.closest(".range-text-pair input[type=range]");
      if (!rangeInput) return;

      const pairWrapper = rangeInput.closest(".range-text-pair");
      const minVal = Number(pairWrapper.dataset.min);
      const maxVal = Number(pairWrapper.dataset.max);
      const decimals = pairWrapper.dataset.step.split(".")[1]?.length || 0;
      const isLog = Boolean(pairWrapper.dataset.log);

      const textInput = pairWrapper.querySelector("input[type=text]");
      // apply scaled value to text input
      textInput.value = utils.rangeToTextInput(rangeInput.value,
        isLog ? { min: minVal, max: maxVal } : null,
        decimals
      );
      pairWrapper.dispatchEvent(
        new CustomEvent("slider-change", {
          detail: { value: textInput.value },
          bubbles: true
        })
      );
    });

    // text -> range
    document.addEventListener("change", function (e) {
      const textInput = e.target.closest(".range-text-pair input[type=text]");
      if (!textInput) return;

      const pairWrapper = textInput.closest(".range-text-pair");
      const minVal = Number(pairWrapper.dataset.min);
      const maxVal = Number(pairWrapper.dataset.max);
      const decimals = pairWrapper.dataset.step.split(".")[1]?.length || 0;
      const isLog = Boolean(pairWrapper.dataset.log);

      const rangeInput = pairWrapper.querySelector("input[type=range]");

      const newVal = utils.textInputToRange(textInput.value,
        minVal, maxVal, isLog, isLog ? 1 : decimals
      );
      if (newVal === null) {
        // revert text input to range value, which should always be safe
        textInput.value = utils.rangeToTextInput(rangeInput.value,
          isLog ? { min: minVal, max: maxVal } : null,
          decimals
        );
      } else {
        // apply scaled value to range slider
        rangeInput.value = newVal;
      }
      pairWrapper.dispatchEvent(
        new CustomEvent("slider-change", {
          detail: { value: textInput.value },
          bubbles: true
        })
      );
    });

    _rangeTextPairsInitialised = true;
  }


  // public API
  return {
    initToastContainer,
    makeToast,
    removeToast,
    makePopup,
    makeRangeTextInputPair,
    initRangeTextPairLinks,
  }
})();
