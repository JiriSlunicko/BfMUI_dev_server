window.pages.settings = (function() {
  let _polling = {
    delayMs: null,
    interval: null,
    active: false,
  };
  let _connectionAttempt = {
    delayMs: 1000,
    busy: false,
    interval: null,
    lastFail: null,
  }

  function init() {
    // set poll delay
    _polling.delayMs = Number(localStorage.getItem("pollDelay")
      || (utils.isMobile() ? 1000 : 500));

    // server & polling config
    if (backend.baseurl) {
      const urlWithoutProtocol = backend.baseurl.replace(/^https?:\/\//, "");
      const [ip, port] = urlWithoutProtocol.split(":");
      utils.qs("#input-ip").value = ip;
      utils.qs("#input-port").value = port;
      connect(backend);
    }
    utils.qs("#input-poll-interval").value = _polling.delayMs;
    utils.qs("#settings-reset-btn").addEventListener("click", _resetSettings);
    utils.qs("#settings-connect-btn").addEventListener("click", () => {
      connect(backend);
    });
    utils.qs("#input-poll-interval").addEventListener("blur", _changePollInterval);
    utils.qs("#settings-poll-start-btn").addEventListener("click", _pollStart);
    utils.qs("#settings-poll-start-btn").disabled = true;
    utils.qs("#settings-poll-pause-btn").addEventListener("click", _pollPause);
    utils.qs("#settings-poll-pause-btn").disabled = true;

    // config saving/loading
    window.serverConfig.init();
  }


  /** Reset app settings to defaults (clear localStorage) if the user confirms. */
  async function _resetSettings() {
    const consent = await ui.makePopup("confirm", "Are you sure you want to reset all app settings, including server IP etc?\n\nThis will reload the app.");
    if (consent) {
      localStorage.clear();
      location.reload();
    }
  }


  function _attemptReconnect() {
    if (_connectionAttempt.interval !== null)
      return;

    _connectionAttempt.interval = setInterval(() => {
      if (!_connectionAttempt.busy)
        connect(backend, true);
    }, _connectionAttempt.delayMs);
  }


  /** Attempt connection to the backend server, start polling and everything.
   * @param {object} globalServer backend - will be updated on success
   * @param {boolean} retry whether to retry on failure
   * @param {string|null} lastFailOverride if retrying, what failed last time
   */
  async function connect(globalServer, retry=true, lastFailOverride=null) {
    const lastFail = lastFailOverride ?? _connectionAttempt.lastFail;
    utils.qs("#settings-connection-status").textContent = "Currently not connected.";
    console.debug("Attempting connection.", lastFail);
    _connectionAttempt.busy = true;
    const ip = utils.qs("#input-ip").value;
    const port = utils.qs("#input-port").value;

    if (ip === null || port === null) {
      await ui.makePopup("alert", "Invalid IP address / port.");
      _connectionAttempt.busy = false;
      _attemptReconnect();
      return;
    }

    _pollPause();
    utils.qs("#settings-poll-start-btn").disabled = true;
    utils.qs("#settings-poll-pause-btn").disabled = true;

    if (lastFail === null)
      ui.makeToast(null, "Attempting connection...", -1);
    else
      ui.makeToast("error", "Retrying connection after the following problem:\n\n"+lastFail, -1);

    const baseurl = "http://" + ip + ":" + port;
    let shouldRetry = false;
    try {
      // get systeminfo
      let raw, resp;
      try {
        raw = await ajax.fetchWithTimeout(baseurl + backend.endpoints.systemInfo
          + "?_=" + Date.now() // cache-buster to avoid weird glitches
        );
      } catch (err) { throw new Error("Fetch from server failed."); }
      // to JSON
      try {
        resp = await raw.json();
      } catch (err) { throw new Error("Can't process JSON from server - "+err.toString()); }
      // did we get an expected response format?
      if (!_.isArray(resp)) { throw new Error("server did not return a JSON array"); }

      globalServer.baseurl = baseurl;
      globalServer.info = resp;
      localStorage.setItem("serverBaseurl", baseurl);

      pages.home.initSysInfo();

      _pollStart();

      // load all settings subscribed to the manager
      const loadSuccess = await settingsManager.load();
      if (loadSuccess === null)
        throw new Error("settingsManager failed to validate its dependencies");

      // load config storage data
      serverConfig.getFreshServerConfigs();

      // open event stream
      events.tryConnectionUntilOk();
      //events.openStream(globalServer);

      // handle success-related things
      utils.qs("#settings-connection-status").textContent = "Connected to " + baseurl;
      let successMessage = "Connected to server, polling.\n\nModules:";
      for (const [domain, success] of Object.entries(loadSuccess)) {
        successMessage += success ? "\nOK: " : "\nERROR: ";
        successMessage += domain;
      }
      successMessage += backend.usingArduino
        ? "\n\nRunning in Arduino mode."
        : "\n\nRunning without Arduino.";

      _connectionAttempt.lastFail = null;
      if (_connectionAttempt.interval !== null) {
        clearInterval(_connectionAttempt.interval);
        _connectionAttempt.interval = null;
      }
      ui.makeToast("success", successMessage, 5000);
    } catch (err) {
      console.error("During connect:", err);
      _connectionAttempt.lastFail = err.toString();
      if (!retry)
        ui.makeToast("error", "Connection failed.\n\n" + _connectionAttempt.lastFail, 5000);
      else
        shouldRetry = true;
    } finally {
      _connectionAttempt.busy = false;
      if (shouldRetry)
        _attemptReconnect();
    }
  }


  /** Start polling telemetry with the currently set interval. */
  function _pollStart() {
    if (_polling.interval !== null) {
      clearInterval(_polling.interval);
      _polling.interval = null;
    }

    _polling.active = true;
    pages.status.clearTeleData();

    _polling.interval = setInterval(() => {
      pages.status.fetchTelemetry();
    }, _polling.delayMs);
    pages.status.fetchTelemetry();

    utils.qs("#settings-poll-start-btn").disabled = true;
    utils.qs("#settings-poll-pause-btn").disabled = false;
    ui.makeToast("success", "Polling!");
  }


  /** Stop polling telemetry. */
  function _pollPause() {
    if (_polling.interval !== null) {
      clearInterval(_polling.interval);
      _polling.interval = null;
      ui.makeToast(null, "Stopped polling.");
    }

    _polling.active = false;
    pages.status.clearTeleData();

    utils.qs("#settings-poll-start-btn").disabled = false;
    utils.qs("#settings-poll-pause-btn").disabled = true;
  }


  /** Change the polling interval. */
  function _changePollInterval() {
    const input = utils.qs("#input-poll-interval").value;
    const newPollDelay = Number(input);
    if (!/^\d+$/.test(input) || newPollDelay < 100) {
      ui.makeToast("error", "Polling interval must be a number >= 100.", 3000);
      return;
    }

    if (newPollDelay !== _polling.delayMs) {
      _polling.delayMs = newPollDelay;
      _pollStart();
      localStorage.setItem("pollDelay", newPollDelay);
      ui.makeToast("success", "Polling interval set to " + _polling.delayMs + " ms.");
    }
  }


  // public API
  return {
    init,
    activate: ()=>{},
    deactivate: ()=>{},
    connect,
  }
})();