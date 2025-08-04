window.pages.plane = (function() {
  let _maxSurfaceAngles = {
    limits: {
      min: 0,
      max: 90,
    },
    surfaces: {},
  }

  let _trimValues = {
    limits: {
      min: -90,
      max: 90,
    },
    surfaces: {},
  }


  function init() {
    // max surface angles
    utils.qs("#plane-angles-inner").addEventListener("click", function (e) {
      const button = e.target.closest("#plane-angles-apply-btn");
      if (button) _submitMaxSurfaceAngleSettings();
    });

    // trim values
    utils.qs("#plane-trim-inner").addEventListener("click", function(e) {
      const button = e.target.closest("#plane-trim-apply-btn");
      if (button) _submitTrimSettings();
    })
  }


  /** Load max surface angle & trim data once connected to a server.
   * @returns {object} bool success per task
   */
  async function onConnected() {
    const msaSuccess = await getFreshMaxSurfaceAngles();
    const trimSuccess = await getFreshTrim();

    return {
      maxSurfaceAngles: msaSuccess,
      trim: trimSuccess
    };
  }

  async function getFreshMaxSurfaceAngles() {
    const msaSuccess = await _fetchMaxSurfaceAnglesData();
    if (msaSuccess) _renderMaxSurfaceAngleSettings();
    return msaSuccess;
  }

  async function getFreshTrim() {
    const trimSuccess = await _fetchTrimData();
    if (trimSuccess) _renderTrimSettings();
    return trimSuccess;
  }


  /** Get max. surface angles.
   * @returns {Promise<boolean>} success?
   */
  async function _fetchMaxSurfaceAnglesData() {
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + "/settings/maxsurfaceangles/");
      if (raw.status !== 200) {
        throw new Error("/settings/maxsurfaceangles/ returned " + raw.status);
      }
      const resp = await raw.json();
      _maxSurfaceAngles.surfaces = {};
      for (const surface of resp.AvailableSurfaces) {
        _maxSurfaceAngles.surfaces[surface] = resp.MaxSurfaceAngles[surface] || 0;
      }
      return true;
    } catch (err) {
      const errorString = "Error fetching max. surface angles data.\n\n" + err.toString();
      console.error(errorString, err);
      ui.makeToast("error", errorString, 5000);
      return false;
    }
  }


  /** Render the settings interface for max. surface angles. */
  function _renderMaxSurfaceAngleSettings() {
    const min = _maxSurfaceAngles.limits.min;
    const max = _maxSurfaceAngles.limits.max;
    const surfaces = _maxSurfaceAngles.surfaces;
    const container = utils.qs("#plane-angles-inner");
    let newHTML = "";
    for (const [name, maxAngle] of Object.entries(surfaces)) {
      newHTML += ui.makeRangeTextInputPair(
        "plane-angles-" + name, name, {
          bounds: { min: min, max: max }, step: 1, value: maxAngle, scaling: "linear"
        }
      );
    };
    newHTML += `
    <div class="flex-r">
      <button type="button" class="btn" id="plane-angles-apply-btn">Apply max angles settings</button>
    </div>`;
    container.innerHTML = newHTML;
  }


  /** POST max surface angles settings to server & process its response. */
  async function _submitMaxSurfaceAngleSettings() {
    const payload = {};
    _.toArray(utils.qsa("#plane-angles-inner input[type=text]")).forEach(el => {
      const name = /plane-angles-(.+?)-text/.exec(el.id)?.[1];
      if (name === undefined) {
        throw new Error("Can't extract surface name from text input ID", el.id);
      }
      const val = Number(el.value);
      payload[name] = val;
    });
    console.debug("submitMaxSurfaceAngleSettings payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + "/settings/maxsurfaceangles/",
      payload,
      (resp) => {
        _maxSurfaceAngles.surfaces = {};
        for (const [surfName, surfMaxAngle] of Object.entries(resp)) {
          _maxSurfaceAngles.surfaces[surfName] = surfMaxAngle;
        }
        _renderMaxSurfaceAngleSettings();
        ui.makeToast("success", "Successfully updated.");
      }
    );
  }


  /** Get trim values.
   * @returns {Promise<boolean>} success?
   */
  async function _fetchTrimData() {
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + "/settings/trim/");
      if (raw.status !== 200) {
        throw new Error("/settings/trim/ returned " + raw.status);
      }
      const resp = await raw.json();
      _trimValues.surfaces = {};
      for (const surface of resp.AvailableSurfaces) {
        _trimValues.surfaces[surface] = resp.TrimValues[surface] || 0;
      }
      return true;
    } catch (err) {
      const errorString = "Error fetching trim data.\n\n" + err.toString();
      console.error(errorString, err);
      ui.makeToast("error", errorString, 5000);
      return false;
    }
  }


  /** Render the settings interface for trim. */
  function _renderTrimSettings() {
    const min = _trimValues.limits.min;
    const max = _trimValues.limits.max;
    const surfaces = _trimValues.surfaces;
    const container = utils.qs("#plane-trim-inner");
    let newHTML = "";
    for (const [name, trim] of Object.entries(surfaces)) {
      newHTML += ui.makeRangeTextInputPair(
        "plane-trim-" + name, name, {
          bounds: { min: min, max: max }, step: 1, value: trim, scaling: "linear"
        }
      );
    };
    newHTML += `
    <div class="flex-r">
      <button type="button" class="btn" id="plane-trim-apply-btn">Apply trim settings</button>
    </div>`;
    container.innerHTML = newHTML;
  }


  /** POST trim values settings to server & process its response. */
  async function _submitTrimSettings() {
    const payload = {};
    _.toArray(utils.qsa("#plane-trim-inner input[type=text]")).forEach(el => {
      const name = /plane-trim-(.+?)-text/.exec(el.id)?.[1];
      if (name === undefined) {
        throw new Error("Can't extract surface name from text input ID", el.id);
      }
      const val = Number(el.value);
      payload[name] = val;
    });
    console.debug("submitTrimSettings payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + "/settings/trim/",
      payload,
      (resp) => {
        _trimValues.surfaces = {};
        for (const [surfName, surfTrim] of Object.entries(resp)) {
          _trimValues.surfaces[surfName] = surfTrim;
        }
        _renderTrimSettings();
        ui.makeToast("success", "Successfully updated.");
      }
    );
  }


  // public API
  return {
    init,
    activate: () => {},
    deactivate: () => {},
    onConnected,
    getFreshMaxSurfaceAngles,
    getFreshTrim,
  }
})();