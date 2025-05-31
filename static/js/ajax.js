async function fetchTelemetry() {
  let resp;
  try {
    const raw = await fetchWithTimeout(g.server.baseurl + "/telemetry/");
    resp = await raw.json();
  } catch (err) {
    makeToast("error", "Connection failed.\n\n" + err, 5000);
    return;
  }
  
  if (!_.isPlainObject(resp)
    || typeof resp.SerialTimerHealthData === "undefined"
    || typeof resp.Controllers === "undefined") {
    makeToast("error", "/telemetry/ returned something unexpected.");
    return;
  }

  g.data.serialTimers.push(resp.SerialTimerHealthData);
  g.data.serialTimers.shift();
  g.data.controllers = resp.Controllers;

  if (g.currentPage === "status") {
    renderTelemetry();
    renderControllers();
  }
}

async function fetchCtrlOptions() {
  makeToast(null, "Loading control options...", -1);
  let raw, resp;

  try {
    raw = await fetchWithTimeout(g.server.baseurl + "/settings/control/");
    resp = await raw.json();
    
    // array of strings (enum)
    g.controls.buttons = resp.AvailableControllerButtons;
    // array of strings (enum)
    g.controls.inAxes = resp.AvailableControllerAxes;
    // array of strings (enum)
    g.controls.actions = resp.AvailableControlActions;
    // array of strings (enum)
    g.controls.outAxes = resp.AvailablePlaneAxes;
    // { action -> input (button or 2 ", " separated buttons), ... }
    g.controls.restrictions = resp.ControlActionsRestrictions;
    g.controls.actionMappings = convertActionMappings(resp.ControlActionsSettings);
    g.controls.axisMappings = convertAxisMappings(resp.PlaneAxesSettings);

    makeToast("success", "Successfully loaded control options.");
    return true;
  } catch (err) {
    makeToast("error", "Connection failed while loading control options.\n\n" + err, 5000);
    return false;
  }
}