/* ---------------------------------------------------------------------------
 * js/fit.js  --  fit the fixed design canvas to whatever screen it lands on.
 *
 * WHY THIS EXISTS
 *
 * Every screen in this app is drawn at a literal 768 x 1004 - the iPad mini 1
 * portrait viewport it was designed against.  Coordinates are hardcoded all
 * over the CSS (.attract-stage sits at left:234px, .chips-viewport is exactly
 * 672px wide, .build-stage is 480 square).  That is a deliberate choice and it
 * is what makes the layout pixel-exact; it is not something to unpick.
 *
 * The Fire HD 8 (K72LL4) reports a very different viewport - roughly 533 x 853
 * CSS px in portrait, because Silk exposes the 800x1280 panel at a ~1.5 device
 * pixel ratio.  Restating all several hundred coordinates inside a media query
 * was tried first; it is unmaintainable, it silently misses whatever it forgot,
 * and it has to be re-guessed for the next device.
 *
 * Instead, the design canvas is left exactly as authored and the WHOLE canvas
 * is scaled to fit.  One transform, computed from the live viewport, and every
 * coordinate in the app stays correct by construction - on the iPad, on the
 * Fire, in portrait, in landscape, and whether or not Silk's address bar is
 * showing.
 *
 * HOW IT SCALES
 *
 *   scale = viewportWidth / 768            - width always fills the screen, so
 *                                            horizontal proportions are exact
 *   stage height = viewportHeight / scale  - the canvas gets TALLER in design
 *                                            units on a taller screen
 *
 * The extra height is not wasted: every screen column is a flexbox with
 * .s1-spacer set to flex:1, which the original author added precisely so the
 * layout could absorb the 1004 (standalone) vs 1024 (in-browser) difference.
 * Growing the canvas to 1229 design px on the Fire just feeds that same
 * spacer, so the content fills the tablet instead of letterboxing.  The
 * attract screen's absolute positions are percentages (see screens.css) so it
 * stays proportional at any height.
 *
 * Two guards:
 *   - if the derived height is under 1004 (landscape), fall back to a contain
 *     fit so nothing can ever clip - a portrait kiosk laid on its side gets
 *     bars at the sides rather than a cropped button.
 *   - the height is capped at MAX_H so a very tall phone does not stretch the
 *     spacers into an ocean of dead space.
 *
 * NOTE: do NOT add will-change/translateZ to #stage.  Promoting it would pin
 * the whole canvas to one rasterised texture and everything inside would go
 * soft; left alone, the compositor rasterises at the effective scale and text
 * stays crisp.
 *
 * ES5 only.  No arrow functions, no let/const, no template literals.
 * ------------------------------------------------------------------------ */

var Fit = (function () {

  var DESIGN_W = 768;    // the authored canvas width  - never changes
  var DESIGN_H = 1004;   // the authored canvas height - the minimum
  /* Stop stretching past this many design px - about 12% taller than the
     canvas was composed at.  Screen 1 absorbs slack happily (the hair grid
     grows), but screens 2 and 3 are hero-plus-caption compositions with no
     elastic element: past this the badge and the finished minifigure start
     floating in space rather than sitting in a layout.  The cost is ~38px of
     letterbox at each end on the Fire HD 8, in the page's own background
     colour, which reads as bezel rather than as a gap. */
  var MAX_H    = 1120;

  var stage = null;
  var scale = 1;
  var frame = null;
  var lastW = -1, lastH = -1;

  /* The visual viewport is the part actually on screen.  On Silk it shrinks
     when the address bar slides in, which window.innerHeight does not always
     report in time - so prefer it where it exists. */
  function viewport() {
    var vv = window.visualViewport;
    var w = (vv && vv.width)  || window.innerWidth  ||
            (document.documentElement && document.documentElement.clientWidth)  || DESIGN_W;
    var h = (vv && vv.height) || window.innerHeight ||
            (document.documentElement && document.documentElement.clientHeight) || DESIGN_H;
    return { w: Math.round(w), h: Math.round(h) };
  }

  function apply() {
    frame = null;
    if (!stage) return;

    var v = viewport();
    if (!v.w || !v.h) return;
    if (v.w === lastW && v.h === lastH) return;   // nothing moved; don't touch the DOM
    lastW = v.w;
    lastH = v.h;

    var s = v.w / DESIGN_W;
    var h = v.h / s;

    if (h < DESIGN_H) {
      // Too short to hold the canvas at full width - contain instead of crop.
      s = v.h / DESIGN_H;
      h = DESIGN_H;
    } else if (h > MAX_H) {
      h = MAX_H;
    }

    scale = s;

    var w = DESIGN_W * s;
    var sh = h * s;
    // transform-origin is 0 0, so centre by translating explicitly.  Doing the
    // arithmetic here rather than with translate(-50%,-50%) avoids depending on
    // how an engine resolves percentage translation against a scaled box.
    var x = Math.round((v.w - w) / 2);
    var y = Math.round((v.h - sh) / 2);

    stage.style.height = Math.round(h) + 'px';

    var t = 'translate(' + x + 'px, ' + y + 'px) scale(' + (Math.round(s * 10000) / 10000) + ')';
    stage.style.webkitTransform = t;
    stage.style.transform = t;
  }

  /* Coalesce bursts of resize/scroll events into one write per frame. */
  function schedule() {
    if (frame) return;
    if (window.requestAnimationFrame) {
      frame = window.requestAnimationFrame(apply);
    } else {
      frame = window.setTimeout(apply, 16);
    }
  }

  /* Force the next apply() through even if the viewport reads the same. */
  function refresh() {
    lastW = lastH = -1;
    apply();
  }

  function init() {
    stage = document.getElementById('stage');
    if (!stage) return;
    apply();

    window.addEventListener('resize', schedule, false);
    window.addEventListener('orientationchange', function () {
      // The viewport is mid-flight when this fires; settle it afterwards.
      refresh();
      window.setTimeout(refresh, 120);
      window.setTimeout(refresh, 400);
      window.setTimeout(refresh, 800);
    }, false);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule, false);
      window.visualViewport.addEventListener('scroll', schedule, false);
    }

    // Silk reports its final height only once chrome has settled after load.
    window.addEventListener('load', function () {
      refresh();
      window.setTimeout(refresh, 300);
      window.setTimeout(refresh, 1000);
    }, false);
  }

  /* Self-booting: the canvas must be sized before the first paint, whichever
     point in the document this file happens to be included from. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, false);
  } else {
    init();
  }

  return {
    init: init,
    refresh: refresh,
    scale: function () { return scale; },
    designWidth: function () { return DESIGN_W; }
  };
})();
