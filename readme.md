# Bloodfly Mobile User Interface (BfMUI)

BfMUI is a GUI for the Bloodfly Control server, which needs to be running on the same LAN
(same machine or accessible on the network over HTTP). Together they allow the user to access
settings on a compatible RC plane and modify them as needed.

This app currently supports Windows PCs and Android devices...

## Getting started - Windows PC
1. Download the repo or the desktop artifact (under Actions on GitHub).
2. Launch `app.py` or the executable.
3. Open the URL that shows up in a browser.

If starting the server fails, try changing the port in `.env`. That file does not exist in the
repo but the app copies it from `.env.example` if it doesn't exist upon launch. No manual edits
should be necessary under normal circumstances.

## Getting started - Android
1. Download the repo or the android artifact (under Actions on GitHub).
2. Copy `bfmui.apk` to your phone.
3. Install the app, confirming you're OK with installing from unknown sources and all that.
4. Open the app.

## Detailed info
Most business logic is delegated to Bloodfly Control server, separate from this repo. The app will
automatically attempt to connect to it using default settings upon launch.

The only agenda BfMUI's backend handles itself is map tiles, which may be accessed either online or
bulk-downloaded to the device.

### Android app
Should run on any reasonably up-to-date Android device. The Flask server gets a thin chaquopy
wrapper which launches a WebView and serves the app to it.

### PC version
Runs either in dev mode or prod mode depending on how the `DEBUG` flag is set in `.env`.

Dev mode (`DEBUG=1`) serves individual pretty-printed JS files for easy debugging.

Prod mode uses a single minified JS bundle. Note that this is NOT included with the repo, so if
you want to run the bare Python version in prod mode you will need to run `bundle.py` before
launching the app itself.
