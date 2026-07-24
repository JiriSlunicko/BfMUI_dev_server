import math
import socket
from time import time

from flask import Request

MIN_LAT = -85.05112878
MAX_LAT =  85.05112878

MIN_ZOOM = 8
MAX_ZOOM = 16

BATCH_DOWNLOAD_HARD_LIMIT = 5000

_is_online_cache = {
    "result": None,
    "last_check": -999
}


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))

def _clamp_lat(lat: float) -> float:
    return _clamp(lat, MIN_LAT, MAX_LAT)


def is_online(host: str = "1.1.1.1",
              port: int = 53,
              timeout: float = 2.0,
              recheck_after: float = 5.0) -> bool:
    """A quick test of whether we have access to the internet.
    
    Default ping target = CloudFlare's public DNS resolver.
    """
    t = time()
    if t - _is_online_cache["last_check"] > recheck_after:
        try:
            with socket.create_connection((host, port), timeout=timeout):
                _is_online_cache["result"] = True
        except OSError:
            _is_online_cache["result"] = False
        _is_online_cache["last_check"] = t

    return _is_online_cache["result"]


def validate_download_tiles_args(request: Request
                                 ) -> tuple[float, float, float, int|None, int|None]:
    lon = request.args.get("lon", type=float)
    lat = request.args.get("lat", type=float)
    radius_km = request.args.get("radiusKm", type=float)
    min_zoom = request.args.get("minZoom", None, type=int)
    max_zoom = request.args.get("maxZoom", None, type=int)
    if lon is None or lat is None or radius_km is None:
        raise ValueError()
    return lon, lat, radius_km, min_zoom, max_zoom


def lon_to_tile_x(lon: float, zoom: int) -> int:
    n = 1 << zoom
    x = math.floor((lon + 180) / 360.0 * n)
    return _clamp(x, 0, n-1)


def lat_to_tile_y(lat: float, zoom: int) -> int:
    n = 1 << zoom
    lat_rad = math.radians(lat)
    y = ((
        1.0
        - math.log(
            math.tan(lat_rad)
            + 1.0 / math.cos(lat_rad)
        ) / math.pi
    ) / 2.0 * n)
    return _clamp(math.floor(y), 0, n-1)


def tile_range_for_radius(lat: float, lon: float,
                          radius_km: float,
                          zoom: int):
    d_lat = radius_km / 111.32
    d_lon = radius_km / (111.32 * math.cos(math.radians(lat)))

    min_lat = _clamp_lat(lat - d_lat)
    max_lat = _clamp_lat(lat + d_lat)
    min_lon = lon - d_lon
    max_lon = lon + d_lon

    min_x = lon_to_tile_x(min_lon, zoom)
    max_x = lon_to_tile_x(max_lon, zoom)
    # Y axis is flipped
    min_y = lat_to_tile_y(max_lat, zoom)
    max_y = lat_to_tile_y(min_lat, zoom)

    return min_x, max_x, min_y, max_y


def even_zooms_in_range(min_zoom: int, max_zoom: int) -> list[int]:
    start = min_zoom if min_zoom % 2 == 0 else min_zoom + 1
    return list(range(start, max_zoom + 1, 2))


def count_tiles(lat: float, lon: float,
                radius_km: float,
                min_zoom: int | None, max_zoom: int | None) -> int:
    resolved_min_z = MIN_ZOOM if min_zoom is None else min_zoom
    resolved_max_z = MAX_ZOOM if max_zoom is None else max_zoom
    total = 0
    for z in even_zooms_in_range(resolved_min_z, resolved_max_z):
        min_x, max_x, min_y, max_y = tile_range_for_radius(lat, lon,
                                                           radius_km, z)
        total += (max_x - min_x + 1) * (max_y - min_y + 1)
    return total
