from flask import (
    Flask, jsonify, make_response, request,
    send_file, send_from_directory, render_template
)
import sys
import traceback
from datetime import datetime
from os import getenv
from pathlib import Path
from traceback import format_exception

from app_config import cfg
import jobs
import tiles
import utils


# initialise Flask
################################################################
app = Flask(__name__, template_folder=cfg.root / "static")
app.secret_key = getenv("APP_SECRET_KEY")
if not app.secret_key:
    # silently fall back to a default (this isn't a banking app)
    app.secret_key = f"bfmui-{int(datetime.now().timestamp() * 1000)}"



# define routes
################################################################
@app.route("/")
def index():
    return render_template("dev-index.html" if cfg.debug else "index.html",
                           tiles_dir=cfg.urlpat)


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


@app.route("/download-tiles/start", methods=["POST"])
def download_tiles():
    try:
        min_lon, max_lon, min_lat, max_lat, min_zoom, max_zoom\
            = utils.validate_download_tiles_args(request)
    except:
        return jsonify({"error": "bad arguments"}), 400

    job_id = jobs.start_job(tiles.bulk_download,
                            min_lon, max_lon, min_lat, max_lat,
                            min_zoom, max_zoom)

    return jsonify({"ok": True, "jobId": job_id}), 202


@app.route("/jobs/running")
def get_jobs_running():
    return jsonify({"ok": True, "jobs": jobs.get_running_jobs()}), 200


@app.route("/jobs/status")
def get_job_status():
    if not request.args.get("jobId"):
        return jsonify({"error": "bad arguments"}), 400

    status, meta, data = jobs.get_job_status(request.args["jobId"])
    match status:
        case jobs.JobStatus.NOT_FOUND:
            return jsonify({"fail": True, "msg": "job not found",
                            "meta": meta, "result": None}), 404
        case jobs.JobStatus.RUNNING:
            return jsonify({"fail": False, "msg": "in progress",
                            "meta": meta, "result": None}), 200
        case jobs.JobStatus.ERROR:
            msg = (str(data) if not hasattr(data, "__traceback__")
                   else "".join(format_exception(data)))
            return jsonify({"fail": True, "msg": msg,
                            "meta": meta, "result": None}), 500
        case jobs.JobStatus.FINISHED:
            return jsonify({"fail": False, "msg": "done",
                            "meta": meta, "result": data}), 200
        case _:
            return jsonify({"fail": True, "msg": "?",
                            "meta": {}, "result": None}), 500


@app.route("/tiles-url-template/set", methods=["POST"])
def set_tiles_url_template():
    urlpat = request.args.get("urlTemplate", "")
    if "{z}" not in urlpat or "{x}" not in urlpat or "{y}" not in urlpat:
        return jsonify({
            "error": "URL template must include {z}, {x}, {y} placeholders!"
        }), 400
    with open(tiles.TILE_URL_SRC, "w", encoding="utf-8") as f:
        f.write(urlpat)
    cfg.urlpat = urlpat
    return jsonify({"ok": True}), 200


@app.route("/tiles-url-template/reset", methods=["POST"])
def unset_tiles_url_template():
    if tiles.TILE_URL_SRC.exists():
        tiles.TILE_URL_SRC.unlink()
    cfg.urlpat = tiles.TILE_URL_DEFAULT    
    return jsonify({"ok": True}), 200


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
        subdir, filename = result.data.parent, result.data.name
        return send_from_directory(str(cfg.root / tiles.TILE_DIR / subdir),
                                   filename)


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
        print(f"\nStarting BfMUI dev server at http://{host}:{port}\n"
              "Quit at any time with Ctrl+C.\n")
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
      2. Plug in, enable USB debugging (settings > more/other/whatever > dev)
      3. cmd > adb reverse tcp:8081 tcp:8000
      4. Open app

    Deployment (other repo):
    1. Copy the required files to `/app/src/main/python` of the other repo.
    2. Build mobile app using `gradle assembleDebug` in its directory.
    3. Copy the .apk from `/app/build/outputs/apk/debug` to the phone, install,
       confirm you accept the immense risks.

    NOTE: This is all handled by a post-commit hook which spits out the APK in
          this repo.

    The mobile app project is in `.../Documents/_js/BfMUI_new`
    """
