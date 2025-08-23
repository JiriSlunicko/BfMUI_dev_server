window.settings.controls = (function()
{
  let _initialised = false;

  let _staged = {
    actionMappings: {},
    axisMappings: {},
  }

  let _controls = {
    buttons: [],
    inAxes: [],
    actions: [],
    outAxes: [],
    restrictions: {},
    actionMappings: {},
    axisMappings: {},
  }

  let _limits = {
    axisGain: { min: 0.01, max: 100 },
    axisDeadzone: { min: 0, max: 1 },
  }


  async function init() {
    utils.qs("#view-controls").addEventListener("click", function (e) {
      const mapping = e.target.closest(".ctrl-wrapper");
      if (mapping) {
        _makeMappingModal(mapping);
        return;
      }

      const submitButton = e.target.closest("#controls-submit-btn");
      if (submitButton && hasPendingChanges()) {
        utils.throttle(save, 1000)();
        return;
      }

      const cancelButton = e.target.closest("#controls-reset-btn");
      if (cancelButton) {
        reset();
        return;
      }
    });

    utils.qs("#controls-role-select").addEventListener("change", function (e) {
      _updateActiveController(this.value);
    });

    return true;
  }


  async function load() {
    const controlsSuccess = await _fetchData();

    if (controlsSuccess) {
      // controller role select
      if (!_initialised) {
        const controllerSelect = utils.qs("#controls-role-select");
        Array.from(controllerSelect.children).forEach(x => x.remove());
        let selected = null;
        for (const controller of Object.keys(_controls.actionMappings)) {
          controllerSelect.insertAdjacentHTML("beforeend", `
          <option value="${controller}"${selected === null ? " selected" : ""}>${controller}</option>`);
          selected = selected || controller;
        }
        _initialised = true;
      }

      // buttons
      utils.qs("#controls-btn-wrapper").innerHTML = `
        <button type="button" class="btn" id="controls-submit-btn">Save</button>
        <button type="button" class="btn" id="controls-reset-btn">Reset</button>
      `;

      _updateActiveController(ctrlHelpers.getActiveControllerRole());
    } else {
      utils.qs("#controls-buttons-inner").innerHTML = "<p>Failed to fetch options.</p>";
      utils.qs("#controls-axes-inner").innerHTML = "<p>Failed to fetch options.</p>";
      utils.qs("#controls-btn-wrapper").innerHTML = "";
    }
    
    return controlsSuccess;
  }


  function reset() {
    _clearStaged();
    _updateActiveController();
  }


  async function save() {
    const payload = {
      ControlActionsSettings: {},
      PlaneAxesSettings: {},
    }

    // buttons -> actions
    for (const controller of Object.keys(_controls.actionMappings)) {
      const processedMappings = {};
      for (const action of _controls.actions) {
        const resolvedMapping = ctrlHelpers.getResolvedMapping(_controls, _staged, controller, action, "button");
        if (resolvedMapping === undefined || resolvedMapping.button === "unbound")
          continue;
        processedMappings[action] = resolvedMapping.button.split(", ");
      }
      payload.ControlActionsSettings[controller] = processedMappings;
    }

    // axes
    for (const controller of Object.keys(_controls.axisMappings)) {
      const processedMappings = {};
      for (const planeAxis of _controls.outAxes) {
        const resolvedMapping = ctrlHelpers.getResolvedMapping(_controls, _staged, controller, planeAxis, "axis");
        if (resolvedMapping === undefined || resolvedMapping.deleteMe)
          continue;

        mappingInfo = {
          ControllerAxis: resolvedMapping.inAxis,
          Inverted: resolvedMapping.invert,
          ControllerAxisDeadBand: resolvedMapping.deadzone,
          FinalValueAssigner: { $type: "DirectValueAssigner" }
        }

        if (resolvedMapping.mode !== "direct") {
          mappingInfo.FinalValueAssigner.$type = "DifferenceValueAssigner";
          mappingInfo.FinalValueAssigner.Gain = resolvedMapping.gain;
        }

        processedMappings[planeAxis] = mappingInfo;
      }
      payload.PlaneAxesSettings[controller] = processedMappings;
    }

    console.debug("controls payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.controlsPost,
      payload,
      (resp) => {
        ctrlHelpers.setMappingsFromJsonResponse(_controls, resp);
        _clearStaged();
        _updateActiveController();
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    for (const controller of Object.keys(_controls.actionMappings)) {
      for (const action of _controls.actions) {
        if (_staged.actionMappings[controller][action])
          return true;
      }
    }

    for (const controller of Object.keys(_controls.axisMappings)) {
      for (const planeAxis of _controls.outAxes) {
        if (_staged.axisMappings[controller][planeAxis])
          return true;
      }
    }

    return false;
  }


  async function _fetchData() {
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + backend.endpoints.controlsGet);
      const resp = await raw.json();

      _controls.buttons = resp.AvailableControllerButtons; // string[]
      _controls.inAxes = resp.AvailableControllerAxes; // string[]
      _controls.actions = resp.AvailableControlActions; // string[]
      _controls.outAxes = resp.AvailablePlaneAxes; // string[]
      _controls.restrictions = {}; // Dictionary<string, List<string>>
      for (const [action, allowedCombos] of Object.entries(resp.ControlActionsRestrictions)) {
        _controls.restrictions[action] = allowedCombos.map(x => x.join(", "));
      }
      ctrlHelpers.setMappingsFromJsonResponse(_controls, resp);
      for (const controller of Object.keys(_controls.actionMappings))
        _staged.actionMappings[controller] ??= {};
      for (const controller of Object.keys(_controls.axisMappings))
        _staged.axisMappings[controller] ??= {};

      return true;
    } catch (err) {
      console.error("Controls fetch error:", err);
      return false;
    }
  }


  function _clearStaged() {
    for (const controller of Object.keys(_controls.actionMappings)) {
      _staged.actionMappings[controller] ??= {};
      for (const action of _controls.actions) {
        _staged.actionMappings[controller][action] = null;
      }
    }

    for (const controller of Object.keys(_controls.axisMappings)) {
      _staged.axisMappings[controller] ??= {};
      for (const planeAxis of _controls.outAxes) {
        _staged.axisMappings[controller][planeAxis] = null;
      }
    }
  }


  /** Create a modal for mapping controller inputs to plane outputs.
 * @param {Element} mapping .ctrl-wrapper for the mapping in DOM
 */
  function _makeMappingModal(mapping) {
    if (utils.qs(".modal-bg")) {
      console.error("Tried to open a control mapping modal while another modal was open.");
      return;
    }

    const activeRole = ctrlHelpers.getActiveControllerRole();
    const kind = mapping.dataset.kind;
    const output = mapping.dataset.output;
    const currentMapping = ctrlHelpers.getResolvedMapping(_controls, _staged, activeRole, output, kind);
    const mappingMainProperty = kind === "axis" ? "inAxis" : "button";
    let currentInput = currentMapping?.[mappingMainProperty]?.split(/\s*,\s*/) || ["unbound"];

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

    if (mapping.dataset.isEnum === "yes") {
      // enum of possible bindings
      const enumSelect = _makeInputSelect("ctrl-input-enum", _controls.restrictions[output], currentMapping?.[mappingMainProperty]);
      fg.appendChild(enumSelect);
    } else {
      // arbitrary buttons/axes
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
          step: 0.01, value: deadzone, scaling: "linear", textInputClassOverride: "w5ch"
        }, "w100 mb16"
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
          step: 0.01, value: gain < 0 ? "0.01" : gain, scaling: "logarithmic", textInputClassOverride: "w7ch"
        }, "w100 mb16" + (mode === "direct" ? " hidden" : "")
        )}
      `);
      }
    }

    // buttons
    fg.insertAdjacentHTML("beforeend", `
    <div class="flex-r f-j-c f-g8">
      <button type="button" class="btn" id="ctrl-modal-ok">Ok</button>
      <button type="button" class="btn" id="ctrl-modal-cancel">Cancel</button>
    </div>`);

    if (kind === "axis") {
      // show/hide gain settings on switching input processing mode
      fg.querySelector("#ctrl-input-method").addEventListener("change", function () {
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


  /** Trivial helper for _makeMappingModal - make a <select>.
   * Automatically includes a (none) option which maps to 'unbound'.
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
        `<option class="ctrl-modal-option" value="${opt}"${selected ? ' selected' : ''}>${optName}</option>`
      );
    }
    return select;
  }


  /** Stage new mapping from modal (not committed to server).
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
    const stringMapping = desiredMapping.join(", ");
    const activeRole = ctrlHelpers.getActiveControllerRole();
    if (kind === "axis") {
      if (stringMapping === "unbound")
        _staged.axisMappings[activeRole][output] = { deleteMe: true };
      else {
        _staged.axisMappings[activeRole][output] = {
          inAxis: stringMapping,
          invert: newInvert,
          deadzone: newDeadzone,
          mode: newMode,
          gain: newGain,
        }
      }
    } else {
      _staged.actionMappings[activeRole][output] = { button: stringMapping };
    }

    _updateActiveController();

    modal.remove();
  }


  function _updateActiveController(controller = null) {
    if (controller) utils.qs("#controls-role-select").value = controller;

    const active = ctrlHelpers.getActiveControllerRole();
    ctrlHelpers.makeMappingList(_controls, _staged, active, "button");
    ctrlHelpers.makeMappingList(_controls, _staged, active, "axis");

    const submitBtn = utils.qs("#controls-submit-btn");
    const cancelBtn = utils.qs("#controls-reset-btn");
    if (hasPendingChanges()) {
      submitBtn.classList.add("primed-yes");
      cancelBtn.classList.add("primed-no");
    } else {
      submitBtn.classList.remove("primed-yes");
      cancelBtn.classList.remove("primed-no");
    }
  }


  // public API
  return {
    init,
    load,
    reset,
    save,
    hasPendingChanges,
    _controls, // debug export
    _staged, // debug export
  }
})();