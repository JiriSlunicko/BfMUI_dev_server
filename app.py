from flask import Flask, send_from_directory
import sys
import traceback
from pathlib import Path

# initialise config
################################################################
root = None
config = {}

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
    _ = input("Missing key.txt. Make sure it exists in the same directory.")
    sys.exit(1)


# define routes
################################################################
@app.route("/")
def index():
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
        debug = int(config.get("debug", "1")) == 1
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
    Testing:
    1. Start server (requires key.txt with an arbitrary secret key)
    2. Connect phone, enable USB debugging (settings > more/other/whatever > developer)
    3. cmd > adb reverse tcp:8081 tcp:8000
    4. Open app

    Deployment:
    1. Copy the contents of /static to /app/src/main/assets of the mobile app project
    2. Build mobile app using .\gradlew.bat assembleDebug in its directory

    The mobile app project is in ...\Documents\_js\BfMUI
    """