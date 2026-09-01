/* ---------------------------------------------------------------------------
 * js/assets.js  --  the one place that turns a style + angle into a URL.
 *
 * Nothing else in the app builds an asset path.  DPT_CONFIG.ART_SOURCE
 * ('render' | 'photo' | 'placeholder') switches the whole app between the
 * LDraw renders, the photography and the flat swatches, with no other edits.
 * ------------------------------------------------------------------------ */

var Assets = (function () {

  function source() {
    var s = window.DPT_CONFIG && DPT_CONFIG.ART_SOURCE;
    return s || 'placeholder';
  }

  function usePlaceholders() { return source() === 'placeholder'; }

  function dir() {
    return source() === 'render' ? 'assets/hair-render/' : 'assets/hair/';
  }

  /* Full-size frame for the turntable / hero / completion figure. */
  function frame(style, angle) {
    if (usePlaceholders()) return v('assets/placeholder/hair-' + style.id + '-' + angle + '.svg');
    return v(dir() + style.id + '/' + angle + '.png');
  }

  /* Small square for the grid cards and the layout-B chips.  Both the renders
     and the photography ship a 176px thumb.png so eight cards never hold eight
     640px textures; a style can set thumb:false to use front.png instead. */
  function thumb(style) {
    if (usePlaceholders()) return placeholder(style);
    if (style.thumb === false) return v(dir() + style.id + '/front.png');
    return v(dir() + style.id + '/thumb.png');
  }

  /* Card-scale frame (176px) for the selected card's turntable.  Using these
     instead of the 640px frames keeps an 88px tile from decoding four full-size
     textures. */
  function thumbFrame(style, angle) {
    if (usePlaceholders()) return v('assets/placeholder/hair-' + style.id + '-' + angle + '.svg');
    return v(dir() + style.id + '/thumb-' + angle + '.png');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Cache-buster appended to every image URL - see ASSET_VERSION in config. */
  function v(url) {
    var ver = window.DPT_CONFIG && DPT_CONFIG.ASSET_VERSION;
    if (!ver || ver === '0') return url;
    return url + (url.indexOf('?') < 0 ? '?v=' : '&v=') + ver;
  }


  /* The single still shown before a spin starts, and on the grid card. */
  function hero(style) {
    if (source() === 'render') return v(dir() + style.id + '/f00.png');
    if (usePlaceholders()) return placeholder(style);
    return v(dir() + style.id + '/front.png');
  }

  /* Cell 0 of the hero sheet, at hero cell resolution.  Pixel-identical to the
     turntable's first frame, so it can overlap the live sheet for as long as
     the decode takes without a visible seam. */
  function still(style) {
    if (usePlaceholders()) return placeholder(style);
    return v(dir() + style.id + '/still.png');
  }

  /* The turntable's sprite sheet: ONE texture holding every frame in a grid.
     Returns { url, grid, seq } where seq is the order of cell indices to
     cycle. Renders ship 16 frames in a 4x4 and loop a true 360; photography
     and the swatches ship 4 in a 2x2 and can only rock out and back. */
  function sprite(style, thumbScale) {
    if (usePlaceholders()) {
      return { url: v('assets/placeholder/sprite-' + style.id + '.png'),
               grid: 2, seq: [0, 1, 2, 3, 2, 1] };
    }
    var file = thumbScale ? '/sprite-t.png' : '/sprite.png';
    if (source() === 'render') {
      // The sheet is the smallest square grid that holds every frame, so the
      // frame count is the only number to change when the renders are rebuilt.
      var n = (window.DPT_CONFIG && DPT_CONFIG.RENDER_FRAMES) || 25;
      var seq = [], i;
      for (i = 0; i < n; i++) seq.push(i);
      return { url: v(dir() + style.id + file),
               grid: Math.ceil(Math.sqrt(n)), seq: seq };
    }
    return { url: v(dir() + style.id + file), grid: 2, seq: [0, 1, 2, 3, 2, 1] };
  }

  /* Always-present fallback, used when a real asset 404s. */
  function placeholder(style) {
    return v('assets/placeholder/hair-' + style.id + '.svg');
  }

  return { frame: frame, thumb: thumb, thumbFrame: thumbFrame, placeholder: placeholder,
           sprite: sprite, still: still, hero: hero,
           usePlaceholders: usePlaceholders, source: source };
})();
