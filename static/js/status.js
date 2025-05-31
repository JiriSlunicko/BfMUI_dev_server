function renderTelemetry() {
  const sthdData = g.data.serialTimers[g.data.serialTimers.length - 1];

  qs("#status-telemetry-inner > p")?.remove();

  if (!sthdData.length) {
    qs("#status-telemetry-inner").innerHTML = "<p>No data.</p>";
    return;
  }

  for (const entry of sthdData) {
    createOrUpdateEntry(
      "#status-telemetry-inner",
      "sthd-" + entry.SerialTimerName,
      entry.SerialTimerName,
      processSTHDEntry(entry),
      entry.Health
    );
  }
  clearDeadEntries("#status-telemetry-inner", sthdData.map(x => "sthd-"+x.SerialTimerName));
}

function renderControllers() {
  const ctrlData = g.data.controllers;
  
  qs("#status-controllers-inner > p")?.remove();

  if (_.isEmpty(ctrlData)) {
    qs("#status-controllers-inner").innerHTML = "<p>No controllers detected.</p>";
    return;
  }

  for (const [key, value] of Object.entries(ctrlData)) {
    createOrUpdateEntry(
      "#status-controllers-inner",
      "ctrl-"+key,
      key,
      {"": value}
    );
  }
  clearDeadEntries("#status-controllers-inner", Object.keys(ctrlData).map(x => "ctrl-"+x));
}

function processSTHDEntry(entry) {
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