/** Interface for handling a server-side event stream.
 * Also responsible for tracking the connection state.
*/

window.events = (function () {
  const _m = "events";

  let _eventStream = null;
  let _lastBoot = null;
  let _connectInterval = null;
  let _hasConnected = false;
  let _isAttemptingReconnect = false;
  let _debugMode = false;


  /** @param {boolean} setTo whether we want debug mode */
  function setDebugMode(setTo) {
    _debugMode = setTo;
  }


  /** Shorthand for "if in debug mode, print to console". */
  function _debugLog(...data) {
    if (_debugMode) {
      logger.debug(_m, ...data);
    }
  }


  /** Close any existing stream and try to open a new one,
   * retrying on failure indefinitely. */
  async function tryConnectionUntilOk() {
    if (_connectInterval) return;

    closeStream(); // sets _hasConnected to false

    _connectInterval = setInterval(() => {
      _debugLog("tryConnectionUntilOk interval hit.", {
        _hasConnected,
        _isAttemptingReconnect
      });
      
      // loop break condition
      if (_hasConnected) {
        clearInterval(_connectInterval);
        _connectInterval = null;
        return;
      }

      // retry if another retry isn't already in progress
      if (!_isAttemptingReconnect) {
        _isAttemptingReconnect = true;
        openStream();
      }
    }, 1000);
  }


  /** Connect to the backend server's event dispatcher. */
  function openStream() {
    _debugLog("Attempting to open a new event stream.");

    closeStream();

    _eventStream = new EventSource(backend.baseurl + backend.endpoints.events);

    // when successfully connected, set the flags to stop connection attempts
    _eventStream.onopen = () => {
      _debugLog("Opened new event stream.", _eventStream);
      pages.settings.pollStart(true);
      _hasConnected = true;
      _isAttemptingReconnect = false;
    }

    // handle incoming messages
    _eventStream.onmessage = (msg) => {
      _debugLog("Received message.", msg.data);

      let asJson = null;
      try {
        asJson = JSON.parse(msg.data);
      } catch (err) {
        logger.error(_m, "Event source received a message that's not valid JSON.", msg, err);
        return;
      }

      const newBootTime = new Date(asJson.AppStartTime);
      if (_lastBoot === null) {
        _lastBoot = newBootTime;
      } else if (newBootTime > _lastBoot) {
        _lastBoot = newBootTime;
        closeStream();
        _debugLog("Event manager requests reconnection from pages.settings.");
        pages.settings.connect(backend, true, "Server has been restarted.");
      }

      if (asJson.Events && asJson.Events.length) {
        _processEvents(asJson.Events);
      }
    };

    // if the stream fails, try to reconnect
    _eventStream.onerror = (ev) => {
      logger.error(_m, "Event stream failed.", ev);
      pages.settings.pollPause(true);

      _isAttemptingReconnect = false;
      tryConnectionUntilOk();
    };
  }


  /** Close an open event stream. Idempotent. */
  function closeStream() {
    if (_eventStream !== null) {
      _debugLog("Closing existing event stream.", _eventStream);
      _eventStream?.close();
      _eventStream = null;
      _hasConnected = false;
    }
  }


  /** Handle any events that came with a message from the backend.
   * 
   * @param {string[]} eventArray list of event names
   */
  function _processEvents(eventArray) {
    let changedDomains = new Set();

    for (const backendEvent of eventArray) {
      _debugLog(backendEvent);

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
          logger.warn(_m, "Received unknown event", backendEvent);
      }
    }

    settingsManager.load(Array.from(changedDomains));
  }


  // public API
  return {
    getDebugMode: () => _debugMode,
    setDebugMode,
    tryConnectionUntilOk,
    openStream,
    closeStream,
  };
})();
