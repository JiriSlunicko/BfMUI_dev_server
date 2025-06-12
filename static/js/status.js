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
      const raw = await ajax.fetchWithTimeout(globals.server.baseurl + "/telemetry/");
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

    if (nav.currentPage === "status") {
      _renderTelemetry();
    }
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
    for (const entry of sthdData) {
      entries.createOrUpdate(
        "#status-telemetry-inner",
        "sthd-" + entry.SerialTimerName,
        entry.SerialTimerName,
        _processSTHDEntry(entry),
        entry.Health,
        entry.LatestErrorMessage
      );
    }
    entries.cleanUpDangling("#status-telemetry-inner", sthdData.map(x => "sthd-" + x.SerialTimerName));

    // controller info
    utils.qs("#status-controllers-inner > p")?.remove();
    const ctrlData = _teleData.controllers;
    if (_.isEmpty(ctrlData)) {
      utils.qs("#status-controllers-inner").innerHTML = "<p>No controllers detected.</p>";
      return;
    }
    for (const [key, value] of Object.entries(ctrlData)) {
      const { Name, IsConnected } = value;
      entries.createOrUpdate(
        "#status-controllers-inner",
        "ctrl-" + key,
        key,
        { [Name]: IsConnected === true ? "connected" : "disconnected" }
      );
    }
    entries.cleanUpDangling("#status-controllers-inner", Object.keys(ctrlData).map(x => "ctrl-" + x));
  }

  /** Private helper for processing serial timer health data entries. */
  function _processSTHDEntry(entry) {
    const result = {};
    for (const [key, value] of Object.entries(entry)) {
      switch (key) {
        case "SerialTimerName":
        case "LatestErrorMessage":
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