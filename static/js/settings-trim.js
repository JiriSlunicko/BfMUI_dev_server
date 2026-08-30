window.settings.trim = (function()
{
  const _m = "settings.trim";

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

  const _throttleSave = _.throttle(save, 1000, { trailing: false, });


  async function init() {
    // apply / reset buttons
    utils.qs("#plane-trim-inner").addEventListener("click", function (e) {
      const applyButton = e.target.closest("#plane-trim-submit-btn");
      if (applyButton && hasPendingChanges()) {
        _throttleSave();
        return;
      }

      const resetButton = e.target.closest("#plane-trim-reset-btn");
      if (resetButton) {
        reset();
        return;
      }
    });

    // sliders: stage changes on user edit
    utils.qs("#plane-trim-inner").addEventListener("slider-change", function(e) {
      if (!e.detail.byUser) return; // automated changes -> don't stage
      
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
    _staged = {};
    _render();
  }


  async function save() {
    const payload = {};
    for (const [surface, serverValue] of Object.entries(_trimValues.surfaces)) {
      payload[surface] = utils.coalesceUndef(_staged[surface], serverValue);
    }
    logger.debug(_m, "trim payload:", payload);

    const success = await ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.trimPost,
      {
        options: {
          method: "POST",
          body: JSON.stringify(payload),
        },
        successHandler: (resp) => {
          _trimValues.surfaces = {};
          for (const [surfName, surfTrim] of Object.entries(resp)) {
            _trimValues.surfaces[surfName] = surfTrim;
          }
          _staged = {};
          ui.makeToast("success", "Successfully updated.");
        },
        failureHandler: ajax.handleJsonAjaxFail,
      }
    );

    return success;
  }


  function hasPendingChanges() {
    for (const [surface, serverValue] of Object.entries(_trimValues.surfaces)) {
      if (_staged[surface] !== undefined && _staged[surface] !== serverValue) {
        return true;
      }
    }
    return false;
  }


  function _fetchData() {
    return ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.trimGet,
      {
        successHandler: (resp) => {
          _trimValues.surfaces = {};
          for (const surface of resp.AvailableSurfaces) {
            _trimValues.surfaces[surface] = resp.TrimValues[surface] ?? 0;
          }
          _initialised = true;
        },
        failureHandler: ajax.handleJsonAjaxFail,
      }
    );
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
      const trimValue = utils.coalesceUndef(_staged[surface], serverValue);
      let myWrapper = container.querySelector(`label[for="plane-trim-${surface}-text"]`);

      if (myWrapper === null) {
        // create the UI element if not exists
        container.innerHTML += ui.makeRangeTextInputPair(
          `plane-trim-${surface}`,
          surface,
          {
            bounds: {
              min: min,
              max: max,
            },
            step: 1,
            value: trimValue,
            scaling: "linear",
          }
        );
      } else {
        // or update an existing element
        const textInput = myWrapper.querySelector("input[type=text]");
        textInput.value = trimValue;
        textInput.dispatchEvent(
          new CustomEvent("backend-refresh", { bubbles: true, }));
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
  };
})();
