async function renderControlsInterface() {
  if (!g.server.baseurl) {
    makeToast("error", "You need to connect to a server before tinkering with this.", 3000);
    return;
  }

  const loadSuccess = await fetchCtrlOptions();

  if (loadSuccess) {
    makeMappingList("button");
    makeMappingList("axis");
    qs("#controls-btn-wrapper").innerHTML = `<button type="button" class="btn" id="controls-submit-btn">Apply</button>`;
  } else {
    qs("#controls-buttons-inner").innerHTML = "<p>Failed to fetch options.</p>";
    qs("#controls-axes-inner").innerHTML = "<p>Failed to fetch options.</p>";
    qs("#controls-btn-wrapper").innerHTML = "";
  }

  qs("#view-controls").addEventListener("click", function(e) {
    const mapping = e.target.closest(".ctrl-wrapper");
    if (mapping) {
      makeMappingModal(mapping);
      return;
    }

    const submitButton = e.target.closest("#controls-submit-btn");
    if (submitButton) {
      submitMappings();
      return;
    }
  });
}


/**
 * Populates the relevant container with current input-output mappings.
 * @param {"button"|"axis"} kind 
 */
const makeMappingList = function(kind) {
  let container, outputs, mappings;
  switch (kind) {
    case "button":
      container = qs("#controls-buttons-inner");
      outputs = g.controls.actions;
      mappings = g.controls.actionMappings;
      break;
    case "axis":
      container = qs("#controls-axes-inner");
      outputs = g.controls.outAxes;
      mappings = g.controls.axisMappings;
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
      const mInAxis = mapping?.inAxis || "None";
      const mInvert = mapping?.invert || false;
      const mDeadzone = mapping?.deadzone || 0.0;
      const mMode = mapping?.mode || "direct";
      const mGain = typeof mapping?.gain === "number" ? mapping.gain : -1;
      item.dataset.mapping = mInAxis;
      item.dataset.inverted = mInvert;
      item.dataset.deadzone = mDeadzone;
      item.dataset.gain = mGain;
      mappingString = stringifyAxisMapping(mInAxis, mInvert, mDeadzone, mMode, mGain);
    } else {
      const mButton = mapping?.button || "None";
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
function makeMappingModal(mapping) {
  if (qs(".modal-bg")) {
    console.error("Tried to open a control mapping modal while another modal was open.");
    return;
  }

  const kind = mapping.dataset.kind;
  const output = mapping.dataset.output;
  const currentInput = mapping.dataset.mapping.split(/\s*,\s*/);
  while (currentInput.length < 2) currentInput.push("None");

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

  const priSelect = makeInputSelect(
    "ctrl-input-primary",
    kind === "button" ? g.controls.buttons : g.controls.inAxes,
    currentInput[0]
  );
  fg.appendChild(priSelect);

  if (kind === "button") {
    const secSelect = makeInputSelect("ctrl-input-secondary", g.controls.buttons, currentInput[1]);
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
          <option class="ctrl-modal-option" value="inverted"${inverted ? " selected": ""}>inverted</option>
        </select>
      </label>
      <label for="ctrl-input-deadzone" class="flex-c f-g4 w100 mb16">
        <span>Deadzone (0–1)</span>
        <input id="ctrl-input-deadzone" type="text" class="w100" pattern="^\\d*[\\.,]?\\d+$" maxlength="4"
          value="${deadzone}"/>
      </label>
      <label for="ctrl-input-method" class="flex-c f-g4 w100 mb16">
        <span>Input processing</span>
        <select id="ctrl-input-method" class="ctrl-modal-options mb0">
          <option class="ctrl-modal-option" value="direct"${gain < 0 ? " selected" : ""}>direct</option>
          <option class="ctrl-modal-option" value="differential"${gain < 0 ? "": " selected"}>differential</option>
        </select>
      </label>
      <label for="ctrl-input-gain" class="flex-c f-g4 w100 mb16${gain < 0 ? " hidden" : ""}">
        <span>Gain</span>
        <input id="ctrl-input-gain" type="text" class="w100" pattern="^^\\d*[\\.,]?\\d+$" maxlength="5"
          value="${gain < 0 ? "0" : gain}" />
      </label>
    `);
  }

  fg.insertAdjacentHTML("beforeend", `
    <div class="flex-r f-j-c f-g8">
      <button type="button" class="btn" id="ctrl-modal-ok">Ok</button>
      <button type="button" class="btn" id="ctrl-modal-cancel">Cancel</button>
    </div>
  `);

  const inputMethod = fg.querySelector("#ctrl-input-method");
  if (inputMethod) {
    inputMethod.addEventListener("change", function () {
      const gainWrapper = fg.querySelector(`label[for="ctrl-input-gain"]`);
      if (this.value === "direct") {
        gainWrapper.classList.add("hidden");
      } else {
        gainWrapper.classList.remove("hidden");
      }
    });
  }
  fg.querySelector("#ctrl-modal-ok").addEventListener("click", () => applyCtrlMapping(kind));
  fg.querySelector("#ctrl-modal-cancel").addEventListener("click", () => qs(".modal-bg[data-output]")?.remove());

  bg.appendChild(fg);
  document.body.append(bg);

}
const makeInputSelect = function(id, options, current) {
  const select = document.createElement("select");
  select.className = "ctrl-modal-options";
  select.id = id;
  for (const opt of options) {
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
function applyCtrlMapping(kind) {
  const modal = qs(".modal-bg[data-output]");
  if (!modal) {
    console.error("Tried to applyCtrlMapping while the mapping modal wasn't open.");
    return;
  }

  const output = modal.dataset.output;
  const relevantWrapper = qs(`.ctrl-wrapper[data-output="${output}"]`);
  if (!relevantWrapper) {
    makeToast("error", `Error: No .ctrl-wrapper for '${output}' exists!`, 3500);
    modal.remove();
    return;
  }
  const mappingInDOM = relevantWrapper.querySelector(".ctrl-input-current");

  const input1 = modal.querySelector("#ctrl-input-primary").value;
  const input2 = kind === "button" ? modal.querySelector("#ctrl-input-secondary").value : "None";
  const whitelistedMappings = g.controls.restrictions[output]?.map(x => _.sortBy(x.split(/\s*,\s*/)));
  let desiredMapping = _.without(_.uniq([input1,input2]), "None");
  if (!desiredMapping.length) {
    desiredMapping = ["None"];
  }

  if (whitelistedMappings
  && !whitelistedMappings.some(x => _.isEqual(x, _.sortBy(desiredMapping)))) {
    makeToast("error", "This mapping is not allowed. Whitelisted options for this action/axis:\n\n"
      + whitelistedMappings.map(x => `<p class="tiny-p mb0">${x.join(" + ")}</p>`).join(""),
      5000
    );
    return;
  }

  const resolvedMapping = desiredMapping.join(", ");
  let newInvert, newDeadzone, newMode, newGain;
  let hasChanged = false;
  if (kind === "button") {
    if (resolvedMapping !== g.controls.actionMappings[output]?.button) {
      hasChanged = true;
    }
  } else if (kind === "axis") {
    try {
      newInvert = modal.querySelector("#ctrl-input-invert")?.value === "inverted";
      newDeadzone = Number(modal.querySelector("#ctrl-input-deadzone")?.value?.replace(",", ".") || 0);
      if (isNaN(newDeadzone) || newDeadzone < 0 || newDeadzone > 1) {
        throw new Error(`invalid deadzone '${newDeadzone}' (must be a number 0.0–1.0)`)
      }
      newMode = modal.querySelector("#ctrl-input-method")?.value || "direct";
      newGain = Number(modal.querySelector("#ctrl-input-gain").value?.replace(",", ".") || 0);
      if (isNaN(newGain) || newGain < 0) {
        throw new Error(`invalid gain '${newGain}' (must be a non-negative number)`)
      }
    } catch (err) {
      makeToast("error", `Error processing modal data for axis:\n\n${err.toString()}`, 7500);
      return;
    }

    const currentSettings = g.controls.axisMappings[output];
    if (resolvedMapping !== currentSettings?.inAxis
    ||        newInvert !== currentSettings?.invert
    ||      newDeadzone !== currentSettings?.deadzone
    ||          newMode !== currentSettings?.mode
    || (currentSettings?.mode === "differential" && newGain !== currentSettings?.gain)
    ) {
      hasChanged = true;
    }
  }

  if (hasChanged) {
    relevantWrapper.dataset.mapping = resolvedMapping;
    if (kind === "axis") {
      mappingInDOM.innerText = stringifyAxisMapping(resolvedMapping, newInvert, newDeadzone, newMode, newGain);
      relevantWrapper.dataset.inverted = newInvert;
      relevantWrapper.dataset.deadzone = newDeadzone;
      relevantWrapper.dataset.gain = newMode === "differential" ? newGain : -1;
    } else {
      mappingInDOM.innerText = resolvedMapping;
    }
    mappingInDOM.classList.add("modified");
    makeToast("success", "Mapping staged.\n\nHit the 'Apply' button to submit to server.");
  } else {
    mappingInDOM.classList.remove("modified");
    makeToast(null, "Keeping original mapping.", 1500);
  }
  modal.remove();
}


async function submitMappings() {
  if (!qs(".ctrl-input-current.modified")) {
    makeToast(null, "No changes made, not submitting.");
    return;
  }

  const payload = {
    ControlActionsSettings: {},
    PlaneAxesSettings: {},
  };

  // buttons-actions
  const actionElements = qsa("#controls-buttons-inner .ctrl-wrapper");
  for (const ae of actionElements) {
    payload.ControlActionsSettings[ae.dataset.output] = ae.dataset.mapping;
  }

  // axes
  const axisElements = qsa("#controls-axes-inner .ctrl-wrapper");
  for (const ae of axisElements) {
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

  let raw = null;
  try {
    raw = await postWithTimeout(g.server.baseurl + "/settings/control/", payload);
  } catch (err) {
    makeToast("error", "Failed - network error:\n\n" + err.toString(), 5000);
    raw = null;
  }
  if (raw) {
    try {
      const resp = await raw.json();
      g.controls.actionMappings = convertActionMappings(resp.ControlActionsSettings);
      g.controls.axisMappings = convertAxisMappings(resp.PlaneAxesSettings);
      makeMappingList("button");
      makeMappingList("axis");

      if (raw.ok) {
        makeToast("success", "Successfully updated.");
      } else {
        makeToast("error", `POST failed - ${raw.status}:\n\n${raw.statusText}\n\nRefreshed mappings from server.`, 7500);
      }
    } catch (err) {
      if (raw.ok) {
        makeToast("error", `POST succeeded, but can't process response:\n\n${err.toString()}`, 7500);
      } else {
        makeToast("error", `Failed utterly - ${raw.status}:\n\n${raw.statusText}`, 7500);
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
function convertActionMappings(respMappings) {
  if (!respMappings) {
    throw new Error("invalid data for convertActionMappings");
  }
  const processedMappings = {};
  for (const [action, mapping] of Object.entries(respMappings)) {
    processedMappings[action] = { "button": mapping };
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
function convertAxisMappings(respMappings) {
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

const stringifyAxisMapping = function(mapping, invert, deadzone, mode, gain) {
  if (mapping === "None") return "unbound";
  return `${mapping}, inv=${invert ? "1" : "0"}, dz=${deadzone}, ${mode === "direct" ? "direct" : ("gain="+gain)}`;
}