/* ---------------------------------------------------------------------------
 * js/admin.js  --  staff panel, reached by long-pressing the logo.
 *
 * Written for the person working the booth, not for an engineer.  They are
 * standing next to the arm with a visitor waiting, so every control here is
 * one tap, reads at arm's length, and cannot leave the kiosk in a state they
 * do not know how to get out of.  The panel never scrolls, for the same reason
 * the rest of the app does not.
 *
 * The one genuinely destructive control - moving the arm - is two-tap
 * confirmed, because a visitor may have their hand near the build area.
 *
 * Counts persist in localStorage so a mid-show reboot does not lose the tally.
 * Every read and write is guarded: Safari 9 in a locked-down configuration can
 * throw on access rather than merely returning null.
 * ------------------------------------------------------------------------ */

var Admin = (function () {

  var HOLD_MS = 1200;                 // long enough that a visitor never finds it
  var MAGS = [
    { key: 'heads',  label: 'HEADS'  },
    { key: 'torsos', label: 'TORSOS' },
    { key: 'legs',   label: 'LEGS'   }
  ];

  var host = null, built = false, open = false;
  var counts = null, buildsToday = 0, bootTime = new Date().getTime();
  var robotText = 'READY', lastError = '';
  var paused = false, pauseEl = null;
  var nodes = {};                     // live references for refresh()
  var confirmTimer = null, confirmArmed = false, idleTick = null;

  /* --- storage, all guarded ------------------------------------------------ */

  function store(k, v) {
    try { window.localStorage.setItem('dpt.' + k, String(v)); } catch (e) {}
  }
  function load(k, dflt) {
    try {
      var v = window.localStorage.getItem('dpt.' + k);
      return v === null ? dflt : v;
    } catch (e) { return dflt; }
  }

  function capacity() {
    return (window.DPT_CONFIG && DPT_CONFIG.MAGAZINE_CAPACITY) || 20;
  }

  function loadState() {
    counts = {};
    var i;
    for (i = 0; i < MAGS.length; i++) {
      var n = parseInt(load('mag.' + MAGS[i].key, capacity()), 10);
      counts[MAGS[i].key] = isNaN(n) ? capacity() : n;
    }
    // the build tally is per calendar day, so a multi-day show starts clean
    var today = new Date().toDateString();
    if (load('buildsDate', '') !== today) {
      buildsToday = 0;
      store('buildsDate', today);
      store('builds', 0);
    } else {
      buildsToday = parseInt(load('builds', 0), 10) || 0;
    }
  }

  /* --- DOM helpers --------------------------------------------------------- */

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function txt(e, s) { e.appendChild(document.createTextNode(s)); return e; }

  /* A button whose colour states are stacked layers, because background-color
     cannot be animated on this device - the same trick the rest of the app
     uses for its pressed shades. */
  function actionRow(label, sub, cls, onTap) {
    var row = el('div', 'ad-row' + (cls ? ' ' + cls : ''));
    var l = el('div', 'ad-row-label');
    txt(l, label);
    row.appendChild(l);
    if (sub) {
      var s = el('div', 'ad-row-sub');
      txt(s, sub);
      row.appendChild(s);
      row.__sub = s;
    }
    Tap.bind(row, onTap);
    return row;
  }

  /* iOS switch.  The knob translates and the two track colours cross-fade, so
     nothing but transform and opacity is ever animated. */
  function makeSwitch(on) {
    var sw = el('div', 'ad-sw' + (on ? ' is-on' : ''));
    sw.appendChild(el('div', 'ad-sw-off'));
    sw.appendChild(el('div', 'ad-sw-on'));
    sw.appendChild(el('div', 'ad-sw-knob'));
    return sw;
  }

  /* --- panel --------------------------------------------------------------- */

  function build() {
    if (built) return;
    built = true;
    host = document.getElementById('admin');
    host.innerHTML = '';

    /* header */
    var bar = el('div', 'ad-bar');
    var title = el('div', 'ad-title');
    txt(title, 'STAFF CONTROLS');
    bar.appendChild(title);
    var done = el('div', 'ad-done');
    txt(done, 'DONE');
    Tap.bind(done, hide);
    bar.appendChild(done);
    host.appendChild(bar);

    var body = el('div', 'ad-body');

    /* --- session stats --- */
    body.appendChild(txt(el('div', 'ad-head'), 'THIS SESSION'));
    var stats = el('div', 'ad-card ad-stats');
    nodes.builds = statCell(stats, 'BUILDS');
    nodes.uptime = statCell(stats, 'UPTIME');
    nodes.robot  = statCell(stats, 'ROBOT');
    nodes.robot.className = 'ad-stat-val ad-stat-text';
    body.appendChild(stats);

    /* --- magazines --- */
    body.appendChild(txt(el('div', 'ad-head'), 'MAGAZINES'));
    var card = el('div', 'ad-card');
    nodes.mag = {};
    var i;
    for (i = 0; i < MAGS.length; i++) {
      card.appendChild(magRow(MAGS[i], i === MAGS.length - 1));
    }
    body.appendChild(card);

    var all = el('div', 'ad-refill-all');
    txt(all, 'REFILL ALL MAGAZINES');
    Tap.bind(all, function () {
      var k;
      for (k = 0; k < MAGS.length; k++) setCount(MAGS[k].key, capacity());
    });
    body.appendChild(all);

    /* --- controls --- */
    body.appendChild(txt(el('div', 'ad-head'), 'CONTROLS'));
    var ctrl = el('div', 'ad-card');

    nodes.home = actionRow('SEND ROBOT HOME', 'Returns the arm to its home position',
                           'ad-danger', onHome);
    ctrl.appendChild(nodes.home);

    nodes.pause = actionRow('PAUSE KIOSK', 'Shows visitors a back-shortly screen', '', onPause);
    ctrl.appendChild(nodes.pause);

    var sim = actionRow('SIMULATED BUILDS', 'Off means the real arm is driving', 'ad-last', onSim);
    nodes.simSw = makeSwitch(!!(window.DPT_CONFIG && DPT_CONFIG.SIMULATE_BUILD));
    sim.appendChild(nodes.simSw);
    ctrl.appendChild(sim);
    body.appendChild(ctrl);

    /* --- reset --- */
    var reset = el('div', 'ad-reset');
    txt(reset, 'RESET SESSION');
    Tap.bind(reset, function () { hide(); App.fullReset(); });
    body.appendChild(reset);

    nodes.foot = el('div', 'ad-foot');
    body.appendChild(nodes.foot);

    host.appendChild(body);
  }

  function statCell(parent, label) {
    var c = el('div', 'ad-stat');
    var v = el('div', 'ad-stat-val');
    var l = el('div', 'ad-stat-lab');
    txt(l, label);
    c.appendChild(v);
    c.appendChild(l);
    parent.appendChild(c);
    return v;
  }

  function magRow(mag, last) {
    var row = el('div', 'ad-row ad-mag' + (last ? ' ad-last' : ''));
    var l = el('div', 'ad-row-label');
    txt(l, mag.label);
    row.appendChild(l);

    var count = el('div', 'ad-count');
    row.appendChild(count);

    var btn = el('div', 'ad-refill');
    txt(btn, 'REFILL');
    Tap.bind(btn, function () { setCount(mag.key, capacity()); });
    row.appendChild(btn);

    nodes.mag[mag.key] = { row: row, count: count };
    return row;
  }

  /* --- state changes ------------------------------------------------------- */

  function setCount(key, n) {
    if (n < 0) n = 0;
    counts[key] = n;
    store('mag.' + key, n);
    refresh();
  }

  /* One completed minifigure consumes one part from each magazine. */
  function consume() {
    var i;
    for (i = 0; i < MAGS.length; i++) {
      var k = MAGS[i].key;
      if (counts[k] > 0) setCount(k, counts[k] - 1);
    }
    buildsToday++;
    store('builds', buildsToday);
    refresh();
  }

  function lowest() {
    var i, m = 1e9;
    for (i = 0; i < MAGS.length; i++) m = Math.min(m, counts[MAGS[i].key]);
    return m;
  }

  function onHome() {
    if (!confirmArmed) {
      confirmArmed = true;
      Anim.addClass(nodes.home, 'is-confirm');
      if (nodes.home.__sub) {
        nodes.home.__sub.innerHTML = '';
        txt(nodes.home.__sub, 'TAP AGAIN TO CONFIRM - THE ARM WILL MOVE');
      }
      confirmTimer = window.setTimeout(disarm, 4000);
      return;
    }
    disarm();
    DPTKiosk.onRobotHome();
  }

  function disarm() {
    if (confirmTimer) { window.clearTimeout(confirmTimer); confirmTimer = null; }
    confirmArmed = false;
    if (!nodes.home) return;
    Anim.removeClass(nodes.home, 'is-confirm');
    if (nodes.home.__sub) {
      nodes.home.__sub.innerHTML = '';
      txt(nodes.home.__sub, 'Returns the arm to its home position');
    }
  }

  function onPause() {
    paused = !paused;
    if (paused) {
      if (!pauseEl) {
        pauseEl = el('div', 'ad-pause');
        var logo = el('div', 'attract-logo');
        var t1 = el('div', 'ad-pause-title');
        txt(t1, 'BACK SHORTLY');
        var t2 = el('div', 'ad-pause-sub');
        txt(t2, 'THIS DEMO IS PAUSED');
        pauseEl.appendChild(logo);
        pauseEl.appendChild(t1);
        pauseEl.appendChild(t2);
        document.body.appendChild(pauseEl);
      }
      Anim.addClass(pauseEl, 'is-on');
      hide();
    } else if (pauseEl) {
      Anim.removeClass(pauseEl, 'is-on');
    }
    DPTKiosk.onPause(paused);
    refresh();
  }

  function onSim() {
    if (!window.DPT_CONFIG) return;
    DPT_CONFIG.SIMULATE_BUILD = !DPT_CONFIG.SIMULATE_BUILD;
    if (DPT_CONFIG.SIMULATE_BUILD) Anim.addClass(nodes.simSw, 'is-on');
    else Anim.removeClass(nodes.simSw, 'is-on');
  }

  /* --- render -------------------------------------------------------------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function refresh() {
    if (!built) return;
    var i;

    nodes.builds.innerHTML = '';
    txt(nodes.builds, String(buildsToday));

    var secs = Math.floor((new Date().getTime() - bootTime) / 1000);
    nodes.uptime.innerHTML = '';
    txt(nodes.uptime, Math.floor(secs / 3600) + ':' + pad(Math.floor(secs / 60) % 60));

    nodes.robot.innerHTML = '';
    txt(nodes.robot, paused ? 'PAUSED' : robotText);

    for (i = 0; i < MAGS.length; i++) {
      var m = MAGS[i], n = counts[m.key], ref = nodes.mag[m.key];
      ref.count.innerHTML = '';
      txt(ref.count, String(n));
      Anim.removeClass(ref.row, 'is-low');
      Anim.removeClass(ref.row, 'is-empty');
      if (n === 0) Anim.addClass(ref.row, 'is-empty');
      else if (n <= 5) Anim.addClass(ref.row, 'is-low');
    }

    if (nodes.pause.__sub) {
      nodes.pause.__sub.innerHTML = '';
      txt(nodes.pause.__sub, paused ? 'Tap to put the kiosk back in service'
                                    : 'Shows visitors a back-shortly screen');
    }
    var lbl = nodes.pause.getElementsByTagName('div')[0];
    lbl.innerHTML = '';
    txt(lbl, paused ? 'RESUME KIOSK' : 'PAUSE KIOSK');

    nodes.foot.innerHTML = '';
    var v = (window.DPT_CONFIG && DPT_CONFIG.ASSET_VERSION) || '-';
    txt(nodes.foot, 'DPT KIOSK  ·  assets ' + v +
                    '  ·  ' + (lastError ? 'last error: ' + lastError : 'no errors'));
  }

  /* --- show / hide --------------------------------------------------------- */

  function show() {
    if (open) return;
    build();
    open = true;
    refresh();
    Anim.addClass(host, 'is-on');
    // the idle loop must not drag the attract screen over the top of staff
    if (idleTick) window.clearInterval(idleTick);
    idleTick = window.setInterval(refresh, 1000);   // keeps uptime ticking
  }

  function hide() {
    if (!open) return;
    open = false;
    disarm();
    Anim.removeClass(host, 'is-on');
    if (idleTick) { window.clearInterval(idleTick); idleTick = null; }
    App.resetIdle();
  }

  /* --- the long press ------------------------------------------------------ */

  /* Delegated so it keeps working when a screen rebuilds its logo, and armed
     from any of the marks: the select-screen wordmark, its badge, or the big
     build-screen badge.  Movement or an early release cancels. */
  function isHotspot(node) {
    while (node && node !== document.body) {
      var c = ' ' + (node.className || '') + ' ';
      if (c.indexOf(' s1-logo ') >= 0 || c.indexOf(' s1-badge ') >= 0 ||
          c.indexOf(' badge-timer ') >= 0 || c.indexOf(' attract-logo ') >= 0) return true;
      node = node.parentNode;
    }
    return false;
  }

  function wire() {
    var timer = null, sx = 0, sy = 0;

    function cancel() {
      if (timer) { window.clearTimeout(timer); timer = null; }
    }
    function down(e) {
      if (open) return;
      var t = e.touches ? e.touches[0] : e;
      if (!isHotspot(e.target)) return;
      sx = t.clientX; sy = t.clientY;
      cancel();
      timer = window.setTimeout(function () { timer = null; show(); }, HOLD_MS);
    }
    function move(e) {
      if (!timer) return;
      var t = e.touches ? e.touches[0] : e;
      if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) cancel();
    }

    var touch = Tap.hasTouch;
    document.addEventListener(touch ? 'touchstart' : 'mousedown', down, false);
    document.addEventListener(touch ? 'touchmove'  : 'mousemove', move, false);
    document.addEventListener(touch ? 'touchend'   : 'mouseup',   cancel, false);
    document.addEventListener('touchcancel', cancel, false);
  }

  function boot() {
    loadState();
    wire();
  }

  return {
    boot: boot, show: show, hide: hide, consume: consume,
    isOpen: function () { return open; },
    isPaused: function () { return paused; },
    setRobotStatus: function (s) { robotText = s || 'READY'; refresh(); },
    noteError: function (m) { lastError = m || 'unknown'; refresh(); },
    counts: function () {
      var out = {}, i;
      for (i = 0; i < MAGS.length; i++) out[MAGS[i].key] = counts[MAGS[i].key];
      return out;
    },
    setCount: setCount
  };
})();
