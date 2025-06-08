document.addEventListener("DOMContentLoaded", () => {
  if (g.server.baseurl) {
    const urlWithoutProtocol = g.server.baseurl.replace(/^https?:\/\//, "")
    const [ip, port] = urlWithoutProtocol.split(":");
    qs("#input-ip").value = ip;
    qs("#input-port").value = port;
    connect();
    if (!g.controls.actions.length && g.currentPage === "controls") {
      renderControlsInterface();
    }
  }
  qs("#input-poll-interval").value = g.server.pollDelay;
  qs("#settings-reset-btn").addEventListener("click", resetSettings);
  qs("#settings-connect-btn").addEventListener("click", connect);
  qs("#input-poll-interval").addEventListener("blur", changePollInterval);
  qs("#settings-poll-start-btn").addEventListener("click", pollStart);
  qs("#settings-poll-start-btn").disabled = true;
  qs("#settings-poll-pause-btn").addEventListener("click", pollPause);
  qs("#settings-poll-pause-btn").disabled = true;
});


async function resetSettings() {
  const confirmed = await window.makePopup("confirm", "Are you sure you want to reset all app settings, including server IP etc?");
  if (confirmed) {
    localStorage.clear();
  }
}


async function connect() {
  const ip = qs("#input-ip").value;
  const port = qs("#input-port").value;

  if (!/^(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|localhost$/.test(ip)
   || !/^\d{4}$/.test(port)) {
    await makePopup("alert", "Invalid IP address / port.");
    return;
  }

  pollPause();
  qs("#settings-poll-start-btn").disabled = true;
  qs("#settings-poll-pause-btn").disabled = true;

  makeToast(null, "Attempting connection...", -1);
  const baseurl = "http://" + ip + ":" + port;
  try {
    // get systeminfo
    const raw = await fetchWithTimeout(baseurl + "/systeminfo/");
    const resp = await raw.json();

    // did we get an expected response format?
    if (_.isArray(resp)) {
      g.server.baseurl = baseurl;
      g.server.info = resp;
      localStorage.setItem("serverBaseurl", baseurl);

      initSysInfo();
      qs("#settings-connection-status").textContent = "Connected to " + baseurl;

      pollStart();

      // check if serial port endpoints are supported
      if (fetchSerialPortData()) {
        renderInitialArduinoSettings();
      }

      makeToast("success", `Connection successful, polling.\n\nArduino: ${g.server.usingArduino}`);
    } else {
      throw new Error("server did not return a JSON array");
    }
  } catch (err) {
    makeToast("error", "Connection failed.\n\n" + err, 5000);
  }
}


function renderInitialArduinoSettings() {
  qs("#settings-misc").insertAdjacentHTML("afterbegin", `
    <h2>Arduino serial port</h2>
    <div class="flex-r mb8">
      <select id="settings-arduino-port" class="f-noshrink"></select>
      <span class="f-noshrink">@</span>
      <select id="settings-arduino-baudrate-select" class="f-noshrink">
        <option value="custom">(custom)</option>
      </select>
      <input type="text" id="settings-arduino-baudrate-text" class="ml8" pattern="^\\d{1,8}$"
        value="${g.arduino.baudRate ? g.arduino.baudRate : ''}" />
    </div>
    <button type="button" class="btn mb32" id="settings-arduino-apply-btn">Apply settings</button>
  `);
  const select = qs("#settings-arduino-baudrate-select");
  const textInput = qs("#settings-arduino-baudrate-text");

  // baudrate config
  for (const baudRate of g.arduino.baudRatePresets) {
    const optText = baudRate < 1000 ? baudRate+" bps" : baudRate/1000+" kbps";
    const isSelected = baudRate === g.arduino.baudRate;
    select.insertAdjacentHTML("beforeend", `
      <option value="${baudRate}"${isSelected ? " selected" : ""}>${optText}</option>
    `);
  }
  // update text input on select interaction
  select.addEventListener("change", function () {
    if (this.value !== "custom") { textInput.value = this.value; }
  });
  // update select on text input
  textInput.addEventListener("change", function() {
    const val = parseInt(this.value);
    select.value = g.arduino.baudRatePresets.includes(val) ? val : "custom";
  });

  // serial port selection
  updateArduinoSettings();

  // submit listener
  qs("#settings-arduino-apply-btn").addEventListener("click", submitArduinoSettings);
}


function updateArduinoSettings() {
  const arduinoPortSelect = qs("#settings-arduino-port");
  if (arduinoPortSelect) {
    arduinoPortSelect.innerHTML = "";
    for (const opt of g.arduino.availablePorts) {
      arduinoPortSelect.insertAdjacentHTML("beforeend", `
        <option value="${opt}"${opt === g.arduino.port ? " selected" : ""}>${opt}</option>
      `);
    }
  }
}


async function submitArduinoSettings() {
  const arduinoPort = qs("#settings-arduino-port").value;
  const baudRate = qs("#settings-arduino-baudrate-text").value;
  if (!/^\d+$/.test(baudRate)) {
    makeToast("error", "Invalid baud rate. Must be a non-negative integer.", 3000);
    return;
  }

  const payload = {Name: arduinoPort, BaudRate: parseInt(baudRate)};
  console.debug("submitArduinoSettings payload:", payload);

  let raw = null;
  try {
    raw = await postWithTimeout(g.server.baseurl + "/settings/serialport/", payload);
  } catch (err) {
    makeToast("error", "Failed - network error:\n\n" + err.toString(), 5000);
    raw = null;
  }
  if (raw) {
    try {
      const resp = await raw.json();
      g.arduino.port = resp.Name;
      g.arduino.baudRate = resp.BaudRate;
    } catch (err) {
      if (raw.ok) {
        makeToast("error", `POST succeeded, but can't process response:\n\n${err.toString()}`, 7500);
      } else {
        makeToast("error", `Failed utterly - ${raw.status}:\n\n${raw.statusText}`, 7500);
      }
    }
  }
}


function changePollInterval() {
  const input = qs("#input-poll-interval").value;
  const newPollDelay = Number(input);
  if (!/^\d+$/.test(input) || newPollDelay < 100) {
    makeToast("error", "Polling interval must be a number >= 100.", 3000);
    return;
  }

  if (newPollDelay !== g.server.pollDelay) {
    g.server.pollDelay = newPollDelay;
    pollStart();
    localStorage.setItem("pollDelay", newPollDelay);
    makeToast("success", "Polling interval set to "+g.server.pollDelay+" ms.");
  }
}


function pollStart() {
  if (g.polling.interval !== null) {
    clearInterval(g.polling.interval);
    g.polling.interval = null;
  }

  g.polling.active = true;
  g.data.serialTimers = Array(25).fill([]);
  g.data.controllers = {};

  g.polling.interval = setInterval(() => {
    fetchTelemetry();
  }, g.server.pollDelay);
  fetchTelemetry();

  qs("#settings-poll-start-btn").disabled = true;
  qs("#settings-poll-pause-btn").disabled = false;
  makeToast("success", "Polling!");
}


function pollPause() {
  if (g.polling.interval !== null) {
    clearInterval(g.polling.interval);
    g.polling.interval = null;
    makeToast(null, "Stopped polling.");
  }

  g.polling.active = false;
  g.data.serialTimers = Array(25).fill([]);
  g.data.controllers = {};

  qs("#settings-poll-start-btn").disabled = false;
  qs("#settings-poll-pause-btn").disabled = true;
}