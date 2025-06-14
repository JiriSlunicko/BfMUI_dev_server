window.pages.controls = (function () {
  let _loaded = false;

  let _loadInterval = null;

  let _controls = {
    buttons: [],
    inAxes: [],
    actions: [],
    outAxes: [],
    restrictions: {},
    actionMappings: {},
    axisMappings: {},
  };

  let _limits = {
    axisGain: { min: 0.01, max: 100, },
    axisDeadzone: { min: 0, max: 1, },
  }


  /** Lazy load the interface only when the user navigates to it. */
  function activate() {
    if (!_controls.actions.length && _loadInterval === null) {
      _loadInterval = setInterval(() => {
        if (globals.server.info) {
          _renderControlsInterface();
          clearInterval(_loadInterval);
          _loadInterval = null;
          _loaded = true;
        }
      }, 50);
    }
  }


  /** Load the current mappings from the server. Don't call on POST.
   * @returns {Boolean} */
  async function _fetchCtrlOptions() {
    ui.makeToast(null, "Loading control options...", -1);
    let raw, resp;

    try {
      raw = await ajax.fetchWithTimeout(globals.server.baseurl + "/settings/control/");
      resp = await raw.json();

      // array of strings (enum)
      _controls.buttons = resp.AvailableControllerButtons;
      // array of strings (enum)
      _controls.inAxes = resp.AvailableControllerAxes;
      // array of strings (enum)
      _controls.actions = resp.AvailableControlActions;
      // array of strings (enum)
      _controls.outAxes = resp.AvailablePlaneAxes;
      // { action -> input (button or 2 ", " separated buttons), ... }
      _controls.restrictions = resp.ControlActionsRestrictions;
      _controls.actionMappings = _convertActionMappings(resp.ControlActionsSettings);
      _controls.axisMappings = _convertAxisMappings(resp.PlaneAxesSettings);

      ui.makeToast("success", "Successfully loaded control options.");
      return true;
    } catch (err) {
      ui.makeToast("error", "Connection failed while loading control options.\n\n" + err, 5000);
      return false;
    }
  }


  /** Load the current mappings from the server and render them. Don't call on POST. */
  async function _renderControlsInterface() {
    if (!globals.server.baseurl) {
      ui.makeToast("error", "You need to connect to a server before tinkering with this.", 3000);
      return;
    }

    const loadSuccess = await _fetchCtrlOptions();

    if (loadSuccess) {
      _makeMappingList("button");
      _makeMappingList("axis");
      utils.qs("#controls-btn-wrapper").innerHTML = `
        <button type="button" class="btn" id="controls-submit-btn">Submit changes</button>
        <button type="button" class="btn" id="controls-reset-btn">Discard changes</button>
      `;
    } else {
      utils.qs("#controls-buttons-inner").innerHTML = "<p>Failed to fetch options.</p>";
      utils.qs("#controls-axes-inner").innerHTML = "<p>Failed to fetch options.</p>";
      utils.qs("#controls-btn-wrapper").innerHTML = "";
    }

    utils.qs("#view-controls").addEventListener("click", function (e) {
      const mapping = e.target.closest(".ctrl-wrapper");
      if (mapping) {
        _makeMappingModal(mapping);
        return;
      }

      const submitButton = e.target.closest("#controls-submit-btn");
      if (submitButton) {
        _submitMappings();
        return;
      }

      const cancelButton = e.target.closest("#controls-reset-btn");
      if (cancelButton) {
        if (cancelButton.classList.contains("primed-no")) {
          _makeMappingList("button");
          _makeMappingList("axis");
          utils.qs("#controls-submit-btn").classList.remove("primed-yes");
          utils.qs("#controls-reset-btn").classList.remove("primed-no");
        }
        return;
      }
    });
  }


  /**
   * Populate the relevant container with current input-output mappings.
   * @param {"button"|"axis"} kind 
   */
  function _makeMappingList(kind) {
    let container, outputs, mappings;
    switch (kind) {
      case "button":
        container = utils.qs("#controls-buttons-inner");
        outputs = _controls.actions;
        mappings = _controls.actionMappings;
        break;
      case "axis":
        container = utils.qs("#controls-axes-inner");
        outputs = _controls.outAxes;
        mappings = _controls.axisMappings;
        break;
    }

    Array.from(container.children).forEach(x => x.remove());
    const mappingsWrapper = document.createDocumentFragment();
    for (const output of outputs) {
      const mapping = mappings[output];

      const item = document.createElement("div");
      item.className = "entry-wrapper ctrl-wrapper";
      item.dataset.kind = kind;
      item.dataset.output = output;
      let mappingString;

      if (kind === "axis") {
        const mInAxis = mapping?.inAxis || "unbound";
        const mInvert = mapping?.invert || false;
        const mDeadzone = mapping?.deadzone || 0.0;
        const mMode = mapping?.mode || "direct";
        const mGain = typeof mapping?.gain === "number" ? mapping.gain : -1;
        item.dataset.mapping = mInAxis;
        item.dataset.inverted = mInvert;
        item.dataset.deadzone = mDeadzone;
        item.dataset.gain = mGain;
        mappingString = _stringifyAxisMapping(mInAxis, mInvert, mDeadzone, mMode, mGain);
      } else {
        const mButton = mapping?.button || "unbound";
        item.dataset.mapping = mButton;
        mappingString = mButton;
      }

      item.insertAdjacentHTML("beforeend", `
      <div class="entry-header ctrl-output">${output}</div>
      <div class="ctrl-input-current">${mappingString}</div>
    `);
      mappingsWrapper.appendChild(item);
    }
    container.append(mappingsWrapper);
  }


  /**
   * Create a modal for mapping controller inputs to plane outputs.
   * @param {Element} mapping .ctrl-wrapper for the mapping in DOM
   */
  function _makeMappingModal(mapping) {
    if (utils.qs(".modal-bg")) {
      console.error("Tried to open a control mapping modal while another modal was open.");
      return;
    }

    const kind = mapping.dataset.kind;
    const output = mapping.dataset.output;
    const currentInput = mapping.dataset.mapping.split(/\s*,\s*/);
    while (currentInput.length < 2) currentInput.push("unbound");

    const bg = document.createElement("div");
    bg.className = "modal-bg flex-c f-a-c";
    bg.dataset.output = output;
    const fg = document.createElement("div");
    fg.className = "modal-fg flex-c f-a-c";
    fg.insertAdjacentHTML("beforeend", `
    <h3 class="hal-center break-word">${output.replace(/([A-Z]+)/g, "<wbr />$1")}</h3>
    <p class="hal-center mb16">Select ${kind === "button"
        ? "0-2 buttons. If 2 are selected, both need to be pressed simultaneously."
        : "input axis and its parameters."}</p>
  `);

    const priSelect = _makeInputSelect(
      "ctrl-input-primary",
      kind === "button" ? _controls.buttons : _controls.inAxes,
      currentInput[0]
    );
    fg.appendChild(priSelect);

    if (kind === "button") {
      const secSelect = _makeInputSelect("ctrl-input-secondary", _controls.buttons, currentInput[1]);
      fg.appendChild(secSelect);
    } else {
      const inverted = mapping.dataset.inverted === "false" ? false : true;
      const deadzone = mapping.dataset.deadzone;
      const gain = mapping.dataset.gain;
      fg.insertAdjacentHTML("beforeend", `
      <label for="ctrl-input-invert" class="flex-c f-g4 w100 mb16">
        <span>Axis direction</span>
        <select id="ctrl-input-invert" class="ctrl-modal-options mb0">
          <option class="ctrl-modal-option" value="normal"${inverted ? "" : " selected"}>not inverted</option>
          <option class="ctrl-modal-option" value="inverted"${inverted ? " selected" : ""}>inverted</option>
        </select>
      </label>
      <label for="ctrl-input-deadzone-range" class="flex-c f-g4 w100 mb16">
        <span>Deadzone (0–1)</span>
        <div class="flex-r f-g16">
          <input id="ctrl-input-deadzone-range" type="range" class="f-grow"
            min="${_limits.axisDeadzone.min}" max="${_limits.axisDeadzone.max}"
            step="0.01" value="${deadzone}" />
          <input id="ctrl-input-deadzone-text" type="text" value="${Number(deadzone).toFixed(2)}" />
        </div>
      </label>
      <label for="ctrl-input-method" class="flex-c f-g4 w100 mb16">
        <span>Input processing</span>
        <select id="ctrl-input-method" class="ctrl-modal-options mb0">
          <option class="ctrl-modal-option" value="direct"${gain < 0 ? " selected" : ""}>direct</option>
          <option class="ctrl-modal-option" value="differential"${gain < 0 ? "" : " selected"}>differential</option>
        </select>
      </label>
      <label for="ctrl-input-gain-text" class="flex-c f-g4 w100 mb16${gain < 0 ? " hidden" : ""}">
        <span>Gain</span>
        <div class="flex-r f-g16">
          <input id="ctrl-input-gain-range" type="range" class="f-grow" min="0" max="100" step="0.1"
            value="${utils.logToPercent(_limits.axisGain.min, _limits.axisGain.max, (gain < 0 ? "0.01" : gain))}" />
          <input id="ctrl-input-gain-text" type="text" value="${gain < 0 ? "0.01" : gain}" />
        </div>
      </label>
    `);
    }

    fg.insertAdjacentHTML("beforeend", `
    <div class="flex-r f-j-c f-g8">
      <button type="button" class="btn" id="ctrl-modal-ok">Ok</button>
      <button type="button" class="btn" id="ctrl-modal-cancel">Cancel</button>
    </div>
  `);

    if (kind === "axis") {
      // update deadzone
      const minDZ = _limits.axisDeadzone.min;
      const maxDZ = _limits.axisDeadzone.max;
      fg.querySelector("#ctrl-input-deadzone-range").addEventListener("input", function () {
        const deadzoneValue = fg.querySelector("#ctrl-input-deadzone-text");
        deadzoneValue.value = Number(this.value).toFixed(2);
      });
      fg.querySelector("#ctrl-input-deadzone-text").addEventListener("change", function () {
        const inputValue = Number(this.value);
        const deadzoneSlider = fg.querySelector("#ctrl-input-deadzone-range");
        if (isNaN(inputValue) || inputValue < minDZ || inputValue > maxDZ) {
          this.value = Number(deadzoneSlider.value).toFixed(2);
          ui.makeToast("error", `Deadzone must be between ${minDZ} and ${maxDZ}`);
        } else {
          deadzoneSlider.value = inputValue;
        }
      });

      // show/hide gain settings
      fg.querySelector("#ctrl-input-method").addEventListener("change", function () {
        const gainWrapper = fg.querySelector(`label[for="ctrl-input-gain"]`);
        if (this.value === "direct") {
          gainWrapper.classList.add("hidden");
        } else {
          gainWrapper.classList.remove("hidden");
        }
      });

      // update gain
      const minGain = _limits.axisGain.min;
      const maxGain = _limits.axisGain.max;
      fg.querySelector("#ctrl-input-gain-range").addEventListener("input", function () {
        const gainValue = fg.querySelector("#ctrl-input-gain-text");
        gainValue.value = utils.percentToLog(minGain, maxGain, this.value).slice(0, 4).replace(/\.$/, "");
      });
      fg.querySelector("#ctrl-input-gain-text").addEventListener("change", function () {
        const inputValue = Number(this.value);
        const gainSlider = fg.querySelector("#ctrl-input-gain-range");
        if (isNaN(inputValue) || inputValue < minGain || inputValue > maxGain) {
          this.value = utils.percentToLog(minGain, maxGain, gainSlider.value).slice(0, 4).replace(/\.$/, "");
          ui.makeToast("error", `Gain must be between ${minGain} and ${maxGain}!`);
        } else {
          gainSlider.value = utils.logToPercent(minGain, maxGain, inputValue).toFixed(1);
        }
      });
    }
    fg.querySelector("#ctrl-modal-ok").addEventListener("click", () => _applyCtrlMapping(kind));
    fg.querySelector("#ctrl-modal-cancel").addEventListener("click", () => utils.qs(".modal-bg[data-output]")?.remove());

    bg.appendChild(fg);
    document.body.append(bg);
  }


  /**
   * Trivial helper for _makeMappingModal - make a <select>.
   * @param {string} id ID attribute to assign to the new select
   * @param {Array<string>} options list of options
   * @param {string} current which option is selected
   * @returns {Element}
   */
  function _makeInputSelect(id, options, current) {
    const select = document.createElement("select");
    select.className = "ctrl-modal-options";
    select.id = id;
    select.insertAdjacentHTML("beforeend",
      `<option class="ctrl-modal-option" value="unbound">(none)</option>`
    );
    for (const opt of options.filter(x => x !== "None")) {
      const selected = current === opt;
      select.insertAdjacentHTML("beforeend",
        `<option class="ctrl-modal-option" value="${opt}"${selected ? ' selected' : ''}>${opt}</option>`
      );
    }
    return select;
  }


  /**
   * Stage new mapping from modal (not committed to server).
   * @param {"button"|"axis"} kind are we mapping an action or an axis?
   */
  function _applyCtrlMapping(kind) {
    const modal = utils.qs(".modal-bg[data-output]");
    if (!modal) {
      console.error("Tried to applyCtrlMapping while the mapping modal wasn't open.");
      return;
    }

    const output = modal.dataset.output;
    const relevantWrapper = utils.qs(`.ctrl-wrapper[data-output="${output}"]`);
    if (!relevantWrapper) {
      ui.makeToast("error", `Error: No .ctrl-wrapper for '${output}' exists!`, 3500);
      modal.remove();
      return;
    }
    const mappingInDOM = relevantWrapper.querySelector(".ctrl-input-current");

    // parse button/axis inputs
    const input1 = modal.querySelector("#ctrl-input-primary").value;
    const input2 = kind === "button" ? modal.querySelector("#ctrl-input-secondary").value : "unbound";
    const whitelistedMappings = _controls.restrictions[output]?.map(x => _.sortBy(x.split(/\s*,\s*/)));
    let desiredMapping = _.without(_.uniq([input1, input2]), "unbound");
    if (!desiredMapping.length) { desiredMapping = ["unbound"]; }

    // check constraints
    if (whitelistedMappings
      && !whitelistedMappings.some(x => _.isEqual(x, _.sortBy(desiredMapping)))) {
      ui.makeToast("error", "This mapping is not allowed. Whitelisted options for this action/axis:\n\n"
        + whitelistedMappings.map(x => `<p class="tiny-p mb0">${x.join(" + ")}</p>`).join(""), 5000);
      return;
    }

    // further inputs processing
    const resolvedMapping = desiredMapping.join(", ");
    let newInvert, newDeadzone, newMode, newGain;
    let hasChanged = false;
    if (kind === "button") {
      if (!(_controls.actionMappings[output] === undefined && resolvedMapping === "unbound")
        && (resolvedMapping !== _controls.actionMappings[output]?.button)) {
        hasChanged = true;
      }
    } else if (kind === "axis") {
      try {
        newInvert = modal.querySelector("#ctrl-input-invert")?.value === "inverted";
        newDeadzone = Number(modal.querySelector("#ctrl-input-deadzone-range")?.value || 0);
        const minDZ = _limits.axisDeadzone.min;
        const maxDZ = _limits.axisDeadzone.max;
        if (isNaN(newDeadzone) || newDeadzone < minDZ || newDeadzone > maxDZ) {
          throw new Error(`invalid deadzone '${newDeadzone}' (must be a number ${minDZ}–${maxDZ})`);
        }
        newMode = modal.querySelector("#ctrl-input-method")?.value || "direct";
        newGain = Number(modal.querySelector("#ctrl-input-gain-text")?.value || 0);
        const minGain = _limits.axisGain.min;
        const maxGain = _limits.axisGain.max;
        if (isNaN(newGain) || newGain < minGain || newGain > maxGain) {
          throw new Error(`invalid gain '${newGain}' (must be a number ${minGain}–${maxGain})`);
        }
      } catch (err) {
        ui.makeToast("error", `Error processing modal data for axis:\n\n${err.toString()}`, 7500);
        return;
      }

      // is this different from the server's config?
      const currentSettings = _controls.axisMappings[output];
      if (!(currentSettings === undefined && resolvedMapping === "unbound")
        && (resolvedMapping !== currentSettings?.inAxis
          || newInvert !== currentSettings?.invert
          || newDeadzone !== currentSettings?.deadzone
          || newMode !== currentSettings?.mode
          || (currentSettings?.mode === "differential" && newGain !== currentSettings?.gain)
        )
      ) {
        hasChanged = true;
      }
    }

    // update GUI element
    relevantWrapper.dataset.mapping = resolvedMapping;
    if (kind === "axis") {
      mappingInDOM.innerText = _stringifyAxisMapping(resolvedMapping, newInvert, newDeadzone, newMode, newGain);
      relevantWrapper.dataset.inverted = newInvert;
      relevantWrapper.dataset.deadzone = newDeadzone;
      relevantWrapper.dataset.gain = newMode === "differential" ? newGain : -1;
    } else {
      mappingInDOM.innerText = resolvedMapping;
    }

    // signal whether the current settings differ from the server's
    if (hasChanged) {
      mappingInDOM.classList.add("modified");
    } else {
      mappingInDOM.classList.remove("modified");
    }
    // if ANY inputs differ from the server's config, highlight the apply button
    const submitBtn = utils.qs("#controls-submit-btn");
    const cancelBtn = utils.qs("#controls-reset-btn");
    if (utils.qs(".ctrl-input-current.modified")) {
      submitBtn.classList.add("primed-yes");
      cancelBtn.classList.add("primed-no");
    } else {
      submitBtn.classList.remove("primed-yes");
      cancelBtn.classList.remove("primed-no");
    }

    modal.remove();
  }


  /** Trivial helper for showing axis properties as a string. */
  function _stringifyAxisMapping(axis, invert, deadzone, mode, gain) {
    if (axis === "unbound") return axis;
    return `${axis}, inv=${invert ? "1" : "0"}, dz=${deadzone}, ${mode === "direct" ? "direct" : ("gain=" + gain)}`;
  }


  /** POST settings to server & get new server-side mappings. */
  async function _submitMappings() {
    if (!utils.qs(".ctrl-input-current.modified")) {
      ui.makeToast(null, "No changes made, not submitting.");
      return;
    }

    const payload = {
      ControlActionsSettings: {},
      PlaneAxesSettings: {},
    };

    // buttons-actions
    const actionElements = utils.qsa("#controls-buttons-inner .ctrl-wrapper");
    for (const ae of actionElements) {
      // skip unbound altogether
      if (ae.dataset.mapping === "unbound") continue;

      payload.ControlActionsSettings[ae.dataset.output] = ae.dataset.mapping;
    }

    // axes
    const axisElements = utils.qsa("#controls-axes-inner .ctrl-wrapper");
    for (const ae of axisElements) {
      // skip unbound altogether
      if (ae.dataset.mapping === "unbound") continue;

      const mappingInfo = {
        ControllerAxis: ae.dataset.mapping,
        Inverted: ae.dataset.inverted === "false" ? false : true,
        ControllerAxisDeadBand: Number(ae.dataset.deadzone),
        FinalValueAssigner: {},
      }

      const gain = Number(ae.dataset.gain);
      if (gain === -1) {
        mappingInfo.FinalValueAssigner.$type = "DirectValueAssigner";
      } else {
        mappingInfo.FinalValueAssigner.$type = "DifferenceValueAssigner";
        mappingInfo.FinalValueAssigner.Gain = gain;
      }

      payload.PlaneAxesSettings[ae.dataset.output] = mappingInfo;
    }

    console.debug("submitMappings payload:", payload);

    let raw = null;
    try {
      raw = await ajax.postWithTimeout(globals.server.baseurl + "/settings/control/", payload);
    } catch (err) {
      ui.makeToast("error", "Failed - network error:\n\n" + err.toString(), 5000);
      raw = null;
    }
    if (raw) {
      try {
        const resp = await raw.json();
        _controls.actionMappings = _convertActionMappings(resp.ControlActionsSettings);
        _controls.axisMappings = _convertAxisMappings(resp.PlaneAxesSettings);
        _makeMappingList("button");
        _makeMappingList("axis");

        if (raw.ok) {
          ui.makeToast("success", "Successfully updated.");
        } else {
          ui.makeToast("error", `POST failed - ${raw.status}:\n\n${raw.statusText}\n\nRefreshed mappings from server.`, 7500);
        }
      } catch (err) {
        if (raw.ok) {
          ui.makeToast("error", `POST succeeded, but can't process response:\n\n${err.toString()}`, 7500);
        } else {
          ui.makeToast("error", `Failed utterly - ${raw.status}:\n\n${raw.statusText}`, 7500);
        }
      }
    }
  }


  /** Convert response action mappings from server to:
   * {
   *   string action: {
   *     "button": string button || ", "-joined 2 buttons
   *   },
   *   ...
   * }
   */
  function _convertActionMappings(respMappings) {
    if (!respMappings) {
      throw new Error("invalid data for convertActionMappings");
    }
    const processedMappings = {};
    for (const [action, mapping] of Object.entries(respMappings)) {
      processedMappings[action] = { "button": mapping == "None" ? "unbound" : mapping };
    }
    return processedMappings;
  }


  /** Convert response axis mappings from server to:
   * {
   *   string outAxis: {
   *     "inAxis": string inAxis,
   *     "invert": bool,
   *     "deadzone": number 0.0 - 1.0
   *     "mode": "direct"|"differential"
   *     "gain": null|number
   *   },
   *   ...
   * }
   */
  function _convertAxisMappings(respMappings) {
    if (!respMappings) {
      throw new Error("invalid data for convertAxisMappings");
    }
    const processedMappings = {};
    for (const [axis, mapping] of Object.entries(respMappings)) {
      processedMappings[axis] = {
        inAxis: mapping.ControllerAxis,
        invert: mapping.Inverted,
        deadzone: mapping.ControllerAxisDeadBand,
        mode: mapping.FinalValueAssigner.$type === "DifferenceValueAssigner"
          ? "differential"
          : mapping.FinalValueAssigner.$type === "DirectValueAssigner"
            ? "direct"
            : "undefined",
        gain: mapping.FinalValueAssigner.Gain || null,
      }
    }
    return processedMappings;
  }


  // public API
  return {
    init: () => {},
    activate,
    deactivate: () => {},
    hasLoaded: () => _loaded,
  }
})();