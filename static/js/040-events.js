/** Interface for handling a server-side event stream.
 * Also responsible for tracking the connection state.
*/

window.events = (function () {
  let _eventStream = null;
  let _lastBoot = null;
  let _streamFailed = false;
  let _tryingReconnect = false;
  let _debugMode = false;


  function isDebugMode(change=null) {
    if (change === null)
      return _debugMode;
    if (change === true) {
      _debugMode = true;
      return;
    }
    _debugMode = false;
  }


  async function tryConnectionUntilOk() {
    if (_tryingReconnect) return;
    closeStream();
    _tryingReconnect = true;
    _tryConnection();
  }


  async function _tryConnection() {
    if (isDebugMode())
      console.debug("_tryConnection runs.");
    try {
      const raw = await ajax.fetchWithTimeout(backend.baseurl + backend.endpoints.events, 2500);
      if (!raw.ok) throw new Error("Response "+raw.status);
      if (isDebugMode())
        console.debug("_tryConnection succeeded.");
      _tryingReconnect = false;
      _streamFailed = false;
      openStream();
    } catch {
      _tryConnection();
    }
  }

  
  /** Connect to the backend server's event dispatcher. */
  function openStream() {
    closeStream();
    _eventStream = new EventSource(backend.baseurl + backend.endpoints.events);

    _eventStream.onmessage = (msg) => {
      if (isDebugMode())
        console.debug(msg.data);
      _streamFailed = false;

      let asJson = null;
      try {
        asJson = JSON.parse(msg.data);
      } catch (err) {
        console.error("Event source received a message that's not valid JSON.", msg, err);
        return;
      }

      const newBootTime = new Date(asJson.AppStartTime);
      if (_lastBoot === null) {
        _lastBoot = newBootTime;
      } else if (newBootTime > _lastBoot) {
        _lastBoot = newBootTime;
        closeStream();
        if (isDebugMode())
          console.debug("Event manager requests reconnection from pages.settings.");
        pages.settings.connect(backend, true, "Server has been restarted.");
      }

      if (asJson.Events && asJson.Events.length) {
        _processEvents(asJson.Events);
      }
    };

    _eventStream.onerror = (ev) => {
      if (isDebugMode())
        console.debug("Event stream fail.");

      if (!_streamFailed) { // allow one fail before we consider the connection dead
        _streamFailed = true;
        return;
      }

      tryConnectionUntilOk();
    };
  }


  /** Handle any events that came with a message from the backend.
   * @param {string[]} eventArray list of event names
   */
  function _processEvents(eventArray) {
    let changedDomains = new Set();

    for (const backendEvent of eventArray) {
      if (isDebugMode()) {
        console.debug(new Date().toLocaleString(), backendEvent);
      }

      switch (backendEvent) {
        case "AvailableSerialPortsChanged":
        case "SerialPortParametersChanged":
          changedDomains.add("arduino");
          break;

        case "ControlActionSettingsChanged":
        case "PlaneAxisSettingsChanged":
          changedDomains.add("controls");
          break;

        case "MaxAnglesChanged":
          changedDomains.add("maxSurfaceAngles");
          break;

        case "RadioSettingsChanged":
          changedDomains.add("radio");
          break;

        case "TrimValuesChanged":
          changedDomains.add("trim");
          break;
      }
    }

    settingsManager.load(Array.from(changedDomains));
  }


  /** Close an open event stream. */
  function closeStream() {
    if (_eventStream !== null) {
      _eventStream?.close();
      _eventStream = null;
    }
  }


  // public API
  return {
    isDebugMode,
    tryConnectionUntilOk,
    openStream,
    closeStream,
  }
})();