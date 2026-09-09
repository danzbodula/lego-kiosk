/* ---------------------------------------------------------------------------
 * js/prefetch.js  --  fill the HTTP cache during idle time.
 *
 * The turntable is only ever as smooth as the sheet behind it, and a sheet
 * that is still in flight paints nothing.  app.js already holds ONE style's
 * sheet decoded and warm at a time - that policy is deliberate and is not
 * touched here, because it is what fixed the wash-out on the 512 MB iPad
 * (see the long note in anim.js).
 *
 * This is the layer underneath that: it walks every style's sheets once and
 * pulls the BYTES into the browser's HTTP cache.  No Image objects, so nothing
 * is decoded and no texture memory is held - the warm-set policy is unchanged.
 * When a visitor then taps a style, the sheet is already local and the decode
 * starts immediately instead of after a round trip to a Pi Zero W.
 *
 * This only works because serve.py now serves ?v=-stamped URLs as immutable;
 * under the old blanket no-store, nothing could be pre-warmed at all.
 *
 * Order matters:
 *   1. sprite-t.png  (~93 KB)  - needed the instant a card is tapped
 *   2. still + thumb (~16 KB)  - the cards and the attract row
 *   3. sprite.png    (~341 KB) - only needed once a build starts, and there is
 *                                an 18-second build to cover it
 *
 * Requests go out ONE at a time with a gap between them.  The server is a
 * single-core 1 GHz Pi also driving the robot link; saturating it to make the
 * prefetch finish sooner would be a bad trade.
 *
 * ES5 only.  No arrow functions, no let/const, no template literals.
 * ------------------------------------------------------------------------ */

var Prefetch = (function () {

  var GAP_MS = 150;      // breathing room between requests
  var START_DELAY = 4000; // let the first screen settle before using bandwidth

  var queue = [];
  var running = false;
  var done = 0;

  function fetchOne(url, whenDone) {
    var xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      // A plain GET is what an <img> would issue, so it populates the same
      // cache entry the Image will later hit.
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) whenDone();
      };
      xhr.send();
    } catch (e) {
      whenDone();   // a failed prefetch is not an error - the image still loads
    }
  }

  function pump() {
    if (!queue.length) {
      running = false;
      if (window.Debug && Debug.log) Debug.log('prefetch: ' + done + ' files warm');
      return;
    }
    var url = queue.shift();
    fetchOne(url, function () {
      done++;
      window.setTimeout(pump, GAP_MS);
    });
  }

  function build() {
    var urls = [];
    var styles = window.HAIR_STYLES || [];
    var i, s;

    if (!window.Assets || !styles.length) return urls;
    if (Assets.usePlaceholders && Assets.usePlaceholders()) return urls;

    for (i = 0; i < styles.length; i++) {          // 1. card-scale sheets
      s = Assets.sprite(styles[i], true);
      if (s && s.url) urls.push(s.url);
    }
    for (i = 0; i < styles.length; i++) {          // 2. stills and thumbs
      urls.push(Assets.still(styles[i]));
      urls.push(Assets.thumb(styles[i]));
    }
    for (i = 0; i < styles.length; i++) {          // 3. full-size sheets
      s = Assets.sprite(styles[i], false);
      if (s && s.url) urls.push(s.url);
    }
    return urls;
  }

  function start() {
    if (running) return;
    if (window.DPT_CONFIG && DPT_CONFIG.PREFETCH_ALL === false) return;
    queue = build();
    if (!queue.length) return;
    running = true;
    pump();
  }

  window.addEventListener('load', function () {
    window.setTimeout(start, START_DELAY);
  }, false);

  return { start: start, pending: function () { return queue.length; } };
})();
