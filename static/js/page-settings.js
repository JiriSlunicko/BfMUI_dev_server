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

    // map tile URL template settings
    utils.qs("#tiles-url-set").addEventListener("click", _setTilesUrlTemplate);
    utils.qs("#tiles-url-reset").addEventListener("click", _resetTilesUrlTemplate);
  }


  /** Reset app settings to defaults (clear localStorage & unset tile URL)
   *  if the user confirms. */
  async function _resetSettings() {
    const consent = await ui.makePopup("confirm",
      "Are you sure you want to reset all app settings, including server IP, map tile "
    + "URL template etc?\n\nThis will reload the app.");
    if (consent) {
      localStorage.clear();
      _resetTilesUrlTemplate();
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
    utils.qs("#settings-connection-status").textContent = "Currently not connected.";
    _pollPause();
    utils.qs("#settings-poll-start-btn").disabled = true;
    utils.qs("#settings-poll-pause-btn").disabled = true;
    _connectionAttempt.busy = true;

    const lastFail = lastFailOverride ?? _connectionAttempt.lastFail;
    console.debug("Attempting connection.", lastFail);
    if (lastFail === null) {
      ui.makeToast(null, "Attempting connection...", -1);
    } else {
      ui.makeToast("error", "Retrying connection after the following problem:\n\n"+lastFail, -1);
    }

    const ip = utils.qs("#input-ip").value;
    const port = utils.qs("#input-port").value;
    const baseurl = "http://" + ip + ":" + port;
    let shouldRetry = false;
    try {
      // try the systemInfo endpoint
      let sysInfoOk = await ajax.fetchWithTimeout(
        baseurl + backend.endpoints.systemInfo + `?_=${Date.now()}`,
        {
          successHandler: (resp) => {
            if (!_.isArray(resp)) {
              throw new Error(`Fetch from server OK, but ${backend.endpoints.systemInfo} did `
                            + `not return a JSON array`);
            }
            globalServer.bfcontrol = resp;
          },
          failureHandler: ajax.propagateRespError, // fail loudly
        },
      );

      // if we're here the initial ping was successful, connection considered alive
      globalServer.baseurl = baseurl;
      localStorage.setItem("serverBaseurl", baseurl);

      // show systeminfo data on the dashboard
      pages.home.initSysInfo();

      // start polling telemetry
      _pollStart();

      // load all settings subscribed to the manager
      const settingsLoadStatus = await settingsManager.load();

      // load config storage data
      serverConfig.getFreshServerConfigs();

      // open event stream
      events.tryConnectionUntilOk();

      // inform the user
      utils.qs("#settings-connection-status").textContent = "Connected to " + baseurl;
      let successMessage = "Connected to server, polling.\n\nModules:";
      for (const [domain, success] of Object.entries(settingsLoadStatus)) {
        successMessage += (success ? "\nOK: " : "\nERROR: ") + domain;
      }
      successMessage += backend.usingArduino
        ? "\n\nRunning in Arduino mode."
        : "\n\nRunning without Arduino.";
      ui.makeToast("success", successMessage, 5000);

      // clean up
      _connectionAttempt.lastFail = null;
      if (_connectionAttempt.interval !== null) {
        clearInterval(_connectionAttempt.interval);
        _connectionAttempt.interval = null;
      }
    } catch (err) {
      console.error("During connect:", err);
      _connectionAttempt.lastFail = err.toString();
      if (!retry) {
        ui.makeToast("error", `Connection failed.\n\n${err.toString()}`, 5000);
      } else {
        shouldRetry = true;
      }
    } finally {
      _connectionAttempt.busy = false;
      if (shouldRetry) {
        _attemptReconnect();
      }
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


  /** Persist a new tile URL pattern with {z}, {x}, {y} placeholders. */
  async function _setTilesUrlTemplate() {
    const urlPat = utils.qs("#input-tiles-url").value;
    if (!urlPat) {
      ui.makeToast("error", "Please enter a URL template.");
      return;
    }
    await ajax.fetchWithTimeout(
      `/tiles-url-template/set?urlTemplate=${encodeURIComponent(urlPat)}`,
      {
        options: {method: "POST", body: "null"},
        successHandler: (resp) => {
          if (resp.ok) {
            ui.makeToast("success", "Updated tile URL template.");
          } else {
            ui.makeToast("error", `Something failed: ${JSON.stringify(resp)}`);
          }
        },
        failureHandler: ajax.handleJsonAjaxFail,
      }
    );
  }


  /** Clear the set URL template for tiles, revert to default. */
  async function _resetTilesUrlTemplate() {
    const consent = await ui.makePopup("confirm",
      "Are you sure you want to revert to the default map tile source?",
      "Reset tile source?"
    );
    if (!consent) return;

    await ajax.fetchWithTimeout(
      "/tiles/url-template/reset",
      {
        options: {method: "POST", body: "null"},
        successHandler: (resp) => {
          ui.makeToast("success", "Successfully reset.");
        },
        failureHandler: ajax.handleJsonAjaxFail,
      }
    );
  }


  // public API
  return {
    init,
    activate: ()=>{},
    deactivate: ()=>{},
    connect,
  }
})();