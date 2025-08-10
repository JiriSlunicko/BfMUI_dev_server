Bloodfly Mobile User Interface (BfMUI)
======================================

BfMUI is a GUI for the Bloodfly Control server, which needs to be running on the same LAN
(same machine or accessible on the network over HTTP). Together they allow the user to access
settings on a compatible RC plane and modify them as needed.

This app currently supports Windows PCs and Android devices.

Getting started - Windows PC
----------------------------
1. Download the repo or the desktop artifact (under Actions on GitHub).
2. Create `key.txt` with an arbitrary secret key in the same directory as `app.py` or the executable. (optional)
3. Launch `app.py` or the executable.
4. Open the URL that shows up in a browser.
If starting the server fails, try changing the port in `config.txt`.

Getting started - Android
-------------------------
1. Download the repo or the android artifact (under Actions on GitHub).
2. Copy `bfmui.apk` to your phone.
3. Install the app, confirming you're OK with installing from unknown sources and all that.
4. Open the app.


\
Detailed info
=============
The frontend is all raw static files in order to minimise the need for platform-specific setup and code.

Everything meaningful is delegated to Bloodfly Control server, separate from this repo. The app will
automatically attempt to connect to it using default settings upon launch.

Android app
-----------
Should run on any reasonably up-to-date Android device. All the app does is create a WebView and serve
static files to it using NanoHTTPD in Java.

PC prod mode
------------
Default for the EXE version (`debug=0` in `config.txt`).

Serves a single JS bundle created by `bundle.py`.

If you want to run in prod mode via `app.py` for any reason, you'll need to run `bundle.py` once
(the bundled JS isn't part of the repo) and change the `debug` variable at the start of `app.py`.

PC dev mode
-----------
Launched either via `app.py` (runs in dev mode by default), or via the EXE if `config.txt` sets `debug=1`.

Serves a large number of individual pretty-printed & documented JS files for easier debugging.
