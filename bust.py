#!/usr/bin/env python3
"""
Stamp a cache-busting version onto index.html's CSS/JS/manifest references,
and onto ASSET_VERSION in js/config.js.

Safari 9 gives you no reload button in Home Screen (standalone) mode, and any
cache entry it created BEFORE the server started sending no-store headers will
keep being served from cache regardless of what the server says now. Changing
the URL is the only thing it cannot ignore.

RUN THIS ON EVERY DEPLOY.  It is no longer only a Safari 9 workaround: since
serve.py started serving ?v=-stamped URLs as immutable (so the tablet stops
re-downloading 4.4 MB of sprite sheets on every load), the version string IS
the cache key.  Ship changed CSS or JS without re-stamping and every device
that already loaded the old copy will keep it, permanently.

    py bust.py            # stamp with the current timestamp
"""
import re
import sys
import time
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
version = sys.argv[1] if len(sys.argv) > 1 else str(int(time.time()))

html = (ROOT / "index.html").read_text()
# [a-z0-9-]+ rather than [a-z]+: a hyphenated or numbered filename is easy to
# add and silently would not have been stamped, which under immutable caching
# means it would never update on a device again.
html = re.sub(r'(href="css/[a-z0-9-]+\.css)(\?v=[^"]*)?"', r'\1?v=' + version + '"', html)
html = re.sub(r'(src="(?:js|data)/[a-z0-9-]+\.js)(\?v=[^"]*)?"', r'\1?v=' + version + '"', html)
html = re.sub(r'(href="manifest\.json)(\?v=[^"]*)?"', r'\1?v=' + version + '"', html)
(ROOT / "index.html").write_text(html)

# The manifest points at the app icon with its own ?v=; keep it in step.
man = ROOT / "manifest.json"
if man.exists():
    man.write_text(re.sub(r'\?v=\d+', "?v=" + version, man.read_text()))

cfg = (ROOT / "js" / "config.js").read_text()
if "ASSET_VERSION" in cfg:
    cfg = re.sub(r"ASSET_VERSION:\s*'[^']*'", "ASSET_VERSION: '" + version + "'", cfg)
    (ROOT / "js" / "config.js").write_text(cfg)

print("stamped version " + version)
