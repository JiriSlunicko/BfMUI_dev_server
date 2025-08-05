window.settings.maxSurfaceAngles = (function()
{
  let _staged = {};

  let _maxSurfaceAngles = {
    limits: {
      min: 0,
      max: 90,
    },
    surfaces: {},
  }


  async function init() {
    utils.qs("#plane-angles-inner").addEventListener("click", function (e) {
      const button = e.target.closest("#plane-angles-apply-btn");
      if (button) save();
    });

    utils.qs("#plane-angles-inner").addEventListener("slider-change", function (e) {
      const slider = e.target.closest(".range-text-pair");
      if (!slider) return;

      const surface = /plane-angles-(.+?)-text/.exec(slider.getAttribute("for"))?.[1];
      if (!surface) return;

      _staged[surface] = parseInt(e.detail.value);
    })

    return true;
  }


  async function load() {
    const success = await _fetchData();

    const container = utils.qs("#plane-angles-inner");
    if (success) {
      const min = _maxSurfaceAngles.limits.min;
      const max = _maxSurfaceAngles.limits.max;
      const surfaces = _maxSurfaceAngles.surfaces;
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
    } else {
      container.innerHTML = `<p>Failed to fetch data.</p>`;
    }

    return success;
  }


  async function save() {
    const payload = _staged;
    console.debug("max angles payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.maxSurfaceAnglesPost,
      payload,
      (resp) => {
        _maxSurfaceAngles.surfaces = {};
        for (const [surfName, surfMaxAngle] of Object.entries(resp)) {
          _maxSurfaceAngles.surfaces[surfName] = surfMaxAngle;
        }
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    return !_.isEqual(_staged, _maxSurfaceAngles.surfaces);
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
      }
      _setStagedToActual();
      return true;
    } catch (err) {
      const errorString = "Error fetching max. surface angles data.\n\n" + err.toString();
      console.error(errorString, err);
      ui.makeToast("error", errorString, 5000);
      return false;
    }
  }


  function _setStagedToActual() {
    _staged = JSON.parse(JSON.stringify(_maxSurfaceAngles.surfaces));
  }


  // public API
  return {
    init,
    load,
    save,
    hasPendingChanges,
  }
})();