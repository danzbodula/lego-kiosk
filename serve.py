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
import socket
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
STATE = {"hair_choice": None, "style": None, "at": None,
         "sent_to_robot": False, "robot_reply": None}

# Rainbow Robotics command channel.  Verified against Rainbow's own client
# library (github.com/RainbowRobotics/rbpodo):
#
#   common.hpp   static inline const unsigned int kCommandPort = 5000;
#   socket.cpp   msg += "\n";  ::send(sock_, msg.data(), msg.size(), 0);
#   cobot.hpp    eval() sends the script string straight down that socket
#
# So the wire format is: plain TCP to 5000, ASCII script, newline terminated.
# Assigning a global is just the script statement "_GLOBAL_0 = 3".
#
# The controller answers on 192.168.1.100 - both 5000 and 5001 open, and a
# print() statement sent to 5000 came back "The command was executed", so raw
# script is accepted, not just the task-level commands the public docs list.
#
# It is plugged into a LAN port on the travel router and keeps its own static
# 192.168.1.100.  The router bridges its LAN ports and its wifi into ONE layer-2
# segment, so the Pi simply carries a second address - 192.168.1.250 alongside
# 192.168.8.50, both on wlan0 - and the two talk directly.  No routing, no
# change to the controller, and no USB ethernet adapter: hot-plugging a gigabit
# dongle browned out the Pi Zero W and reset it, which is the whole reason the
# cable moved to the router.
ROBOT_ENABLED = os.environ.get("DPT_ROBOT_ENABLED", "0") == "1"
ROBOT_HOST = os.environ.get("DPT_ROBOT_HOST", "192.168.1.100")
ROBOT_PORT = int(os.environ.get("DPT_ROBOT_PORT", "5000"))
ROBOT_GLOBAL = os.environ.get("DPT_ROBOT_GLOBAL", "_GLOBAL_0")
# Source address to send from - the alias the booth wifi profile carries.
# Binding to it does two jobs.  It pins the traffic to the right interface, and
# it fails closed: if the Pi has fallen back to the house wifi, that address is
# not configured, the bind fails, and nothing is sent.  That matters because the
# house network is ALSO 192.168.1.x, so without this an unreachable robot could
# mean writing _GLOBAL_0 into whatever else happens to answer on .100 there.
ROBOT_SRC = os.environ.get("DPT_ROBOT_SRC", "192.168.1.250")


def robot_reachable():
    """One TCP connect to the command port.  Cheap, and it is the only question
    that matters: can we open 5000 right now."""
    if not ROBOT_ENABLED:
        return False, "disabled"
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2.0)
        if ROBOT_SRC:
            sock.bind((ROBOT_SRC, 0))
        sock.connect((ROBOT_HOST, ROBOT_PORT))
        sock.close()
        return True, "%s:%d reachable from %s" % (ROBOT_HOST, ROBOT_PORT, ROBOT_SRC)
    except Exception as exc:
        return False, "%s:%d unreachable (%s)" % (ROBOT_HOST, ROBOT_PORT, exc)


def send_to_robot(hair_choice, style):
    """Set the controller's global to hair_choice.  Returns (ok, reply).

    A fresh connection per build rather than a held socket: it is one command
    every twenty seconds, and a connection that reconnects on its own is the
    right trade at a trade show.  Every failure is swallowed - the kiosk must
    keep serving visitors whatever the arm is doing."""
    if not ROBOT_ENABLED:
        return False, "disabled (set DPT_ROBOT_ENABLED=1)"
    script = "%s = %d" % (ROBOT_GLOBAL, hair_choice)
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2.0)
        if ROBOT_SRC:
            sock.bind((ROBOT_SRC, 0))       # fails unless we are on the booth net
        sock.connect((ROBOT_HOST, ROBOT_PORT))
    except Exception as exc:
        return False, "connect failed: %s" % exc
    try:
        sock.sendall((script + "\n").encode("ascii"))
        sock.settimeout(1.5)
        try:
            reply = sock.recv(512).decode("utf-8", "replace").strip()
        except Exception:
            reply = ""            # some firmware answers nothing on success
    except Exception as exc:
        return False, "send failed: %s" % exc
    finally:
        try:
            sock.close()
        except Exception:
            pass
    ok = "not allowed" not in reply.lower() and "error" not in reply.lower()
    return ok, (reply or "(no reply)")


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


# --- caching policy ---------------------------------------------------------
# Every asset URL the app builds carries ?v=<ASSET_VERSION> (see js/assets.js),
# and bust.py bumps ASSET_VERSION whenever the art is rebuilt.  That makes a
# versioned URL immutable by construction: its bytes cannot change without the
# URL changing too.
#
# The server used to send no-store on *everything*, which was the right call
# against Safari 9 in standalone mode - it has no reload button, so a stale
# cache entry was unrecoverable without wiping the app.  The cost of that
# blanket rule is that the tablet re-downloads all 4.4 MB of sprite sheets on
# every single load, from a Pi Zero W, over wifi.  That is the reason the
# turntable stalls: not the compositor, just bytes still in flight.
#
# So the rule is now narrower and keeps the same guarantee where it mattered:
#   versioned URL  -> cache forever; the URL is the version
#   everything else (HTML, the API, any unversioned request) -> no-store, and
#                     conditional requests are still stripped, exactly as before
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
NO_STORE_CACHE = "no-store, no-cache, must-revalidate, max-age=0"


class NoCacheHandler(SimpleHTTPRequestHandler):
    # A cold load pulls ~40 files.  On HTTP/1.0 (the stdlib default) that is
    # ~40 separate TCP connections, and over a wifi repeater the per-connection
    # handshake latency dominates the transfer.  HTTP/1.1 keeps the connection
    # open between requests.  It requires an accurate Content-Length on every
    # response or the client hangs waiting for a body that never ends; every
    # path in this handler sets one, and so does the base class.
    protocol_version = "HTTP/1.1"

    # Set per-request by send_head(); see _versioned() below.  Handler
    # instances are reused across keep-alive requests, so every entry point
    # resets this rather than trusting the previous request's value.
    _immutable = False

    def _versioned(self):
        """True if this request is for a ?v=-stamped static asset."""
        parts = self.path.split("?", 1)
        if len(parts) != 2:
            return False
        path, query = parts
        # HTML is never versioned by the app and must stay fresh, or a deploy
        # would not be picked up until the cache expired - i.e. never.
        if path.endswith((".html", "/")):
            return False
        return query == "v" or query.startswith("v=") or "&v=" in query or "?v=" in query

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self._immutable = False      # API replies are never cacheable
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
            ok, reply = send_to_robot(choice, STATE["style"])
            STATE["sent_to_robot"] = ok
            STATE["robot_reply"] = reply
            snap = dict(STATE)
        print("  hair_choice = %d (%s)  robot: %s" %
              (choice, snap["style"], snap["robot_reply"]))
        self._json(200, {"ok": True, "state": snap})

    def do_GET(self):
        # Reset before the API branches below, which never reach send_head().
        # Handler instances are reused across keep-alive requests.
        self._immutable = False
        if self.path.split("?")[0] == "/api/robot":
            ok, msg = robot_reachable()
            self._json(200, {"enabled": ROBOT_ENABLED, "host": ROBOT_HOST,
                             "port": ROBOT_PORT, "variable": ROBOT_GLOBAL,
                             "reachable": ok, "detail": msg})
            return
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
        if self._immutable:
            self.send_header("Cache-Control", IMMUTABLE_CACHE)
        else:
            self.send_header("Cache-Control", NO_STORE_CACHE)
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        SimpleHTTPRequestHandler.end_headers(self)

    def send_head(self):
        self._immutable = self._versioned()
        if not self._immutable:
            # Unversioned: never answer a conditional request with "not
            # modified", so an unrecoverable stale entry stays impossible.
            # Versioned requests keep theirs - a 304 there is the whole point.
            for header in ("If-None-Match", "If-Modified-Since"):
                if header in self.headers:
                    del self.headers[header]
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
    # Say at startup whether the arm is there.  It lands in the service journal,
    # so `journalctl -u dpt-kiosk` answers "is the robot link up?" without
    # anyone having to reason about interfaces.
    _ok, _msg = robot_reachable()
    print("  robot: %s  (%s = %s)" % (_msg, ROBOT_GLOBAL, "live" if _ok else "not sending"))
    print("")
    srv.serve_forever()
