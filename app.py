from flask import (
    Flask, jsonify, make_response, request,
    send_file, send_from_directory
)
import sys
import traceback
from datetime import datetime
from os import getenv
from pathlib import Path

from app_config import cfg
import tiles



# initialise Flask
################################################################
app = Flask(__name__)
app.secret_key = getenv("APP_SECRET_KEY")
if not app.secret_key:
    # silently fall back to a default (this isn't a banking app)
    app.secret_key = f"bfmui-{int(datetime.now().timestamp() * 1000)}"



# define routes
################################################################
@app.route("/")
def index():
    return send_from_directory(str(cfg.root / "static"),
                               "dev-index.html" if cfg.debug
                               else "index.html")


@app.route("/v")
def version():
    v = "0.0.0"
    try:
        with open(cfg.root / "v", "r", encoding="utf-8") as f:
            v = f.read()
    except: pass
    resp = make_response(v)
    resp.headers["Content-Type"] = "text-plain"
    resp.status_code = 200
    return resp


@app.route("/tiles/<int:z>/<int:x>/<int:y>.png")
def serve_tile(z: int, x: int, y: int):
    result = tiles.get_tile(z, x, y, request.args.get("save"))
    if not result.ok:
        return result.message, result.suggested_status

    if isinstance(result.data, bytes):
        resp = make_response(result.data)
        resp.headers.set("Content-Type", "image/png")
        return resp
    
    if isinstance(result.data, Path):
        return send_from_directory(str(cfg.root / tiles.TILE_DIR), result.data)


@app.route("/download-tiles", methods=["POST"])
def download_tiles():
    try:
        lon = request.args.get("lon", type=float)
        lat = request.args.get("lat", type=float)
        radius_km = request.args.get("radiusKm", type=float)
        min_zoom = request.args.get("minZoom", None, type=int)
        max_zoom = request.args.get("maxZoom", None, type=int)
    except:
        return jsonify({"error": "Bad arguments"}), 400

    result = tiles.bulk_download(lat, lon, radius_km, min_zoom, max_zoom)
    return jsonify(result.to_json()), 200


@app.route("/set-tiles-url-pattern", methods=["POST"])
def set_tiles_url_pattern():
    urlpat = request.args.get("urlPattern", "")
    if "{z}" not in urlpat or "{x}" not in urlpat or "{y}" not in urlpat:
        return jsonify({
            "error": "URL pattern must include {z}, {x}, {y} placeholders"
        }), 400
    with open(tiles.TILE_URL_SRC, "w", encoding="utf-8") as f:
        f.write(urlpat)
    cfg.urlpat = urlpat
    return jsonify({"ok": True}), 200


@app.route("/<path:path>")
def static_proxy(path: str):
    return send_from_directory(str(cfg.root / "static"), path)



# run the server
################################################################
if __name__ == "__main__":
    try:
        host = "127.0.0.1"
        port = int(getenv("PORT", "8000"))
    except:
        _ = input("Invalid config. Make sure you followed the instructions.")
        sys.exit(1)
    try:
        print(f"\nStarting BfMUI dev server at http://{host}:{port}\nQuit at any time with Ctrl+C.\n")
        app.run(host=host, port=port, debug=cfg.debug)
        sys.exit(0)
    except Exception as e:
        _ = input("Failed to run server!\n" + traceback.format_exc())
        sys.exit(1)

    r"""
    Note to self:
    - commit via CLI rather than VS Code if hook weirdness occurs.

    Testing:
    1. Start server
    Desktop:
      2. Simply open the URL in a browser.
    Mobile:
      2. Connect phone, enable USB debugging (settings > more/other/whatever > developer)
      3. cmd > adb reverse tcp:8081 tcp:8000
      4. Open app

    Deployment (other repo):
    1. Copy the required files to `/app/src/main/python`  of the mobile app project
    2. Build mobile app using `gradle assembleDebug` in its directory
    3. Copy the .apk found in `/app/build/outputs/apk/debug` to the phone & install
    NOTE: This is all handled by a post-commit hook which spits out the APK in this repo.

    The mobile app project is in `.../Documents/_js/BfMUI_new`
    """
