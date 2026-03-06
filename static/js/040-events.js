/** Interface for handling a server-side event stream.
 * Also responsible for tracking the connection state.
*/

window.events = (function () {
  let _eventStream = null;
  let _lastBoot = null;
  let _connectInterval = null;
  let _hasConnected = false;
  let _isAttemptingReconnect = false;
  let _debugMode = false;


  function isDebugMode(change=null) {
    if (change === null)
      return _debugMode;

    _debugMode = change === true;
  }


  async function tryConnectionUntilOk() {
    if (_connectInterval) return;
    closeStream(); // sets _hasConnected to false
    _connectInterval = setInterval(() => {
      if (isDebugMode())
        console.debug("tryConnectionUntilOk interval hit.", {_hasConnected, _isAttemptingReconnect});
      
      if (_hasConnected) {
        clearInterval(_connectInterval);
        _connectInterval = null;
        return;
      }

      if (!_isAttemptingReconnect) {
        _isAttemptingReconnect = true;
        openStream();
      }
    }, 1000);
  }


  /** Connect to the backend server's event dispatcher. */
  function openStream() {
    if (isDebugMode())
      console.debug("Attempting to open a new event stream.");

    closeStream();
    _eventStream = new EventSource(backend.baseurl + backend.endpoints.events);

    _eventStream.onopen = () => {
      if (isDebugMode()) console.debug("Opened new event stream.", _eventStream);
      _hasConnected = true;
      _isAttemptingReconnect = false;
    }

    _eventStream.onmessage = (msg) => {
      if (isDebugMode()) console.debug(msg.data);

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

      _isAttemptingReconnect = false;
      tryConnectionUntilOk();
    };
  }


  /** Close an open event stream. Idempotent. */
  function closeStream() {
    if (_eventStream !== null) {
      if (isDebugMode()) console.debug("Closing existing event stream.", _eventStream);
      _eventStream?.close();
      _eventStream = null;
      _hasConnected = false;
    }
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

        case "BackgroundMusicSettingsChanged":
          changedDomains.add("music");
          break;

        default:
          console.warn("Received unknown event", backendEvent);
      }
    }

    settingsManager.load(Array.from(changedDomains));
  }


  // public API
  return {
    isDebugMode,
    tryConnectionUntilOk,
    openStream,
    closeStream,
  }
})();