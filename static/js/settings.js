window.pages.settings = (function () {
  let _polling = {
    delay: Number(localStorage.getItem("pollDelay") || 1000),
    interval: null,
    active: false,
  };

  function init() {
    if (globals.server.baseurl) {
      const urlWithoutProtocol = globals.server.baseurl.replace(/^https?:\/\//, "");
      const [ip, port] = urlWithoutProtocol.split(":");
      utils.qs("#input-ip").value = ip;
      utils.qs("#input-port").value = port;
      _connect(globals.server, globals.arduino);
    }
    utils.qs("#input-poll-interval").value = _polling.delay;
    utils.qs("#settings-reset-btn").addEventListener("click", _resetSettings);
    utils.qs("#settings-connect-btn").addEventListener("click", () => {
      _connect(globals.server, globals.arduino);
    });
    utils.qs("#input-poll-interval").addEventListener("blur", _changePollInterval);
    utils.qs("#settings-poll-start-btn").addEventListener("click", _pollStart);
    utils.qs("#settings-poll-start-btn").disabled = true;
    utils.qs("#settings-poll-pause-btn").addEventListener("click", _pollPause);
    utils.qs("#settings-poll-pause-btn").disabled = true;
  }


  /** Get serial port options and settings from the server.
   * @param {object} globalServer globals.server - .usingArduino will be updated
   * @param {object} globalArduino globals.arduino - will be updated
   */
  async function _fetchSerialPortData(globalServer, globalArduino) {
    try {
      const raw = await ajax.fetchWithTimeout(globalServer.baseurl + "/settings/serialport/");
      globalServer.usingArduino = raw.status === 200;
      if (globalServer.usingArduino) {
        const resp = await raw.json();
        // nullable string
        globalArduino.port = resp.SerialPortParameters ? resp.SerialPortParameters.Name : null;
        // nullable integer
        globalArduino.baudRate = resp.SerialPortParameters ? resp.SerialPortParameters.BaudRate : null;
        // array of strings
        globalArduino.availablePorts = resp.AvailablePorts;

        if (!globalArduino.availablePorts.length) {
          ui.makeToast("error", "Warning:\n\nUsing Arduino, but no available serial ports.", 3000);
        }
        return true;
      }

      return false;
    } catch (err) {
      ui.makeToast("error", "Error fetching serial port data.\n\n" + err, 5000);
      return false;
    }
  }


  /** Reset app settings to defaults (clear localStorage) if the user confirms. */
  async function _resetSettings() {
    const consent = await ui.makePopup("confirm", "Are you sure you want to reset all app settings, including server IP etc?");
    if (consent) { localStorage.clear(); }
  }


  /** Attempt connection to the backend server, start polling.
   * @param {object} globalServer globals.server - will be updated on success
   * @param {object} globalArduino globals.arduino - will be updated on success
   */
  async function _connect(globalServer, globalArduino) {
    const ip = utils.qs("#input-ip").value;
    const port = utils.qs("#input-port").value;

    if (!/^(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|localhost$/.test(ip)
      || !/^\d{4}$/.test(port)) {
      await ui.makePopup("alert", "Invalid IP address / port.");
      return;
    }

    _pollPause();
    utils.qs("#settings-poll-start-btn").disabled = true;
    utils.qs("#settings-poll-pause-btn").disabled = true;

    ui.makeToast(null, "Attempting connection...", -1);
    const baseurl = "http://" + ip + ":" + port;
    try {
      // get systeminfo
      const raw = await ajax.fetchWithTimeout(baseurl + "/systeminfo/");
      const resp = await raw.json();

      // did we get an expected response format?
      if (_.isArray(resp)) {
        globalServer.baseurl = baseurl;
        globalServer.info = resp;
        localStorage.setItem("serverBaseurl", baseurl);

        pages.home.initSysInfo();
        utils.qs("#settings-connection-status").textContent = "Connected to " + baseurl;

        _pollStart();

        // check if serial port endpoints are supported
        const arduino = await _fetchSerialPortData(globalServer, globalArduino);
        if (arduino) {
          _renderInitialArduinoSettings();
        } else {
          _removeArduinoSettings();
        }

        ui.makeToast("success", `Connection successful, polling.\n\nArduino: ${globalServer.usingArduino}`);
      } else {
        throw new Error("server did not return a JSON array");
      }
    } catch (err) {
      ui.makeToast("error", "Connection failed.\n\n" + err, 5000);
    }
  }


  /** Initialise arduino settings section. */
  function _renderInitialArduinoSettings() {
    _removeArduinoSettings();
    utils.qs("#settings-misc").insertAdjacentHTML("afterbegin", `
      <div id="settings-arduino">
        <h2>Arduino serial port</h2>
        <div class="flex-r mb8">
          <select id="settings-arduino-port" class="f-noshrink"></select>
          <span class="f-noshrink">@</span>
          <select id="settings-arduino-baudrate-select" class="f-noshrink">
            <option value="custom">(custom)</option>
          </select>
          <input type="text" id="settings-arduino-baudrate-text" class="ml8" pattern="^\\d{1,8}$"
            value="${globals.arduino.baudRate ? globals.arduino.baudRate : ''}" />
        </div>
        <button type="button" class="btn mb32" id="settings-arduino-apply-btn">Apply settings</button>
      </div>
    `);
    const select = utils.qs("#settings-arduino-baudrate-select");
    const textInput = utils.qs("#settings-arduino-baudrate-text");

    // baudrate config
    for (const baudRate of globals.arduino.baudRatePresets) {
      const optText = baudRate < 1000 ? baudRate + " bps" : baudRate / 1000 + " kbps";
      const isSelected = baudRate === globals.arduino.baudRate;
      select.insertAdjacentHTML("beforeend", `
        <option value="${baudRate}"${isSelected ? " selected" : ""}>${optText}</option>
      `);
    }
    // update text input on select interaction
    select.addEventListener("change", function () {
      if (this.value !== "custom") { textInput.value = this.value; }
    });
    // update select on text input
    textInput.addEventListener("change", function () {
      const val = parseInt(this.value);
      select.value = globals.arduino.baudRatePresets.includes(val) ? val : "custom";
    });

    // serial port selection
    _updateArduinoSettings();

    // submit listener
    utils.qs("#settings-arduino-apply-btn").addEventListener("click", _submitArduinoSettings);
  }


  /** Clear arduino settings before redrawing them or because the server is no longer using arduino. */
  function _removeArduinoSettings() {
    const as = utils.qs("#settings-arduino");
    if (as) as.remove();
  }


  /** Switch an existing arduino <select> to the currently active option. */
  function _updateArduinoSettings() {
    const arduinoPortSelect = utils.qs("#settings-arduino-port");
    if (arduinoPortSelect) {
      arduinoPortSelect.innerHTML = "";
      for (const opt of globals.arduino.availablePorts) {
        arduinoPortSelect.insertAdjacentHTML("beforeend", `
          <option value="${opt}"${opt === globals.arduino.port ? " selected" : ""}>${opt}</option>
        `);
      }
    }
  }


  /** POST arduino settings to server & process its response.
   * @param {object} globalArduino globals.arduino - updated on success
  */
  async function _submitArduinoSettings(globalArduino) {
    const arduinoPort = utils.qs("#settings-arduino-port").value;
    const baudRate = utils.qs("#settings-arduino-baudrate-text").value;
    if (!/^\d+$/.test(baudRate)) {
      ui.makeToast("error", "Invalid baud rate. Must be a non-negative integer.", 3000);
      return;
    }

    const payload = { Name: arduinoPort, BaudRate: parseInt(baudRate) };
    console.debug("submitArduinoSettings payload:", payload);

    let raw = null;
    try {
      raw = await ajax.postWithTimeout(globals.server.baseurl + "/settings/serialport/", payload);
    } catch (err) {
      ui.makeToast("error", "Failed - network error:\n\n" + err.toString(), 5000);
      raw = null;
    }
    if (raw) {
      try {
        const resp = await raw.json();
        globalArduino.port = resp.Name;
        globalArduino.baudRate = resp.BaudRate;
      } catch (err) {
        if (raw.ok) {
          ui.makeToast("error", `POST succeeded, but can't process response:\n\n${err.toString()}`, 7500);
        } else {
          ui.makeToast("error", `Failed utterly - ${raw.status}:\n\n${raw.statusText}`, 7500);
        }
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
    }, _polling.delay);
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

    if (newPollDelay !== _polling.delay) {
      _polling.delay = newPollDelay;
      _pollStart();
      localStorage.setItem("pollDelay", newPollDelay);
      ui.makeToast("success", "Polling interval set to " + _polling.delay + " ms.");
    }
  }


  // public API
  return {
    init,
    activate: ()=>{},
    deactivate: ()=>{},
  }
})();