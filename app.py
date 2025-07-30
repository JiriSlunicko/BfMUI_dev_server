from flask import Flask, send_from_directory
import sys
import traceback
from pathlib import Path
from datetime import datetime

# initialise config
################################################################
root = None
config = {}
debug = True

# this is an .EXE
if getattr(sys, "frozen", False):
    root = Path(sys.executable).parent
    with open("config.txt", "r", encoding="utf-8") as f:
        for line in f.readlines():
            try:
                if line.startswith("#") or not line.strip(): continue
                k, v = (x.strip() for x in line.split("="))
                config[k] = v
            except:
                _ = input("Failed to read config.txt.\nEnsure it's 'key=value' pairs, one per line.")
                sys.exit(1)

# this is a .PY
else:
    root = Path(__file__).parent.resolve()


# initialise Flask
################################################################
app = Flask(__name__)
try:
    with open("key.txt", "r", encoding="utf-8") as f:
        app.secret_key = f.read()
except:
    print("WARNING: Missing or corrupted key.txt, falling back to default placeholder.\n"
        + "(Bad idea in real world situations, but this isn't one.)")
    app.secret_key = f"bfmui-{int(datetime.now().timestamp() * 1000)}"


# define routes
################################################################
@app.route("/")
def index():
    if debug is True:
        return send_from_directory(str(root / "static"), "dev-index.html")
    else:
        return send_from_directory(str(root / "static"), "index.html")

@app.route("/<path:path>")
def static_proxy(path: str):
    return send_from_directory(str(root / "static"), path)


# run the server
################################################################
if __name__ == "__main__":
    try:
        host = "127.0.0.1"
        port = int(config.get("port", "8000"))
        if config.get("debug") is not None:
            debug = int(config["debug"]) == 1
    except:
        _ = input("Invalid config. Make sure you followed the instructions.")
        sys.exit(1)
    try:
        print(f"\nStarting BfMUI dev server at http://{host}:{port}\nQuit at any time with Ctrl+C.\n")
        app.run(host=host, port=port, debug=debug)
        sys.exit(0)
    except Exception as e:
        _ = input("Failed to run server.\n" + traceback.format_exc())
        sys.exit(1)

    r"""
    Important:
    - commit via CLI rather than VS Code to avoid hook weirdness.

    Testing:
    1. Start server
    Desktop:
      2. Simply open the URL in a browser.
    Mobile:
      2. Connect phone, enable USB debugging (settings > more/other/whatever > developer)
      3. cmd > adb reverse tcp:8081 tcp:8000
      4. Open app

    Deployment (other repo):
    1. Copy the contents of /static to /app/src/main/assets of the mobile app project
    2. Build mobile app using .\gradlew.bat assembleDebug in its directory
    3. Copy the .apk found in /app/build/outputs/apk/debug to the phone & install
    NOTE: This is all handled by a post-commit hook which spits out the APK in this repo.

    The mobile app project is in ...\Documents\_js\BfMUI
    """