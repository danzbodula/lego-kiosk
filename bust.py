#!/usr/bin/env python3
"""
Stamp a cache-busting version onto index.html's CSS/JS references, and onto
ASSET_VERSION in js/config.js.

Safari 9 gives you no reload button in Home Screen (standalone) mode, and any
cache entry it created BEFORE the server started sending no-store headers will
keep being served from cache regardless of what the server says now. Changing
the URL is the only thing it cannot ignore.

    py bust.py            # stamp with the current timestamp
"""
import re
import sys
import time
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
version = sys.argv[1] if len(sys.argv) > 1 else str(int(time.time()))

html = (ROOT / "index.html").read_text()
html = re.sub(r'(href="css/[a-z]+\.css)(\?v=[^"]*)?"', r'\1?v=' + version + '"', html)
html = re.sub(r'(src="(?:js|data)/[a-z]+\.js)(\?v=[^"]*)?"', r'\1?v=' + version + '"', html)
(ROOT / "index.html").write_text(html)

cfg = (ROOT / "js" / "config.js").read_text()
if "ASSET_VERSION" in cfg:
    cfg = re.sub(r"ASSET_VERSION:\s*'[^']*'", "ASSET_VERSION: '" + version + "'", cfg)
    (ROOT / "js" / "config.js").write_text(cfg)

print("stamped version " + version)
