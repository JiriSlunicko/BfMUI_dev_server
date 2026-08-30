/** Helper functions for controls settings. */

window.ctrlHelpers = (function()
{
  const _m = "ctrlHelpers";

  /** Read a JSON response from the controls endpoint and save its data in the app.
   * 
   * @param {object} controls the _controls property of window.pages.controls
   * @param {object} resp parsed JSON response from controls endpoint
   */
  function setMappingsFromJsonResponse(controls, resp) {
    // server-side state reference
    controls.actionMappings = _convertActionMappings(resp.ControlActionsSettings);
    controls.axisMappings = _convertAxisMappings(resp.PlaneAxesSettings);
  }


  /** Find out which controller role is currently selected (checks the combobox).
   * 
   * @returns {string} controller role name
   */
  function getActiveControllerRole() {
    return utils.qs("#controls-role-select").value;
  }


  /** Populate the relevant container with current input-output mappings.
   * 
   * @param {object} controls the _controls property of window.pages.controls
   * @param {object} staged the _staged property of window.pages.controls
   * @param {string} controller which controller we're showing
   * @param {"button"|"axis"} kind
   */
  function makeMappingList(controls, staged, controller, kind) {
    let container, outputs;
    switch (kind) {
      case "button":
        container = utils.qs("#controls-buttons-inner");
        outputs = controls.actions;
        break;
      case "axis":
        container = utils.qs("#controls-axes-inner");
        outputs = controls.outAxes;
        break;
    }

    utils.removeChildren(container);
    const mappingsWrapper = document.createDocumentFragment();

    for (const output of outputs) {
      const mapping = getResolvedMapping(controls, staged, controller, output, kind);

      const item = document.createElement("div");
      item.className = "entry-wrapper ctrl-wrapper";
      item.dataset.kind = kind;
      item.dataset.output = output;

      let mappingString;
      let stagedChange = false;

      if (kind === "axis") {
        // axes
        const currentInAxis = mapping?.inAxis || "unbound";
        const currentInvert = mapping?.invert || false;
        const currentDeadzone = mapping?.deadzone || 0.0;
        const currentMode = mapping?.mode || "direct";
        const currentGain = typeof mapping?.gain === "number" ? mapping.gain : -1;

        mappingString = _stringifyAxisMapping(
          currentInAxis,
          currentInvert,
          currentDeadzone,
          currentMode,
          currentGain
        );

        // pending change = staged state exists and isn't equivalent to server state
        if (staged.axisMappings[controller][output] !== undefined
          && !_.isEqual(staged.axisMappings[controller][output],
                      controls.axisMappings[controller][output])
        ) {
          stagedChange = true;               
        }
      } else {
        // buttons
        item.dataset.isEnum = controls.restrictions[output] ? "yes" : "";

        mappingString = mapping?.button || "unbound";

        // pending change = staged state exists and isn't equivalent to server state
        if (staged.actionMappings[controller][output] !== undefined
          && !_.isEqual(staged.actionMappings[controller][output],
                      controls.actionMappings[controller][output])
        ) {
          stagedChange = true;
        }
      }

      // append the mapping to the wrapper
      item.innerHTML = `
        <div class="entry-header ctrl-output">${output}</div>
        <div class="ctrl-input-current${stagedChange ? ' modified' : ''}"
          >${mappingString}</div>`;
      mappingsWrapper.appendChild(item);
    }

    // insert in the DOM
    container.append(mappingsWrapper);
  }


  /** Trivial helper for showing axis properties as a string. */
  function _stringifyAxisMapping(axis, invert, deadzone, mode, gain) {
    if (axis === "unbound") {
      return axis;
    }
    return `${axis}, `
         + `inv=${invert ? "1" : "0"}, `
         + `dz=${deadzone}, `
         + (mode === "direct" ? `direct` : `gain=${gain}`);
  }


  /** Convert response action mappings from server to:
   * {
   *  string controllerRole: {
   *    string action: {
   *      "button": string // button or 2 buttons joined by ", "
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

    // for each controller...
    for (const [ctrlrRole, ctrlrMappings] of Object.entries(respMappings)) {
      const processedCtrlrMappings = {};

      // for each control action...
      for (const [action, mapping] of Object.entries(ctrlrMappings)) {
        processedCtrlrMappings[action] = {
          button: mapping.join(", "),
        };
      }

      processedMappings[ctrlrRole] = processedCtrlrMappings;
    }

    return processedMappings;
  }


  /** Convert response axis mappings from server to:
   * {
   *  string controllerRole: {
   *    string outAxis: {
   *      "inAxis": string,
   *      "invert": bool,
   *      "deadzone": number 0.0-1.0
   *      "mode": "direct"|"differential"
   *      "gain": null|number 0.01+
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

    // for each controller...
    for (const [ctrlrRole, ctrlrMappings] of Object.entries(respMappings)) {
      const processedCtrlrMappings = {};

      // for each plane axis...
      for (const [axis, mapping] of Object.entries(ctrlrMappings)) {
        let mappingMode;
        switch (mapping.FinalValueAssigner.$type) {
          case "DifferenceValueAssigner": mappingMode = "differential"; break;
          case "DirectValueAssigner":     mappingMode = "direct"; break;
          default:                        mappingMode = "undefined";
        }

        processedCtrlrMappings[axis] = {
          inAxis: mapping.ControllerAxis,
          invert: mapping.Inverted,
          deadzone: mapping.ControllerAxisDeadBand,
          mode: mappingMode,
          gain: mapping.FinalValueAssigner.Gain || null,
        };
      }

      processedMappings[ctrlrRole] = processedCtrlrMappings;
    }

    return processedMappings;
  }


  /** Get the staged mapping if one exists, otherwise the last known server mapping.
   * 
   * @param {object} controls the _controls property of window.pages.controls
   * @param {object} staged the _staged property of window.pages.controls
   * @param {string} controller which controller we're interested in
   * @param {string} output which action or plane axis we're interested in
   * @param {"button"|"axis"} kind 
   * @returns {object} a mapping for an action or an axis
   */
  function getResolvedMapping(controls, staged, controller, output, kind) {
    const mappingsKey = (
      kind === "axis"
      ? "axisMappings"
      : "actionMappings"
    );

    return utils.coalesceUndef(staged[mappingsKey][controller][output],
                             controls[mappingsKey][controller][output]);
  }


  // public API
  return {
    setMappingsFromJsonResponse,
    getActiveControllerRole,
    makeMappingList,
    getResolvedMapping,
  };
})();
