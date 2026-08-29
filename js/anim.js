/* ---------------------------------------------------------------------------
 * js/anim.js  --  animation helpers.
 *
 * JS only ever adds and removes classes; the motion itself lives in CSS.
 * The one thing JS owns is layer promotion: `translateZ(0)` goes on for the
 * duration of a transform and comes straight back off, because more than
 * ~6-8 composited layers at once thrashes texture memory on a 512MB A5.
 * ------------------------------------------------------------------------ */

var Anim = (function () {

  var SCREEN_MS = 380;
  var reduced = !!(window.DPT_CONFIG && DPT_CONFIG.REDUCED_MOTION);

  /* Safari 9 has classList, but guard anyway - a silent failure here would
     take the whole UI down with no console to see it in. */
  function addClass(el, c) {
    if (!el) return;
    if (el.classList) { el.classList.add(c); return; }
    if ((' ' + el.className + ' ').indexOf(' ' + c + ' ') < 0) el.className += ' ' + c;
  }

  function removeClass(el, c) {
    if (!el) return;
    if (el.classList) { el.classList.remove(c); return; }
    el.className = (' ' + el.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  function hasClass(el, c) {
    if (!el) return false;
    if (el.classList) return el.classList.contains(c);
    return (' ' + el.className + ' ').indexOf(' ' + c + ' ') >= 0;
  }

  // Reading offsetHeight flushes pending style changes so the next class add
  // actually transitions instead of being coalesced into one paint.
  function reflow(el) { return el.offsetHeight; }

  /* --- layer promotion ---------------------------------------------------- */

  function promote(el) { addClass(el, 'is-animating'); }

  function unpromoteAfter(el, ms) {
    window.setTimeout(function () { removeClass(el, 'is-animating'); }, ms);
  }

  /* --- 1. staggered entrance ---------------------------------------------- */

  /* items: array of { el: node, delay: ms }.  Everything is already sitting in
     .enter-init / .enter-init-logo from the markup or the builder. */
  function enter(items) {
    var i;
    for (i = 0; i < items.length; i++) {
      (function (item) {
        window.setTimeout(function () {
          if (!reduced) promote(item.el);
          addClass(item.el, 'enter-run');
          removeClass(item.el, 'enter-init');
          removeClass(item.el, 'enter-init-logo');
          if (!reduced) unpromoteAfter(item.el, 400);
        }, item.delay);
      })(items[i]);
    }
  }

  /* --- 5. screen transitions ---------------------------------------------- */

  function transition(fromEl, toEl, back, done) {
    var outCls = back ? 'pop-out' : 'push-out';
    var inStart = back ? 'pop-in-start' : 'push-in-start';

    addClass(toEl, inStart);
    addClass(toEl, 'screen-active');
    promote(toEl);
    promote(fromEl);
    reflow(toEl);

    addClass(toEl, 'is-moving');
    addClass(fromEl, 'is-moving');
    addClass(fromEl, outCls);
    removeClass(toEl, inStart);
    addClass(toEl, 'push-in-end');

    window.setTimeout(function () {
      removeClass(fromEl, 'screen-active');
      removeClass(fromEl, 'is-moving');
      removeClass(fromEl, outCls);
      removeClass(fromEl, 'is-animating');
      removeClass(toEl, 'is-moving');
      removeClass(toEl, 'push-in-end');
      removeClass(toEl, 'is-animating');
      if (typeof done === 'function') done();
    }, reduced ? 160 : SCREEN_MS);
  }

  function push(fromEl, toEl, done) { transition(fromEl, toEl, false, done); }
  function pop(fromEl, toEl, done) { transition(fromEl, toEl, true, done); }

  /* --- 4. turntable ------------------------------------------------------- */

  /* Cross-fades two stacked background-image divs so four stills read as one
     smooth rotation.  Only opacity moves.  Exactly one style's frames are held
     warm at a time - `warm` is replaced wholesale on every setStyle. */
  /* Turntable: cycles one style through its rotation frames.
   *
   * Every frame lives in ONE sprite sheet, and a step is a background-position
   * change on a single element. That matters far more than it sounds on an A5.
   *
   * The previous version pointed a layer at a different PNG each step and
   * cross-faded two of them. Three separate attempts to kill the wash-out that
   * way all measured clean in a desktop browser and all still washed out on
   * the device, because the cause was never the compositing math - it was
   * decode cost. Sixteen frames per style is sixteen decodes and ~14 MB of
   * decoded bitmaps, and Safari 9 on a 512 MB device evicts those aggressively.
   * So every 170 ms we asked it to paint an image it had already thrown away;
   * it re-decoded, and for those milliseconds the layer painted empty.
   *
   * One sheet is one decode and one texture upload, held warm by a single
   * Image reference. Stepping never touches background-image, so there is
   * nothing to re-resolve, and with a single layer there is no cross-layer
   * alpha blending to dip - the wash-out is structurally impossible now rather
   * than merely tuned away. Sheets are 1600px and 704px square, inside the
   * A5's 2048px texture limit.
   *
   * The trade is that frames hard-cut instead of blending. Across 16 frames of
   * a 360 that reads as rotation; it is also what film does. */
  function Turntable(host, tOpts) {
    tOpts = tOpts || {};

    var strip = document.createElement('div');
    strip.className = 'spin-strip';

    var wrap = document.createElement('div');
    wrap.className = 'spin';
    wrap.appendChild(strip);
    host.appendChild(wrap);

    var seq = [0];         // cell indices, in the order they are shown
    var grid = 4;          // the sheet is grid x grid cells
    var idx = 0, timer = null, speed = 0;
    var warm = null;       // the one Image ref that keeps the sheet decoded

    /* A per-cent background-position puts the image's P% point over the box's
       P% point, so with the sheet scaled to grid*100% the cells land exactly on
       multiples of 100/(grid-1). */
    function place(cell) {
      var stepPct = 100 / (grid - 1);
      var col = cell % grid, row = Math.floor(cell / grid);
      strip.style.backgroundPosition = (col * stepPct) + '% ' + (row * stepPct) + '%';
    }

    /* Assets owns the shape of the sequence: a true 360 loop for the renders,
       a rock through four angles for photography and the swatches. */
    function setStyle(style) {
      stop();
      var sheet = Assets.sprite(style, !!tOpts.thumbScale);
      grid = sheet.grid;
      seq = sheet.seq;
      idx = 0;
      strip.style.backgroundImage = 'url(' + sheet.url + ')';
      strip.style.backgroundSize = (grid * 100) + '% ' + (grid * 100) + '%';
      place(seq[0]);
      warm = new Image();                          // hold it against eviction
      Debug.trackImage(sheet.url, warm);
      warm.src = sheet.url;
    }

    function step() {
      idx = (idx + 1) % seq.length;
      place(seq[idx]);
    }

    function start(ms) {
      stop();
      speed = ms || (window.DPT_CONFIG && DPT_CONFIG.SPIN_SPEED) || 260;
      if (reduced) return;                         // no spin under reduced motion
      timer = window.setInterval(step, speed);
    }

    function stop() {
      if (timer) { window.clearInterval(timer); timer = null; }
    }

    function destroy() {
      stop();
      warm = null;
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    return { setStyle: setStyle, start: start, stop: stop, destroy: destroy, el: wrap };
  }

  return {
    addClass: addClass,
    removeClass: removeClass,
    hasClass: hasClass,
    reflow: reflow,
    promote: promote,
    unpromoteAfter: unpromoteAfter,
    enter: enter,
    push: push,
    pop: pop,
    Turntable: Turntable,
    reduced: reduced,
    SCREEN_MS: SCREEN_MS
  };
})();
