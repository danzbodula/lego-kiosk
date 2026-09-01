/* ---------------------------------------------------------------------------
 * js/fastclick.js  --  300ms tap-delay killer.
 *
 * This is a dependency-free replacement for the FastClick library rather than
 * the library itself.  FastClick works by synthesising a click on touchend and
 * then swallowing the browser's ghost click; that machinery only earns its
 * keep when a page has native controls (inputs, selects, links) that must keep
 * behaving natively.  This kiosk has none - every control is a div or button
 * we drive ourselves - so binding taps directly is both smaller and less
 * failure-prone, and it gives us the press/release hooks the card animation
 * needs anyway.
 *
 * ES5 only.  No arrow functions, no let/const, no template literals.
 * ------------------------------------------------------------------------ */

var Tap = (function () {

  // A finger that slides more than this many px is a scroll/drag, not a tap.
  var MOVE_TOLERANCE = 12;

  var hasTouch = ('ontouchstart' in window) ||
                 (window.DocumentTouch && document instanceof window.DocumentTouch);

  function point(e) {
    if (e.touches && e.touches.length) return e.touches[0];
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
    return e;
  }

  function call(fn) { if (typeof fn === 'function') fn(); }

  /* bind(el, handlers)
   *   handlers.press    finger down  (drive the 0.97 scale here)
   *   handlers.release  finger up or cancelled (spring back here)
   *   handlers.tap      a real tap completed
   */
  function bind(el, handlers) {
    if (!el) return;
    var active = false, sx = 0, sy = 0;

    function start(e) {
      var p = point(e);
      active = true; sx = p.clientX; sy = p.clientY;
      call(handlers.press);
    }

    function move(e) {
      if (!active) return;
      var p = point(e);
      if (Math.abs(p.clientX - sx) > MOVE_TOLERANCE ||
          Math.abs(p.clientY - sy) > MOVE_TOLERANCE) {
        active = false;
        call(handlers.release);
      }
    }

    function end(e) {
      if (!active) return;
      active = false;
      // Swallowing the default here is what stops the 300ms ghost click.
      if (e.preventDefault) e.preventDefault();
      call(handlers.release);
      call(handlers.tap);
    }

    function cancel() {
      if (!active) return;
      active = false;
      call(handlers.release);
    }

    if (hasTouch) {
      el.addEventListener('touchstart', start, false);
      el.addEventListener('touchmove', move, false);
      el.addEventListener('touchend', end, false);
      el.addEventListener('touchcancel', cancel, false);
    } else {
      // desktop fallback so the whole flow is demoable on a laptop
      el.addEventListener('mousedown', start, false);
      el.addEventListener('mousemove', move, false);
      el.addEventListener('mouseup', end, false);
      el.addEventListener('mouseleave', cancel, false);
    }
  }

  /* Kill rubber-band scrolling document-wide.  No screen in this app scrolls,
     so every touchmove that reaches the document is unwanted. */
  function lockScrolling() {
    document.addEventListener('touchmove', function (e) {
      if (e.preventDefault) e.preventDefault();
    }, false);
  }

  return { bind: bind, lockScrolling: lockScrolling, hasTouch: hasTouch };
})();
