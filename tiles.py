import urllib.request
from dataclasses import asdict, dataclass
from os import getenv
from pathlib import Path
from time import sleep, perf_counter

from app_config import cfg
import utils

TILE_URL_DEFAULT = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
TILE_URL_SRC = cfg.data_dir / "tiles_url"
TILE_DIR = cfg.data_dir / "tiles"
USER_AGENT = "BfMUI"
DOWNLOAD_THROTTLE_SECONDS = 0.1
_MIN_ZOOM = 12
_MAX_ZOOM = 16

try:
    with open(TILE_URL_SRC, "r", encoding="utf-8") as f:
        cfg.urlpat = f.read().strip()
except IOError:
    cfg.urlpat = TILE_URL_DEFAULT


# edit this to change tile providers.
def _get_remote_url(z: int, x: int, y: int) -> str:
    return cfg.urlpat.format(x=x, y=y, z=z)


@dataclass
class GetTileResult:
    ok: bool
    message: str
    suggested_status: int
    data: bytes | Path | None = None


@dataclass
class BulkDownloadResult:
    downloaded: int
    skipped: int
    failed: int
    duration: float

    def to_json(self) -> dict:
        return asdict(self)


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


def bulk_download(lat: float, lon: float, radius_km: float,
                  min_zoom: int | None = None, max_zoom: int | None = None
                  ) -> BulkDownloadResult:
    downloaded = skipped = failed = 0
    start = perf_counter()
    for z in utils.even_zooms_in_range(min_zoom or _MIN_ZOOM,
                                       max_zoom or _MAX_ZOOM):
        min_x, max_x, min_y, max_y = utils.tile_range_for_radius(lat, lon,
                                                                 radius_km, z)
        for x in range(min_x, max_x+1):
            for y in range(min_y, max_y+1):
                f = _abs(_get_tile_path_relative(z, x, y))
                if f.exists():
                    skipped += 1
                    continue

                if downloaded + failed > 0:
                    sleep(DOWNLOAD_THROTTLE_SECONDS)
                
                try:
                    data = _fetch_remote(z, x, y)
                    _store_file(f, data)
                    downloaded += 1
                except OSError as e:
                    failed += 1
                    print(f"Download failed for {z}/{x}/{y}: {e}")
    dur = round(perf_counter() - start, 2)

    return BulkDownloadResult(downloaded, skipped, failed, dur)
