from flask import Flask, send_from_directory

app = Flask(__name__)
with open("key.txt", "r", encoding="utf-8") as f:
    app.secret_key = f.read()

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/<path:path>")
def static_proxy(path: str):
    return send_from_directory("static", path)

if __name__ == "__main__":
    app.run("127.0.0.1", 8000, debug=True)

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