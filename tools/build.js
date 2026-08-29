/* ---------------------------------------------------------------------------
 * tools/build.js  --  render every hairstyle turntable and pack the sheets.
 *
 *   node tools/build.js [styleId ...]
 *
 * Writes assets/hair-render/<id>/sprite.png and sprite-t.png, which is all the
 * kiosk loads.  Individual frames are not written: nothing consumes them, and
 * the sheet is its own contact sheet for review.
 *
 * Colours are the real ones.  Every value below was resolved from the element
 * ID on the packing list through Studio's own elementInfoList.json and colour
 * table, not eyeballed - so BROWN, AUBURN and LONG are all genuinely the same
 * Reddish Brown, and BLACK and CURLY are both genuinely Black.  They are told
 * apart by mould, not colour.
 *
 * dy seats a part that is modelled against a different datum.  Most hair spans
 * y -10..24 in LDraw units, sitting over the head down to the neck.  The two
 * bl_ prefixed pieces (ginger, curly) instead span y -34..0 - their origin is
 * the bottom of the hair, not the head's neck plane - so without a shift they
 * render floating in mid-air above the head.  ginger takes the full +24;
 * curly is a mini-doll mould cut for a shorter head, so a full 24 buries the
 * face and it seats at +19.  Raise the number to sit the hair lower.
 *
 * Grid is 5x5.  25 frames is 14.4 degrees per step against the 22.5 of the old
 * 16, and at 340px cells the sheet is 1700px square - inside the A5's 2048px
 * texture limit, and only a little above the 1600px sheet already proven on
 * the device.
 * ------------------------------------------------------------------------ */

var fs = require('fs');
var path = require('path');
var R = require('./render.js');
var P = require('./raster.js');
var sharp = require('/tmp/claude-1000/-home-danzbodula/2ab31edb-c4de-48f2-be22-a1ac349c80b8/scratchpad/tools/node_modules/sharp');

var OUT  = path.join(__dirname, '..', 'assets', 'hair-render');
var HEAD = { file: '3626b.dat', hex: '#F2CD37' };      // Yellow, LDraw 14

var GRID = 5, FRAMES = 25, HERO = 340, CARD = 128, SS = 3;

var STYLES = [
  { id: 'brown',  file: 'bl_103748pb01.dat', hex: '#582A12', colour: 'Reddish Brown' },
  { id: 'blonde', file: '87991.dat',         hex: '#E4CD9E', colour: 'Tan' },
  { id: 'auburn', file: '21268.dat',         hex: '#582A12', colour: 'Reddish Brown' },
  { id: 'ginger', file: 'bl_36037.dat',      hex: '#A95500', colour: 'Dark Orange', dy: 24 },
  { id: 'long',   file: '59363.dat',         hex: '#582A12', colour: 'Reddish Brown' },
  { id: 'black',  file: '99930.dat',         hex: '#05131D', colour: 'Black' },
  { id: 'curly',  file: 'bl_2646.dat',       hex: '#05131D', colour: 'Black', dy: 19 },
  { id: 'cap',    file: '11303.dat',         hex: '#C91A09', colour: 'Red' }
];

function pack(frames, cell, out) {
  var comps = [];
  for (var i = 0; i < frames.length; i++) {
    comps.push({ input: frames[i], raw: { width: cell, height: cell, channels: 4 },
                 left: (i % GRID) * cell, top: Math.floor(i / GRID) * cell });
  }
  return sharp({ create: { width: GRID*cell, height: GRID*cell, channels: 4,
                           background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(comps).png({ palette: true, quality: 90, effort: 8 }).toFile(out);
}

(async function () {
  var only = process.argv.slice(2);
  var list = only.length ? STYLES.filter(function (s) { return only.indexOf(s.id) >= 0; }) : STYLES;
  console.log('grid ' + GRID + 'x' + GRID + '  ' + FRAMES + ' frames  hero ' +
              (GRID*HERO) + 'px  card ' + (GRID*CARD) + 'px\n');

  for (var i = 0; i < list.length; i++) {
    var s = list[i], t0 = Date.now();
    var mesh = R.buildMesh([
      { file: HEAD.file, rgb: R.hexLinear(HEAD.hex) },
      { file: s.file,    rgb: R.hexLinear(s.hex), dy: s.dy }
    ]);
    R.bakeAO(mesh);
    var cam = P.fitCamera(mesh);

    var hero = [], card = [];
    for (var f = 0; f < FRAMES; f++) {
      var yaw = f / FRAMES * 360;
      hero.push(P.renderFrame(mesh, cam, yaw, HERO, SS));
      card.push(P.renderFrame(mesh, cam, yaw, CARD, SS));
    }
    var dir = path.join(OUT, s.id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await pack(hero, HERO, path.join(dir, 'sprite.png'));
    await pack(card, CARD, path.join(dir, 'sprite-t.png'));

    var kb = Math.round((fs.statSync(path.join(dir, 'sprite.png')).size +
                         fs.statSync(path.join(dir, 'sprite-t.png')).size) / 1024);
    console.log('  ' + s.id.padEnd(8) + s.colour.padEnd(16) + mesh.length + ' tris   ' +
                kb + ' KB   [' + ((Date.now()-t0)/1000).toFixed(1) + 's]');
  }
  console.log('\ndone');
})().catch(function (e) { console.error(e.stack); process.exit(1); });
