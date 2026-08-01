window.settings.arduino = (function()
{
  let _initialised = false;

  let _staged = {
    port: undefined,
    baudRate: undefined,
  }

  let _arduino = {
    port: null,
    baudRate: null,
    availablePorts: [],
    baudRatePresets: [
      110, 300, 600, 1200, 2400, 4800,
      9600, 14400, 19200, 38400, 57600,
      115200, 128000, 256000,
    ],
    serverDataIsNull: null,
    portSelect: null,
    baudRateSelect: null,
    baudRateText: null,
    submitBtn: null,
    setNullBtn: null,
    resetBtn: null,
  }


  async function init() {
    _arduino.portSelect = utils.qs("#settings-arduino-port");
    _arduino.baudRateSelect = utils.qs("#settings-arduino-baudrate-select");
    _arduino.baudRateText = utils.qs("#settings-arduino-baudrate-text");
    _arduino.baudRateText.value = _arduino.baudRate || "";
    _arduino.submitBtn = utils.qs("#settings-arduino-submit-btn");
    _arduino.setNullBtn = utils.qs("#settings-arduino-setnull-btn");
    _arduino.resetBtn = utils.qs("#settings-arduino-reset-btn");

    // serial port validation
    _arduino.portSelect.addEventListener("change", function () {
      _validatePortSelection(this.value);
    });

    // baudrate config
    for (const baudRate of _arduino.baudRatePresets) {
      const optText = (
        baudRate < 1000
        ? baudRate + " bps"
        : baudRate / 1000 + " kbps"
      );
      const isSelected = baudRate === _arduino.baudRate;
      _arduino.baudRateSelect.insertAdjacentHTML("beforeend", `
        <option value="${baudRate}"${isSelected ? " selected" : ""}
          >${optText}</option>
      `);
    }

    // update text input on baud rate select interaction
    _arduino.baudRateSelect.addEventListener("change", function () {
      if (this.value !== "custom") {
        _arduino.baudRateText.value = this.value;
      }
      _staged.baudRate = (
        _arduino.baudRateText.value === ""
        ? undefined
        : parseInt(_arduino.baudRateText.value)
      );
    });

    // update baud rate select on text input
    _arduino.baudRateText.addEventListener("change", function () {
      const val = parseInt(this.value);
      _arduino.baudRateSelect.value = (
        _arduino.baudRatePresets.includes(val)
        ? val
        : "custom"
      );
      _staged.baudRate = (
        isNaN(val)
        ? undefined
        : val
      );
    });

    // submit listener
    _arduino.submitBtn.addEventListener("click",
      _.throttle(() => {
        if (hasPendingChanges()) {
          save();
        }
      }, 1000, { trailing: false, }));
    // submit as NULL listener
    _arduino.setNullBtn.addEventListener("click",
      _.throttle(() => {
        if (!_arduino.serverDataIsNull) {
          _saveNull();
        }
      }, 1000, { trailing: false, }));
    // reset listener
    _arduino.resetBtn.addEventListener("click", reset);

    return true;
  }


  async function load() {
    const usingArduino = await _fetchData(backend);
    if (usingArduino === null) {
      return false; // loading error
    }
    _render();
    return true;
  }


  function reset() {
    _clearStaged();
    _render();
  }


  async function save() {
    const resolvedPort = utils.coalesceUndef(_staged.port, _arduino.port);
    const resolvedBaudRate = utils.coalesceUndef(_staged.baudRate, _arduino.baudRate);

    if (!resolvedPort) {
      ui.makeToast(
        "error",
        "Invalid port. Must be a non-empty string.",
        3000
      );
      return false;
    }
    if (!/^\d+$/.test(resolvedBaudRate)) {
      ui.makeToast(
        "error",
        "Invalid baud rate. Must be a non-negative integer.",
        3000
      );
      return false;
    }

    const payload = { Name: resolvedPort, BaudRate: parseInt(resolvedBaudRate) };
    return _saveInternal(payload);
  }


  function hasPendingChanges() {
    return (
      (_staged.port !== undefined && _staged.port !== _arduino.port)
      ||
      (_staged.baudRate !== undefined && _staged.baudRate !== _arduino.baudRate)
    );
  }


  async function _saveNull() {
    const payload = null;
    const success = await _saveInternal(payload);
    if (success) {
      _arduino.portSelect.value = null;
      _validatePortSelection(null);
    }
    return success;
  }


  async function _saveInternal(payload) {
    console.debug("arduino payload:", payload);

    const success = await ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.serialPortPost,
      {
        options: {
          method: "POST",
          body: JSON.stringify(payload),
        },
        successHandler: (resp) => {
          _arduino.port = resp?.Name || null;
          _arduino.baudRate = resp?.BaudRate || null;
          _arduino.serverDataIsNull = resp === null;
          _clearStaged();
          ui.makeToast("success", "Successfully updated.");4
        },
        failureHandler: ajax.handleJsonAjaxFail,
      }
    );

    return success;
  }


  /** Load fresh data from the server into _arduino.
   * 
   * @param {object} globalServer backend - .usingArduino will be updated
   * @returns {Promise<boolean|null>} true = using arduino, false = not using arduino, null = error
   */
  async function _fetchData(globalServer) {
    let isArduinoEnabled;

    await ajax.fetchWithTimeout(
      backend.baseurl + backend.endpoints.serialPortGet,
      {
        successHandler: (resp) => {
          globalServer.usingArduino = true;
          isArduinoEnabled = true;
          console.debug("Server is using arduino.");
          _arduino.port = resp.SerialPortParameters?.Name ?? null;
          _arduino.baudRate = resp.SerialPortParameters?.BaudRate ?? null;
          _arduino.availablePorts = resp.AvailablePorts ?? [];
          _arduino.serverDataIsNull = resp.SerialPortParameters === null;
        },
        failureHandler: (resp, err) => {
          if (resp.status === 512) {
            globalServer.usingArduino = false;
            isArduinoEnabled = false;
            console.debug("Server is not using arduino.");
          } else {
            isArduinoEnabled = null;
            console.debug("Arduino fetch errored unexpectedly.", err);
            ui.makeToast(
              "error",
              `AJAX fail for ${resp.url}:\n\n${err.toString()}`,
              5000
            );
          }
        },
      }
    );

    return isArduinoEnabled;
  }


  function _render() {
    const arduinoPanel = utils.qs("#settings-arduino");

    // no arduino -> just hide the panel
    if (!backend.usingArduino) {
      arduinoPanel.classList.add("hidden");
      return;
    }

    // arduino enabled -> show the panel
    arduinoPanel.classList.remove("hidden");
    const prevWarning = arduinoPanel.querySelector("#settings-arduino-warning");
    if (prevWarning) prevWarning.remove();

    const resolvedPort = utils.coalesceUndef(_staged.port, _arduino.port);
    const resolvedBaudRate = utils.coalesceUndef(_staged.baudRate, _arduino.baudRate);

    // update port selection
    utils.removeChildren(_arduino.portSelect);
    for (const opt of _arduino.availablePorts) {
      _arduino.portSelect.insertAdjacentHTML("beforeend", `
        <option value="${opt}"${opt === resolvedPort ? " selected" : ""}
          >${opt}</option>`);
    }

    // selection invalid -> selected but disabled
    if (!_validatePortSelection(resolvedPort)) {
      _arduino.portSelect.insertAdjacentHTML("beforeend", `
        <option value="${resolvedPort}" selected disabled
          >${resolvedPort}</option>`);
    }

    // update baudrate selection
    _arduino.baudRateText.value = resolvedBaudRate;
    _arduino.baudRateSelect.value = (
      _arduino.baudRatePresets.includes(resolvedBaudRate)
      ? resolvedBaudRate
      : "custom"
    );
  }


  /** Check if the selected port is valid and signal it visually.
   * 
   * @param {string|null} value arduino port name
   * @returns {boolean} whether valid
   */
  function _validatePortSelection(value) {
    const arduinoPanel = utils.qs("#settings-arduino");
    let returnValue = null;

    if (value && value !== "null" && !_arduino.availablePorts.includes(value)) {
      arduinoPanel.classList.add("invalid");
      _arduino.submitBtn.classList.add("hidden");
      arduinoPanel.querySelector("#settings-arduino-buttons").insertAdjacentHTML("beforebegin", `
        <p id="settings-arduino-warning" class="warning mb16"
          ><b>WARNING:</b> port not available</p>`);

      _staged.port = undefined;
      returnValue = false;
    } else {
      arduinoPanel.classList.remove("invalid");
      _arduino.submitBtn.classList.remove("hidden");
      arduinoPanel.querySelector("#settings-arduino-warning")?.remove();

      if (_initialised) {
        _staged.port = value;
      }
      returnValue = true;
    }

    _initialised = true;
    return returnValue;
  }


  function _clearStaged() {
    _staged.port = undefined;
    _staged.baudRate = undefined;
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
