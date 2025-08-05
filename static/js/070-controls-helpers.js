window.ctrlHelpers = (function() {
  /** Read a JSON response from the controls endpoint and save its data in the app.
   * @param {object} controls the _controls property of window.pages.controls
   * @param {object} resp parsed JSON response from controls endpoint
   */
  function setMappingsFromJsonResponse(controls, resp) {
    // server-side state reference
    controls.actionMappings = _convertActionMappings(resp.ControlActionsSettings);
    controls.axisMappings = _convertAxisMappings(resp.PlaneAxesSettings);
  }


  /** Find out which controller role is currently selected (checks the combobox).
   * @returns {string} controller role name
   */
  function getActiveControllerRole() {
    return utils.qs("#controls-role-select").value;
  }


  /** Populate the relevant container with current input-output mappings.
   * @param {object} controls the _controls property of window.pages.controls
   * @param {string} controller which controller we're showing
   * @param {"button"|"axis"} kind
   */
  function makeMappingList(controls, staged, controller, kind) {
    let container, outputs, mappings;
    switch (kind) {
      case "button":
        container = utils.qs("#controls-buttons-inner");
        outputs = controls.actions;
        mappings = staged.actionMappings[controller];
        break;
      case "axis":
        container = utils.qs("#controls-axes-inner");
        outputs = controls.outAxes;
        mappings = staged.axisMappings[controller];
        break;
    }

    //console.debug(controller, mappings);

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
        mappingString = _stringifyAxisMapping(mInAxis, mInvert, mDeadzone, mMode, mGain);
        if (_hasAxisMappingChanged(controls, staged, controller, output))
          stagedChange = true;
      } else {
        item.dataset.isEnum = controls.restrictions[output] ? "yes" : "";
        mappingString = mapping?.button || "unbound";
        if (_hasActionMappingChanged(controls, staged, controller, output))
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


  /** Trivial helper for showing axis properties as a string. */
  function _stringifyAxisMapping(axis, invert, deadzone, mode, gain) {
    if (axis === "unbound") return axis;
    return `${axis}, inv=${invert ? "1" : "0"}, dz=${deadzone}, ${mode === "direct" ? "direct" : ("gain=" + gain)}`;
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


  /** Find out if the staged mapping for an action differs from current server settings.
   * @param {object} controls the _controls property of window.pages.controls
   * @param {string} controller name of the controller role we're editing
   * @param {string} action name of the plane action we're mapping input for
   * @returns {boolean} whether the mapping is different
   */
  function _hasActionMappingChanged(controls, staged, controller, action) {
    return controls.actionMappings[controller][action]?.button
       !== staged.actionMappings[controller][action]?.button;
  }


  /** Find out if the staged mapping for an axis differs from current server settings.
   * @param {object} controls the _controls property of window.pages.controls
   * @param {string} controller name of the controller role we're editing
   * @param {string} axisRole name of the plane axis we're mapping a controller axis for
   * @returns {boolean} whether the mapping is different
   */
  function _hasAxisMappingChanged(controls, staged, controller, axisRole) {
    const storedSetting = controls.axisMappings[controller][axisRole];
    const stagedSetting = staged.axisMappings[controller][axisRole];

    const storedUndef = storedSetting === undefined;
    const stagedUndef = stagedSetting === undefined;

    // one undefined, the other not -> changed
    if (storedUndef !== stagedUndef) return true;

    // both undefined -> not changed
    if (storedUndef && stagedUndef) return false;

    // if the value of any key has changed -> changed
    for (const key of Object.keys(stagedSetting)) {
      if (storedSetting[key] !== stagedSetting[key]) return true;
    }
    // else -> not changed
    return false;
  }


  // public API
  return {
    setMappingsFromJsonResponse,
    getActiveControllerRole,
    makeMappingList,
  }
})();