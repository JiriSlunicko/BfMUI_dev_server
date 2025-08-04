/** Interface for handling a server-side event stream. */

window.events = (function () {
  /** Connect to the backend server's event dispatcher.
   * @param {object} globalServer backend - will be updated
   */
  function openStream(globalServer) {
    closeStream(globalServer);
    globalServer.eventStream = new EventSource(globalServer.baseurl + "/events/");
    globalServer.eventStream.onmessage = (msg) => {
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
   * @param {object} globalServer backend - will be updated
   * @param {array<string>} eventArray list of event names
   */
  function _processEvents(globalServer, eventArray) {
    for (const backendEvent of eventArray) {
      switch (backendEvent) {
        case "AvailableSerialPortsChanged":
          pages.settings.getFreshArduinoPortsAndSettings(globalServer);
          break;
      }
    }
  }


  /** Close an open event stream.
   * @param {object} globalServer backend - will be updated
   */
  function closeStream(globalServer) {
    if (globalServer.eventStream) {
      globalServer.eventStream?.close();
      globalServer.eventStream = null;
    }
  }


  // public API
  return {
    openStream,
    closeStream,
  }
})();