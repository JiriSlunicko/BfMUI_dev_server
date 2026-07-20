window.pages.mapPage = (function() {
  let _map = null;

  function activate() {
    if (!_map) {
      _loadMap();
    } else {
      _map.invalidateSize();
    }
  }


  function _loadMap() {
    _map = L.map("map-view", {
      zoomSnap: 2,
      zoomDelta: 2,
      minZoom: 12,
      maxZoom: 16,
      tapHold: true,
    }).setView([49.82, 18.23], 10);
    L.tileLayer("/tiles/{z}/{x}/{y}.png", {
      attribution: "&copy; OSM and/or others"
    }).addTo(_map);
  }


  // public API
  return {
    init: () => {},
    activate,
    deactivate: () => {},
  }
})();