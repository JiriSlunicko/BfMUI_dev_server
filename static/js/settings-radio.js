window.settings.radio = (function()
{
  const _m = "settings.radio";

  let _lastFetchOk = null;

  let _staged = {
    channel: undefined,
    feedbackChannel: undefined,
    paLevel: undefined,
    feedback: undefined,
  }

  let _radio = {
    channel: null,
    feedbackChannel: null,
    paLevel: null,
    feedback: null,
  }


  async function init() {
    // main channel
    const channelPlaceholder = utils.qs("#settings-radio-channel-placeholder");
    channelPlaceholder.outerHTML = ui.makeRangeTextInputPair(
      "settings-radio-channel",
      "Channel",
      {
        bounds: {
          min: 0,
          max: 125
        },
        step: 1,
        value: 0,
        scaling: "linear",
        incrementButtons: true,
      },
      "mb16"
    );
    const sliderWrapperPrimary = utils.qs(`label[for="settings-radio-channel-text"]`);
    sliderWrapperPrimary.addEventListener("slider-change", (e) => {
      if (!e.detail.byUser) return; // automated changes -> don't stage

      _staged.channel = parseInt(e.detail.value);
    });

    // feedback channel
    const fbcPlaceholder = utils.qs("#settings-radio-feedback-channel-placeholder");
    fbcPlaceholder.outerHTML = ui.makeRangeTextInputPair(
      "settings-radio-feedback-channel",
      "Feedback channel",
      {
        bounds: {
          min: 0,
          max: 125,
        },
        step: 1,
        value: 0,
        scaling: "linear",
        incrementButtons: true,
      },
      "mb16"
    );
    const sliderWrapperFeedback = utils.qs(`label[for="settings-radio-feedback-channel-text"]`);
    sliderWrapperFeedback.addEventListener("slider-change", (e) => {
        if (!e.detail.byUser) return; // automated changes -> don't stage

        _staged.feedbackChannel = parseInt(e.detail.value);
      }
    );

    // PA
    const PAPlaceholder = utils.qs("#settings-radio-pa-placeholder");
    PAPlaceholder.outerHTML = ui.makeRangeTextInputPair(
      "settings-radio-pa",
      "Power amp level",
      {
        bounds: {
          min: 0,
          max: 3,
        },
        step: 1,
        value: 0,
        scaling: "linear",
        incrementButtons: true,
      },
      "f-grow"
    );
    const sliderWrapperPA = utils.qs(`label[for="settings-radio-pa-text"]`);
    sliderWrapperPA.addEventListener("slider-change", (e) => {
      if (!e.detail.byUser) return; // automated changes -> don't stage

      _staged.paLevel = parseInt(e.detail.value);
    });

    // feedback on/off
    utils.qs("#settings-radio-feedback").addEventListener("change", function() {
      _staged.feedback = this.value === "yes";
    });

    // submit
    utils.qs("#settings-radio-submit-btn").addEventListener("click",
      _.throttle(() => {
        if (hasPendingChanges()) save();
      }, 1000, { trailing: false, })
    );
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
    _staged.channel = undefined;
    _staged.feedbackChannel = undefined;
    _staged.paLevel = undefined;
    _staged.feedback = undefined;
    _render();
  }


  async function save() {
    const payload = {
      Channel: utils.coalesceUndef(_staged.channel, _radio.channel),
      ChannelFeedback: utils.coalesceUndef(_staged.feedbackChannel, _radio.feedbackChannel),
      PALevel: utils.coalesceUndef(_staged.paLevel, _radio.paLevel),
      IsPlaneFeedbackEnabled: utils.coalesceUndef(_staged.feedback, _radio.feedback),
    };
    logger.debug(_m, "radio payload:", payload);

    const success = await ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.radioPost,
      {
        options: {
          method: "POST",
          body: JSON.stringify(payload),
        },
        successHandler: (resp) => {
          _radio.channel = resp.Channel;
          _radio.feedbackChannel = resp.ChannelFeedback;
          _radio.paLevel = resp.PALevel;
          _radio.feedback = resp.IsPlaneFeedbackEnabled;
          _staged.channel = undefined;
          _staged.feedbackChannel = undefined;
          _staged.paLevel = undefined;
          _staged.feedback = undefined;
          ui.makeToast("success", "Successfully updated.");
        },
        failureHandler: ajax.handleJsonAjaxFail,
      }
    );

    return success;
  }


  function hasPendingChanges() {
    return (
      (_staged.channel !== undefined
        && _staged.channel !== _radio.channel) ||
      (_staged.feedbackChannel !== undefined
        && _staged.feedbackChannel !== _radio.feedbackChannel) ||
      (_staged.paLevel !== undefined
        && _staged.paLevel !== _radio.paLevel) ||
      (_staged.feedback !== undefined
        && _staged.feedback !== _radio.feedback)
    );
  }


  /** Load fresh data from the server into _radio.
   * 
   * @returns {Promise<boolean>} success
   */
  function _fetchData() {
    return ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.radioGet,
      {
        successHandler: (resp) => {
          _radio.channel = resp.Channel;
          _radio.feedbackChannel = resp.ChannelFeedback;
          _radio.paLevel = resp.PALevel;
          _radio.feedback = resp.IsPlaneFeedbackEnabled;
        },
        failureHandler: ajax.handleJsonAjaxFail,
      }
    );
  }


  function _render() {
    const radioPanel = utils.qs("#settings-radio");

    if (!_lastFetchOk) {
      if (radioPanel.querySelector("#radio-error") === null) {
        radioPanel.insertAdjacentHTML("beforeend", `
          <p id="radio-error">Failed to fetch data.</p>`);
      }
      return;
    }

    const resolvedChannel = utils.coalesceUndef(_staged.channel, _radio.channel);
    const resolvedFeedbackChannel = utils.coalesceUndef(_staged.feedbackChannel, _radio.feedbackChannel);
    const resolvedPALevel = utils.coalesceUndef(_staged.paLevel, _radio.paLevel);
    const resolvedFeedback = utils.coalesceUndef(_staged.feedback, _radio.feedback);
    radioPanel.querySelector("#radio-error")?.remove();
    radioPanel.querySelector("#settings-radio-channel-range").value = resolvedChannel;
    radioPanel.querySelector("#settings-radio-channel-text").value = resolvedChannel;
    radioPanel.querySelector("#settings-radio-feedback-channel-range").value = resolvedFeedbackChannel;
    radioPanel.querySelector("#settings-radio-feedback-channel-text").value = resolvedFeedbackChannel;
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
  };
})();
