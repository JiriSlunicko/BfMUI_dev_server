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
        renderInitialArduinoPortSettings();
      }

      makeToast("success", `Connection successful, polling.\n\nArduino: ${g.server.usingArduino}`);
    } else {
      throw new Error("server did not return a JSON array");
    }
  } catch (err) {
    makeToast("error", "Connection failed.\n\n" + err, 5000);
  }
}


function renderInitialArduinoPortSettings() {
  qs("#settings-misc").insertAdjacentHTML("afterbegin", `
    <h2>Arduino serial port</h2>
    <div class="flex-r f-g8 mb32">
      <select id="settings-arduino-port"></select>
      <button type="button" class="btn mla" id="settings-port-btn">Set port</button>
    </div>
  `);
  updateArduinoPortSettings();
}


function updateArduinoPortSettings() {
  const arduinoPortSelect = qs("#settings-arduino-port");
  if (arduinoPortSelect) {
    arduinoPortSelect.innerHTML = "";
    for (const opt of g.arduinoConfig.availablePorts) {
      arduinoPortSelect.insertAdjacentHTML("beforeend", `
        <option value="${opt}">${opt}</option>
      `);
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