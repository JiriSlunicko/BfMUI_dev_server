/** Interface for handling a server-side event stream. */

window.events = (function () {
  let _eventStream = null;

  
  /** Connect to the backend server's event dispatcher.
   * @param {object} globalServer backend - may be modified by some event handlers
   */
  function openStream(globalServer) {
    closeStream();
    _eventStream = new EventSource(globalServer.baseurl + globalServer.endpoints.events);
    _eventStream.onmessage = (msg) => {
      let asJson = null;
      try {
        asJson = JSON.parse(msg.data);
      } catch (err) {
        console.error("Event source received a message that's not valid JSON.", msg, err);
        return;
      }

      if (asJson.Events && asJson.Events.length) {
        _processEvents(globalServer, asJson.Events);
      }
    }
  }


  /** Handle any events that came with a message from the backend.
   * @param {object} globalServer backend - may be modified
   * @param {array<string>} eventArray list of event names
   */
  function _processEvents(globalServer, eventArray) {
    for (const backendEvent of eventArray) {
      switch (backendEvent) {
        case "AvailableSerialPortsChanged":
          settingsManager.load(["arduino"]);
          break;
      }
    }
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