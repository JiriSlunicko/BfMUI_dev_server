window.settings.arduino = (function()
{
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
      _staged.baudRate = parseInt(baudRateText.value);
    });
    // update baud rate select on text input
    baudRateText.addEventListener("change", function () {
      const val = parseInt(this.value);
      baudRateSelect.value = _arduino.baudRatePresets.includes(val) ? val : "custom";
      _staged.baudRate = val;
    });

    // submit listener
    utils.qs("#settings-arduino-apply-btn").addEventListener("click", function () {
      if (!this.disabled)
        save();
    });

    return true;
  }


  async function load() {
    const usingArduino = await _fetchData(backend);
    if (usingArduino === null) return false; // loading error

    const arduinoPanel = utils.qs("#settings-arduino");

    // hide panel and return if not using arduino
    if (usingArduino === false) {
      arduinoPanel.classList.add("hidden");
      return true;
    }

    // if we're here, arduino is enabled
    arduinoPanel.classList.remove("hidden");
    const arduinoPortSelect = arduinoPanel.querySelector("#settings-arduino-port");
    const arduinoBaudRateText = arduinoPanel.querySelector("#settings-arduino-baudrate-text");
    const prevWarning = arduinoPanel.querySelector("#settings-arduino-warning");
    if (prevWarning) prevWarning.remove();

    // update port selection
    arduinoPortSelect.innerHTML = "";
    for (const opt of _arduino.availablePorts) {
      arduinoPortSelect.insertAdjacentHTML("beforeend", `
        <option value="${opt}"${opt === _arduino.port ? " selected" : ""}>${opt}</option>
      `);
    }
    if (_arduino.port && _arduino.port !== "null" && !_arduino.availablePorts.includes(_arduino.port)) {
      arduinoPortSelect.insertAdjacentHTML("beforeend", `
        <option value="${_arduino.port}" selected disabled>${_arduino.port}</option>`);
    }
    _validatePortSelection(_arduino.port);

    // update baudrate selection
    arduinoBaudRateText.value = _arduino.baudRate;
    arduinoBaudRateText.dispatchEvent(new Event("change", { bubbles: true }));

    return true;
  }


  async function save() {
    if (!/^\d+$/.test(_staged.baudRate)) {
      ui.makeToast("error", "Invalid baud rate. Must be a non-negative integer.", 3000);
      return;
    }

    const payload = { Name: _staged.port, BaudRate: parseInt(_staged.baudRate) };
    console.debug("arduino payload:", payload);

    const postSuccess = await ajax.postWithTimeout(
      backend.baseurl + backend.endpoints.serialPortPost,
      payload,
      (resp) => {
        _arduino.port = resp.Name;
        _arduino.baudRate = resp.BaudRate;
        _setStagedToActual();
        ui.makeToast("success", "Successfully updated.");
      }
    );

    return postSuccess;
  }


  function hasPendingChanges() {
    return (
      _staged.port !== _arduino.port ||
      _staged.baudRate !== _arduino.baudRate
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
        _arduino.availablePorts = resp.availablePorts || [];
        _setStagedToActual();
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


  /** Check if the selected port is valid and signal it visually.
   * @param {string|null} value arduino port name
   */
  function _validatePortSelection(value) {
    const arduinoPanel = utils.qs("#settings-arduino");

    if (value && value !== "null" && !_arduino.availablePorts.includes(value)) {
      arduinoPanel.classList.add("invalid");
      arduinoPanel.querySelector("#settings-arduino-apply-btn").classList.add("hidden");
      arduinoPanel.querySelector("#settings-arduino-apply-btn").insertAdjacentHTML("beforebegin", `
        <p id="settings-arduino-warning" class="warning mb0"><b>WARNING:</b> port not available</p>`);
    } else {
      arduinoPanel.classList.remove("invalid");
      arduinoPanel.querySelector("#settings-arduino-apply-btn").classList.remove("hidden");
      arduinoPanel.querySelector("#settings-arduino-warning")?.remove();
    }
  }


  function _setStagedToActual() {
    _staged.port = _arduino.port;
    _staged.baudRate = _arduino.baudRate;
  }


  // public API
  return {
    init,
    load,
    save,
    hasPendingChanges,
  }
})();