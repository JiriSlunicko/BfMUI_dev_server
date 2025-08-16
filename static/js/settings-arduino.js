window.settings.arduino = (function()
{
  let _initialised = false;

  let _staged = {
    port: null,
    baudRate: null,
  }

  let _arduino = {
    port: null,
    baudRate: null,
    availablePorts: [],
    baudRatePresets: [110, 300, 600, 1200, 2400, 4800, 9600, 14400,
      19200, 38400, 57600, 115200, 128000, 256000],
    serverDataIsNull: null,
  }


  async function init() {
    const portSelect = utils.qs("#settings-arduino-port");
    const baudRateSelect = utils.qs("#settings-arduino-baudrate-select");
    const baudRateText = utils.qs("#settings-arduino-baudrate-text");
    baudRateText.value = _arduino.baudRate || "";

    // serial port validation
    portSelect.addEventListener("change", function () {
      _validatePortSelection(this.value);
    });

    // baudrate config
    for (const baudRate of _arduino.baudRatePresets) {
      const optText = baudRate < 1000 ? baudRate + " bps" : baudRate / 1000 + " kbps";
      const isSelected = baudRate === _arduino.baudRate;
      baudRateSelect.insertAdjacentHTML("beforeend", `
        <option value="${baudRate}"${isSelected ? " selected" : ""}>${optText}</option>
      `);
    }
    // update text input on baud rate select interaction
    baudRateSelect.addEventListener("change", function () {
      if (this.value !== "custom") { baudRateText.value = this.value; }
      _staged.baudRate = baudRateText.value === "" ? null : parseInt(baudRateText.value);
    });
    // update baud rate select on text input
    baudRateText.addEventListener("change", function () {
      const val = parseInt(this.value);
      baudRateSelect.value = _arduino.baudRatePresets.includes(val) ? val : "custom";
      _staged.baudRate = isNaN(val) ? null : val;
    });

    // submit listener
    utils.qs("#settings-arduino-submit-btn").addEventListener("click", function () {
      if (hasPendingChanges())
        save();
    });
    // reset listener
    utils.qs("#settings-arduino-reset-btn").addEventListener("click", reset);

    return true;
  }


  async function load() {
    const usingArduino = await _fetchData(backend);
    if (usingArduino === null)
      return false; // loading error
    _render();
    return true;
  }


  function reset() {
    _staged.port = null;
    _staged.baudRate = null;
    _render();
  }


  async function save() {
    const resolvedPort = _staged.port ?? _arduino.port;
    const resolvedBaudRate = _staged.baudRate ?? _arduino.baudRate;

    if (!/^\d+$/.test(resolvedBaudRate)) {
      ui.makeToast("error", "Invalid baud rate. Must be a non-negative integer.", 3000);
      return;
    }

    const payload = { Name: resolvedPort, BaudRate: parseInt(resolvedBaudRate) };
    console.debug("arduino payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.serialPortPost,
      payload,
      (resp) => {
        _arduino.port = resp?.Name || null;
        _arduino.baudRate = resp?.BaudRate || null;
        _arduino.serverDataIsNull = resp === null;
        _staged.port = null;
        _staged.baudRate = null;
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    return (
      (_staged.port !== null && _staged.port !== _arduino.port) ||
      (_staged.baudRate !== null && _staged.baudRate !== _arduino.baudRate)
    );
  }


  /** Load fresh data from the server into _arduino.
   * @param {object} globalServer backend - .usingArduino will be updated
   * @returns {Promise<boolean|null>} true = using arduino, false = not using arduino, null = error
   */
  async function _fetchData(globalServer) {
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + backend.endpoints.serialPortGet);
      globalServer.usingArduino = raw.status === 200;

      if (globalServer.usingArduino) {
        const resp = await raw.json();
        _arduino.port = resp.SerialPortParameters?.Name || null;
        _arduino.baudRate = resp.SerialPortParameters?.BaudRate || null;
        _arduino.availablePorts = resp.AvailablePorts || [];
        _arduino.serverDataIsNull = resp.SerialPortParameters === null;
        return true;
      } else {
        console.debug("Server is not using arduino.");
        return false;
      }
    } catch (err) {
      console.error("Arduino fetch error:", err);
      return null;
    }
  }


  function _render() {
    const arduinoPanel = utils.qs("#settings-arduino");

    if (!backend.usingArduino) {
      arduinoPanel.classList.add("hidden");
      return;
    }

    arduinoPanel.classList.remove("hidden");
    const portSelect = arduinoPanel.querySelector("#settings-arduino-port");
    const baudRateText = arduinoPanel.querySelector("#settings-arduino-baudrate-text");
    const baudRateSelect = arduinoPanel.querySelector("#settings-arduino-baudrate-select");
    const prevWarning = arduinoPanel.querySelector("#settings-arduino-warning");
    if (prevWarning) prevWarning.remove();

    const resolvedPort = _staged.port ?? _arduino.port;
    const resolvedBaudRate = _staged.baudRate ?? _arduino.baudRate;

    // update port selection
    portSelect.innerHTML = "";
    for (const opt of _arduino.availablePorts) {
      portSelect.insertAdjacentHTML("beforeend", `
        <option value="${opt}"${opt === resolvedPort ? " selected" : ""}>${opt}</option>
      `);
    }
    const isPortValid = _validatePortSelection(resolvedPort);

    if (!isPortValid) {
      portSelect.insertAdjacentHTML("beforeend", `
        <option value="${resolvedPort}" selected disabled>${resolvedPort}</option>`);
    }

    // update baudrate selection
    baudRateText.value = resolvedBaudRate;
    baudRateSelect.value = _arduino.baudRatePresets.includes(resolvedBaudRate) ? resolvedBaudRate : "custom";
  }


  /** Check if the selected port is valid and signal it visually.
   * @param {string|null} value arduino port name
   * @returns {boolean} whether valid
   */
  function _validatePortSelection(value) {
    const arduinoPanel = utils.qs("#settings-arduino");
    let returnValue = null;

    if (value && value !== "null" && !_arduino.availablePorts.includes(value)) {
      arduinoPanel.classList.add("invalid");
      arduinoPanel.querySelector("#settings-arduino-submit-btn").classList.add("hidden");
      arduinoPanel.querySelector("#settings-arduino-submit-btn").insertAdjacentHTML("beforebegin", `
        <p id="settings-arduino-warning" class="warning mb0"><b>WARNING:</b> port not available</p>`);
      
      _staged.port = null;
      returnValue = false;
    } else {
      arduinoPanel.classList.remove("invalid");
      arduinoPanel.querySelector("#settings-arduino-submit-btn").classList.remove("hidden");
      arduinoPanel.querySelector("#settings-arduino-warning")?.remove();
      
      if (_initialised) _staged.port = value;
      returnValue = true;
    }

    _initialised = true;
    return returnValue;
  }


  // public API
  return {
    init,
    load,
    reset,
    save,
    hasPendingChanges,
  }
})();