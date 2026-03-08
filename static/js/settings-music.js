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
      "settings-music-volume", "Volume %", {
        bounds: {min: 0.0, max: 100}, step: 0.1, value: 0,
        scaling: "logarithmic", textInputClassOverride: "w6ch"
      }, "mb16"
    );
    utils.qs(`label[for="settings-music-volume-text"]`).addEventListener("slider-change", (e) => {
      if (e.detail.byUser) {
        _staged.volume = parseFloat(e.detail.value);
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
      Volume: _convertOutgoing(_staged.volume ?? _music.volume),
    };
    console.debug("music payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.musicPost,
      payload,
      (resp) => {
        _music.volume = _convertIncoming(resp.Volume);
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
        _music.volume = _convertIncoming(resp.Volume);
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


  /** Convert <0.000,1.000> to <0.0,100.0>
   * @param {number} val backend value
   * @returns {number} multiplied by 100 and rounded to 1 decimal
   */
  function _convertIncoming(val) {
    return Math.round(val * 10000) / 100;
  }

  /** Convert <0.0,100.0> to <0.000,1.000>
   * @param {number} val frontend value
   * @returns {number} rounded to 1 decimal and divided by 100
   */
  function _convertOutgoing(val) {
    return Math.round(val * 10) / 1000;
  }


  function _render() {
    const musicPanel = utils.qs("#settings-music");

    if (!backend.musicEnabled) {
      musicPanel.classList.add("hidden");
      return;
    }

    musicPanel.classList.remove("hidden");
    musicPanel.querySelector("#music-error")?.remove();
    const textInput = musicPanel.querySelector("#settings-music-volume-text");
    textInput.value = (_staged.volume ?? _music.volume).toFixed(1);
    textInput.dispatchEvent(new CustomEvent("backend-refresh", { bubbles: true }));
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