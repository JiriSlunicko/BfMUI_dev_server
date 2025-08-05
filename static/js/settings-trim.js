window.settings.trim = (function()
{
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
      if (button) save();
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
      const surfaces = _trimValues.surfaces;
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
    } else {
      container.innerHTML = `<p>Failed to fetch data.</p>`;
    }

    return success;
  }


  async function save() {
    const payload = _staged;
    console.debug("trim payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.trimPost,
      payload,
      (resp) => {
        _trimValues.surfaces = {};
        for (const [surfName, surfTrim] of Object.entries(resp)) {
          _trimValues.surfaces[surfName] = surfTrim;
        }
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    return !_.isEqual(_staged, _trimValues.surfaces);
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
      }
      _setStagedToActual();
      return true;
    } catch (err) {
      const errorString = "Error fetching trim data.\n\n" + err.toString();
      console.error(errorString, err);
      ui.makeToast("error", errorString, 5000);
      return false;
    }
  }


  function _setStagedToActual() {
    _staged = JSON.parse(JSON.stringify(_trimValues.surfaces));
  }


  // public API
  return {
    init,
    load,
    save,
    hasPendingChanges,
  }
})();