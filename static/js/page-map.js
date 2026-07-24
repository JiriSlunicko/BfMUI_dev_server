window.pages.mapPage = (function() {
  let _map = null;
  const _maxRadiusKm = 10;
  const _approxTileFileSizeMB = 0.04;
  const _minZoom = 8;
  const _maxZoom = 16;
  const _minLat = -85.05112878;
  const _maxLat =  85.05112878;
  let _previewRect = null;

  function activate() {
    if (!_map) {
      _loadMap();
    } else {
      _map.invalidateSize();
    }
  }


  function _loadMap() {
    // create map
    _map = L.map("map-view", {
      zoomSnap: 2,
      zoomDelta: 2,
      minZoom: _minZoom,
      maxZoom: _maxZoom,
      tapHold: true,
    }).setView(
      [49.82, 18.23], // Ostrava
      12 // medium zoom
    );
    L.tileLayer("/tiles/{z}/{x}/{y}.png", {
      attribution: "&copy; OSM and/or others"
    }).addTo(_map);

    // my location
    if (navigator.geolocation) {
      L.control.locate({
        position: "topright",
        flyTo: true,
        keepCurrentZoomLevel: false,
        drawCircle: true,
        showPopup: true,
        locateOptions: { enableHighAccuracy: true },
        onLocationError: (err) => {
          switch (err.code) {
            case 1: // permission denied by user
              return;
            case 2: // geolocation fail
            case 3: // geolocation timeout
            default:
              ui.makePopup(
                "confirm",
                `Failed to locate:\n\n${err.toString()}`,
                "Geolocation error"
              );
          }
        }
      }).addTo(_map);
    }

    // prompt batch download
    _map.on("contextmenu",  (e) => {
      _openBatchDownloadDialog(e);
    });
  }


  async function _openBatchDownloadDialog(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const latStr = Math.abs(lat).toFixed(4) + (lat > 0 ? "°N" : "°S");
    const lngStr = Math.abs(lng).toFixed(4) + (lng > 0 ? "°E" : "°W");

    // get radius from user
    let radius = await ui.makePopup(
      "prompt",
      `<b>Enter a radius of up to ${_maxRadiusKm} km</b> around (${latStr}, `
      + `${lngStr}) to download map tiles for offline use (1&nbsp;km radius = `
      + `2&times;2 km area).\n\nThis may take several minutes. Please respect `
      + `the tile server's ToS.`,
      "Download map?"
    );
    if (radius === null) { return; }
    radius = parseFloat(radius.toString().replace(",", "."));
    if (_.isNaN(radius) || !radius || radius <= 0 || radius > _maxRadiusKm) {
      ui.makeToast("error", "Please enter a number (0–" + _maxRadiusKm + ").");
      return;
    }

    // get & visualise estimate
    const est = _estimateDownloadParameters(lat, lng, radius);
    if (_previewRect !== null) _map.removeLayer(_previewRect);
    _previewRect = L.rectangle(est.bounds, {
      stroke: false, fill: true, fillOpacity: 0.3, fillColor: "red"
    }).addTo(_map);

    // confirm scope
    const consent = await ui.makePopup(
      "confirm",
      `Download ${est.total} tiles?\n\nThat amounts to <b>roughly `
      + `${Math.ceil(est.total * _approxTileFileSizeMB)} MB</b>, depending on `
      + `your configured tile provider. Wi-fi is recommended.`,
      `Confirm download`
    );

    // remove preview rectangle
    if (_previewRect !== null) _map.removeLayer(_previewRect);
    _previewRect = null;

    console.log(est);

    // TODO: POST job, poll result

  }


  function _batchDownload() {}


  const _toRad = (deg) => deg * (Math.PI / 180);


  function _lng_to_x(lng, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lng + 180) / 360 * n);
    return _.clamp(x, 0, n-1);
  }


  function _lat_to_y(lat, z) {
    const n = Math.pow(2, z);
    const latRad = _toRad(lat);
    const y = ((
      1.0
      - Math.log(
        Math.tan(latRad)
        + 1.0 / Math.cos(latRad)
      ) / Math.PI
    ) / 2.0 * n);
    return _.clamp(Math.floor(y), 0, n-1);
  }


  function _get_rect_around(lat, lng, rad) {
    const dLat = rad / 111.32;
    const dLng = rad / (111.32 * Math.cos(_toRad(lat)));
    return {
      minLat: _.clamp(lat - dLat, _minLat, _maxLat),
      maxLat: _.clamp(lat + dLat, _minLat, _maxLat),
      minLng: lng - dLng,
      maxLng: lng + dLng,
    };
  }


  function _atZoom(rect, zoom) {
    const minX = _lng_to_x(rect.minLng, zoom);
    const maxX = _lng_to_x(rect.maxLng, zoom);
    // Y axis is flipped
    const minY = _lat_to_y(rect.maxLat, zoom);
    const maxY = _lat_to_y(rect.minLat, zoom);

    return { minX, maxX, minY, maxY };
  }


  function _estimateDownloadParameters(lat, lng, radiusKm) {
    const rect = _get_rect_around(lat, lng, radiusKm);

    // the rectangle as map-friendly coords
    const bounds = L.latLngBounds([rect.minLat, rect.minLng],
                                  [rect.maxLat, rect.maxLng]);

    // count tiles
    let total = 0;
    for (let z = _minZoom; z <= _maxZoom; z++) {
      if (z % 2 !== 0) continue; // skip odd zooms

      const boundsXY = _atZoom(rect, z);
      total += (boundsXY.maxX - boundsXY.minX + 1)
             * (boundsXY.maxY - boundsXY.minY + 1);
    }

    return {total, rect, bounds};
  }

  // public API
  return {
    init: () => {},
    activate,
    deactivate: () => {},
  }
})();