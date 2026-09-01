#!/usr/bin/env python3
"""
DPT Kiosk dev server.

Identical to `python -m http.server` except every response carries no-store
cache headers.  Safari 9 caches HTML/CSS/JS aggressively and gives you no
reload button at all in Home Screen (standalone) mode, so during development
it will happily serve you a build from an hour ago and look like your sync
failed.  This makes that impossible.

    py serve.py            # port 8000, all interfaces
    py serve.py 8080       # different port

Binds 0.0.0.0 explicitly: the default picks IPv6 (`::`) on Windows, which the
iPad cannot reach over IPv4.
"""
import sys
import json
import os
import subprocess
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# --- camera -----------------------------------------------------------------
# GET /camera.jpg grabs one frame from the Pi camera for the staff panel's
# camera test.  A capture on a Pi Zero W takes roughly 2.5 seconds, so this is
# a slideshow rather than a video feed - enough to check aim and focus, which
# is all the test is for.
#
# The lock matters: the server is threaded, and two overlapping rpicam calls
# both fail because the sensor can only be opened once.  Serialising them means
# a second request simply waits its turn.
CAM_LOCK = threading.Lock()
CAM_FILE = "/tmp/dpt-cam.jpg"

# --- robot handoff ----------------------------------------------------------
# The kiosk POSTs hair_choice to /api/hair-choice the moment CONTINUE is
# tapped.  This holds the latest value and serves it back at /api/state, so the
# robot side can work either way round: have this push to the controller, or
# let the controller poll.  Which one is right depends on the RB5's command
# interface, which is not decided here.
#
# Nothing in this file talks to the robot yet.  send_to_robot() is the single
# place that has to change once the controller's protocol is known.
STATE_LOCK = threading.Lock()
STATE = {"hair_choice": None, "style": None, "at": None, "sent_to_robot": False}


def send_to_robot(hair_choice, style):
    """Hand hair_choice to the RB5.  Not implemented - see README.

    Returns True when the controller has accepted it.  Left returning False so
    /api/state reports honestly that nothing has been delivered, rather than a
    stub quietly reporting success."""
    return False


def capture():
    """Return JPEG bytes, or None with a reason string on failure."""
    for exe in ("rpicam-jpeg", "libcamera-jpeg", "rpicam-still", "libcamera-still"):
        try:
            r = subprocess.run(
                [exe, "-o", CAM_FILE, "-t", "250", "-n",
                 "--width", "640", "--height", "480"],
                capture_output=True, timeout=20)
        except FileNotFoundError:
            continue
        except subprocess.TimeoutExpired:
            return None, "%s timed out" % exe
        if r.returncode == 0 and os.path.exists(CAM_FILE):
            with open(CAM_FILE, "rb") as fh:
                return fh.read(), None
        return None, (r.stderr or b"").decode("utf-8", "replace")[-300:] or "capture failed"
    return None, "no rpicam/libcamera tool found on this Pi"


class NoCacheHandler(SimpleHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/hair-choice":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            choice = int(data["hair_choice"])
        except Exception as exc:
            self._json(400, {"ok": False, "error": str(exc)})
            return
        if not 0 <= choice <= 7:
            self._json(400, {"ok": False, "error": "hair_choice must be 0-7"})
            return
        with STATE_LOCK:
            STATE["hair_choice"] = choice
            STATE["style"] = data.get("style")
            STATE["at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            STATE["sent_to_robot"] = send_to_robot(choice, STATE["style"])
            snap = dict(STATE)
        print("  hair_choice = %d (%s)" % (choice, snap["style"]))
        self._json(200, {"ok": True, "state": snap})

    def do_GET(self):
        if self.path.split("?")[0] == "/api/state":
            with STATE_LOCK:
                self._json(200, dict(STATE))
            return
        if self.path.split("?")[0] == "/camera.jpg":
            with CAM_LOCK:
                data, err = capture()
            if data:
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                msg = ("camera error: " + (err or "unknown")).encode("utf-8", "replace")
                self.send_response(503)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            return
        SimpleHTTPRequestHandler.do_GET(self)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        SimpleHTTPRequestHandler.end_headers(self)

    def send_response(self, *args, **kwargs):
        # drop the Last-Modified based 304s that Safari would otherwise honour
        SimpleHTTPRequestHandler.send_response(self, *args, **kwargs)

    def send_head(self):
        # never answer a conditional request with "not modified"
        self.headers.replace_header("If-Modified-Since", "") if "If-Modified-Since" in self.headers else None
        if "If-None-Match" in self.headers:
            del self.headers["If-None-Match"]
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        return SimpleHTTPRequestHandler.send_head(self)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    srv = ThreadingHTTPServer(("0.0.0.0", port), NoCacheHandler)
    print("")
    print("  DPT Kiosk server  -  no-cache, IPv4")
    print("  serving this folder on port %d" % port)
    print("")
    print("  On the iPad:   http://192.168.137.1:%d" % port)
    print("")
    print("  Leave this window OPEN. Ctrl+C to stop.")
    print("")
    srv.serve_forever()
