window.settings.trim = (function()
{
  let _initialised = false;

  let _staged = {};

  let _trimValues = {
    limits: {
      min: -90,
      max: 90,
    },
    surfaces: {},
  }


  async function init() {
    utils.qs("#plane-trim-inner").addEventListener("click", function (e) {
      const button = e.target.closest("#plane-trim-apply-btn");
      if (button && hasPendingChanges())
        save();
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
    const success = await _fetchData();

    const container = utils.qs("#plane-trim-inner");

    if (success) {
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
          textInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      // make apply button if not exists
      if (container.querySelector("#plane-trim-apply-btn") === null) {
        container.insertAdjacentHTML("beforeend", `
          <div class="flex-r">
            <button type="button" class="btn" id="plane-trim-apply-btn">Apply trim settings</button>
          </div>`);
      }
    } else {
      container.innerHTML = `<p>Failed to fetch data.</p>`;
    }

    return success;
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


  // public API
  return {
    init,
    load,
    save,
    hasPendingChanges,
  }
})();