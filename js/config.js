/* ---------------------------------------------------------------------------
 * js/config.js  --  every tunable in one place.
 * Loaded before everything else; all other files read DPT_CONFIG.
 * ------------------------------------------------------------------------ */

var DPT_CONFIG = {

  /* --- kiosk behaviour ------------------------------------------------- */

  // ms of no touch before the attract loop takes over.  Spec: 45s.
  IDLE_TIMEOUT: 45000,

  // ms on the completion screen before the booth resets itself.  Spec: 30s.
  AUTO_RESET: 30000,

  // Run a fake 18-second build so the whole flow demos with no robot attached.
  // Set false once DPTKiosk.setProgress() is driven by the hardware layer.
  SIMULATE_BUILD: true,

  // Bumped by bust.py. Appended to every image URL so a Safari cache entry
  // created before the no-store headers existed cannot keep serving a stale
  // frame - changing the URL is the one thing the cache cannot ignore.
  ASSET_VERSION: '1788290777',

  // Where the hair art comes from.  One word switches the whole app.
  //   'render'      assets/hair-render/  - rendered from the real LDraw part
  //                 geometry. Perfect registration, ~60 KB a frame.
  //   'photo'       assets/hair/         - the segmented photography
  //   'placeholder' assets/placeholder/  - flat colour swatches
  ART_SOURCE: 'render',

  /* --- motion ---------------------------------------------------------- */

  // Escape hatch: swap every transition for a flat 150ms opacity fade.
  // Flip this on if the real A5 can't hold frame rate.
  REDUCED_MOTION: false,

  // Layout A (2x4 grid) is the only layout.  B - hero plus swipeable chips -
  // was dropped: its hosts are not square, which the sprite-sheet turntable
  // requires, and it is not wanted.  Screen1B in screens.js is now unreachable
  // dead code and can be deleted whenever convenient.
  // Parts the arm dispenses pneumatically.  One completed minifigure consumes
  // one from each magazine; staff refill from the panel behind a long press on
  // the logo.  Counts persist across a reload so a mid-show reboot keeps them.
  MAGAZINE_CAPACITY: 20,

  LAYOUT: 'A',

  // How many frames the rendered set holds. The renders are a true 360 loop
  // (16 frames, 22.5 degrees apart) so the rotation never reverses or resets.
  // Change this only if you re-run the render script with a different count.
  RENDER_FRAMES: 25,

  // Turntable: ms each frame is held.  Frames hard-cut - there is no fade to
  // configure, because every frame lives in one sprite sheet (see
  // Anim.Turntable).  With 16 frames a revolution takes SPIN_SPEED * 16
  // (~3.0s at 120).  Photography rocks through its four angles instead.
  //
  // 170 used to be a decode-budget number: each step swapped in a different
  // PNG, so a faster spin meant more decoding.  A step is now just a
  // background-position change on an already-uploaded texture, which costs
  // essentially nothing, so the rate is free to be chosen for how it looks.
  // Faster reads as rotation rather than as a slideshow, which matters more
  // now that frames cut instead of blending.  Override live with ?spin=120.
  SPIN_SPEED: 120,

  // Was 280 purely to save decodes while the idle loop ran for hours.  That
  // cost is gone with the sprite sheet, so the attract loop spins at the same
  // rate as everywhere else; slowing it again is now only an aesthetic call.
  SPIN_SPEED_ATTRACT: 120,

  /* --- on-device debugging --------------------------------------------- */

  // Master switch for the debug panel, the FPS meter and asset-load logging.
  // When false none of it is built and it costs nothing.
  // Triple-tap the logo to toggle the panel while DEBUG is true.
  DEBUG: false
};

/* ---------------------------------------------------------------------------
 * URL overrides.
 *
 * The booth iPad has no keyboard and no way to edit a file, so the flags worth
 * flipping while standing in front of the thing can be set from the address
 * bar instead.  Everything above stays the shipping default.
 *
 *   ?debug=1                        turn the debug panel + FPS meter on
 *   ?layout=B                       hero turntable instead of the 2x4 grid
 *   ?art=photo | render | placeholder
 *   ?motion=reduced                 flat 150ms fades
 *   ?sim=0                          stop the fake build (drive it from the arm)
 *
 * Combine with & - e.g. ?debug=1&layout=B
 * ------------------------------------------------------------------------ */
(function () {
  var q = String(window.location.search || '');
  function val(name) {
    var m = q.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  if (val('debug') === '1') DPT_CONFIG.DEBUG = true;

  var art = val('art');
  if (art === 'photo' || art === 'render' || art === 'placeholder') DPT_CONFIG.ART_SOURCE = art;

  // ?spin=<ms> - tune the turntable rate on the device without a redeploy
  var spin = parseInt(val('spin'), 10);
  if (spin > 0 && spin < 2000) {
    DPT_CONFIG.SPIN_SPEED = spin;
    DPT_CONFIG.SPIN_SPEED_ATTRACT = spin;
  }

  if (val('motion') === 'reduced') DPT_CONFIG.REDUCED_MOTION = true;
  if (val('sim') === '0') DPT_CONFIG.SIMULATE_BUILD = false;
})();
