/* ---------------------------------------------------------------------------
 * tools/ldr.js  --  LDraw part loader.
 *
 * Build-time only.  Nothing here ships to the iPad.
 *
 * Reads a part out of Studio's bundled LDraw library and flattens it into a
 * triangle soup in world space, with every triangle wound consistently
 * counter-clockwise when viewed from OUTSIDE the solid.
 *
 * Getting that winding right is the whole point of this file.  The previous
 * renderer averaged vertex normals without tracking orientation, so on parts
 * whose sub-assemblies are mirrored - the red cap especially - half the
 * surface ended up lit from behind and read as a different colour.  LDraw
 * already carries the information needed to avoid that, in its BFC
 * (Back Face Culling) metacommands, so this implements BFC properly:
 *
 *   - a file states its winding with  0 BFC CERTIFY CCW|CW  and may flip it
 *     mid-file with  0 BFC CW|CCW
 *   -  0 BFC INVERTNEXT  flips the orientation of the next sub-file reference
 *   - a sub-file reference whose matrix has NEGATIVE determinant is mirrored,
 *     which flips winding again
 *
 * Those three flips compose, so orientation is carried down the tree as a
 * single accumulated boolean rather than guessed at the end.
 * ------------------------------------------------------------------------ */

var fs = require('fs');
var path = require('path');

var LIB = '/mnt/c/Program Files/Studio 2.0/ldraw';

/* Search order matters: an UnOfficial part must win over a same-named official
   primitive, and parts/s (subparts) is where most of the real geometry lives. */
var SEARCH = [
  'UnOfficial/parts', 'UnOfficial/parts/s', 'UnOfficial/p', 'UnOfficial/p/48',
  'parts', 'parts/s', 'p', 'p/48'
];

/* /mnt/c is slow per-file and primitives are referenced hundreds of times, so
   both the resolved path and the file text are cached for the whole run. */
var pathCache = {};
var textCache = {};
var dirIndex = null;

function buildIndex() {
  dirIndex = {};
  for (var i = SEARCH.length - 1; i >= 0; i--) {   // reverse so earlier wins
    var dir = path.join(LIB, SEARCH[i]);
    var names;
    try { names = fs.readdirSync(dir); } catch (e) { continue; }
    for (var j = 0; j < names.length; j++) {
      if (names[j].slice(-4).toLowerCase() !== '.dat') continue;
      dirIndex[names[j].toLowerCase()] = path.join(dir, names[j]);
    }
  }
}

function resolve(name) {
  var key = name.toLowerCase().replace(/\\/g, '/');
  key = key.slice(key.lastIndexOf('/') + 1);
  if (pathCache[key] !== undefined) return pathCache[key];
  if (!dirIndex) buildIndex();
  pathCache[key] = dirIndex[key] || null;
  return pathCache[key];
}

function read(name) {
  var p = resolve(name);
  if (!p) return null;
  if (textCache[p] === undefined) textCache[p] = fs.readFileSync(p, 'latin1');
  return textCache[p];
}

/* --- 4x3 affine transforms, stored row-major as [a..i, x,y,z] ------------- */

var IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function mul(m, n) {                                // apply n, then m
  return [
    m[0]*n[0]+m[1]*n[3]+m[2]*n[6], m[0]*n[1]+m[1]*n[4]+m[2]*n[7], m[0]*n[2]+m[1]*n[5]+m[2]*n[8],
    m[3]*n[0]+m[4]*n[3]+m[5]*n[6], m[3]*n[1]+m[4]*n[4]+m[5]*n[7], m[3]*n[2]+m[4]*n[5]+m[5]*n[8],
    m[6]*n[0]+m[7]*n[3]+m[8]*n[6], m[6]*n[1]+m[7]*n[4]+m[8]*n[7], m[6]*n[2]+m[7]*n[5]+m[8]*n[8],
    m[0]*n[9]+m[1]*n[10]+m[2]*n[11]+m[9],
    m[3]*n[9]+m[4]*n[10]+m[5]*n[11]+m[10],
    m[6]*n[9]+m[7]*n[10]+m[8]*n[11]+m[11]
  ];
}

function apply(m, x, y, z) {
  return [m[0]*x+m[1]*y+m[2]*z+m[9], m[3]*x+m[4]*y+m[5]*z+m[10], m[6]*x+m[7]*y+m[8]*z+m[11]];
}

function det3(m) {
  return m[0]*(m[4]*m[8]-m[5]*m[7]) - m[1]*(m[3]*m[8]-m[5]*m[6]) + m[2]*(m[3]*m[7]-m[4]*m[6]);
}

/* --- the recursive walk ---------------------------------------------------- */

function load(rootName) {
  var tris = [];
  var depthGuard = 0;

  /* colour 16 means "inherit from whoever referenced me"; 24 is edge colour,
     which carries no surface and is skipped. */
  function walk(name, xform, colour, invert) {
    if (++depthGuard > 400000) throw new Error('LDraw recursion runaway at ' + name);
    var text = read(name);
    if (text === null) { walk.missing[name] = (walk.missing[name] || 0) + 1; return; }

    var lines = text.split('\n');
    var certified = null;         // null = not yet stated
    var ccw = true;               // BFC default winding once certified
    var invertNext = false;

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].trim();
      if (!line) continue;
      var t = line.charCodeAt(0) - 48;

      if (t === 0) {
        if (line.indexOf('BFC') === -1) continue;
        var toks = line.split(/\s+/);
        for (var k = 2; k < toks.length; k++) {
          var tk = toks[k].toUpperCase();
          if (tk === 'CERTIFY') certified = true;
          else if (tk === 'NOCERTIFY') certified = false;
          else if (tk === 'CCW') { ccw = true;  if (certified === null) certified = true; }
          else if (tk === 'CW')  { ccw = false; if (certified === null) certified = true; }
          else if (tk === 'INVERTNEXT') invertNext = true;
        }
        continue;
      }

      var f = line.split(/\s+/);

      if (t === 1) {
        var m = [ +f[5], +f[6], +f[7], +f[8], +f[9], +f[10], +f[11], +f[12], +f[13], +f[2], +f[3], +f[4] ];
        var sub = f.slice(14).join(' ').trim();
        var childColour = (+f[1] === 16) ? colour : +f[1];
        // the three orientation flips compose into one boolean
        var childInvert = invert !== invertNext;
        if (det3(m) < 0) childInvert = !childInvert;
        walk(sub, mul(xform, m), childColour, childInvert);
        invertNext = false;
        continue;
      }
      invertNext = false;

      if (t !== 3 && t !== 4) continue;             // 2 and 5 are edges
      var c = (+f[1] === 16) ? colour : +f[1];
      if (c === 24) continue;

      var n = (t === 3) ? 3 : 4;
      var v = [];
      for (var vi = 0; vi < n; vi++) {
        v.push(apply(xform, +f[2 + vi*3], +f[3 + vi*3], +f[4 + vi*3]));
      }
      // normalise every face to CCW-from-outside before it is emitted
      var flip = invert;
      if (certified && !ccw) flip = !flip;
      if (flip) v.reverse();

      tris.push({ a: v[0], b: v[1], c: v[2], colour: c });
      if (n === 4) tris.push({ a: v[0], b: v[2], c: v[3], colour: c });
    }
  }
  walk.missing = {};
  walk(rootName, IDENT, 16, false);
  return { tris: tris, missing: walk.missing };
}

/* Signed volume via the divergence theorem.  This is the honest test that the
   windings came out right: for a closed solid whose faces all point outward it
   equals the true enclosed volume and is positive.  Scrambled windings cancel
   out and drive it toward zero or negative, which is exactly the failure that
   made the red cap light wrongly. */
function signedVolume(tris) {
  var v = 0;
  for (var i = 0; i < tris.length; i++) {
    var a = tris[i].a, b = tris[i].b, c = tris[i].c;
    v += (a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6;
  }
  return v;
}

function bounds(tris) {
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], i, k, p;
  for (i = 0; i < tris.length; i++) {
    var t = [tris[i].a, tris[i].b, tris[i].c];
    for (p = 0; p < 3; p++) for (k = 0; k < 3; k++) {
      if (t[p][k] < lo[k]) lo[k] = t[p][k];
      if (t[p][k] > hi[k]) hi[k] = t[p][k];
    }
  }
  return { lo: lo, hi: hi };
}

module.exports = { load: load, signedVolume: signedVolume, bounds: bounds, resolve: resolve, LIB: LIB };
