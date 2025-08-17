window.settings.trim = (function()
{
  let _initialised = false;

  let _staged = {};

  let _lastFetchOk = null;

  let _trimValues = {
    limits: {
      min: -90,
      max: 90,
    },
    surfaces: {},
  }


  async function init() {
    utils.qs("#plane-trim-inner").addEventListener("click", function (e) {
      const applyButton = e.target.closest("#plane-trim-submit-btn");
      if (applyButton && hasPendingChanges()) {
        utils.throttle(save, 1000)();
        return;
      }

      const resetButton = e.target.closest("#plane-trim-reset-btn");
      if (resetButton) {
        reset();
        return;
      }
    });

    utils.qs("#plane-trim-inner").addEventListener("slider-change", function(e) {
      const slider = e.target.closest(".range-text-pair");
      if (!slider) return;
      
      const surface = /plane-trim-(.+?)-text/.exec(slider.getAttribute("for"))?.[1];
      if (!surface) return;

      _staged[surface] = parseInt(e.detail.value);
    })

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
    for (const [surface, serverValue] of Object.entries(_trimValues.surfaces)) {
      payload[surface] = _staged[surface] ?? serverValue;
    }
    console.debug("trim payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.trimPost,
      payload,
      (resp) => {
        _trimValues.surfaces = {};
        for (const [surfName, surfTrim] of Object.entries(resp)) {
          _trimValues.surfaces[surfName] = surfTrim;
          _staged[surfName] = null;
        }
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    for (const [surface, serverValue] of Object.entries(_trimValues.surfaces)) {
      if (_staged[surface] !== null && _staged[surface] !== serverValue)
        return true;
    }
    return false;
  }


  async function _fetchData() {
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + backend.endpoints.trimGet);
      if (raw.status !== 200) {
        throw new Error(backend.endpoints.trimGet + " returned " + raw.status);
      }
      const resp = await raw.json();
      _trimValues.surfaces = {};
      for (const surface of resp.AvailableSurfaces) {
        _trimValues.surfaces[surface] = resp.TrimValues[surface] || 0;
        if (!_initialised)
          _staged[surface] = null;
      }
      _initialised = true;
      return true;
    } catch (err) {
      const errorString = "Error fetching trim data.\n\n" + err.toString();
      console.error(errorString, err);
      ui.makeToast("error", errorString, 5000);
      return false;
    }
  }


  function _render() {
    const container = utils.qs("#plane-trim-inner");

    if (!_lastFetchOk) {
      container.innerHTML = `<p>Failed to fetch data.</p>`;
      return;
    }

    const min = _trimValues.limits.min;
    const max = _trimValues.limits.max;
    container.querySelector("p")?.remove();

    for (const [surface, serverValue] of Object.entries(_trimValues.surfaces)) {
      const trimValue = _staged[surface] ?? serverValue;
      let myWrapper = container.querySelector(`label[for="plane-trim-${surface}-text"]`);

      if (myWrapper === null) {
        // create the UI element if not exists
        container.innerHTML += ui.makeRangeTextInputPair(
          "plane-trim-" + surface, surface, {
          bounds: { min: min, max: max }, step: 1, value: trimValue, scaling: "linear"
        }
        );
      } else {
        // or update an existing element
        const textInput = myWrapper.querySelector("input[type=text]");
        textInput.value = trimValue;
        textInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // make apply button if not exists
    if (container.querySelector("#plane-trim-submit-btn") === null) {
      container.insertAdjacentHTML("beforeend", `
          <div class="flex-r f-g8">
            <button type="button" class="btn" id="plane-trim-submit-btn">Save</button>
            <button type="button" class="btn" id="plane-trim-reset-btn">Reset</button>
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