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
    let resp;
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + backend.endpoints.telemetry);
      resp = await raw.json();
    } catch (err) {
      ui.makeToast("error", "Connection failed.\n\n" + err.toString(), 5000);
      return;
    }

    if (!_.isPlainObject(resp)
      || typeof resp.SerialTimerHealthData === "undefined"
      || typeof resp.Controllers === "undefined") {
      ui.makeToast("error", "/telemetry/ returned something unexpected.");
      return;
    }

    _teleData.serialTimers.push(resp.SerialTimerHealthData);
    _teleData.serialTimers.shift();
    _teleData.controllers = resp.Controllers;

    if (nav.getCurrentPage() === "status") {
      _renderTelemetry();
    }

    pages.home.updateChecklist(resp.FlightChecklist);
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
    for (const [key, value] of Object.entries(entry)) {
      switch (key) {
        case "SerialTimerName":
        case "LatestErrorMessage":
        case "Health":
          break;
        case "Frequency":
          result[key] = (value === null ? "–" : value.toFixed(1));
          break;
        case "MaxLoopDelayMs":
          result[key] = (value === null ? "–" : Math.ceil(value)) + " ms";
          break;
        default:
          result[key] = value;
      }
    }
    return result;
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