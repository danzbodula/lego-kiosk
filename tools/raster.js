/* ---------------------------------------------------------------------------
 * tools/raster.js  --  z-buffered triangle rasteriser and shader.
 *
 * Build-time only.
 *
 * The light rig is CAMERA-RELATIVE, not world-fixed.  On a turntable that is
 * the difference between a product shot and a novelty: with a world-fixed key
 * light the subject swings through bright and dark as it spins, and any error
 * in the surface normals shows up as one side reading a different colour -
 * which is exactly the fault the old renderer had on the red cap.  Lighting
 * from the camera means every frame is lit identically, so the only thing that
 * changes between frames is the silhouette.
 * ------------------------------------------------------------------------ */

var R = require('./render.js');
var norm = R.norm, dot = R.dot, cross = R.cross, sub = R.sub;

var FOV = 20 * Math.PI / 180;      // long lens: minimal perspective distortion
var ELEV = 8 * Math.PI / 180;      // a touch above eye level, as in product shots

function bounds(tris) {
  var lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
  for (var i = 0; i < tris.length; i++) {
    var ps = [tris[i].a, tris[i].b, tris[i].c];
    for (var p = 0; p < 3; p++) for (var d = 0; d < 3; d++) {
      if (ps[p][d] < lo[d]) lo[d] = ps[p][d];
      if (ps[p][d] > hi[d]) hi[d] = ps[p][d];
    }
  }
  return { lo: lo, hi: hi };
}

/* Frame the subject once, from the widest silhouette it presents over a full
   revolution, so it neither clips nor visibly breathes as it spins.

   Fitting a bounding SPHERE badly under-fills the canvas - a minifig head is
   nowhere near spherical, so the sphere is far larger than any actual
   silhouette.  Instead this binary-searches the closest camera distance at
   which every vertex still projects inside the frame at every sampled yaw.
   The result is a tight, constant framing shared by all frames. */
function fitCamera(tris, margin) {
  var b = bounds(tris);
  var centre = [(b.lo[0]+b.hi[0])/2, (b.lo[1]+b.hi[1])/2, (b.lo[2]+b.hi[2])/2];
  margin = margin || 1.06;

  var pts = [], i, p, ps;
  for (i = 0; i < tris.length; i++) {
    ps = [tris[i].a, tris[i].b, tris[i].c];
    for (p = 0; p < 3; p++) pts.push(ps[p]);
  }

  var rH = 0, rV = Math.max(b.hi[1]-centre[1], centre[1]-b.lo[1]);
  for (i = 0; i < pts.length; i++) {
    var dx = pts[i][0]-centre[0], dz = pts[i][2]-centre[2];
    var r = Math.sqrt(dx*dx + dz*dz);
    if (r > rH) rH = r;
  }
  var lim = Math.tan(FOV/2) / margin;

  /* worst-case projected half-angle over a revolution, at a given distance */
  function worst(dist) {
    var ce = Math.cos(ELEV), se = Math.sin(ELEV), max = 0;
    for (var y = 0; y < 24; y++) {
      var yaw = y / 24 * 2 * Math.PI;
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var eye = [centre[0] + dist*ce*sy, centre[1] - dist*se, centre[2] - dist*ce*cy];
      var fwd = norm(sub(centre, eye));
      var rgt = norm(cross(fwd, [0,-1,0]));
      var vup = cross(rgt, fwd);
      for (var k = 0; k < pts.length; k++) {
        var v = sub(pts[k], eye), zz = dot(v, fwd);
        if (zz < 1e-3) return 1e9;
        var ax = Math.abs(dot(v, rgt)) / zz, ay = Math.abs(dot(v, vup)) / zz;
        if (ax > max) max = ax;
        if (ay > max) max = ay;
      }
    }
    return max;
  }

  var lo = Math.sqrt(rH*rH + rV*rV) * 1.01;      // never inside the model
  var hi = lo * 40;
  for (var it = 0; it < 26; it++) {
    var mid = (lo + hi) / 2;
    if (worst(mid) > lim) lo = mid; else hi = mid;
  }
  return { centre: centre, dist: hi, radius: Math.sqrt(rH*rH + rV*rV) };
}

function renderFrame(tris, cam, yawDeg, size, ss) {
  var W = size * ss, H = size * ss;
  var col = new Float32Array(W*H*3);
  var alpha = new Float32Array(W*H);
  var zbuf = new Float32Array(W*H);
  for (var z = 0; z < zbuf.length; z++) zbuf[z] = 1e9;

  var yaw = yawDeg * Math.PI / 180;
  var cy = Math.cos(yaw), sy = Math.sin(yaw);
  var ce = Math.cos(ELEV), se = Math.sin(ELEV);

  // LDraw is -Y up.  Orbit in the XZ plane, lift by ELEV.
  var off = [ cam.dist * ce * sy, -cam.dist * se, -cam.dist * ce * cy ];
  var eye = [cam.centre[0]+off[0], cam.centre[1]+off[1], cam.centre[2]+off[2]];
  var fwd = norm(sub(cam.centre, eye));
  var up  = [0, -1, 0];
  var rgt = norm(cross(fwd, up));
  var vup = cross(rgt, fwd);

  var f = (H/2) / Math.tan(FOV/2);
  var cx0 = W/2, cy0 = H/2;

  function project(p) {
    var v = sub(p, eye);
    var x = dot(v, rgt), y = dot(v, vup), zz = dot(v, fwd);
    if (zz < 1e-3) return null;
    return [cx0 + x/zz*f, cy0 - y/zz*f, zz];
  }

  // camera-relative rig, so shading is identical on every frame
  var Lkey = norm([-0.45, 0.62, 1]);         // upper-left, front of the subject
  var Lfill = norm([0.7, 0.15, 1]);          // opposite side, softer
  var i, px, py;

  for (i = 0; i < tris.length; i++) {
    var t = tris[i];
    var A = project(t.a), B = project(t.b), C = project(t.c);
    if (!A || !B || !C) continue;

    var area = (B[0]-A[0])*(C[1]-A[1]) - (C[0]-A[0])*(B[1]-A[1]);
    if (area >= -1e-9) continue;             // backface cull; windings are trusted
    var invArea = 1/area;

    var minX = Math.max(0, Math.floor(Math.min(A[0],B[0],C[0])));
    var maxX = Math.min(W-1, Math.ceil(Math.max(A[0],B[0],C[0])));
    var minY = Math.max(0, Math.floor(Math.min(A[1],B[1],C[1])));
    var maxY = Math.min(H-1, Math.ceil(Math.max(A[1],B[1],C[1])));
    if (minX > maxX || minY > maxY) continue;

    for (py = minY; py <= maxY; py++) {
      for (px = minX; px <= maxX; px++) {
        var sx = px + 0.5, sy2 = py + 0.5;
        var w0 = ((B[0]-A[0])*(sy2-A[1]) - (sx-A[0])*(B[1]-A[1])) * invArea;
        var w1 = ((sx-A[0])*(C[1]-A[1]) - (C[0]-A[0])*(sy2-A[1])) * invArea;
        var w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        // w2->A, w1->B, w0->C
        var depth = w2*A[2] + w1*B[2] + w0*C[2];
        var o = py*W + px;
        if (depth >= zbuf[o]) continue;
        zbuf[o] = depth;

        var n = [ w2*t.vn[0][0] + w1*t.vn[1][0] + w0*t.vn[2][0],
                  w2*t.vn[0][1] + w1*t.vn[1][1] + w0*t.vn[2][1],
                  w2*t.vn[0][2] + w1*t.vn[1][2] + w0*t.vn[2][2] ];
        // into camera space so the rig is view-relative
        var nc = norm([dot(n, rgt), dot(n, vup), -dot(n, fwd)]);
        var ao = w2*t.ao[0] + w1*t.ao[1] + w0*t.ao[2];

        var ndl = Math.max(0, nc[0]*Lkey[0] + nc[1]*Lkey[1] + nc[2]*Lkey[2]);
        var ndf = Math.max(0, nc[0]*Lfill[0] + nc[1]*Lfill[1] + nc[2]*Lfill[2]);
        // hemisphere ambient, occluded
        var sky = 0.5 + 0.5*nc[1];
        var amb = (0.30 + 0.20*sky) * (0.30 + 0.70*ao);

        var V = [0,0,1];
        var Hv = norm([Lkey[0]+V[0], Lkey[1]+V[1], Lkey[2]+V[2]]);
        var spec = Math.pow(Math.max(0, nc[0]*Hv[0]+nc[1]*Hv[1]+nc[2]*Hv[2]), 42) * 0.34 * ao;
        var fres = Math.pow(1 - Math.max(0, nc[2]), 3.2) * 0.10 * ao;

        var lum = amb + 0.62*ndl + 0.20*ndf;
        var b3 = o*3;
        col[b3  ] = t.rgb[0]*lum + spec + fres;
        col[b3+1] = t.rgb[1]*lum + spec + fres;
        col[b3+2] = t.rgb[2]*lum + spec + fres;
        alpha[o] = 1;
      }
    }
  }

  // box-downsample the supersampled buffer, premultiplied so edges stay clean
  var out = Buffer.alloc(size*size*4);
  var n2 = ss*ss;
  for (var oy = 0; oy < size; oy++) {
    for (var ox = 0; ox < size; ox++) {
      var r = 0, g = 0, b = 0, a = 0;
      for (var jy = 0; jy < ss; jy++) {
        for (var jx = 0; jx < ss; jx++) {
          var so = (oy*ss+jy)*W + (ox*ss+jx);
          if (!alpha[so]) continue;
          r += col[so*3]; g += col[so*3+1]; b += col[so*3+2]; a += 1;
        }
      }
      var d = (oy*size+ox)*4;
      if (a === 0) { out[d]=0; out[d+1]=0; out[d+2]=0; out[d+3]=0; continue; }
      out[d  ] = Math.max(0, Math.min(255, Math.round(R.toSRGB(Math.min(1, r/a))*255)));
      out[d+1] = Math.max(0, Math.min(255, Math.round(R.toSRGB(Math.min(1, g/a))*255)));
      out[d+2] = Math.max(0, Math.min(255, Math.round(R.toSRGB(Math.min(1, b/a))*255)));
      out[d+3] = Math.round(a / n2 * 255);
    }
  }
  return out;
}

module.exports = { renderFrame: renderFrame, fitCamera: fitCamera, bounds: bounds };
