window.settings.music = (function()
{
  let _staged = {
    volume: undefined,
  }

  let _music = {
    volume: undefined
  }


  async function init() {
    // volume
    const volumePlaceholder = utils.qs("#settings-music-volume-placeholder");
    volumePlaceholder.outerHTML = ui.makeRangeTextInputPair(
      "settings-music-volume", "Volume %", {
        bounds: {min: 0.0, max: 100}, step: 0.01, value: 0,
        scaling: "logarithmic", textInputClassOverride: "w7ch"
      }, "mb16"
    );
    utils.qs(`label[for="settings-music-volume-text"]`).addEventListener("slider-change", (e) => {
      if (e.detail.byUser) {
        _staged.volume = parseFloat(e.detail.value);
      }
    });

    // submit
    utils.qs("#settings-music-submit-btn").addEventListener("click",
      _.throttle(() => {
        if (hasPendingChanges()) save();
      }, 1000, {trailing: false}));
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
    _staged.volume = undefined;
    _render();
  }


  async function save() {
    const payload = {
      Volume: _convertOutgoing(utils.coalesceUndef(_staged.volume, _music.volume)),
    };
    console.debug("music payload:", payload);

    const success = await ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.musicPost,
      {
        options: {
          method: "POST",
          body: JSON.stringify(payload),
        },
        successHandler: (resp) => {
          _music.volume = _convertIncoming(resp.Volume);
          _staged.volume = undefined;
          ui.makeToast("success", "Successfully updated.");
        },
        failureHandler: ajax.handleJsonAjaxFail,
      }
    );

    return success;
  }


  function hasPendingChanges() {
    return _staged.volume !== undefined && _staged.volume !== _music.volume;
  }


  /** Load fresh data from the server into _music.
   * @param {object} globalServer backend - .musicEnabled will be updated
   * @returns {Promise<boolean|null>} true = music enabled, false = not enabled, null = error
   */
  async function _fetchData(globalServer) {
    let isMusicEnabled;

    await ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.musicGet,
      {
        successHandler: (resp) => {
          globalServer.musicEnabled = true;
          isMusicEnabled = true;
          console.debug("Music is available.");
          _music.volume = _convertIncoming(resp.Volume);
        },
        failureHandler: (resp, err) => {
          if (resp.status === 512) {
            globalServer.musicEnabled = false;
            isMusicEnabled = false;
            console.debug("Music is not available.");
          } else {
            isMusicEnabled = null;
            console.debug("Music fetch errored unexpectedly.", err);
            ui.makeToast(
              "error",
              `AJAX fail for ${resp.url}:\n\n${err.toString()}`,
              5000
            );
          }
        },
      }
    );

    return isMusicEnabled;
  }


  /** Convert <0.0000,1.0000> to <0.00,100.00>
   * @param {number} val backend value
   * @returns {number} multiplied by 100 and rounded to 2 decimals
   */
  function _convertIncoming(val) {
    return Math.round(val * 100_000) / 1000;
  }

  /** Convert <0.00,100.00> to <0.0000,1.0000>
   * @param {number} val frontend value
   * @returns {number} rounded to 2 decimal and divided by 100
   */
  function _convertOutgoing(val) {
    return Math.round(val * 100) / 10_000;
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
    textInput.value = (utils.coalesceUndef(_staged.volume, _music.volume)).toFixed(2);
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