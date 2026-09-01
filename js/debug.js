/* ---------------------------------------------------------------------------
 * js/debug.js  --  on-device diagnostics.
 *
 * There is no way to attach Safari Web Inspector to an iOS 9 device from a
 * modern Mac, so the app has to be able to tell us what is wrong by itself.
 * Triple-tap the DPT logo to toggle the panel (only while DPT_CONFIG.DEBUG).
 *
 * When DEBUG is false nothing here builds anything and nothing is measured -
 * the whole module costs one boolean test.
 * ------------------------------------------------------------------------ */

var Debug = (function () {

  var on = !!(window.DPT_CONFIG && DPT_CONFIG.DEBUG);
  var panel = null;
  var lines = [];          // asset + runtime log lines
  var fps = 0, frames = 0, lastSample = 0, rafId = null;
  var open = false;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  /* --- feature probes ---------------------------------------------------- */

  function supportsFlex() {
    var d = document.createElement('div');
    d.style.display = '-webkit-flex';
    if (d.style.display === '-webkit-flex') return true;
    d.style.display = 'flex';
    return d.style.display === 'flex';
  }

  function supportsTransform3d() {
    var d = document.createElement('div');
    return ('webkitPerspective' in d.style) || ('perspective' in d.style);
  }

  function supportsCustomProps() {
    return !!(window.CSS && window.CSS.supports && window.CSS.supports('--probe', '0'));
  }

  function probes() {
    return [
      ['CSS.supports',     !!(window.CSS && window.CSS.supports)],
      ['flexbox',          supportsFlex()],
      ['transform3d',      supportsTransform3d()],
      ['CSS custom props', supportsCustomProps()],
      ['requestAnimFrame', !!window.requestAnimationFrame],
      ['classList',        'classList' in document.documentElement],
      ['Promise',          typeof window.Promise === 'function'],
      ['touch events',     Tap.hasTouch]
    ];
  }

  /* --- fps meter --------------------------------------------------------- */

  function tick(now) {
    if (!open) { rafId = null; return; }
    frames++;
    if (!lastSample) lastSample = now;
    if (now - lastSample >= 500) {
      fps = Math.round(frames * 1000 / (now - lastSample));
      frames = 0; lastSample = now;
      render();
    }
    rafId = window.requestAnimationFrame(tick);
  }

  function startFps() {
    if (!window.requestAnimationFrame || rafId) return;
    frames = 0; lastSample = 0;
    rafId = window.requestAnimationFrame(tick);
  }

  /* --- rendering --------------------------------------------------------- */

  function render() {
    if (!on || !panel || !open) return;
    var html = [];
    html.push('<span class="debug-hint">-- DPT KIOSK DEBUG -- triple-tap logo to close --</span>');
    html.push('fps      ' + (fps || '--'));
    html.push('viewport ' + window.innerWidth + ' x ' + window.innerHeight +
              '   dpr ' + (window.devicePixelRatio || 1));
    html.push('layout   ' + DPT_CONFIG.LAYOUT +
              '   reduced-motion ' + (DPT_CONFIG.REDUCED_MOTION ? 'on' : 'off') +
              '   simulate ' + (DPT_CONFIG.SIMULATE_BUILD ? 'on' : 'off'));
    html.push('ua       ' + esc(navigator.userAgent));
    html.push('');
    var p = probes(), i;
    for (i = 0; i < p.length; i++) {
      html.push((p[i][1] ? '<span class="debug-ok">  PASS</span>' :
                           '<span class="debug-bad">  FAIL</span>') + '  ' + p[i][0]);
    }
    if (lines.length) {
      html.push('');
      for (i = Math.max(0, lines.length - 10); i < lines.length; i++) {
        html.push(esc(lines[i]));
      }
    }
    panel.innerHTML = html.join('\n');
  }

  /* --- public ------------------------------------------------------------ */

  function log(msg) {
    if (!on) return;
    lines.push(msg);
    render();
  }

  /* Report any image that fails to load, by filename.  With 32 hair frames a
     single typo in the manifest otherwise just yields a mysteriously empty
     card, which is impossible to diagnose without a console. */
  function trackImage(url, img) {
    if (!on) return;
    img.onerror = function () { log('ASSET FAIL  ' + url); };
  }

  function toggle() {
    if (!on || !panel) return;
    open = !open;
    if (open) { panel.className = 'debug is-open'; startFps(); render(); }
    else { panel.className = 'debug'; }
  }

  /* Triple-tap within 800ms on the given element toggles the panel. */
  function wireToggle(el) {
    if (!on || !el) return;
    var taps = 0, timer = null;
    Tap.bind(el, {
      tap: function () {
        taps++;
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(function () { taps = 0; }, 800);
        if (taps >= 3) { taps = 0; toggle(); }
      }
    });
  }

  function init() {
    if (!on) return;
    panel = document.getElementById('debug');
    log('boot ' + new Date().toISOString());
  }

  return {
    enabled: on,
    init: init,
    log: log,
    trackImage: trackImage,
    toggle: toggle,
    wireToggle: wireToggle
  };
})();
