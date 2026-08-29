/* ---------------------------------------------------------------------------
 * js/screens.js  --  screen builders.
 *
 * Every style on screen 1 comes from HAIR_STYLES in data/hair.js.  Nothing
 * here (or in index.html, or the CSS) names an individual style, so adding a
 * ninth hairstyle is a one-file change.
 * ------------------------------------------------------------------------ */

var Screens = (function () {

  var CHECK_SVG =
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M3 8.4l3.2 3.2L13 4.9" fill="none" stroke="#FFFFFF" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  /* Paths come from Assets so the placeholder/photo switch lives in one place.
     A failed load still falls back to the swatch, so a typo in the manifest
     shows as a plain colour rather than an empty card. */
  function placeholderUrl(style) { return Assets.placeholder(style); }

  function applyThumb(node, style) {
    var primary = Assets.thumb(style);
    var probe = new Image();
    probe.onload = function () {
      node.style.backgroundImage = 'url(' + primary + ')';
    };
    probe.onerror = function () {
      Debug.log('ASSET FAIL  ' + primary + '  -> placeholder');
      node.style.backgroundImage = 'url(' + placeholderUrl(style) + ')';
    };
    probe.src = primary;
  }

  /* --------------------------- SCREEN 1 --------------------------------- */

  var Screen1 = (function () {
    var cards = [];              // { style, slot, card, thumb }
    var selectedId = null;
    var onSelect = null;
    var cardSpin = null;         // turntable running inside the selected card
    var spinOk = {};             // per-style: are the card-scale frames present?

    function build(handler) {
      onSelect = handler;
      var grid = document.getElementById('hair-grid');
      grid.innerHTML = '';
      cards = [];

      var i;
      for (i = 0; i < HAIR_STYLES.length; i++) {
        (function (style) {
          var slot = el('div', 'card-slot enter-init');
          var card = el('div', 'card');

          var wash  = el('div', 'card-wash');
          var thumb = el('div', 'card-thumb');
          var name  = el('div', 'card-name');
          var check = el('div', 'card-check');
          var ring  = el('div', 'card-ring');

          name.appendChild(document.createTextNode(style.name));
          check.innerHTML = CHECK_SVG;
          applyThumb(thumb, style);

          card.appendChild(wash);
          card.appendChild(thumb);
          card.appendChild(name);
          card.appendChild(check);
          card.appendChild(ring);   // last so the ring draws over the content
          slot.appendChild(card);
          grid.appendChild(slot);

          Tap.bind(card, {
            press: function () {
              Anim.promote(slot);
              Anim.addClass(card, 'is-pressed');
            },
            release: function () {
              Anim.removeClass(card, 'is-pressed');
              Anim.unpromoteAfter(slot, 460);
            },
            tap: function () { if (onSelect) onSelect(style.id); }
          });

          cards.push({ style: style, slot: slot, card: card, thumb: thumb });
        })(HAIR_STYLES[i]);
      }
    }

    /* Stop and tear down the turntable running in whichever card had it, and
       give that card its static thumbnail back. */
    function stopCardSpin() {
      if (!cardSpin) return;
      var host = cardSpin.host;
      cardSpin.spin.destroy();
      cardSpin = null;
      if (host) host.style.backgroundImage = 'url(' + Assets.thumb(host.__style) + ')';
    }

    /* Run the turntable inside the selected card's 88px tile.  Only ever one
       card at a time, so this costs two composited layers - the same budget as
       the attract loop.  Skipped when the card-scale frames are absent (a
       hand-supplied photo set may only have the four full-size angles). */
    function startCardSpin(entry) {
      if (Anim.reduced) return;
      var probe = new Image();
      probe.onload = function () {
        spinOk[entry.style.id] = true;
        if (selectedId !== entry.style.id || cardSpin) return;
        entry.thumb.__style = entry.style;
        entry.thumb.style.backgroundImage = 'none';
        var tt = Anim.Turntable(entry.thumb, { thumbScale: true });
        tt.setStyle(entry.style);
        tt.start();
        cardSpin = { spin: tt, host: entry.thumb };
      };
      probe.onerror = function () {
        spinOk[entry.style.id] = false;
        Debug.log('no card-scale frames for ' + entry.style.id + ' - card stays static');
      };
      // Probe the sheet itself: it confirms the art exists AND leaves it
      // decoded, so the first painted frame is instant rather than blank.
      probe.src = Assets.sprite(entry.style, true).url;
    }

    /* The outgoing card's ring/check leave on the 180ms sharp curve while the
       incoming card's spring in over 320ms - they overlap, so there is never a
       frame with nothing selected. */
    function setSelected(id) {
      if (id === selectedId) return;
      stopCardSpin();
      selectedId = id;
      var i, chosen = null;
      for (i = 0; i < cards.length; i++) {
        var c = cards[i];
        var want = (c.style.id === id);
        if (want) chosen = c;
        if (want === Anim.hasClass(c.card, 'is-selected')) continue;
        Anim.promote(c.slot);
        if (want) Anim.addClass(c.card, 'is-selected');
        else Anim.removeClass(c.card, 'is-selected');
        Anim.unpromoteAfter(c.slot, 460);
      }
      // let the selection spring settle before the rotation starts
      if (chosen && spinOk[id] !== false) {
        window.setTimeout(function () {
          if (selectedId === id && !cardSpin) startCardSpin(chosen);
        }, 340);
      }
    }

    /* The card keeps spinning behind a hidden screen otherwise - wasted work on
       an A5, and it blows the attract loop's two-layer budget. */
    function pauseSpin() { if (cardSpin) cardSpin.spin.stop(); }
    function resumeSpin() { if (cardSpin && !Anim.reduced) cardSpin.spin.start(); }

    function getSelected() { return selectedId; }

    /* App entrance: logo drifts down, then stepper, headline, cards 40ms apart,
       then the button and helper.  Last frame lands under 900ms. */
    function entrance() {
      var items = [
        { el: document.getElementById('logo-select'),    delay: 0 },
        { el: document.getElementById('stepper-select'), delay: 70 },
        { el: document.getElementById('headline-select'),delay: 130 }
      ];
      var i;
      for (i = 0; i < cards.length; i++) {
        items.push({ el: cards[i].slot, delay: 190 + i * 40 });
      }
      var after = 190 + cards.length * 40;
      items.push({ el: document.getElementById('btn-wrap-select'), delay: after + 20 });
      items.push({ el: document.getElementById('helper-select'),   delay: after + 55 });
      Anim.enter(items);
    }

    /* Put the screen back in its pre-entrance state so a kiosk reset replays
       the whole animation rather than snapping. */
    function reset() {
      stopCardSpin();
      var nodes = [
        document.getElementById('logo-select'),
        document.getElementById('stepper-select'),
        document.getElementById('headline-select'),
        document.getElementById('btn-wrap-select'),
        document.getElementById('helper-select')
      ];
      var i;
      for (i = 0; i < nodes.length; i++) {
        Anim.removeClass(nodes[i], 'enter-run');
        Anim.addClass(nodes[i], i === 0 ? 'enter-init-logo' : 'enter-init');
      }
      for (i = 0; i < cards.length; i++) {
        Anim.removeClass(cards[i].slot, 'enter-run');
        Anim.addClass(cards[i].slot, 'enter-init');
      }
    }

    return {
      build: build,
      setSelected: setSelected,
      getSelected: getSelected,
      entrance: entrance,
      reset: reset,
      pauseSpin: pauseSpin,
      resumeSpin: resumeSpin
    };
  })();


  /* --------------------- SCREEN 1, LAYOUT OPTION B ---------------------- */
  /* Hero turntable + a swipeable row of circular chips.  Not the default -
     it exists so the two layouts can be compared on the real device. */

  var Screen1B = (function () {
    var chips = [];              // { style, chip, disc }
    var selectedId = null;
    var onSelect = null;
    var hero = null, heroName = null, track = null, viewport = null;
    var trackX = 0, minX = 0;

    function build(handler) {
      onSelect = handler;
      var host = document.getElementById('screen-select');
      var oldCol = host.querySelector('.s1-col');

      var col = el('div', 's1b-col');

      // reuse the real nodes so both layouts share identical styling and ids
      col.appendChild(document.getElementById('logo-select'));
      col.appendChild(document.getElementById('stepper-select'));
      col.appendChild(document.getElementById('headline-select'));

      hero = el('div', 'hero enter-init');
      heroName = el('div', 'hero-name enter-init');
      col.appendChild(hero);
      col.appendChild(heroName);

      viewport = el('div', 'chips-viewport');
      track = el('div', 'chips-track');
      viewport.appendChild(track);
      col.appendChild(viewport);

      var i;
      for (i = 0; i < HAIR_STYLES.length; i++) {
        (function (style) {
          var chip = el('div', 'chip enter-init');
          var disc = el('div', 'chip-disc');
          var wash = el('div', 'chip-wash');
          var img  = el('div', 'chip-img');
          var ring = el('div', 'chip-ring');
          var lab  = el('div', 'chip-label');
          lab.appendChild(document.createTextNode(style.name));
          applyThumb(img, style);
          disc.appendChild(wash);
          disc.appendChild(img);
          disc.appendChild(ring);
          chip.appendChild(disc);
          chip.appendChild(lab);
          track.appendChild(chip);

          Tap.bind(chip, {
            press:   function () { Anim.addClass(chip, 'is-pressed'); },
            release: function () { Anim.removeClass(chip, 'is-pressed'); },
            tap:     function () { if (onSelect) onSelect(style.id); }
          });

          chips.push({ style: style, chip: chip, disc: disc });
        })(HAIR_STYLES[i]);
      }

      col.appendChild(el('div', 's1-spacer'));
      col.appendChild(document.getElementById('btn-wrap-select'));
      col.appendChild(document.getElementById('helper-select'));

      if (oldCol && oldCol.parentNode) oldCol.parentNode.removeChild(oldCol);
      host.appendChild(col);

      // track width: n * 88 + (n-1) * 16
      var w = HAIR_STYLES.length * 88 + (HAIR_STYLES.length - 1) * 16;
      track.style.width = w + 'px';
      minX = Math.min(0, 672 - w);

      wireDrag();
      spin = Anim.Turntable(hero);
    }

    /* The document swallows touchmove to kill rubber-banding, so this row is
       dragged by hand: the track is translated 1:1 with the finger and eased
       back inside its bounds on release. */
    function wireDrag() {
      var dragging = false, startX = 0, startTx = 0;

      function pt(e) {
        if (e.touches && e.touches.length) return e.touches[0];
        if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
        return e;
      }
      function apply() {
        track.style.webkitTransform = 'translate3d(' + trackX + 'px,0,0)';
        track.style.transform = 'translate3d(' + trackX + 'px,0,0)';
      }
      function down(e) {
        dragging = true;
        startX = pt(e).clientX;
        startTx = trackX;
        Anim.removeClass(track, 'is-settling');
        Anim.promote(track);
      }
      function move(e) {
        if (!dragging) return;
        trackX = startTx + (pt(e).clientX - startX);
        // rubber-band a little past the ends, then snap back on release
        if (trackX > 0) trackX = trackX * 0.35;
        if (trackX < minX) trackX = minX + (trackX - minX) * 0.35;
        apply();
      }
      function up() {
        if (!dragging) return;
        dragging = false;
        if (trackX > 0) trackX = 0;
        if (trackX < minX) trackX = minX;
        Anim.addClass(track, 'is-settling');
        apply();
        window.setTimeout(function () {
          Anim.removeClass(track, 'is-settling');
          Anim.removeClass(track, 'is-animating');
        }, 340);
      }

      if (Tap.hasTouch) {
        viewport.addEventListener('touchstart', down, false);
        viewport.addEventListener('touchmove', move, false);
        viewport.addEventListener('touchend', up, false);
        viewport.addEventListener('touchcancel', up, false);
      } else {
        viewport.addEventListener('mousedown', down, false);
        viewport.addEventListener('mousemove', move, false);
        viewport.addEventListener('mouseup', up, false);
        viewport.addEventListener('mouseleave', up, false);
      }
    }

    var spin = null;

    function setSelected(id) {
      if (id === selectedId) return;
      selectedId = id;
      var i, style = null;
      for (i = 0; i < chips.length; i++) {
        var want = (chips[i].style.id === id);
        if (want) style = chips[i].style;
        if (want) Anim.addClass(chips[i].chip, 'is-selected');
        else Anim.removeClass(chips[i].chip, 'is-selected');
      }
      if (!style) return;
      heroName.innerHTML = '';
      heroName.appendChild(document.createTextNode(style.name));
      if (spin) { spin.setStyle(style); spin.start(); }
      scrollChipIntoView(id);
    }

    function scrollChipIntoView(id) {
      var i, idx = -1;
      for (i = 0; i < chips.length; i++) if (chips[i].style.id === id) idx = i;
      if (idx < 0) return;
      var left = idx * (88 + 16);
      var want = trackX;
      if (left + trackX < 0) want = -left;
      else if (left + 88 + trackX > 672) want = 672 - left - 88;
      if (want > 0) want = 0;
      if (want < minX) want = minX;
      if (want === trackX) return;
      trackX = want;
      Anim.addClass(track, 'is-settling');
      track.style.webkitTransform = 'translate3d(' + trackX + 'px,0,0)';
      track.style.transform = 'translate3d(' + trackX + 'px,0,0)';
      window.setTimeout(function () { Anim.removeClass(track, 'is-settling'); }, 340);
    }

    /* The card keeps spinning behind a hidden screen otherwise - wasted work on
       an A5, and it blows the attract loop's two-layer budget. */
    function pauseSpin() { if (cardSpin) cardSpin.spin.stop(); }
    function resumeSpin() { if (cardSpin && !Anim.reduced) cardSpin.spin.start(); }

    function getSelected() { return selectedId; }

    function entrance() {
      var items = [
        { el: document.getElementById('logo-select'),     delay: 0 },
        { el: document.getElementById('stepper-select'),  delay: 70 },
        { el: document.getElementById('headline-select'), delay: 130 },
        { el: hero,     delay: 190 },
        { el: heroName, delay: 240 }
      ];
      var i;
      for (i = 0; i < chips.length; i++) items.push({ el: chips[i].chip, delay: 290 + i * 40 });
      var after = 290 + chips.length * 40;
      items.push({ el: document.getElementById('btn-wrap-select'), delay: after + 20 });
      items.push({ el: document.getElementById('helper-select'),   delay: after + 55 });
      Anim.enter(items);
    }

    function reset() {
      var nodes = [
        document.getElementById('logo-select'),
        document.getElementById('stepper-select'),
        document.getElementById('headline-select'),
        hero, heroName,
        document.getElementById('btn-wrap-select'),
        document.getElementById('helper-select')
      ];
      var i;
      for (i = 0; i < nodes.length; i++) {
        Anim.removeClass(nodes[i], 'enter-run');
        Anim.addClass(nodes[i], i === 0 ? 'enter-init-logo' : 'enter-init');
      }
      for (i = 0; i < chips.length; i++) {
        Anim.removeClass(chips[i].chip, 'enter-run');
        Anim.addClass(chips[i].chip, 'enter-init');
      }
    }

    return {
      build: build, setSelected: setSelected, getSelected: getSelected,
      entrance: entrance, reset: reset,
      // layout B's turntable is the hero, so pause/resume drive that instead
      pauseSpin: function () { if (spin) spin.stop(); },
      resumeSpin: function () { if (spin && !Anim.reduced) spin.start(); }
    };
  })();


  /* ------------------------- shared chrome ------------------------------ */

  var ARM_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">' +
    '  <!-- Rainbow Robotics cobot, drawn from the booth cell photo: light grey' +
    '       tubular links with dark joint shrouds, not a charcoal industrial arm.' +
    '       Outlined so the light body still reads on the #FAFAFA ground. -->' +
    '  <g stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '' +
    '    <!-- link outlines -->' +
    '    <g stroke="#1C1C1E" stroke-width="34"><path d="M120 188V150"/></g>' +
    '    <g stroke="#1C1C1E" stroke-width="31"><path d="M120 150L168 88"/></g>' +
    '    <g stroke="#1C1C1E" stroke-width="28"><path d="M168 88L84 60"/></g>' +
    '    <g stroke="#1C1C1E" stroke-width="23"><path d="M84 60L64 96"/></g>' +
    '' +
    '    <!-- light tube bodies -->' +
    '    <g stroke="#E6E6EA" stroke-width="27"><path d="M120 188V150"/></g>' +
    '    <g stroke="#E6E6EA" stroke-width="24"><path d="M120 150L168 88"/></g>' +
    '    <g stroke="#E6E6EA" stroke-width="21"><path d="M168 88L84 60"/></g>' +
    '    <g stroke="#E6E6EA" stroke-width="16"><path d="M84 60L64 96"/></g>' +
    '' +
    '    <!-- dark joint shrouds -->' +
    '    <circle cx="120" cy="150" r="20" fill="#33333A" stroke="#1C1C1E" stroke-width="2.5"/>' +
    '    <circle cx="168" cy="88"  r="18" fill="#33333A" stroke="#1C1C1E" stroke-width="2.5"/>' +
    '    <circle cx="84"  cy="60"  r="15" fill="#33333A" stroke="#1C1C1E" stroke-width="2.5"/>' +
    '    <circle cx="64"  cy="96"  r="12" fill="#33333A" stroke="#1C1C1E" stroke-width="2.5"/>' +
    '' +
    '    <!-- base: pedestal, collar, table mount -->' +
    '    <rect x="98" y="180" width="44" height="26" rx="8" fill="#33333A" stroke="#1C1C1E" stroke-width="2.5"/>' +
    '    <rect x="88" y="204" width="64" height="12" rx="5" fill="#1C1C1E"/>' +
    '    <rect x="58" y="216" width="124" height="12" rx="6" fill="#1C1C1E"/>' +
    '' +
    '    <!-- tool flange + gripper, burgundy where the work happens -->' +
    '    <path d="M64 96L58 116" stroke="#1C1C1E" stroke-width="17"/>' +
    '    <path d="M64 96L58 116" stroke="#E6E6EA" stroke-width="11"/>' +
    '    <!-- SCHUNK Co-act EGP-C 40. Navy shell with a white panel inset into it:' +
    '         navy frames the top, both tapered flanks, and a band across the bottom' +
    '         just above the jaws, the way the real housing does. -->' +
    '    <rect x="38" y="112" width="42" height="14" rx="6" fill="#2A3552" stroke="#1C1C1E" stroke-width="2"/>' +
    '    <path d="M42 124h34l-5 28H47z" fill="#2A3552" stroke="#1C1C1E" stroke-width="2" stroke-linejoin="round"/>' +
    '    <path d="M48 130h22l-4 16H52z" fill="#E9E9EC"/>' +
    '    <rect x="48" y="152" width="9" height="13" rx="2" fill="#C6A434" stroke="#1C1C1E" stroke-width="1.5"/>' +
    '    <rect x="61" y="152" width="9" height="13" rx="2" fill="#C6A434" stroke="#1C1C1E" stroke-width="1.5"/>' +
    '  </g>' +
    '</svg>';

  /* The same arm re-coloured for the maroon badge: near-white tubes, grey
     shrouds, white gripper, outlined in a dark maroon so overlapping shapes
     separate without going black. */
  var ARM_LIGHT =
    '<g stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '    <g stroke="#4E0010" stroke-width="34"><path d="M120 188V150"/></g>' +
    '    <g stroke="#4E0010" stroke-width="31"><path d="M120 150L168 88"/></g>' +
    '    <g stroke="#4E0010" stroke-width="28"><path d="M168 88L84 60"/></g>' +
    '    <g stroke="#4E0010" stroke-width="23"><path d="M84 60L64 96"/></g>' +
    '    <g stroke="#F2F2F4" stroke-width="27"><path d="M120 188V150"/></g>' +
    '    <g stroke="#F2F2F4" stroke-width="24"><path d="M120 150L168 88"/></g>' +
    '    <g stroke="#F2F2F4" stroke-width="21"><path d="M168 88L84 60"/></g>' +
    '    <g stroke="#F2F2F4" stroke-width="16"><path d="M84 60L64 96"/></g>' +
    '    <circle cx="120" cy="150" r="20" fill="#9A9AA2" stroke="#4E0010" stroke-width="2.5"/>' +
    '    <circle cx="168" cy="88"  r="18" fill="#9A9AA2" stroke="#4E0010" stroke-width="2.5"/>' +
    '    <circle cx="84"  cy="60"  r="15" fill="#9A9AA2" stroke="#4E0010" stroke-width="2.5"/>' +
    '    <circle cx="64"  cy="96"  r="12" fill="#9A9AA2" stroke="#4E0010" stroke-width="2.5"/>' +
    '    <rect x="98" y="180" width="44" height="26" rx="8" fill="#9A9AA2" stroke="#4E0010" stroke-width="2.5"/>' +
    '    <rect x="88" y="204" width="64" height="12" rx="5" fill="#E6E6EA"/>' +
    '    <rect x="58" y="216" width="124" height="12" rx="6" fill="#E6E6EA"/>' +
    '    <path d="M64 96L58 116" stroke="#4E0010" stroke-width="17"/>' +
    '    <path d="M64 96L58 116" stroke="#F2F2F4" stroke-width="11"/>' +
    '    <!-- SCHUNK Co-act EGP-C 40, lifted for the maroon ground -->' +
    '    <rect x="38" y="112" width="42" height="14" rx="6" fill="#3B4C74" stroke="#D8D8DE" stroke-width="1.5"/>' +
    '    <path d="M42 124h34l-5 28H47z" fill="#3B4C74" stroke="#D8D8DE" stroke-width="1.5" stroke-linejoin="round"/>' +
    '    <path d="M48 130h22l-4 16H52z" fill="#F2F2F4"/>' +
    '    <rect x="48" y="152" width="9" height="13" rx="2" fill="#D2B142" stroke="#D8D8DE" stroke-width="1.2"/>' +
    '    <rect x="61" y="152" width="9" height="13" rx="2" fill="#D2B142" stroke="#D8D8DE" stroke-width="1.2"/>' +
    '  </g>';

  /* The three steps are the three screens, and each label is a word lifted
     from that screen's own headline - CHOOSE YOUR HAIR, BUILD YOUR MINIFIGURE,
     COLLECT FROM THE TRAY.  So the stepper reads as a map of the flow rather
     than as decoration, and somebody walking up to the kiosk learns the whole
     interaction from it without being told. */
  var STEP_NAMES = ['CHOOSE', 'BUILD', 'COLLECT'];

  /* states: array of 'done' | 'active' | '' per step */
  function buildStepper(states) {
    var wrap = el('div', 'stepper');
    var i;
    for (i = 0; i < STEP_NAMES.length; i++) {
      // the connector fills in behind a completed step, so progress reads as
      // one continuous line rather than three unrelated dots
      if (i > 0) {
        wrap.appendChild(el('div', 'step-bar' +
          (states[i - 1] === 'done' ? ' step-bar-done' : '')));
      }
      var cls = 'step';
      if (states[i] === 'done') cls += ' step-done';
      if (states[i] === 'active') cls += ' step-active';
      var step = el('div', cls);
      var dot = el('div', 'step-dot');
      var num = el('span', 'step-num');
      num.appendChild(document.createTextNode(states[i] === 'done' ? '\u2713' : String(i + 1)));
      dot.appendChild(num);
      var lab = el('div', 'step-label');
      lab.appendChild(document.createTextNode(STEP_NAMES[i]));
      step.appendChild(dot);
      step.appendChild(lab);
      wrap.appendChild(step);
    }
    return wrap;
  }

  function buildHeadline(small, big, label) {
    var h = el('div', 'headline');
    var a = el('div', 'h-small');
    a.appendChild(document.createTextNode(small));
    var b = el('div', 'h-big');
    b.appendChild(document.createTextNode(big));
    h.appendChild(a);
    h.appendChild(b);
    // screens 2 and 3 carry the label device too, so the block still sums to
    // 140px and all three screens share one headline rhythm
    var r = el('div', 'h-rule');
    r.appendChild(el('span', 'rule-line'));
    if (label) {
      var lt = el('span', 'rule-text');
      lt.appendChild(document.createTextNode(label));
      r.appendChild(lt);
    }
    h.appendChild(r);
    return h;
  }

  function buildButton(label, cls) {
    var wrap = el('div', 'btn-wrap');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls || 'btn-primary';
    var lab = el('span', 'btn-label');
    lab.appendChild(document.createTextNode(label));
    btn.appendChild(lab);
    var press = el('span', 'btn-press');
    btn.appendChild(press);
    wrap.appendChild(btn);
    wrap.btn = btn;
    return wrap;
  }

  /* --------------------------- SCREEN 2 --------------------------------- */

  var Screen2 = (function () {
    var host, ringFill, pctEl, lineA, lineB, lineTop, errBox, errMsg, armWrap;
    var C = 0;                       // ring circumference
    var built = false;
    var currentLabel = '';

    var STAGES = ['Preparing components', 'Installing hair', 'Finalizing build'];

    function build() {
      if (built) return;
      built = true;
      host = document.getElementById('screen-build');
      host.innerHTML = '';
      var col = el('div', 's2-col');

      // no header mark on this screen - the big badge in the middle IS the mark.
      // A spacer above as well as below centres the whole block optically.
      col.appendChild(el('div', 's1-spacer'));
      col.appendChild(buildStepper(['done', 'active', '']));
      col.appendChild(buildHeadline('BUILDING YOUR', 'MINIFIGURE'));

      var stage = el('div', 'build-stage');
      var R = 118, CX = 180;
      C = 2 * Math.PI * R;

      /* One mark, doing all the work: the badge is the logo, its reticle circle
         is the progress bar, and the robot sits inside the crosshairs. The
         crosshair runs behind the arm on purpose - the thing being built is
         literally in the cross hairs. */
      var svg = '<svg class="badge-timer" width="480" height="480" viewBox="0 0 360 360">' +
        '<rect width="360" height="360" rx="81" fill="#7E001B"/>' +
        '<g fill="none" stroke="#FFFFFF" stroke-linecap="round">' +
          '<path d="M180 38v284M38 180h284" stroke-width="8" opacity="0.40"/>' +
          '<circle class="ring-track" cx="' + CX + '" cy="' + CX + '" r="' + R + '" stroke-width="11"/>' +
          '<g transform="rotate(-90 ' + CX + ' ' + CX + ')">' +
            '<circle class="ring-fill" cx="' + CX + '" cy="' + CX + '" r="' + R + '" ' +
            'stroke-width="11" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/>' +
          '</g>' +
        '</g>' +
        '<svg class="badge-arm" x="90" y="76" width="196" height="196" viewBox="0 0 240 240">' +
        ARM_LIGHT + '</svg></svg>';
      stage.innerHTML = svg;
      armWrap = stage.querySelector('.badge-arm');
      col.appendChild(stage);
      ringFill = stage.querySelector('.ring-fill');

      var label = el('div', 'stage-label');
      lineA = el('div', 'stage-line');
      lineB = el('div', 'stage-line');
      label.appendChild(lineA);
      label.appendChild(lineB);
      lineTop = lineA;
      col.appendChild(label);

      pctEl = el('div', 'build-pct');
      pctEl.appendChild(document.createTextNode('0%'));
      col.appendChild(pctEl);

      col.appendChild(el('div', 's1-spacer'));

      var note = el('div', 'build-note');
      note.appendChild(document.createTextNode('Please leave the tablet in place during the build.'));
      col.appendChild(note);

      host.appendChild(col);

      errBox = el('div', 'build-error');
      errBox.appendChild(el('div', 's1-badge'));
      errBox.appendChild(el('div', 's1-spacer'));

      var mark = el('div', 'err-mark');
      mark.innerHTML =
        '<svg width="24" height="44" viewBox="0 0 24 44">' +
        '<path d="M12 4v24" stroke="#7E001B" stroke-width="7" stroke-linecap="round" fill="none"/>' +
        '<circle cx="12" cy="39" r="4" fill="#7E001B"/></svg>';
      errBox.appendChild(mark);

      var et = el('div', 'err-title');
      et.appendChild(document.createTextNode('BUILD PAUSED'));
      errMsg = el('div', 'err-msg');
      errBox.appendChild(et);
      errBox.appendChild(errMsg);

      errBox.appendChild(el('div', 's1-spacer'));

      var retry = buildButton('START OVER', 'btn-primary');
      Tap.bind(retry.btn, {
        press: function () { Anim.addClass(retry.btn, 'is-pressed'); },
        release: function () { Anim.removeClass(retry.btn, 'is-pressed'); },
        tap: function () { DPTKiosk.reset(); }
      });
      errBox.appendChild(retry);
      host.appendChild(errBox);
    }

    /* Cross-fade the stage label: outgoing rises and fades, incoming rises in. */
    function setStage(text) {
      if (text === currentLabel) return;
      currentLabel = text;
      var incoming = (lineTop === lineA) ? lineB : lineA;
      var outgoing = lineTop;
      incoming.innerHTML = '';
      incoming.appendChild(document.createTextNode(text));
      Anim.removeClass(incoming, 'is-out');
      Anim.reflow(incoming);
      Anim.addClass(incoming, 'is-on');
      Anim.removeClass(outgoing, 'is-on');
      Anim.addClass(outgoing, 'is-out');
      lineTop = incoming;
    }

    function setProgress(percent, stageLabel) {
      build();
      var p = Math.max(0, Math.min(100, Number(percent) || 0));
      if (ringFill) ringFill.setAttribute('stroke-dashoffset', String(C * (1 - p / 100)));
      if (pctEl) { pctEl.innerHTML = ''; pctEl.appendChild(document.createTextNode(Math.round(p) + '%')); }
      setStage(stageLabel || stageFor(p));
    }

    function stageFor(p) {
      if (p < 34) return STAGES[0];
      if (p < 76) return STAGES[1];
      return STAGES[2];
    }

    function reset() {
      build();
      currentLabel = '';
      if (ringFill) ringFill.setAttribute('stroke-dashoffset', String(C));
      if (pctEl) { pctEl.innerHTML = ''; pctEl.appendChild(document.createTextNode('0%')); }
      Anim.removeClass(lineA, 'is-on'); Anim.removeClass(lineA, 'is-out');
      Anim.removeClass(lineB, 'is-on'); Anim.removeClass(lineB, 'is-out');
      Anim.removeClass(errBox, 'is-on');
    }

    function error(message) {
      build();
      errMsg.innerHTML = '';
      errMsg.appendChild(document.createTextNode(message || 'The arm stopped unexpectedly. A member of staff can restart the build.'));
      Anim.addClass(errBox, 'is-on');
    }

    function complete() { App.goDone(); }

    return {
      build: build, setProgress: setProgress, reset: reset,
      error: error, complete: complete, STAGES: STAGES
    };
  })();

  /* --------------------------- SCREEN 3 --------------------------------- */

  var Screen3 = (function () {
    var host, figure, tickPath, pulse, nameEl, spin;
    var built = false, TICK_LEN = 60;

    function build() {
      if (built) return;
      built = true;
      host = document.getElementById('screen-done');
      host.innerHTML = '';
      var col = el('div', 's3-col');

      col.appendChild(el('div', 's1-badge'));
      col.appendChild(buildStepper(['done', 'done', 'active']));
      col.appendChild(buildHeadline('YOUR MINIFIGURE IS', 'READY', 'COLLECT FROM THE TRAY'));

      var stage = el('div', 'done-stage');
      figure = el('div', 'done-figure');
      stage.appendChild(figure);

      var badge = el('div', 'done-badge');
      pulse = el('div', 'done-pulse');
      var disc = el('div', 'done-badge-disc');
      disc.innerHTML =
        '<svg width="92" height="92" viewBox="0 0 84 84">' +
        '<path class="done-tick-path" d="M24 43.5l12 12 24-26" fill="none" stroke="#FFFFFF" ' +
        'stroke-width="7" stroke-linecap="round" stroke-linejoin="round" ' +
        'stroke-dasharray="' + TICK_LEN + '" stroke-dashoffset="' + TICK_LEN + '"/></svg>';
      badge.appendChild(pulse);
      badge.appendChild(disc);
      stage.appendChild(badge);
      col.appendChild(stage);
      tickPath = disc.querySelector('.done-tick-path');

      nameEl = el('div', 'done-name');
      col.appendChild(nameEl);

      col.appendChild(el('div', 's1-spacer'));

      var again = buildButton('BUILD ANOTHER', 'btn-primary');
      Tap.bind(again.btn, {
        press: function () { Anim.addClass(again.btn, 'is-pressed'); },
        release: function () { Anim.removeClass(again.btn, 'is-pressed'); },
        tap: function () { DPTKiosk.reset(); }
      });
      col.appendChild(again);

      host.appendChild(col);
      spin = Anim.Turntable(figure);
    }

    /* checkmark draws (500ms) -> one ring pulse -> the figure springs in */
    function show(style) {
      build();
      nameEl.innerHTML = '';
      nameEl.appendChild(document.createTextNode(style.name + ' HAIR'));
      spin.setStyle(style);

      tickPath.setAttribute('stroke-dashoffset', String(TICK_LEN));
      Anim.removeClass(pulse, 'is-pulsing');
      Anim.removeClass(figure, 'is-in');
      Anim.reflow(tickPath);

      window.setTimeout(function () { tickPath.setAttribute('stroke-dashoffset', '0'); }, 120);
      window.setTimeout(function () { Anim.addClass(pulse, 'is-pulsing'); }, 640);
      window.setTimeout(function () {
        Anim.addClass(figure, 'is-in');
        spin.start();
      }, 780);
    }

    function stop() { if (spin) spin.stop(); }

    return { build: build, show: show, stop: stop };
  })();

  /* Pick the layout once, here, so app.js never branches on it. */
  var active = (window.DPT_CONFIG && DPT_CONFIG.LAYOUT === 'B') ? Screen1B : Screen1;

  return { Screen1: active, Screen1A: Screen1, Screen1B: Screen1B, Screen2: Screen2, Screen3: Screen3,
           el: el, applyThumb: applyThumb, placeholderUrl: placeholderUrl };
})();
