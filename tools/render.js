/* ---------------------------------------------------------------------------
 * tools/render.js  --  software rasteriser for the hairstyle turntables.
 *
 * Build-time only.  Produces the PNG frames that tools/build.js then packs
 * into the sprite sheets the kiosk actually loads.
 *
 * There is no GPU here and no native dependency beyond sharp for PNG output,
 * which is deliberate: this has to run anywhere, including inside WSL.
 *
 * Pipeline per style:
 *   1. load head + hair as one triangle soup      (ldr.js, BFC-correct)
 *   2. weld vertices, build smooth normals with a break angle
 *   3. bake per-vertex ambient occlusion once, via BVH ray casts
 *   4. render N frames by orbiting the camera; AO and normals are reused
 *
 * Baking AO once per style rather than once per frame is what keeps this
 * practical - it is view-independent, and it is by far the most expensive step.
 * ------------------------------------------------------------------------ */

var L = require('./ldr.js');

/* --- small vector helpers -------------------------------------------------- */
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function norm(a) {
  var l = Math.sqrt(dot(a, a)) || 1;
  return [a[0]/l, a[1]/l, a[2]/l];
}

/* sRGB <-> linear.  Lighting has to happen in linear space or the mid-tones
   go muddy and dark colours like Reddish Brown lose all their shading. */
function toLinear(c) { return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
function toSRGB(c)   { return c <= 0.0031308 ? c*12.92 : 1.055*Math.pow(c, 1/2.4) - 0.055; }
function hexLinear(hex) {
  return [toLinear(parseInt(hex.slice(1,3),16)/255),
          toLinear(parseInt(hex.slice(3,5),16)/255),
          toLinear(parseInt(hex.slice(5,7),16)/255)];
}

/* --- mesh construction ----------------------------------------------------- */

var BREAK_ANGLE = Math.cos(35 * Math.PI / 180);

/* Weld by quantised position, then give each vertex one normal per smoothing
   group: incident faces are averaged only where they meet within the break
   angle, so a moulded crease stays sharp instead of being rounded away. */
function buildMesh(groups) {
  var tris = [], i, g;
  for (g = 0; g < groups.length; g++) {
    var part = L.load(groups[g].file);
    /* Some parts are modelled against a different datum than the minifig head
       and need seating.  See the dy note in build.js. */
    var dy = groups[g].dy || 0;
    for (i = 0; i < part.tris.length; i++) {
      var t = part.tris[i];
      tris.push({ a: [t.a[0], t.a[1]+dy, t.a[2]],
                  b: [t.b[0], t.b[1]+dy, t.b[2]],
                  c: [t.c[0], t.c[1]+dy, t.c[2]], rgb: groups[g].rgb });
    }
  }

  // face normals (already outward - ldr.js guarantees the winding)
  for (i = 0; i < tris.length; i++) {
    tris[i].n = norm(cross(sub(tris[i].b, tris[i].a), sub(tris[i].c, tris[i].a)));
  }

  // gather faces per welded position
  var buckets = {}, key;
  function k(p) { return (p[0]*64|0) + '_' + (p[1]*64|0) + '_' + (p[2]*64|0); }
  for (i = 0; i < tris.length; i++) {
    var vs = [tris[i].a, tris[i].b, tris[i].c];
    for (var v = 0; v < 3; v++) {
      key = k(vs[v]);
      (buckets[key] || (buckets[key] = [])).push({ t: i, v: v });
    }
  }

  // per-corner smoothed normal
  for (i = 0; i < tris.length; i++) tris[i].vn = [null, null, null];
  for (key in buckets) {
    var inc = buckets[key];
    for (var a = 0; a < inc.length; a++) {
      var fn = tris[inc[a].t].n, acc = [0, 0, 0];
      for (var b = 0; b < inc.length; b++) {
        var on = tris[inc[b].t].n;
        if (dot(fn, on) >= BREAK_ANGLE) { acc[0]+=on[0]; acc[1]+=on[1]; acc[2]+=on[2]; }
      }
      tris[inc[a].t].vn[inc[a].v] = norm(acc);
    }
  }
  return tris;
}

/* --- BVH, used only for the AO bake ---------------------------------------- */

function buildBVH(tris) {
  var idx = [], i;
  for (i = 0; i < tris.length; i++) idx.push(i);
  function box(list) {
    var lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
    for (var j = 0; j < list.length; j++) {
      var t = tris[list[j]], ps = [t.a, t.b, t.c];
      for (var p = 0; p < 3; p++) for (var d = 0; d < 3; d++) {
        if (ps[p][d] < lo[d]) lo[d] = ps[p][d];
        if (ps[p][d] > hi[d]) hi[d] = ps[p][d];
      }
    }
    return { lo: lo, hi: hi };
  }
  function build(list, depth) {
    var b = box(list);
    if (list.length <= 8 || depth > 26) return { lo: b.lo, hi: b.hi, leaf: list };
    var ext = [b.hi[0]-b.lo[0], b.hi[1]-b.lo[1], b.hi[2]-b.lo[2]];
    var ax = ext[0] > ext[1] ? (ext[0] > ext[2] ? 0 : 2) : (ext[1] > ext[2] ? 1 : 2);
    list.sort(function (p, q) {
      var tp = tris[p], tq = tris[q];
      return (tp.a[ax]+tp.b[ax]+tp.c[ax]) - (tq.a[ax]+tq.b[ax]+tq.c[ax]);
    });
    var mid = list.length >> 1;
    return { lo: b.lo, hi: b.hi,
             l: build(list.slice(0, mid), depth+1), r: build(list.slice(mid), depth+1) };
  }
  return build(idx, 0);
}

function slabHit(node, o, d, tmax) {
  var t0 = 0, t1 = tmax;
  for (var i = 0; i < 3; i++) {
    var inv = 1 / (d[i] || 1e-12);
    var a = (node.lo[i] - o[i]) * inv, b = (node.hi[i] - o[i]) * inv;
    if (a > b) { var s = a; a = b; b = s; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}

/* Moller-Trumbore; we only need to know THAT something was hit, not where. */
function anyHit(node, tris, o, d, tmax) {
  if (!slabHit(node, o, d, tmax)) return false;
  if (node.leaf) {
    for (var i = 0; i < node.leaf.length; i++) {
      var t = tris[node.leaf[i]];
      var e1 = sub(t.b, t.a), e2 = sub(t.c, t.a);
      var p = cross(d, e2), det = dot(e1, p);
      if (det > -1e-8 && det < 1e-8) continue;
      var inv = 1/det, tv = sub(o, t.a);
      var u = dot(tv, p) * inv;
      if (u < 0 || u > 1) continue;
      var q = cross(tv, e1);
      var vv = dot(d, q) * inv;
      if (vv < 0 || u + vv > 1) continue;
      var dist = dot(e2, q) * inv;
      if (dist > 1e-4 && dist < tmax) return true;
    }
    return false;
  }
  return anyHit(node.l, tris, o, d, tmax) || anyHit(node.r, tris, o, d, tmax);
}

/* Cosine-weighted hemisphere AO.  AO_DIST is short on purpose: we want contact
   shading where hair meets head, not a global darkening. */
var AO_RAYS = 40, AO_DIST = 22;

function bakeAO(tris) {
  var bvh = buildBVH(tris);
  var cache = {};
  function k(p) { return (p[0]*32|0) + '_' + (p[1]*32|0) + '_' + (p[2]*32|0); }
  for (var i = 0; i < tris.length; i++) {
    tris[i].ao = [0, 0, 0];
    var vs = [tris[i].a, tris[i].b, tris[i].c];
    for (var v = 0; v < 3; v++) {
      var key = k(vs[v]) + '|' + (tris[i].vn[v][0]*8|0);
      if (cache[key] !== undefined) { tris[i].ao[v] = cache[key]; continue; }
      var n = tris[i].vn[v], o = [vs[v][0]+n[0]*0.05, vs[v][1]+n[1]*0.05, vs[v][2]+n[2]*0.05];
      // orthonormal basis around the normal
      var up = Math.abs(n[1]) < 0.9 ? [0,1,0] : [1,0,0];
      var tx = norm(cross(up, n)), ty = cross(n, tx);
      var open = 0;
      for (var r = 0; r < AO_RAYS; r++) {
        var u1 = (r + 0.5) / AO_RAYS, u2 = (r * 0.618033988749895) % 1;
        var sr = Math.sqrt(u1), ph = 2 * Math.PI * u2;
        var dx = sr*Math.cos(ph), dy = sr*Math.sin(ph), dz = Math.sqrt(Math.max(0, 1-u1));
        var d = [tx[0]*dx+ty[0]*dy+n[0]*dz, tx[1]*dx+ty[1]*dy+n[1]*dz, tx[2]*dx+ty[2]*dy+n[2]*dz];
        if (!anyHit(bvh, tris, o, d, AO_DIST)) open++;
      }
      var ao = open / AO_RAYS;
      cache[key] = ao;
      tris[i].ao[v] = ao;
    }
  }
}

module.exports = { buildMesh: buildMesh, bakeAO: bakeAO, norm: norm, dot: dot,
                   cross: cross, sub: sub, hexLinear: hexLinear,
                   toLinear: toLinear, toSRGB: toSRGB };
