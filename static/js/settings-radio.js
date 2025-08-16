window.settings.radio = (function()
{
  let _lastFetchOk = null;

  let _staged = {
    channel: null,
    paLevel: null,
    feedback: null,
  }

  let _radio = {
    channel: null,
    paLevel: null,
    feedback: null,
  }


  async function init() {
    // channel
    const channelPlaceholder = utils.qs("#settings-radio-channel-placeholder");
    channelPlaceholder.outerHTML = ui.makeRangeTextInputPair(
      "settings-radio-channel", "Channel", {
        bounds: {min: 0, max:125}, step: 1, value: 0, scaling: "linear"
      }, "mb16"
    );
    utils.qs(`label[for="settings-radio-channel-text"]`).addEventListener("slider-change", (e) => {
      _staged.channel = parseInt(e.detail.value);
    });

    // PA
    const PAPlaceholder = utils.qs("#settings-radio-pa-placeholder");
    PAPlaceholder.outerHTML = ui.makeRangeTextInputPair(
      "settings-radio-pa", "Power amp level", {
        bounds: {min: 0, max: 3}, step: 1, value: 0, scaling: "linear"
      }, "f-grow"
    );
    utils.qs(`label[for="settings-radio-pa-text"]`).addEventListener("slider-change", (e) => {
      _staged.paLevel = parseInt(e.detail.value);
    });

    // feedback
    utils.qs("#settings-radio-feedback").addEventListener("change", function() {
      _staged.feedback = this.value === "yes";
    });

    // submit
    utils.qs("#settings-radio-submit-btn").addEventListener("click", save);
    // reset
    utils.qs("#settings-radio-reset-btn").addEventListener("click", reset);

    return true;
  }


  async function load() {
    _lastFetchOk = await _fetchData();
    _render();
    return _lastFetchOk;
  }


  function reset() {
    _staged.channel = null;
    _staged.paLevel = null;
    _staged.feedback = null;
    _render();
  }


  async function save() {
    const payload = {
      Channel: _staged.channel ?? _radio.channel,
      PALevel: _staged.paLevel ?? _radio.paLevel,
      IsPlaneFeedbackEnabled: _staged.feedback ?? _radio.feedback,
    };
    console.debug("radio payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.radioPost,
      payload,
      (resp) => {
        _radio.channel = resp.Channel;
        _radio.paLevel = resp.PALevel;
        _radio.feedback = resp.IsPlaneFeedbackEnabled;
        _staged.channel = null;
        _staged.paLevel = null;
        _staged.feedback = null;
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    return (
      (_staged.channel !== null && _staged.channel !== _radio.channel) ||
      (_staged.paLevel !== null && _staged.paLevel !== _radio.paLevel) ||
      (_staged.feedback !== null && _staged.feedback !== _radio.feedback)
    );
  }


  /** Load fresh data from the server into _radio.
   * @returns {Promise<boolean>} success
   */
  async function _fetchData() {
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + backend.endpoints.radioGet);
      if (raw.status !== 200) {
        throw new Error("/settings/radio/ returned " + raw.status);
      }
      const resp = await raw.json();
      _radio.channel = resp.Channel;
      _radio.paLevel = resp.PALevel;
      _radio.feedback = resp.IsPlaneFeedbackEnabled;

      return true;
    } catch (err) {
      console.error("Radio fetch error:", err);
      return false;
    }
  }


  function _render() {
    const radioPanel = utils.qs("#settings-radio");

    if (!_lastFetchOk) {
      if (radioPanel.querySelector("#radio-error") === null)
        radioPanel.insertAdjacentHTML("beforeend", `
          <p id="radio-error">Failed to fetch data.</p>`
        );
      return;
    }

    const resolvedChannel = _staged.channel ?? _radio.channel;
    const resolvedPALevel = _staged.paLevel ?? _radio.paLevel;
    const resolvedFeedback = _staged.feedback ?? _radio.feedback;
    radioPanel.querySelector("#radio-error")?.remove();
    radioPanel.querySelector("#settings-radio-channel-range").value = resolvedChannel;
    radioPanel.querySelector("#settings-radio-channel-text").value = resolvedChannel;
    radioPanel.querySelector("#settings-radio-pa-range").value = resolvedPALevel;
    radioPanel.querySelector("#settings-radio-pa-text").value = resolvedPALevel;
    radioPanel.querySelector("#settings-radio-feedback").value = resolvedFeedback ? "yes" : "";
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