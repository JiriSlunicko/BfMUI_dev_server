/** Interface for handling a server-side event stream. */

window.events = (function () {
  let _eventStream = null;

  
  /** Connect to the backend server's event dispatcher. */
  function openStream() {
    closeStream();
    _eventStream = new EventSource(backend.baseurl + backend.endpoints.events);
    _eventStream.onmessage = (msg) => {
      let asJson = null;
      try {
        asJson = JSON.parse(msg.data);
      } catch (err) {
        console.error("Event source received a message that's not valid JSON.", msg, err);
        return;
      }

      if (asJson.Events && asJson.Events.length) {
        _processEvents(asJson.Events);
      }
    }
  }


  /** Handle any events that came with a message from the backend.
   * @param {string[]} eventArray list of event names
   */
  function _processEvents(eventArray) {
    let changedDomains = new Set();

    for (const backendEvent of eventArray) {
      console.debug(new Date().toLocaleString(), backendEvent);

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
    openStream,
    closeStream,
  }
})();