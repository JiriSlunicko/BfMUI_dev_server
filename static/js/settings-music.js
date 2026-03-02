window.settings.music = (function()
{
  let _staged = {
    volume: null,
  }

  let _music = {
    volume: null
  }


  async function init() {
    // volume
    const volumePlaceholder = utils.qs("#settings-music-volume-placeholder");
    volumePlaceholder.outerHTML = ui.makeRangeTextInputPair(
      "settings-music-volume", "Volume", {
        bounds: {min:0.0, max:100}, step: 1, value: 0, scaling: "linear", incrementButtons: false
      }, "mb16"
    );
    utils.qs(`label[for="settings-music-volume-text"]`).addEventListener("slider-change", (e) => {
      if (e.detail.byUser) {
        _staged.volume = parseInt(e.detail.value);
      }
    });

    // submit
    utils.qs("#settings-music-submit-btn").addEventListener("click", utils.throttle(() => {
      if (hasPendingChanges()) save();
    }, 1000));
    // reset
    utils.qs("#settings-music-reset-btn").addEventListener("click", reset);

    return true;
  }


  async function load() {
    const musicEnabled = await _fetchData(backend);
    if (musicEnabled === null)
      return false; // loading error
    _render();
    return true;
  }


  function reset() {
    _staged.volume = null;
    _render();
  }


  async function save() {
    const payload = {
      Volume: (_staged.volume ?? _music.volume) / 100,
    };
    console.debug("music payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.musicPost,
      payload,
      (resp) => {
        _music.volume = Math.round(resp.Volume * 100);
        _staged.volume = null;
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    return _staged.volume !== null && _staged.volume !== _music.volume;
  }


  /** Load fresh data from the server into _music.
   * @param {object} globalServer backend - .musicEnabled will be updated
   * @returns {Promise<boolean|null>} true = music enabled, false = not enabled, null = error
   */
  async function _fetchData(globalServer) {
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + backend.endpoints.musicGet);
      globalServer.musicEnabled = raw.status === 200;

      if (globalServer.musicEnabled) {
        const resp = await raw.json();
        _music.volume = Math.round(resp.Volume * 100);
        return true;
      } else {
        console.debug("Music is not enabled.");
        return false;
      }
    } catch (err) {
      console.error("Music fetch error:", err);
      return null;
    }
  }


  function _render() {
    const musicPanel = utils.qs("#settings-music");

    if (!backend.musicEnabled) {
      musicPanel.classList.add("hidden");
      return;
    }

    musicPanel.classList.remove("hidden");
    const resolvedVolume = _staged.volume ?? _music.volume;
    musicPanel.querySelector("#music-error")?.remove();
    musicPanel.querySelector("#settings-music-volume-range").value = resolvedVolume;
    musicPanel.querySelector("#settings-music-volume-text").value = resolvedVolume;
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