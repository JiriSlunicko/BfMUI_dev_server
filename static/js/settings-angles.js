window.settings.maxSurfaceAngles = (function()
{
  let _initialised = false;

  let _staged = {};

  let _lastFetchOk = null;

  let _maxSurfaceAngles = {
    limits: {
      min: 0,
      max: 90,
    },
    surfaces: {},
  }


  async function init() {
    utils.qs("#plane-angles-inner").addEventListener("click", function (e) {
      const applyButton = e.target.closest("#plane-angles-submit-btn");
      if (applyButton && hasPendingChanges()) {
        save();
        return;
      }

      const resetButton = e.target.closest("#plane-angles-reset-btn");
      if (resetButton) {
        reset();
        return;
      }
    });

    utils.qs("#plane-angles-inner").addEventListener("slider-change", function (e) {
      const slider = e.target.closest(".range-text-pair");
      if (!slider) return;

      const surface = /plane-angles-(.+?)-text/.exec(slider.getAttribute("for"))?.[1];
      if (!surface) return;

      _staged[surface] = parseInt(e.detail.value);
    });

    return true;
  }


  async function load() {
    _lastFetchOk = await _fetchData();
    _render();
    return _lastFetchOk;
  }


  function reset() {
    for (const surface of Object.keys(_staged)) {
      _staged[surface] = null;
    }
    _render();
  }


  async function save() {
    const payload = {};
    for (const [surface, serverValue] of Object.entries(_maxSurfaceAngles.surfaces)) {
      payload[surface] = _staged[surface] ?? serverValue;
    }
    console.debug("max angles payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.maxSurfaceAnglesPost,
      payload,
      (resp) => {
        _maxSurfaceAngles.surfaces = {};
        for (const [surfName, surfMaxAngle] of Object.entries(resp)) {
          _maxSurfaceAngles.surfaces[surfName] = surfMaxAngle;
          _staged[surfName] = null;
        }
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    for (const [surface, serverValue] of Object.entries(_maxSurfaceAngles.surfaces)) {
      if (_staged[surface] !== null && _staged[surface] !== serverValue)
        return true;
    }
    return false;
  }


  async function _fetchData() {
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + backend.endpoints.maxSurfaceAnglesGet);
      if (raw.status !== 200) {
        throw new Error(backend.endpoints.maxSurfaceAnglesGet + " returned " + raw.status);
      }
      const resp = await raw.json();
      _maxSurfaceAngles.surfaces = {};
      for (const surface of resp.AvailableSurfaces) {
        _maxSurfaceAngles.surfaces[surface] = resp.MaxSurfaceAngles[surface] || 0;
        if (!_initialised)
          _staged[surface] = null;
      }
      _initialised = true;
      return true;
    } catch (err) {
      const errorString = "Error fetching max. surface angles data.\n\n" + err.toString();
      console.error(errorString, err);
      ui.makeToast("error", errorString, 5000);
      return false;
    }
  }


  function _render() {
    const container = utils.qs("#plane-angles-inner");

    if (!_lastFetchOk) {
      container.innerHTML = `<p>Failed to fetch data.</p>`;
      return;
    }

    const min = _maxSurfaceAngles.limits.min;
    const max = _maxSurfaceAngles.limits.max;
    container.querySelector("p")?.remove();

    for (const [surface, serverValue] of Object.entries(_maxSurfaceAngles.surfaces)) {
      const maxAngle = _staged[surface] ?? serverValue;
      let myWrapper = container.querySelector(`label[for="plane-angles-${surface}-text"]`);

      if (myWrapper === null) {
        // create the UI element if not exists
        container.innerHTML += ui.makeRangeTextInputPair(
          "plane-angles-" + surface, surface, {
          bounds: { min: min, max: max }, step: 1, value: maxAngle, scaling: "linear"
        }
        );
      } else {
        // or update an existing element
        const textInput = myWrapper.querySelector("input[type=text]");
        textInput.value = maxAngle;
        textInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // make apply button if not exists
    if (container.querySelector("#plane-angles-submit-btn") === null) {
      container.insertAdjacentHTML("beforeend", `
          <div class="flex-r f-g8">
            <button type="button" class="btn" id="plane-angles-submit-btn">Apply</button>
            <button type="button" class="btn" id="plane-angles-reset-btn">Cancel</button>
          </div>`);
    }
  }


  // public API
  return {
    init,
    load,
    reset,
    save,
    hasPendingChanges,
  }
})();