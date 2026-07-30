window.pages.status = (function()
{
  let _teleData = {
    serialTimers: Array(25).fill([]),
    controllers: {},
  }

  /** Reset _teleData to default. */
  function clearTeleData() {
    _teleData.serialTimers = Array(25).fill([]);
    _teleData.controllers = {};
  }


  /** Get current telemetry data and render it if we're on the "status" page. */
  async function fetchTelemetry() {
    await ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.telemetry,
      {
        successHandler: (resp) => {
          // update frontend records
          _teleData.serialTimers.push(resp.SerialTimerHealthData); // append at the end
          _teleData.serialTimers.shift(); // pop the first item
          _teleData.controllers = resp.Controllers;
          pages.home.updateChecklist(resp.FlightChecklist);
          // if we're on the status page, also refresh the telemetry component
          if (nav.getCurrentPage() === "status") {
            _renderTelemetry();
          }
        },
        failureHandler: ajax.handleJsonAjaxFail,
      },
    );
  }


  /** Render the latest health timer data and controller status. */
  function _renderTelemetry() {
    // health timers
    utils.qs("#status-telemetry-inner > p")?.remove();
    const sthdData = _teleData.serialTimers[_teleData.serialTimers.length - 1];
    if (!sthdData.length) {
      utils.qs("#status-telemetry-inner").innerHTML = "<p>No data.</p>";
      return;
    }

    // create serial timer health data entries
    for (let i = 0; i < sthdData.length; i++) {
      const dataEntry = sthdData[i];
      entries.reuseOrCreate(
        "#status-telemetry-inner", i,
        dataEntry.SerialTimerName, _processSTHDEntry(dataEntry),
        dataEntry.Health, dataEntry.LatestErrorMessage
      );
    };
    entries.trimList("#status-telemetry-inner", sthdData.length);

    // controller info
    utils.qs("#status-controllers-inner > p")?.remove();
    const ctrlData = _teleData.controllers;
    if (_.isEmpty(ctrlData)) {
      utils.qs("#status-controllers-inner").innerHTML = "<p>No controllers detected.</p>";
      return;
    }

    // create controller entries
    const ctrlKeys = _.toArray(Object.keys(ctrlData));
    for (let i = 0; i < ctrlKeys.length; i++) {
      const key = ctrlKeys[i];
      const {Name, IsConnected} = ctrlData[key];
      entries.reuseOrCreate(
        "#status-controllers-inner", i, key,
        { [Name]: IsConnected ? "connected" : "disconnected" }
      );
    };
    entries.trimList("#status-controllers-inner", ctrlKeys.length);
  }


  /** Private helper for processing serial timer health data entries.
   * @param {object} entry a SerialTimerHealthData object
   */
  function _processSTHDEntry(entry) {
    const result = {};
    // process specific keys
    for (const [key, value] of Object.entries(entry)) {
      switch (key) {
        case "SerialTimerName":
        case "LatestErrorMessage":
        case "Health":
        case "MinCallbackDurationMs":
        case "MaxCallbackDurationMs":
          break;
        case "Frequency":
          result[key] = (value === null ? "–" : value.toFixed(1)) + " Hz";
          break;
        case "MaxLoopDelayMs":
          result.MaxLoopDelay = (value === null ? "–" : Math.ceil(value)) + " ms";
          break;
        default:
          result[key] = value;
      }
    }
    // process callback durations
    result.CallbackDuration = _makeCallbackDurationString(
      entry.MinCallbackDurationMs,
      entry.MaxCallbackDurationMs
    );
    return result;
  }


  function _makeCallbackDurationString(minDur, maxDur) {
    let multiplier = 1;
    let unit = " ms";
    if (Math.max(minDur ?? 0, maxDur ?? 0) < 1) {
      multiplier = 1000;
      unit = " μs"
    }
    const minDurAdjusted = minDur ? (Number(minDur) * multiplier).toFixed(2) : "?";
    const maxDurAdjusted = maxDur ? (Number(maxDur) * multiplier).toFixed(2) : "?";
    return `${minDurAdjusted}–${maxDurAdjusted} ${unit}`;
  }

  
  // public API
  return {
    init: ()=>{},
    activate: () => { _renderTelemetry(); },
    deactivate: ()=>{},
    fetchTelemetry,
    clearTeleData,
  }
})();