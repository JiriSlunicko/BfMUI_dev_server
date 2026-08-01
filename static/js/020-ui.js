/** An assortment of helpers for recurring UI features. */

window.ui = (function ()
{
  let _rangeTextPairsInitialised = false;

  let _toastFadeTimeout = null;
  let _toastKillTimeout = null;


  /** Create a floating notification.
   * 
   * @param {"error"|"success"|null} type affects stripe colour only
   * @param {string} msg arbitrary html content, \n converted to \<br /\> automatically
   * @param {number} [timeout=2500] how long to show in ms, negative -> indefinitely
   */
  function makeToast(type, msg, timeout = 2500) {
    removeToast();

    const toast = document.createElement("div");
    toast.className = "break-word toast"
    switch (type) {
      case "error":   toast.className += " toast-err"; break;
      case "success": toast.className += " toast-ok";  break;
    }
    toast.innerHTML = msg.replaceAll("\n", "<br />");
    utils.qs(".toast-container").appendChild(toast);

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
   * @param {string} msg arbitrary html content, \n converted to \<br /\> automatically
   * @param {string|null} [title=null] optional heading
   * @returns {Promise<boolean>|Promise<string|null>|false} instant false if a modal is
   *  already open, otherwise a Promise: alert -> true; confirm -> boolean;
   *  prompt -> string | null
   */
  function makePopup(type, msg, title = null) {
    if (utils.qs(".modal-bg")) {
      console.error("Tried to open a modal while one was already present.");
      return false;
    }

    return new Promise(resolve => {
      // overlay
      const bg = document.createElement("div");
      bg.className = "modal-bg flex-c f-a-c f-j-c";
      const fg = document.createElement("div");
      fg.className = "modal-fg flex-c f-a-c";

      // title & main text
      let html = title ? `<h3>${title}</h3>` : "";
      html += `<p>${msg.replaceAll("\n", "<br />")}</p>`;

      // prompt -> add text input
      if (type === "prompt") {
        html += `<input type="text" id="modal-text-input" class="w100 mb16"
                  placeholder="(your input here)" />`;
      }

      // button ribbon
      html += `<div class="flex-r f-j-c f-g8">`;
      // OK button
      html += `<button type="button" class="btn" id="modal-ok-btn">Ok</button>`;
      // non-alert -> add cancel button
      if (type !== "alert") {
        html += `<button type="button" class="btn" id="modal-cancel-btn">Cancel</button>`;
      }
      html += `</div>`;

      // assemble everything
      fg.innerHTML = html;
      bg.appendChild(fg);
      document.body.append(bg);

      // focus an appropriate control
      (type === "prompt"
        ? utils.qs("#modal-text-input")
        : utils.qs("#modal-ok-btn")
      ).focus();

      // a helper that cleans up and decides what cancel should resolve to
      const _resolve = (res) => {
        bg.remove();
        if (res === false && type === "prompt") {
          resolve(null);
        } else {
          resolve(res);
        }
      }

      // non-alert -> cancel via button or clicking the background
      if (type !== "alert") {
        bg.addEventListener("click", (e) => {
          if (e.target === bg) { _resolve(false); }
        });
        fg.querySelector("#modal-cancel-btn").addEventListener("click", () => {
          _resolve(false);
        });
      }

      // submit
      fg.querySelector("#modal-ok-btn").addEventListener("click", () => {
        if (type === "prompt") {
          const userInput = utils.qs("#modal-text-input")?.value;
          if (userInput === undefined) {
            console.error("Prompt modal resolved when it didn't exist. (what?)");
          }
          _resolve(userInput || "");
        } else {
          _resolve(true);
        }
      });
    });
  }


  /** Prepare a linked range & text input pair for DOM insertion.
   * 
   * @param {string} valueName this + "-range" & "-text" -> element IDs
   * @param {string} title display name of the UI element
   * @param {{
   *  bounds: { min: number, max: number },
   *  step: number,
   *  value: number,
   *  scaling: ("linear"|"logarithmic"),
   *  incrementButtons?: boolean,
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
    inputWrapper.className = "flex-r f-g16 f-a-str";

    const rangeInput = document.createElement("input");
    rangeInput.setAttribute("type", "range");
    rangeInput.id = valueName + "-range";
    rangeInput.className = "f-grow";

    const textInput = document.createElement("input");
    textInput.setAttribute("type", "text");
    textInput.id = valueName + "-text";
    textInput.className = "w4ch";

    // apply config
    if (!_.isNil(config.textInputClassOverride)) {
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
        config.value,
        minScaled,
        maxScaled,
        usesLogScaling,
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
    if (config.incrementButtons) {
      inputWrapper.insertAdjacentHTML("beforeend", `
        <button type="button" class="btn range-btn range-decr">▼</button>
        <button type="button" class="btn range-btn range-incr">▲</button>`);
    }
    inputWrapper.appendChild(textInput);
    label.appendChild(inputWrapper);
    return label.outerHTML;
  }


  /** Call this once on DOM load to link range & text input pairs. */
  function initRangeTextPairLinks() {
    if (_rangeTextPairsInitialised) return;

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
      textInput.value = utils.rangeToTextInput(
        rangeInput.value,
        isLog ? { min: minVal, max: maxVal } : null,
        decimals
      );
      pairWrapper.dispatchEvent(
        new CustomEvent("slider-change", {
          detail: {
            value: textInput.value,
            byUser: true,
          },
          bubbles: true,
        })
      );
    });

    // text -> range
    ["change", "backend-refresh"].forEach(eName =>
      document.addEventListener(eName, function(e) {
        const textInput = e.target.closest(".range-text-pair input[type=text]");
        if (!textInput) return;

        const pairWrapper = textInput.closest(".range-text-pair");
        const minVal = Number(pairWrapper.dataset.min);
        const maxVal = Number(pairWrapper.dataset.max);
        const decimals = pairWrapper.dataset.step.split(".")[1]?.length || 0;
        const isLog = Boolean(pairWrapper.dataset.log);

        const rangeInput = pairWrapper.querySelector("input[type=range]");

        const newVal = utils.textInputToRange(
          textInput.value,
          minVal,
          maxVal,
          isLog,
          isLog ? 1 : decimals
        );
        if (newVal === null) {
          // invalid -> revert text input to range value, which should always be safe
          textInput.value = utils.rangeToTextInput(
            rangeInput.value,
            isLog ? { min: minVal, max: maxVal } : null,
            decimals
          );
        } else {
          // apply scaled value to range slider
          rangeInput.value = newVal;
        }
        pairWrapper.dispatchEvent(
          new CustomEvent("slider-change", {
            detail: {
              value: textInput.value,
              byUser: e.type === "change",
            },
            bubbles: true,
          })
        );
      })
    );

    // decrement/increment buttons
    document.addEventListener("click", function(e) {
      const decrButton = e.target.closest(".range-decr");
      const incrButton = e.target.closest(".range-incr");
      if (!decrButton || !incrButton) return;

      const pairWrapper = e.target.closest(".range-text-pair");
      if (!pairWrapper) {
        console.error("Increment/decrement button not within a range-text input pair");
        return;
      }

      const textInput = pairWrapper.querySelector("input[type=text]");
      if (!textInput) {
        console.error("Increment/decrement button's wrapper has no text input");
        return;
      }

      const currentValue = Number(textInput.value);
      const minValue = Number(pairWrapper.dataset.min);
      const maxValue = Number(pairWrapper.dataset.max);
      const step = Number(pairWrapper.dataset.step);
      const fireEvent = (el) => {
        el.dispatchEvent(
          new Event("change", {
            bubbles: true,
          })
        );
      };

      if (decrButton && currentValue > minValue) {
        textInput.value = Math.max(currentValue - step, minValue);
        fireEvent(textInput);
      }
      else
      if (incrButton && currentValue < maxValue) {
        textInput.value = Math.min(currentValue + step, maxValue);
        fireEvent(textInput);
      }
    });

    _rangeTextPairsInitialised = true;
  }


  // public API
  return {
    makeToast,
    removeToast,
    makePopup,
    makeRangeTextInputPair,
    initRangeTextPairLinks,
  };
})();
