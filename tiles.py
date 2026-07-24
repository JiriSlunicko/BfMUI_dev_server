import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from time import sleep, perf_counter

from app_config import cfg
import jobs
import utils

TILE_URL_DEFAULT = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
TILE_URL_SRC = cfg.data_dir / "tiles_url"
TILE_DIR = cfg.data_dir / "tiles"
USER_AGENT = "BfMUI"
DOWNLOAD_THROTTLE_SECONDS = 0.1

try:
    with open(TILE_URL_SRC, "r", encoding="utf-8") as f:
        cfg.urlpat = f.read().strip()
except IOError:
    cfg.urlpat = TILE_URL_DEFAULT


def _get_remote_url(z: int, x: int, y: int) -> str:
    return cfg.urlpat.replace("{z}", str(z))\
                     .replace("{x}", str(x))\
                     .replace("{y}", str(y))\
                     .replace("{s}", "a") # hardcoded subdomain if the URL
                                          # template expects one


@dataclass
class GetTileResult:
    ok: bool
    message: str
    suggested_status: int
    data: bytes | Path | None = None


def _get_tile_path_relative(z: int, x: int, y: int) -> Path:
    return Path(str(z)) / str(x) / f"{y}.png"

def _abs(rel: Path) -> Path:
    return TILE_DIR / rel

def _fetch_remote(z: int, x: int, y: int) -> bytes:
    url = _get_remote_url(z, x, y)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=5) as resp:
        if resp.status != 200:
            raise IOError(f"HTTP {resp.status} for {url}")
        return resp.read()

def _store_file(abs_path: Path, data: bytes) -> None:
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(data)


def get_tile(z: int, x: int, y: int, save: bool) -> GetTileResult:
    # validate zoom
    if z % 2 != 0:
        return GetTileResult(False, "odd zoom levels are disabled", 400)

    fpath = _get_tile_path_relative(z, x, y)
    # exists locally -> serve directly
    if (_abs(fpath)).exists():
        return GetTileResult(True, "served from cache", 200, fpath)

    # we're not online -> 404
    if not utils.is_online():
        return GetTileResult(False, "tile unavailable offline", 404)

    # fetch from source
    try:
        bytes = _fetch_remote(z, x, y)
    except IOError as e:
        return GetTileResult(False, f"upstream fetch failed: {e}", 502)

    # save if requested
    if save:
        try:
            _store_file(_abs(fpath), bytes)
            return GetTileResult(True, "ok & saved", 200, bytes)
        except Exception as e:
            # this is not actually fatal
            print(f"Failed to save remote tile as {TILE_DIR / fpath}")
    
    return GetTileResult(True, "ok & not saved", 200, bytes)


def bulk_download(min_lon: float, max_lon: float, min_lat: float, max_lat: float,
                  min_zoom: int | None = None, max_zoom: int | None = None,
                  job_meta: jobs.JobMeta | None = None) -> dict[str, int]:
    status = {
        "total": utils.count_tiles(min_lon, max_lon, min_lat, max_lat,
                                   min_zoom, max_zoom),
        "downloaded": 0,
        "skipped": 0,
        "failed": 0,
        "timeElapsed": None
    }

    def _update_meta(incr_key: str | None = None) -> None:
        if incr_key:
            status[incr_key] += 1
        if job_meta is not None:
            job_meta.update(**status)

    _update_meta()

    if status["total"] > utils.BATCH_DOWNLOAD_HARD_LIMIT:
        raise ValueError("Requested too many tiles (hard limit: "
                         f"{utils.BATCH_DOWNLOAD_HARD_LIMIT})")

    first_request_made = False
    resolved_min_z = utils.MIN_ZOOM if min_zoom is None else min_zoom
    resolved_max_z = utils.MAX_ZOOM if max_zoom is None else max_zoom
    start = perf_counter()
    for z in utils.even_zooms_in_range(resolved_min_z, resolved_max_z):
        min_x, max_x, min_y, max_y\
            = utils.mercator_to_xy_bounds(min_lon, max_lon, min_lat, max_lat, z)
        for x in range(min_x, max_x+1):
            for y in range(min_y, max_y+1):
                f = _abs(_get_tile_path_relative(z, x, y))
                if f.exists():
                    _update_meta("skipped")
                    continue

                if first_request_made:
                    sleep(DOWNLOAD_THROTTLE_SECONDS)

                first_request_made = True

                try:
                    data = _fetch_remote(z, x, y)
                    _store_file(f, data)
                    _update_meta("downloaded")
                except OSError as e:
                    _update_meta("failed")
                    print(f"Download failed for {z}/{x}/{y}: {e}")

    status["timeElapsed"] = int(round(perf_counter() - start, 0))

    return status
