window.settings.radio = (function()
{
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
    utils.qs("#settings-radio-apply-btn").addEventListener("click", save);

    return true;
  }


  async function load() {
    const radioSuccess = await _fetchData();
    
    if (radioSuccess) {
      const radioPanel = utils.qs("#settings-radio");
      radioPanel.querySelector("#settings-radio-channel-range").value = _radio.channel;
      radioPanel.querySelector("#settings-radio-channel-text").value = _radio.channel;
      radioPanel.querySelector("#settings-radio-pa-range").value = _radio.paLevel;
      radioPanel.querySelector("#settings-radio-pa-text").value = _radio.paLevel;
      radioPanel.querySelector("#settings-radio-feedback").value = _radio.feedback ? "yes" : "";
    }

    return radioSuccess;
  }


  async function save() {
    const payload = {
      Channel: Number(utils.qs("#settings-radio-channel-range").value),
      PALevel: Number(utils.qs("#settings-radio-pa-range").value),
      IsPlaneFeedbackEnabled: utils.qs("#settings-radio-feedback").value === "yes",
    };
    console.debug("radio payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.radioPost,
      payload,
      (resp) => {
        _radio.channel = resp.Channel;
        _radio.paLevel = resp.PALevel;
        _radio.feedback = resp.IsPlaneFeedbackEnabled;
        _setStagedToActual();
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    return (
      _staged.channel !== _radio.channel ||
      _staged.paLevel !== _radio.paLevel ||
      _staged.feedback !== _radio.feedback
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
      _setStagedToActual();

      return true;
    } catch (err) {
      console.error("Radio fetch error:", err);
      return false;
    }
  }


  function _setStagedToActual() {
    _staged.channel = _radio.channel;
    _staged.paLevel = _radio.paLevel;
    _staged.feedback = _radio.feedback;
  }


  // public API
  return {
    init,
    load,
    save,
    hasPendingChanges,
  }
})();