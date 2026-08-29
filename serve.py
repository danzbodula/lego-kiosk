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
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
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
