window.serverConfig = (function()
{
  let _configTypes = [];
  let _availableConfigs = {};


  function init() {
    utils.qs("#settings-configs-type-select").addEventListener("change", _updateConfigNameSelect);
    utils.qs("#settings-configs-load").addEventListener("click", _loadConfig);
    utils.qs("#settings-configs-save").addEventListener("click", _saveConfig);
  }


  /** Fetch existing config types and stored configs from the server. */
  async function getFreshServerConfigs() {
    let resp;
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + "/config/list/");
      resp = await raw.json();
    } catch (err) {
      ui.makeToast("error", "Couldn't fetch a list of saved configs.\n\n" + err.toString(), 5000);
      return;
    }

    _configTypes = resp.ConfigurationTypes;
    for (const [cfgType, cfgNameList] of Object.entries(resp.StoredConfigurationsPerType)) {
      configs = _.without(cfgNameList, "latest");
      configs.sort();
      _availableConfigs[cfgType] = configs;
    }

    _updateConfigTypeSelect();
  }


  /** Populate the config type selector with available config types.
   * @param {string} [selected="plane"] initially selected option, auto-loads a list of its configs
   */
  function _updateConfigTypeSelect(selected = "plane") {
    const typeSelect = utils.qs("#settings-configs-type-select");
    Array.from(typeSelect.children).forEach(x => x.remove());

    for (const cfgType of _configTypes) {
      typeSelect.insertAdjacentHTML("beforeend", `
      <option value="${cfgType}"${cfgType===selected ? " selected" : ""}>${cfgType}</option>`);
    }

    _updateConfigNameSelect();
  }


  /** Populate the stored config selector with options for the selected config type. */
  function _updateConfigNameSelect() {
    const nameSelect = utils.qs("#settings-configs-name-select");
    Array.from(nameSelect.children).forEach(x => x.remove());

    nameSelect.insertAdjacentHTML("beforeend", `
    <option value="__NEW__">(new)</option>`);

    const selectedType = utils.qs("#settings-configs-type-select").value;
    for (const cfgName of _availableConfigs[selectedType] ?? []) {
      nameSelect.insertAdjacentHTML("beforeend", `
      <option value="${cfgName}">${cfgName}</option>`);
    }
  }


  async function _loadConfig() {
    const cfgType = utils.qs("#settings-configs-type-select").value;
    const cfgName = utils.qs("#settings-configs-name-select").value;

    if (cfgName === "__NEW__") {
      ui.makeToast("error", "Cannot load a non-existent configuration.");
      return;
    }

    const payload = { ConfigType: cfgType, ConfigId: cfgName };
    console.debug("loadConfig payload:", payload);

    let success = false;
    await ajax.postWithTimeout(
      backend.baseurl + "/config/load/",
      payload,
      (resp) => {
        if (resp.Success) {
          success = true;
          ui.makeToast("success", `Loaded ${cfgType} config '${cfgName}'.`);
          _applyConfig(cfgType);
        } else {
          ui.makeToast("error", `Failed to load ${cfgType} config '${cfgName}'.\n\n${resp.Message}`, 5000);
        }
      },
      (_, err) => {
        ui.makeToast("error", `Failed to load ${cfgType} config '${cfgName}'.\n\n` + err.toString(), 5000);
      }
    );
  }


  /** Reload whatever needs reloading to reflect the loaded config.
   * @param {string} cfgType which configuration type was applied
   */
  async function _applyConfig(cfgType) {
    switch (cfgType) {
      case "plane":
        pages.plane.getFreshTrim();
        pages.plane.getFreshMaxSurfaceAngles();
        pages.settings.getFreshRadioSettings();
        break;
      case "user":
        pages.controls.getFreshControls();
        pages.settings.getFreshArduinoPortsAndSettings(backend);
        break;
    }
  }


  async function _saveConfig() {
    const cfgType = utils.qs("#settings-configs-type-select").value;
    let cfgName = utils.qs("#settings-configs-name-select").value;

    if (cfgName === "__NEW__") {
      const newName = await ui.makePopup("prompt", "Enter a name for the new configuration.", "Name needed");

      // user cancel
      if (newName === null) return;
      
      // invalid name
      if (!newName) {
        ui.makeToast("error", "Cannot save configuration without a name.");
        return;
      }

      cfgName = newName;
    }

    // if exists, ask for confirmation
    if (_availableConfigs[cfgType]?.includes(cfgName)) {
      const consent = await ui.makePopup("confirm",
        `The configuration '${cfgName}' already exists. Okay to overwrite?`, "Confirm overwrite");
      if (!consent) return;
    }

    const payload = { ConfigType: cfgType, ConfigId: cfgName };
    console.debug("saveConfig payload:", payload);

    let success = false;
    await ajax.postWithTimeout(
      backend.baseurl + "/config/save/",
      payload,
      (resp) => {
        if (resp.Success) {
          success = true;
          ui.makeToast("success", `Saved ${cfgType} config '${cfgName}'.`);
        } else {
          ui.makeToast("error", `Failed to save ${cfgType} config '${cfgName}'.\n\n${resp.Message}`, 5000);
        }
      },
      (_, err) => {
        ui.makeToast("error", `Failed to save ${cfgType} config '${cfgName}'.\n\n` + err.toString(), 5000);
      }
    );
  }


  // public API
  return {
    init,
    getFreshServerConfigs,
  }
})();