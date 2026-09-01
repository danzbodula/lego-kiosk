/* ---------------------------------------------------------------------------
 * js/app.js  --  state machine, idle/attract loop, and the DPTKiosk surface.
 * ------------------------------------------------------------------------ */

var App = (function () {

  var current = 'select';          // 'select' | 'build' | 'done'
  var idleTimer = null;
  var attractEl = null, attractSpin = null, attractOn = false;
  var warmFrames = [];             // card-scale frames for the selected style
  var heroFrames = [];             // full-size frames, warmed when a build starts

  function styleById(id) {
    var i;
    for (i = 0; i < HAIR_STYLES.length; i++) if (HAIR_STYLES[i].id === id) return HAIR_STYLES[i];
    return HAIR_STYLES[0];
  }

  /* Hold exactly one style's sheet warm.  Every rotation frame lives in a
     single sprite, so this is one request and one decode per style instead of
     sixteen - the whole reason the turntable stopped washing out.  Overwriting
     the reference lets the previous style's texture go, which matters on a
     512MB device: the card sheet is 704px square (~2MB decoded), the hero sheet
     1600px (~10MB), so they are never held at the same scale for two styles.
     Selection warms the card sheet; the hero sheet waits for the build, which
     gives it eighteen seconds of cover. */
  function preload(style, thumbScale) {
    var url = Assets.sprite(style, thumbScale).url;
    var img = new Image();
    Debug.trackImage(url, img);
    img.src = url;
    return [img];
  }

  function preloadStyle(style) { warmFrames = preload(style, true); }

  /* The still is tiny and must be ready before the completion screen springs
     in, so it is warmed alongside the sheet it stands in for. */
  function preloadHero(style) {
    heroFrames = preload(style, false);
    var s = new Image();
    Debug.trackImage(Assets.still(style), s);
    s.src = Assets.still(style);
    heroFrames.push(s);
  }

  /* --- selection ---------------------------------------------------------- */

  function onSelect(id) {
    if (id === Screens.Screen1.getSelected()) { resetIdle(); return; }
    Screens.Screen1.setSelected(id);
    preloadStyle(styleById(id));
    resetIdle();
    DPTKiosk.onSelectionChange(id);
  }

  /* --- attract / idle loop ------------------------------------------------ */

  function buildAttract() {
    attractEl = document.getElementById('attract');
    attractEl.innerHTML = '';

    var logo = document.createElement('div');
    logo.className = 'attract-logo';

    var stage = document.createElement('div');
    stage.className = 'attract-stage';

    var title = document.createElement('div');
    title.className = 'attract-title';
    title.appendChild(document.createTextNode('BUILD YOUR MINIFIGURE'));

    var sub = document.createElement('div');
    sub.className = 'attract-sub';
    sub.appendChild(document.createTextNode('BUILT BY A ROBOT, WHILE YOU WATCH'));

    var tap = document.createElement('div');
    tap.className = 'attract-tap';
    tap.appendChild(document.createTextNode('TAP TO START'));

    /* Every style, laid out from the manifest so a ninth needs no code here.
       Answers "what can I get?" before anyone touches anything - which is the
       one question the attract loop should be answering.  These are the 128px
       stills, so the whole row costs about half a megabyte decoded and adds no
       animating layers; the motion comes from the single pip below it. */
    var n = HAIR_STYLES.length;
    var GAP = 16, AVAIL = 688;
    var cell = Math.min(64, Math.floor((AVAIL - (n - 1) * GAP) / n));
    var span = n * cell + (n - 1) * GAP;
    var left = Math.round((768 - span) / 2);

    var row = document.createElement('div');
    row.className = 'attract-row';
    var i, pips = [], chipEls = [];
    for (i = 0; i < n; i++) {
      var t = document.createElement('div');
      t.className = 'attract-chip';
      t.style.left = (left + i * (cell + GAP)) + 'px';
      t.style.width = cell + 'px';
      t.style.height = cell + 'px';
      t.style.backgroundImage = 'url(' + Assets.thumb(HAIR_STYLES[i]) + ')';
      t.style.backgroundSize = cell + 'px ' + cell + 'px';
      row.appendChild(t);
      chipEls.push(t);
      pips.push(left + i * (cell + GAP) + Math.round((cell - 34) / 2));
    }

    /* One element, moved by transform - the eye follows it along the row and
       reads the whole range on the way.  Driven from JS rather than keyframes
       so the stops come from the manifest instead of being hard-coded. */
    var pip = document.createElement('div');
    pip.className = 'attract-pip';
    pip.style.left = '0px';
    row.appendChild(pip);

    var count = document.createElement('div');
    count.className = 'attract-count';

    attractEl.appendChild(logo);
    attractEl.appendChild(stage);
    attractEl.appendChild(title);
    attractEl.appendChild(sub);
    attractEl.appendChild(row);
    attractEl.appendChild(tap);
    attractEl.appendChild(count);
    attractEl.stageNode = stage;
    attractEl.pipNode = pip;
    attractEl.pipStops = pips;
    attractEl.chipEls = chipEls;
    attractEl.countNode = count;
  }

  /* The pip walks the row while the attract loop is up, and only then. */
  var pipTimer = null, pipAt = 0;

  function startPip() {
    stopPip();
    var stops = attractEl.pipStops, pip = attractEl.pipNode;
    if (!stops || !stops.length) return;
    var chips = attractEl.chipEls || [];
    function move() {
      pip.style.webkitTransform = 'translate3d(' + stops[pipAt] + 'px,0,0)';
      pip.style.transform = 'translate3d(' + stops[pipAt] + 'px,0,0)';
      // only ever two chips mid-transition, so this stays inside the budget
      var k;
      for (k = 0; k < chips.length; k++) {
        if (k === pipAt) Anim.addClass(chips[k], 'is-lit');
        else Anim.removeClass(chips[k], 'is-lit');
      }
      pipAt = (pipAt + 1) % stops.length;
    }
    move();
    pipTimer = window.setInterval(move, 1100);
  }

  function stopPip() {
    if (pipTimer) { window.clearInterval(pipTimer); pipTimer = null; }
  }

  /* Quiet social proof.  Hidden until there are enough to be worth saying -
     "0 BUILT TODAY" would work against us. */
  function refreshCount() {
    var el = attractEl.countNode;
    if (!el) return;
    var n = (window.Admin && Admin.builds) ? Admin.builds() : 0;
    el.innerHTML = '';
    if (n < 5) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.appendChild(document.createTextNode(n + ' BUILT TODAY'));
  }

  function showAttract() {
    if (attractOn) return;
    attractOn = true;

    // built fresh each time and destroyed on dismiss, so the idle loop never
    // holds textures while somebody is actually using the kiosk
    Screens.Screen1.pauseSpin();
    startPip();
    refreshCount();
    attractSpin = Anim.Turntable(attractEl.stageNode);
    attractSpin.setStyle(styleById(Screens.Screen1.getSelected()));
    attractSpin.start(DPT_CONFIG.SPIN_SPEED_ATTRACT);

    Anim.addClass(document.getElementById('app'), 'is-dimmed');
    Anim.addClass(attractEl, 'is-on');
  }

  function hideAttract() {
    if (!attractOn) return;
    attractOn = false;
    stopPip();
    Anim.addClass(attractEl, 'is-leaving');
    Anim.removeClass(attractEl, 'is-on');
    Anim.removeClass(document.getElementById('app'), 'is-dimmed');
    window.setTimeout(function () {
      Anim.removeClass(attractEl, 'is-leaving');
      if (attractSpin) { attractSpin.destroy(); attractSpin = null; }
    }, 250);
  }

  function resetIdle() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(function () {
      if (current === 'build') { resetIdle(); return; }   // never interrupt a build
      showAttract();
    }, DPT_CONFIG.IDLE_TIMEOUT);
  }

  /* Any touch anywhere resets the idle clock; a touch while the attract loop
     is up dismisses it and returns to a fully reset flow. */
  function wireGlobalTouch() {
    function onDown() {
      if (attractOn) { hideAttract(); fullReset(); }
      resetIdle();
    }
    document.addEventListener(Tap.hasTouch ? 'touchstart' : 'mousedown', onDown, true);
  }

  /* --- navigation --------------------------------------------------------- */

  function screenEl(name) {
    return document.getElementById(
      name === 'select' ? 'screen-select' : (name === 'build' ? 'screen-build' : 'screen-done'));
  }

  /* Names the first empty magazine, or null when there is stock for a build. */
  function outOfStock() {
    if (!window.Admin) return null;
    var c = Admin.counts(), k;
    for (k in c) if (c.hasOwnProperty(k) && c[k] <= 0) return k;
    return null;
  }

  function goBuild(styleId) {
    if (current !== 'select') return;

    /* Refuse a build the arm cannot finish.  An empty magazine mid-build fails
       in front of an audience, which is the worst outcome at a trade show; a
       clear message staff can act on is much better. */
    var empty = outOfStock();
    var style = styleById(styleId);
    Screens.Screen2.build();
    Screens.Screen2.reset();
    Screens.Screen1.pauseSpin();
    preloadHero(style);           // eighteen seconds of build to fetch these in
    var from = screenEl(current), to = screenEl('build');
    current = 'build';
    Anim.push(from, to, function () {
      if (empty) {
        Screens.Screen2.error('Out of ' + empty + '. Please ask a member of staff.');
        return;
      }
      Screens.Screen2.setProgress(0, Screens.Screen2.STAGES[0]);
      DPTKiosk.onBuildStart(styleId);
      if (DPT_CONFIG.SIMULATE_BUILD) startSimulation();
    });
  }

  function goDone() {
    if (current !== 'build') return;
    stopSimulation();
    var style = styleById(Screens.Screen1.getSelected());
    Screens.Screen3.build();
    // load the right minifigure and hide the figure BEFORE the slide starts,
    // or the done screen animates in still showing the previous build's head
    Screens.Screen3.prepare(style);
    var from = screenEl(current), to = screenEl('done');
    current = 'done';
    Anim.push(from, to, function () {
      Screens.Screen3.show(style);
      startAutoReset();
    });
  }

  /* --- simulated build ------------------------------------------------------
   * An 18-second fake run so the whole flow is presentable before the arm is
   * wired in.  Deliberately uneven - a linear bar reads as fake.
   * Turn it off with DPT_CONFIG.SIMULATE_BUILD and drive the screen from
   * DPTKiosk.setProgress() instead.
   * ---------------------------------------------------------------------- */

  var simTimer = null, simStart = 0;

  var SIM_KEYS = [
    [0.0,   0, 0], [1.2,   6, 0], [3.0,  18, 0], [5.4,  30, 0],
    [6.2,  33, 1], [8.0,  45, 1], [10.5, 60, 1], [12.6, 74, 1],
    [13.2, 78, 2], [15.5, 90, 2], [17.2, 97, 2], [18.0, 100, 2]
  ];

  function simAt(t) {
    var i;
    if (t <= 0) return { pct: 0, stage: 0 };
    for (i = 1; i < SIM_KEYS.length; i++) {
      if (t <= SIM_KEYS[i][0]) {
        var a = SIM_KEYS[i - 1], b = SIM_KEYS[i];
        var f = (t - a[0]) / (b[0] - a[0]);
        return { pct: a[1] + (b[1] - a[1]) * f, stage: b[2] };
      }
    }
    return { pct: 100, stage: 2 };
  }

  function startSimulation() {
    stopSimulation();
    simStart = new Date().getTime();
    simTimer = window.setInterval(function () {
      var t = (new Date().getTime() - simStart) / 1000;
      var v = simAt(t);
      Screens.Screen2.setProgress(v.pct, Screens.Screen2.STAGES[v.stage]);
      if (t >= 18) { stopSimulation(); DPTKiosk.buildComplete(); }
    }, 200);
  }

  function stopSimulation() {
    if (simTimer) { window.clearInterval(simTimer); simTimer = null; }
  }

  /* --- auto-reset on the completion screen --------------------------------- */

  var autoResetTimer = null;

  function startAutoReset() {
    stopAutoReset();
    autoResetTimer = window.setTimeout(function () { fullReset(); }, DPT_CONFIG.AUTO_RESET);
  }

  function stopAutoReset() {
    if (autoResetTimer) { window.clearTimeout(autoResetTimer); autoResetTimer = null; }
  }

  /* --- reset -------------------------------------------------------------- */

  function fullReset() {
    stopSimulation();
    stopAutoReset();
    Screens.Screen3.stop();

    var first = HAIR_STYLES[0];
    Screens.Screen1.setSelected(first.id);
    preloadStyle(first);
    Screens.Screen1.reset();

    if (current === 'select') {
      Screens.Screen1.resumeSpin();
      window.setTimeout(function () { Screens.Screen1.entrance(); }, 30);
    } else {
      // back-navigation reverses the push
      Anim.pop(screenEl(current), screenEl('select'), function () {
        Screens.Screen1.entrance();
        Screens.Screen1.resumeSpin();
      });
    }
    current = 'select';
    resetIdle();
    DPTKiosk.onReset();
  }

  /* --- continue ----------------------------------------------------------- */

  function wireContinue() {
    var btn = document.getElementById('btn-continue');
    Tap.bind(btn, {
      press: function () { Anim.addClass(btn, 'is-pressed'); },
      release: function () { Anim.removeClass(btn, 'is-pressed'); },
      tap: function () {
        var id = Screens.Screen1.getSelected();
        resetIdle();
        DPTKiosk.onContinue(id);   // hook first, so an override can see the tap
        goBuild(id);
      }
    });
  }

  /* --- boot --------------------------------------------------------------- */

  function boot() {
    Debug.init();
    Tap.lockScrolling();

    if (DPT_CONFIG.REDUCED_MOTION) Anim.addClass(document.body, 'reduced-motion');
    Debug.wireToggle(document.getElementById('logo-select'));

    Screens.Screen1.build(onSelect);

    // exactly one style is selected at all times; default to the first
    var first = HAIR_STYLES[0];
    Screens.Screen1.setSelected(first.id);
    preloadStyle(first);

    wireContinue();
    buildAttract();
    wireGlobalTouch();
    Admin.boot();                 // arms the long-press on the logo

    Screens.Screen1.entrance();
    resetIdle();

    Debug.log('boot ok - ' + HAIR_STYLES.length + ' styles');
  }

  return {
    boot: boot,
    goBuild: goBuild,
    goDone: goDone,
    fullReset: fullReset,
    resetIdle: resetIdle,
    styleById: styleById,
    preloadStyle: preloadStyle,
    setScreen: function (s) { current = s; },
    getScreen: function () { return current; }
  };
})();

/* ---------------------------------------------------------------------------
 * window.DPTKiosk  --  the integration surface for the hardware layer.
 *
 * Methods the hardware layer CALLS are implemented here.
 * Hooks the UI calls are no-op stubs; override them after this file loads:
 *
 *   DPTKiosk.onContinue = function (styleId) { myRobot.queue(styleId); };
 *
 * Every method logs to the console so the wiring is visible without a robot.
 * ------------------------------------------------------------------------ */

window.DPTKiosk = {

  /* ---- called by the hardware layer ---- */

  setProgress: function (percent, stageLabel) {
    console.log('[DPTKiosk] setProgress', percent, stageLabel);
    if (window.Screens && Screens.Screen2) Screens.Screen2.setProgress(percent, stageLabel);
  },

  buildComplete: function () {
    console.log('[DPTKiosk] buildComplete');
    // a finished minifigure has taken one part from each magazine
    if (window.Admin) Admin.consume();
    if (window.Screens && Screens.Screen2) Screens.Screen2.complete();
  },

  buildError: function (message) {
    console.log('[DPTKiosk] buildError', message);
    if (window.Admin) Admin.noteError(message || 'build error');
    if (window.Screens && Screens.Screen2) Screens.Screen2.error(message);
  },

  reset: function () {
    console.log('[DPTKiosk] reset');
    App.fullReset();
  },

  /* ---- called by the UI, overridden by the hardware layer ---- */

  onSelectionChange: function (styleId) { console.log('[DPTKiosk] onSelectionChange', styleId); },
  onContinue:        function (styleId) { console.log('[DPTKiosk] onContinue', styleId); },
  onBuildStart:      function (styleId) { console.log('[DPTKiosk] onBuildStart', styleId); },
  onReset:           function ()        { console.log('[DPTKiosk] onReset'); },

  /* Staff panel -> hardware.  Override these the same way as the rest. */
  onRobotHome:       function ()        { console.log('[DPTKiosk] onRobotHome'); },
  onPause:           function (isPaused){ console.log('[DPTKiosk] onPause', isPaused); },

  /* ---- magazine stock, readable and writable by the hardware layer ----
     Read it before starting a build to check there is stock, and correct it
     with setMagazine if the arm detects a jam or a miscount. */
  magazines:    function ()        { return window.Admin ? Admin.counts() : null; },
  setMagazine:  function (key, n)  { if (window.Admin) Admin.setCount(key, n); },
  setRobotStatus: function (text)  { if (window.Admin) Admin.setRobotStatus(text); }
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  App.boot();
} else {
  document.addEventListener('DOMContentLoaded', function () { App.boot(); }, false);
}
