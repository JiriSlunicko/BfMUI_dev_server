window.pages.controls = (function() {
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
    stagedActionMappings: {},
    stagedAxisMappings: {},
  };

  let _limits = {
    axisGain: { min: 0.01, max: 100, },
    axisDeadzone: { min: 0, max: 1, },
  }


  /** Lazy load the interface only when the user navigates to it. */
  function activate() {
    if (!_controls.actions.length && _loadInterval === null) {
      _loadInterval = setInterval(() => {
        if (backend.info) {
          _initControlsInterface();
          clearInterval(_loadInterval);
          _loadInterval = null;
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
      raw = await ajax.fetchWithTimeout(backend.baseurl + "/settings/control/");
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
      // { role -> { input -> output, ... }, ... }
      _setMappingsFromJsonResponse(resp);

      ui.makeToast("success", "Successfully loaded control options.");
      return true;
    } catch (err) {
      console.error("_fetchCtrlOptions failed:", err);
      ui.makeToast("error", "Connection failed while loading control options.\n\n" + err, 5000);
      return false;
    }
  }


  function _setMappingsFromJsonResponse(resp) {
    // server-side state reference
    _controls.actionMappings = _convertActionMappings(resp.ControlActionsSettings);
    _controls.axisMappings = _convertAxisMappings(resp.PlaneAxesSettings);
    // deep copies for working state
    _setStagedToCurrentlyStored();
  }


  /** Load the current mappings from the server and render them. Only run this once. */
  async function _initControlsInterface() {
    if (!backend.baseurl) {
      ui.makeToast("error", "You need to connect to a server before tinkering with this.", 3000);
      return;
    }

    const loadSuccess = await _fetchCtrlOptions();

    if (loadSuccess) {
      // populate the controller combobox
      const ctrlrSelect = utils.qs("#controls-role-select");
      Array.from(ctrlrSelect.children).forEach(x => x.remove());
      let selectedCtrlr = null;
      for (const controller of Object.keys(_controls.actionMappings)) {
        ctrlrSelect.insertAdjacentHTML("beforeend",
          `<option value="${controller}"${selectedCtrlr === null ? " selected" : ""}>${controller}</option>`);
        selectedCtrlr = selectedCtrlr || controller;
      }

      utils.qs("#controls-btn-wrapper").innerHTML = `
        <button type="button" class="btn" id="controls-submit-btn">Save changes</button>
        <button type="button" class="btn" id="controls-reset-btn">Discard changes</button>
      `;

      _updateActiveController(selectedCtrlr);
    } else {
      utils.qs("#controls-buttons-inner").innerHTML = "<p>Failed to fetch options.</p>";
      utils.qs("#controls-axes-inner").innerHTML = "<p>Failed to fetch options.</p>";
      utils.qs("#controls-btn-wrapper").innerHTML = "";
    }

    if (_loaded) return; // skip first time setup when returning here

    utils.qs("#view-controls").addEventListener("click", function(e) {
      const mapping = e.target.closest(".ctrl-wrapper");
      if (mapping) {
        _makeMappingModal(mapping);
        return;
      }

      const submitButton = e.target.closest("#controls-submit-btn");
      if (submitButton) {
        _submitMappings();
        _updateActiveController();
        return;
      }

      const cancelButton = e.target.closest("#controls-reset-btn");
      if (cancelButton) {
        _setStagedToCurrentlyStored();
        _updateActiveController();
        return;
      }
    });

    utils.qs("#controls-role-select").addEventListener("change", function(e) {
      _updateActiveController(this.value);
    });

    _loaded = true;
  }


  /**
   * Populate the relevant container with current input-output mappings.
   * @param {string} controller which controller we're showing
   * @param {"button"|"axis"} kind
   */
  function _makeMappingList(controller, kind) {
    let container, outputs, mappings;
    switch (kind) {
      case "button":
        container = utils.qs("#controls-buttons-inner");
        outputs = _controls.actions;
        mappings = _controls.stagedActionMappings[controller];
        break;
      case "axis":
        container = utils.qs("#controls-axes-inner");
        outputs = _controls.outAxes;
        mappings = _controls.stagedAxisMappings[controller];
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
      let stagedChange;

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
        if (_hasAxisMappingChanged(controller, output))
          stagedChange = true;
      } else {
        const mButton = mapping?.button || "unbound";
        item.dataset.mapping = mButton;
        item.dataset.isEnum = _controls.restrictions[output] ? "yes" : "";
        mappingString = mButton;
        if (_hasActionMappingChanged(controller, output))
          stagedChange = true;
      }

      item.insertAdjacentHTML("beforeend", `
      <div class="entry-header ctrl-output">${output}</div>
      <div class="ctrl-input-current${stagedChange ? ' modified' : ''}">${mappingString}</div>
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

    const ctrlrRole = _getActiveControllerRole();
    const kind = mapping.dataset.kind;
    const output = mapping.dataset.output;
    let currentMapping, currentInput;
    if (kind === "axis") {
      currentMapping = _controls.stagedAxisMappings[ctrlrRole][output];
      currentInput = currentMapping?.inAxis.split(/\s*,\s*/) || ["unbound"];
    } else {
      currentMapping = _controls.stagedActionMappings[ctrlrRole][output];
      currentInput = currentMapping?.button.split(/\s*,\s*/) || ["unbound"];
    }

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

    // enum of possible bindings
    if (mapping.dataset.isEnum === "yes") {
      const enumSelect = _makeInputSelect("ctrl-input-enum", _controls.restrictions[output], currentInput);
      fg.appendChild(enumSelect);
    // arbitrary buttons/axes
    } else {
      const priSelect = _makeInputSelect("ctrl-input-primary", kind === "axis" ? _controls.inAxes : _controls.buttons, currentInput[0]);
      fg.appendChild(priSelect);

      // buttons
      if (kind === "button") {
        const secSelect = _makeInputSelect("ctrl-input-secondary", _controls.buttons, currentInput[1] || "unbound");
        fg.appendChild(secSelect);
      // axes
      } else {
        const inverted = currentMapping?.invert || false;
        const deadzone = currentMapping?.deadzone || 0;
        const mode = currentMapping?.mode || "direct";
        const gain = currentMapping?.gain || 0.1;
        fg.insertAdjacentHTML("beforeend", `
        <label for="ctrl-input-invert" class="flex-c f-g4 w100 mb16">
          <span>Axis direction</span>
          <select id="ctrl-input-invert" class="ctrl-modal-options mb0">
            <option class="ctrl-modal-option" value="normal"${inverted ? "" : " selected"}>not inverted</option>
            <option class="ctrl-modal-option" value="inverted"${inverted ? " selected" : ""}>inverted</option>
          </select>
        </label>
        ${ui.makeRangeTextInputPair("ctrl-input-deadzone", "Deadzone (0-1)", {
          bounds: { min: _limits.axisDeadzone.min, max: _limits.axisDeadzone.max },
          step: 0.01,
          value: deadzone,
          scaling: "linear",
          textInputClassOverride: "w5ch"
        },
          "w100 mb16"
        )}
        <label for="ctrl-input-method" class="flex-c f-g4 w100 mb16">
          <span>Input processing</span>
          <select id="ctrl-input-method" class="ctrl-modal-options mb0">
            <option class="ctrl-modal-option" value="direct"${mode === "direct" ? " selected" : ""}>direct</option>
            <option class="ctrl-modal-option" value="differential"${mode === "differential" ? " selected" : ""}>differential</option>
          </select>
        </label>
        ${ui.makeRangeTextInputPair("ctrl-input-gain", "Gain", {
          bounds: { min: _limits.axisGain.min, max: _limits.axisGain.max },
          step: 0.01,
          value: gain < 0 ? "0.01" : gain,
          scaling: "logarithmic",
          textInputClassOverride: "w7ch"
        },
          "w100 mb16" + (mode === "direct" ? " hidden" : "")
        )}
      `);
      }
    }

    // buttons
    fg.insertAdjacentHTML("beforeend", `
    <div class="flex-r f-j-c f-g8">
      <button type="button" class="btn" id="ctrl-modal-ok">Ok</button>
      <button type="button" class="btn" id="ctrl-modal-cancel">Cancel</button>
    </div>
    `);

    if (kind === "axis") {
      // show/hide gain settings on switching input processing mode
      fg.querySelector("#ctrl-input-method").addEventListener("change", function() {
        const gainWrapper = fg.querySelector(`label[for="ctrl-input-gain-text"]`);
        if (this.value === "direct") {
          gainWrapper.classList.add("hidden");
        } else {
          gainWrapper.classList.remove("hidden");
        }
      });
    }

    fg.querySelector("#ctrl-modal-ok").addEventListener("click", () => _applyCtrlMapping(kind));
    fg.querySelector("#ctrl-modal-cancel").addEventListener("click", () => utils.qs(".modal-bg[data-output")?.remove());

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
      const optName = opt.replace(/\b(.)Input/g, "$1I").replace(/\s*,\s*/g, " + ");
      select.insertAdjacentHTML("beforeend",
        `<option class="ctrl-modal-option" value="${opt}"${selected? ' selected' : ''}>${optName}</option>`
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

    // let's parse button/axis inputs
    let input1, input2;
    // first check if this is an enum
    const enumInput = modal.querySelector("#ctrl-input-enum");
    if (enumInput) {
      const enumButtons = enumInput.value.split(/\s*,\s*/);
      [input1, input2] = enumButtons.length === 2 ? enumButtons : ["unbound", "unbound"];
    // otherwise grab primary & secondary inputs
    } else {
      input1 = modal.querySelector("#ctrl-input-primary").value;
      input2 = kind === "button" ? modal.querySelector("#ctrl-input-secondary").value : "unbound";
    }
    // finalise the desired mapping
    let desiredMapping = _.without(_.uniq([input1, input2]), "unbound");
    if (!desiredMapping.length) { desiredMapping = ["unbound"]; }

    // check constraints
    const whitelistedMappings = _controls.restrictions[output]?.map(x => _.sortBy(x.split(/\s*,\s*/)));
    if (whitelistedMappings) whitelistedMappings.push(["unbound"]);
    if (whitelistedMappings
      && !whitelistedMappings.some(x => _.isEqual(x, _.sortBy(desiredMapping)))) {
      ui.makeToast("error", "This mapping is not allowed. Whitelisted options for this action/axis:\n\n"
        + whitelistedMappings.map(x => `<p class="tiny-p mb0">${x.join(" + ")}</p>`).join(""), 5000);
      return;
    }

    // further config for axes
    let newInvert, newDeadzone, newMode, newGain;
    if (kind === "axis") {
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
    }

    // update staged state
    const resolvedMapping = desiredMapping.join(", ");
    if (kind === "axis") {
      if (resolvedMapping === "unbound")
        delete _controls.stagedAxisMappings[_getActiveControllerRole()][output];
      else {
        _controls.stagedAxisMappings[_getActiveControllerRole()][output] = {
          inAxis: resolvedMapping,
          invert: newInvert,
          deadzone: newDeadzone,
          mode: newMode,
          gain: newGain,
        }
      }
    } else {
      _controls.stagedActionMappings[_getActiveControllerRole()][output] = {button: resolvedMapping};
    }

    _updateActiveController();

    modal.remove();
  }


  /** Trivial helper for showing axis properties as a string. */
  function _stringifyAxisMapping(axis, invert, deadzone, mode, gain) {
    if (axis === "unbound") return axis;
    return `${axis}, inv=${invert ? "1" : "0"}, dz=${deadzone}, ${mode === "direct" ? "direct" : ("gain=" + gain)}`;
  }


  /** POST settings to server & get new server-side mappings. */
  async function _submitMappings(onlyActive = false) {
    if (!utils.qs(".ctrl-wrapper .modified")) {
      ui.makeToast(null, "No changes made, not submitting.");
      return;
    }

    const payload = {
      ControlActionsSettings: {},
      PlaneAxesSettings: {},
    };

    const actionCtrlrRoles = onlyActive ? [_getActiveControllerRole()] : Object.keys(_controls.stagedActionMappings);
    const axisCtrlrRoles = onlyActive ? [_getActiveControllerRole()] : Object.keys(_controls.stagedAxisMappings);

    // buttons -> actions
    for (const ctrlrRole of actionCtrlrRoles) {
      const ctrlrMappings = _controls.stagedActionMappings[ctrlrRole];
      const processedCtrlrMappings = {};
      for (const [action, mapping] of Object.entries(ctrlrMappings)) {
        if (mapping.button === "unbound") continue;
        
        processedCtrlrMappings[action] = mapping.button;
      }

      payload.ControlActionsSettings[ctrlrRole] = processedCtrlrMappings;
    }

    // axes
    for (const ctrlrRole of axisCtrlrRoles) {
      const ctrlrMappings = _controls.stagedAxisMappings[ctrlrRole];
      const processedCtrlrMappings = {};
      for (const [planeAxis, mapping] of Object.entries(ctrlrMappings)) {
        if (!mapping) continue;

        mappingInfo = {
          ControllerAxis: mapping.inAxis,
          Inverted: mapping.invert,
          ControllerAxisDeadBand: mapping.deadzone,
          FinalValueAssigner: {}
        }

        if (mapping.mode === "direct") {
          mappingInfo.FinalValueAssigner.$type = "DirectValueAssigner";
        } else {
          mappingInfo.FinalValueAssigner.$type = "DifferenceValueAssigner";
          mappingInfo.FinalValueAssigner.Gain = mapping.gain;
        }

        processedCtrlrMappings[planeAxis] = mappingInfo;
      }

      payload.PlaneAxesSettings[ctrlrRole] = processedCtrlrMappings;
    }

    console.debug("submitMappings payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + "/settings/control/",
      payload,
      (resp) => {
        _setMappingsFromJsonResponse(resp);
        _updateActiveController();
        ui.makeToast("success", "Successfully updated.");
      }
    );
  }


  /** Convert response action mappings from server to:
   * {
   *  string controllerRole: {
   *    string action: {
   *      "button": string button || ", "-joined 2 buttons
   *    },
   *    ...
   *  },
   *  ...
   * }
   */
  function _convertActionMappings(respMappings) {
    if (!respMappings) {
      throw new Error("invalid data for convertActionMappings");
    }
    const processedMappings = {};
    for (const [ctrlrRole, ctrlrMappings] of Object.entries(respMappings)) {
      const processedCtrlrMappings = {};
      for (const [action, mapping] of Object.entries(ctrlrMappings)) {
        processedCtrlrMappings[action] = { "button": mapping == "None" ? "unbound" : mapping };
      }
      processedMappings[ctrlrRole] = processedCtrlrMappings;
    }
    return processedMappings;
  }


  /** Convert response axis mappings from server to:
   * {
   *  string controllerRole: {
   *    string outAxis: {
   *      "inAxis": string inAxis,
   *      "invert": bool,
   *      "deadzone": number 0.0 - 1.0
   *      "mode": "direct"|"differential"
   *      "gain": null|number
   *    },
   *    ...
   *  },
   *  ...
   * }
   */
  function _convertAxisMappings(respMappings) {
    if (!respMappings) {
      throw new Error("invalid data for convertAxisMappings");
    }
    const processedMappings = {};

    for (const [ctrlrRole, ctrlrMappings] of Object.entries(respMappings)) {
      const processedCtrlrMappings = {};
      for (const [axis, mapping] of Object.entries(ctrlrMappings)) {
        processedCtrlrMappings[axis] = {
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
      processedMappings[ctrlrRole] = processedCtrlrMappings;
    }
    return processedMappings;
  }


  function _hasActionMappingChanged(controller, action) {
    return _controls.actionMappings[controller][action]?.button
       !== _controls.stagedActionMappings[controller][action]?.button;
  }

  function _hasAxisMappingChanged(controller, axisRole) {
    const stored = _controls.axisMappings[controller][axisRole];
    const staged = _controls.stagedAxisMappings[controller][axisRole];

    const storedUndef = stored === undefined;
    const stagedUndef = staged === undefined;

    // one undefined, the other not -> changed
    if (storedUndef !== stagedUndef)
      return true;

    // both undefined -> not changed
    if (storedUndef && stagedUndef)
      return false;

    // if the value of any key has changed -> changed
    for (const key of Object.keys(staged)) {
      if (stored[key] !== staged[key]) return true;
    }
    // else -> not changed
    return false;
  }


  function _updateActiveController(controller = null) {
    if (controller !== null) 
      utils.qs("#controls-role-select").value = controller

    const active = _getActiveControllerRole();
    _makeMappingList(active, "button");
    _makeMappingList(active, "axis");

    const submitBtn = utils.qs("#controls-submit-btn");
    const cancelBtn = utils.qs("#controls-reset-btn");
    if (utils.qsa(".ctrl-wrapper .modified").length > 0) {
      submitBtn.classList.add("primed-yes");
      cancelBtn.classList.add("primed-no");
    } else {
      submitBtn.classList.remove("primed-yes");
      cancelBtn.classList.remove("primed-no");
    }
  }


  function _setStagedToCurrentlyStored(controller = null) {
    if (controller === null) {
      _controls.stagedActionMappings = JSON.parse(JSON.stringify(_controls.actionMappings));
      _controls.stagedAxisMappings = JSON.parse(JSON.stringify(_controls.axisMappings));
    } else {
      _controls.stagedActionMappings[controller] = JSON.parse(JSON.stringify(_controls.actionMappings[controller]));
      _controls.stagedAxisMappings[controller] = JSON.parse(JSON.stringify(_controls.axisMappings[controller]));
    }
  }


  function _getActiveControllerRole() {
    return utils.qs("#controls-role-select").value;
  }


  // public API
  return {
    init: () => {},
    activate,
    deactivate: () => {},
    hasLoaded: () => _loaded,
    _controls //debug only
  }
})();