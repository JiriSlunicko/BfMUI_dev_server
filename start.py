"""Entry point for the Kotlin wrapper."""

import threading
from pathlib import Path

_server_thread = None

def start(port=8765, data_dir=None):
    """Called once from RcPlaneApplication.onCreate(). Idempotent so it's
    safe if the Application object is ever recreated."""
    global _server_thread
    if _server_thread and _server_thread.is_alive():
        return

    def run():
        from waitress import serve
        from app import app, cfg
        if data_dir:
            cfg.data_dir = Path(data_dir)
        serve(app, host="127.0.0.1", port=port, channel_timeout=900)

    _server_thread = threading.Thread(target=run, daemon=True)
    _server_thread.start()
