window.pages.settings = (function () {
  let _polling = {
    delay: Number(localStorage.getItem("pollDelay") || 1000),
    interval: null,
    active: false,
  };
  let _radio = {
    channel: null,
    paLevel: null,
    feedback: null,
  }
  let _arduino = {
    port: null,
    baudRate: null,
    availablePorts: [],
    baudRatePresets: [110, 300, 600, 1200, 2400, 4800, 9600, 14400,
      19200, 38400, 57600, 115200, 128000, 256000],
  }
  let _maxSurfaceAngles = {
    limits: {
      min: 0, max: 90,
    },
    surfaces: {},
  }

  function init() {
    // server & polling config
    if (globals.server.baseurl) {
      const urlWithoutProtocol = globals.server.baseurl.replace(/^https?:\/\//, "");
      const [ip, port] = urlWithoutProtocol.split(":");
      utils.qs("#input-ip").value = ip;
      utils.qs("#input-port").value = port;
      _connect(globals.server);
    }
    utils.qs("#input-poll-interval").value = _polling.delay;
    utils.qs("#settings-reset-btn").addEventListener("click", _resetSettings);
    utils.qs("#settings-connect-btn").addEventListener("click", () => {
      _connect(globals.server);
    });
    utils.qs("#input-poll-interval").addEventListener("blur", _changePollInterval);
    utils.qs("#settings-poll-start-btn").addEventListener("click", _pollStart);
    utils.qs("#settings-poll-start-btn").disabled = true;
    utils.qs("#settings-poll-pause-btn").addEventListener("click", _pollPause);
    utils.qs("#settings-poll-pause-btn").disabled = true;
    
    // radio channel config
    const radioChannelRange = utils.qs("#settings-radio-channel-range");
    const radioChannelText = utils.qs("#settings-radio-channel-text");
    radioChannelRange.addEventListener("input", function() {
      radioChannelText.value = this.value;
    });
    radioChannelText.addEventListener("change", function() {
      const inputValue = Number(this.value);
      if (isNaN(inputValue) || inputValue < 0 || inputValue > 125) {
        this.value = radioChannelRange.value;
        ui.makeToast("error", "Invalid input for radio channel.");
      } else {
        radioChannelRange.value = inputValue.toFixed(0);
      }
    });
    // radio PA config
    const radioPARange = utils.qs("#settings-radio-pa-range");
    const radioPAText = utils.qs("#settings-radio-pa-text");
    radioPARange.addEventListener("input", function() {
      radioPAText.value = this.value;
    });
    radioPAText.addEventListener("change", function() {
      const inputValue = Number(this.value);
      if (isNaN(inputValue) || inputValue < 0 || inputValue > 3) {
        this.value = radioPARange.value;
        ui.makeToast("error", "Invalid input for radio PA level.");
      } else {
        radioPARange.value = inputValue.toFixed(0);
      }
    });
    // submit radio settings
    utils.qs("#settings-radio-apply-btn").addEventListener("click", _submitRadioSettings);

    // max surface angle config
    const msaSettings = utils.qs("#settings-surfaces-inner");
    msaSettings.addEventListener("change", function(e) {
      const rangeInput = e.target.closest(`input[type=range]`);
      if (rangeInput) {
        const textInput = rangeInput.parentNode.querySelector(`input[type=text]`);
        textInput.value = rangeInput.value;
      }
    });
    msaSettings.addEventListener("change", function(e) {
      const textInput = e.target.closest(`input[type=text]`);
      if (textInput) {
        const rangeInput = textInput.parentNode.querySelector(`input[type=range]`);
        const inputValue = Number(textInput.value);
        if (isNaN(inputValue) || inputValue < _maxSurfaceAngles.limits.min || inputValue > _maxSurfaceAngles.limits.max) {
          textInput.value = rangeInput.value;
          ui.makeToast("error", "Invalid input for max. surface angle.");
        } else {
          rangeInput.value = inputValue.toFixed(0);
        }
      }
    });
    // submit max surface angle config
    msaSettings.addEventListener("click", function(e) {
      const button = e.target.closest("#settings-surfaces-apply-btn");
      if (button) {
        _submitMSASettings();
      }
    });
  }


  /** Get serial port options and settings from the server.
   * @param {object} globalServer globals.server - .usingArduino will be updated
   * @return {Boolean} true if we get a response indicating arduino is being used
   */
  async function _fetchSerialPortData(globalServer) {
    try {
      const raw = await ajax.fetchWithTimeout(globalServer.baseurl + "/settings/serialport/");
      globalServer.usingArduino = raw.status === 200;
      if (globalServer.usingArduino) {
        const resp = await raw.json();
        // nullable string
        _arduino.port = resp.SerialPortParameters ? resp.SerialPortParameters.Name : null;
        // nullable integer
        _arduino.baudRate = resp.SerialPortParameters ? resp.SerialPortParameters.BaudRate : null;
        // array of strings
        _arduino.availablePorts = resp.AvailablePorts;
        return true;
      }

      return false;
    } catch (err) {
      ui.makeToast("error", "Error fetching serial port data.\n\n" + err.toString(), 5000);
      return false;
    }
  }


  /** Get current radio settings & save them to _radio.
   * @returns {Boolean} success?
   */
  async function _fetchRadioData() {
    try {
      const raw = await ajax.fetchWithTimeout(globals.server.baseurl + "/settings/radio/");
      if (raw.status !== 200) {
        throw new Error("/settings/radio/ returned "+raw.status);
      }
      const resp = await raw.json();
      _radio.channel = resp.Channel;
      _radio.paLevel = resp.PALevel;
      _radio.feedback = resp.IsPlaneFeedbackEnabled;
      return true;
    } catch (err) {
      ui.makeToast("error", "Error fetching radio data.\n\n" + err.toString(), 5000);
      return false;
    }
  }


  /** Get max. surface angles - which surfaces we're dealing with.
   * @returns {Boolean} success?
   */
  async function _fetchMaxSurfaceAnglesData() {
    try {
      const raw = await ajax.fetchWithTimeout(globals.server.baseurl + "/settings/maxsurfaceangles/");
      if (raw.status !== 200) {
        throw new Error("/settings/maxsurfaceangles/ returned "+raw.status);
      }
      const resp = await raw.json();
      _maxSurfaceAngles.surfaces = {};
      for (const surface of resp.AvailableSurfaces) {
        _maxSurfaceAngles.surfaces[surface] = resp.MaxSurfaceAngles[surface] || 0;
      }
      return true;
    } catch (err) {
      ui.makeToast("error", "Error fetching max. surface angles data.\n\n" + err.toString(), 5000);
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
   */
  async function _connect(globalServer) {
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
        const arduinoSuccess = await _fetchSerialPortData(globalServer);
        _removeArduinoSettings();
        if (arduinoSuccess) {
          _renderInitialArduinoSettings();
        }

        // load radio data
        const radioSuccess = await _fetchRadioData();
        if (radioSuccess) {
          utils.qs("#settings-radio-channel-range").value = _radio.channel;
          utils.qs("#settings-radio-channel-text").value = _radio.channel;
          utils.qs("#settings-radio-pa-range").value = _radio.paLevel;
          utils.qs("#settings-radio-pa-text").value = _radio.paLevel;
          utils.qs("#settings-radio-feedback").value = _radio.feedback ? "yes" : "";
        }

        // load max surface angles data
        const msaSuccess = await _fetchMaxSurfaceAnglesData();
        if (msaSuccess) {
          _renderMSASettings();
        }

        ui.makeToast("success",
          "Connected to server, polling.\n\n"
          +(globalServer.usingArduino ? `Using arduino, ${_arduino.availablePorts.length} available ports.\n\n` : "")
          +`Radio: ${radioSuccess ? "ok" : "ERROR"}\n\n`
          +`Max. surf angles: ${msaSuccess ? "ok" : "ERROR"}`,
          5000
        );
      } else {
        throw new Error("server did not return a JSON array");
      }
    } catch (err) {
      ui.makeToast("error", "Connection failed.\n\n" + err, 5000);
    }
  }


  /** Initialise arduino settings section. */
  function _renderInitialArduinoSettings() {
    utils.qs("#settings-connection").insertAdjacentHTML("afterend", `
      <div id="settings-arduino">
        <h2>Arduino serial port</h2>
        <div class="flex-r mb16">
          <select id="settings-arduino-port" class="f-noshrink"></select>
          <span class="f-noshrink">@</span>
          <select id="settings-arduino-baudrate-select" class="f-noshrink">
            <option value="custom">(custom)</option>
          </select>
          <input type="text" id="settings-arduino-baudrate-text" class="ml8" pattern="^\\d{1,8}$"
            value="${_arduino.baudRate ? _arduino.baudRate : ''}" placeholder="baud rate" />
        </div>
        <button type="button" class="btn" id="settings-arduino-apply-btn">Apply serial port settings</button>
      </div>
    `);
    const select = utils.qs("#settings-arduino-baudrate-select");
    const textInput = utils.qs("#settings-arduino-baudrate-text");

    // baudrate config
    for (const baudRate of _arduino.baudRatePresets) {
      const optText = baudRate < 1000 ? baudRate + " bps" : baudRate / 1000 + " kbps";
      const isSelected = baudRate === _arduino.baudRate;
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
      select.value = _arduino.baudRatePresets.includes(val) ? val : "custom";
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
      for (const opt of _arduino.availablePorts) {
        arduinoPortSelect.insertAdjacentHTML("beforeend", `
          <option value="${opt}"${opt === _arduino.port ? " selected" : ""}>${opt}</option>
        `);
      }
    }
  }


  /** POST arduino settings to server & process its response. */
  async function _submitArduinoSettings() {
    const arduinoPort = utils.qs("#settings-arduino-port").value;
    const baudRate = utils.qs("#settings-arduino-baudrate-text").value;
    if (!/^\d+$/.test(baudRate)) {
      ui.makeToast("error", "Invalid baud rate. Must be a non-negative integer.", 3000);
      return;
    }

    const payload = { Name: arduinoPort, BaudRate: parseInt(baudRate) };
    console.debug("submitArduinoSettings payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      globals.server.baseurl + "/settings/serialport/",
      payload,
      (resp) => {
        _arduino.port = resp.Name;
        _arduino.baudRate = resp.BaudRate;
        ui.makeToast("success", "Successfully updated.");
      }
    );
  }


  /** Render the settings interface for max. surface angles. */
  function _renderMSASettings() {
    const min = _maxSurfaceAngles.limits.min;
    const max = _maxSurfaceAngles.limits.max;
    const surfaces = _maxSurfaceAngles.surfaces;
    const container = utils.qs("#settings-surfaces-inner");
    let newHTML = "";
    for (const [name, maxAngle] of Object.entries(surfaces)) {
      newHTML += `
      <label for="settings-surfaces-${name}-range">
        <span>${name}</span>
        <div class="flex-r f-g16">
          <input id="settings-surfaces-${name}-range" type="range" class="f-grow" data-surf="${name}"
            min="${min}" max="${max}" step="1" value="${maxAngle}" />
          <input id="settings-surfaces-${name}-text" class="w4ch" type="text"
            pattern="^\\d+$" maxlength="2" value="${maxAngle}" />
        </div>
      </label>`;
    };
    newHTML += `
    <div class="flex-r">
      <button type="button" class="btn" id="settings-surfaces-apply-btn">Apply max angles settings</button>
    </div>`;
    container.innerHTML = newHTML;
  }


  /** POST max surface angles settings to server & process its response. */
  async function _submitMSASettings() {
    const payload = { MaxSurfaceAngles: {}, };
    _.toArray(utils.qsa("#settings-surfaces-inner input[type=range]")).forEach(el => {
      const name = el.dataset.surf;
      const val = Number(el.value);
      payload.MaxSurfaceAngles[name] = val;
    });
    console.debug("submitMSASettings payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      globals.server.baseurl + "/settings/maxsurfaceangles/",
      payload,
      (resp) => {
        _maxSurfaceAngles.surfaces = {};
        for (const surface of resp.AvailableSurfaces) {
          _maxSurfaceAngles.surfaces[surface] = resp.MaxSurfaceAngles[surface] || 0;
        }
        _renderMSASettings();
        ui.makeToast("success", "Successfully updated.");
      }
    );
  }


  /** POST radio settings to server & process its response. */
  async function _submitRadioSettings() {
    const payload = {
      Channel: Number(utils.qs("#settings-radio-channel-range").value),
      PALevel: Number(utils.qs("#settings-radio-pa-range").value),
      IsPlaneFeedbackEnabled: utils.qs("#settings-radio-feedback").value === "yes",
    };
    console.debug("submitRadioSettings payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      globals.server.baseurl + "/settings/radio/",
      payload,
      (resp) => {
        _radio.channel = resp.Channel;
        _radio.paLevel = resp.PALevel;
        _radio.feedback = resp.IsPlaneFeedbackEnabled;
        ui.makeToast("success", "Successfully updated.");
      }
    );
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