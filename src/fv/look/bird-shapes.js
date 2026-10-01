// The birds of Extreme, modelled: the kingfisher, the goosander drake, the grey heron and the
// northern gannet, each laid along +x (the bill forward, the back up, the right wing out along
// +z) at its real size in the game's units (a unit is ten centimetres), and rigged for the
// shader (birds.js), which folds and beats the wings, bends the neck and turns the head, lifts
// the tail and swings the legs.
//
// Every vertex carries, in one interleaved buffer:
//   paint  rgb, and the surface (0 soft feathers, 0.3 glossy feathers, 0.6 bare skin and
//          bill, 1 an eye) that sets how rough it is
//   rig    the part (PART) and the pivot it turns about: the shoulder for a wing, the hip
//          for a leg, the root of the tail, the base of the neck, the joint of the head
//          (a wing's part number carries, above the whole number, 0.4 times how much the lines
//          between its flight feathers show there: the shader rounds the part number, so the
//          fraction is free to use, and it goes smoothly from vertex to vertex across a face)
//   joint  a second point further along -- the wrist of a wing, the heel of a leg, the head's
//          end of the neck -- and how far the vertex follows it (a neck vertex: how far along
//          the neck it lies)
//   fold   where a wing's vertex lies with the wing folded against the body, and its feather
//          line (whole numbers between two flight feathers, running on unbroken over the whole
//          wing: a line number that jumped between two vertices, to -1 where no lines are
//          drawn or back to 0 at the wrist, swept through every whole number in between across
//          the face and drew a fan of false lines there; below 0 for none on other parts)
//   folded the folded normal, and how many feathers a unit the plumage shows there (the
//          shader lays a fine pattern of feather edges over it: 0 for bare skin, a bill, an
//          eye; below 0 with pale spots in it)
//   foldPaint  the colour and the feathers a unit the vertex shows with the wing folded (the
//          same as paint and folded.w but on a wing's underside, which shows the upper
//          side's: a folded wing lies against the flank turned over, its underside outward --
//          see folder() -- and without this it showed the underwing's buff and grey where
//          the upper wing's colours belong)
// A wing is built twice with the same vertices, spread and folded; the shader goes from one
// to the other, so a folded wing lies along the flank as a real one does (the hand over the
// arm, the primaries back over the tail) instead of being a spread wing turned about.
//
// Feathers are suggested with the vertex colours and with a few shaped pieces: the scalloped
// trailing edges and the fingered hand of the wings, the heron's crest and breast plumes, the
// saw teeth of the goosander's bill. No textures.

import * as THREE from "three";
import { blob, curve, loft, tube } from "./kit.js";

export const PART = { body: 0, wing: 1, tail: 2, neck: 3, head: 4, leg: 5 };
// The surfaces (paint.w).
const DOWN = 0,
  SHEEN = 0.3,
  BARE = 0.6,
  EYE = 1;
const STRIDE = 24;
const ZERO = [0, 0, 0];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// A fixed pseudo-random number for a point (the speckles and the unevenness of a plumage: the
// same bird every time).
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
// A smooth noise in -1..1 (for ruffling the plumage a little out of its lofted smoothness).
function noise(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const u = x - xi,
    v = y - yi,
    w = z - zi;
  const su = u * u * (3 - 2 * u),
    sv = v * v * (3 - 2 * v),
    sw = w * w * (3 - 2 * w);
  const h = (a, b, c) => hash(xi + a, yi + b, zi + c) * 2 - 1;
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), su), l(h(0, 1, 0), h(1, 1, 0), su), sv), l(l(h(0, 0, 1), h(1, 0, 1), su), l(h(0, 1, 1), h(1, 1, 1), su), sv), sw);
}
const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// A colour as it is picked (sRGB, as a hex number), in the linear light the vertex colours are.
const hex = (h) => new THREE.Color(h).toArray();

// The vertices of one bird, part after part, into the interleaved layout above.
// `feathers`: how many feathers a unit its plumage shows; `ruffle`: how far (in units) its
// lofted surfaces are pushed in and out, at `grain` bumps a unit, so they are not smooth as a
// toy's.
class Plumage {
  constructor({ feathers = 3, ruffle = 0, grain = 2 } = {}) {
    this.feathers = feathers;
    this.ruffle = ruffle;
    this.grain = grain;
    this.position = [];
    this.normal = [];
    this.data = [];
    this.index = [];
  }
  get vertices() {
    return this.position.length / 3;
  }
  // `paint(p, n, i)` gives [r, g, b, surface] for each vertex; `weight(p, i)` how far it follows
  // the joint; `folded` the wing's folded positions and normals, `line(i)` its feather lines
  // and `share(i)` how much they show (0..1), `foldPaint(i)` its colour and feathers a unit
  // folded. `feathers(p, n, i)` may say otherwise per vertex; bare parts (a bill, an eye) show
  // none.
  add(geometry, { part = PART.body, pivot = ZERO, joint = ZERO, weight = null, paint, folded = null, line = null, share = null, foldPaint = null, feathers = null, ruffle = true } = {}) {
    const pos = geometry.attributes.position,
      nor = geometry.attributes.normal;
    const offset = this.vertices;
    const p = new THREE.Vector3(),
      n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      const c = paint(p, n, i);
      const bare = (c[3] ?? DOWN) >= BARE;
      const plume = bare ? 0 : feathers ? feathers(p, n, i) : this.feathers;
      if (ruffle && !bare && !folded && this.ruffle > 0) {
        const k = this.grain;
        p.addScaledVector(n, this.ruffle * noise(p.x * k + 7.1, p.y * k, p.z * k));
      }
      this.position.push(p.x, p.y, p.z);
      this.normal.push(n.x, n.y, n.z);
      const w = weight ? weight(p, i) : 0;
      const fp = folded ? [folded.position[i * 3], folded.position[i * 3 + 1], folded.position[i * 3 + 2]] : [p.x, p.y, p.z];
      const fn = folded ? [folded.normal[i * 3], folded.normal[i * 3 + 1], folded.normal[i * 3 + 2]] : [n.x, n.y, n.z];
      const f = foldPaint ? foldPaint(i) : [c[0], c[1], c[2], plume];
      this.data.push(c[0], c[1], c[2], c[3] ?? DOWN, part + (share ? 0.4 * share(i) : 0), pivot[0], pivot[1], pivot[2], joint[0], joint[1], joint[2], w, fp[0], fp[1], fp[2], line ? line(i) : -1, fn[0], fn[1], fn[2], plume, f[0], f[1], f[2], f[3]);
    }
    if (geometry.index) for (let i = 0; i < geometry.index.count; i++) this.index.push(geometry.index.getX(i) + offset);
    else for (let i = 0; i < pos.count; i++) this.index.push(i + offset);
    geometry.dispose();
    return this;
  }
  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
    const data = new THREE.InterleavedBuffer(new Float32Array(this.data), STRIDE);
    geometry.setAttribute("paint", new THREE.InterleavedBufferAttribute(data, 4, 0));
    geometry.setAttribute("rig", new THREE.InterleavedBufferAttribute(data, 4, 4));
    geometry.setAttribute("joint", new THREE.InterleavedBufferAttribute(data, 4, 8));
    geometry.setAttribute("fold", new THREE.InterleavedBufferAttribute(data, 4, 12));
    geometry.setAttribute("folded", new THREE.InterleavedBufferAttribute(data, 4, 16));
    geometry.setAttribute("foldPaint", new THREE.InterleavedBufferAttribute(data, 4, 20));
    geometry.setIndex(this.vertices > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

// Mirror a geometry (and a wing's folded copy) across the middle plane, z to -z, keeping its
// faces turned outward.
function mirrored(geometry) {
  const g = geometry.clone();
  const flip = (attribute) => {
    for (let i = 0; i < attribute.count; i++) attribute.setZ(i, -attribute.getZ(i));
  };
  flip(g.attributes.position);
  flip(g.attributes.normal);
  const index = g.index.array.slice();
  for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  g.setIndex(Array.from(index));
  return g;
}
function mirroredArrays(folded) {
  const position = folded.position.slice(),
    normal = folded.normal.slice();
  for (let i = 2; i < position.length; i += 3) {
    position[i] = -position[i];
    normal[i] = -normal[i];
  }
  return { position, normal };
}
// A geometry moved by a matrix (a body part built in the body's own frame, placed where the
// body is: the heron's body stands tilted).
function placed(geometry, matrix) {
  if (!matrix) return geometry;
  geometry.applyMatrix4(matrix);
  return geometry;
}
const at = (matrix, p) => (matrix ? new THREE.Vector3(...p).applyMatrix4(matrix).toArray() : p);

// The size of a lofted body along x: its half-width, half-height and middle height, read
// from its stations (straight between two), for laying the folded wings on its flanks.
function sizeAlong(stations) {
  const list = stations.filter((s) => s.w > 0).sort((a, b) => a.x - b.x);
  return (x) => {
    if (x <= list[0].x) return list[0];
    if (x >= list[list.length - 1].x) return list[list.length - 1];
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i],
        b = list[i + 1];
      if (x >= a.x && x <= b.x) {
        const t = (x - a.x) / (b.x - a.x);
        return { w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t };
      }
    }
    return list[0];
  };
}
// Where on a lofted body a point is: how far round from the top of the back (0) to the belly
// (pi), whatever the side, and how far out (1 on the surface).
function around(size, p) {
  const s = size(p.x);
  const u = (p.y - s.y) / Math.max(s.h, 1e-6),
    v = Math.abs(p.z) / Math.max(s.w, 1e-6);
  return { phi: Math.atan2(v, u), r: Math.hypot(u, v) };
}

// A neck: a tube straight from its base B to the head's joint J0, whose vertices say how far
// along it they lie (the shader bends it along a curve by that).
let along = null;
function neckTube(B, J0, radius, { radial = 14, flat = 1, up = new THREE.Vector3(0, 1, 0), samples = 8 } = {}) {
  const g = tube(curve([B, J0], samples), radius, { radial, flat, up });
  const t = g.userData.along;
  along = (p, i) => t[i];
  return g;
}

// A lofted shape's stations resampled into `n` rings along a smooth curve through them (the
// few stations a shape is written with would show as kinks in its outline and its shading),
// its closing points kept at the ends.
function smoothed(stations, n = 24) {
  const list = [...stations].sort((a, b) => a.x - b.x);
  const inner = list.filter((s) => s.w > 0);
  const k = inner.length;
  if (k < 3) return stations;
  const at = (i) => inner[Math.max(0, Math.min(k - 1, i))];
  const spline = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const out = [];
  if (list[0].w <= 0) out.push(list[0]);
  for (let j = 0; j < n; j++) {
    const u = (j / (n - 1)) * (k - 1);
    const i = Math.min(k - 2, Math.floor(u));
    const t = u - i;
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const value = (key) => spline(a[key] ?? 0, b[key] ?? 0, c[key] ?? 0, d[key] ?? 0, t);
    out.push({ x: value("x"), w: Math.max(0.001, value("w")), h: Math.max(0.001, value("h")), y: value("y") });
  }
  if (list[list.length - 1].w <= 0) out.push(list[list.length - 1]);
  return out;
}

// ---- The wing.

// One wing, the right one (out along +z), spread level, from `lead` and `trail`: the
// control points of its leading and trailing edges from the root out to the tip (both end at
// the tip). `wrist` is where the hand begins on the leading edge. The trailing edge is
// scalloped into feather tips, `arm` secondaries and `hand` primaries (`notch`: how deep, in
// parts of the chord there; `fingers`: the primaries' tips standing apart, as a heron's do).
// `thick` the arm's thickness (the hand is thinner). `paint(s, c, top)` colours it: s along
// the span (0 root, 1 tip), c back from the leading edge (0) to the trailing edge (1), top
// the upper side. `fold(s, c, top, lift)` says where each vertex lies with the wing folded.
function wing({ lead, trail, wrist, arm = 10, hand = 10, notch = 0.06, fingers = 0, thick, S = 34, C = 7, paint, fold }) {
  const L = new THREE.CatmullRomCurve3(lead.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  const T = new THREE.CatmullRomCurve3(trail.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  const leads = L.getSpacedPoints(400);
  let best = 0;
  for (let i = 0; i < leads.length; i++) if (leads[i].distanceTo(new THREE.Vector3(...wrist)) < leads[best].distanceTo(new THREE.Vector3(...wrist))) best = i;
  const sW = best / 400;
  const R = 2 * C - 1;
  const positions = [],
    folded = [],
    lines = [],
    shares = [],
    spans = [],
    chords = [],
    tops = [];
  const le = new THREE.Vector3(),
    te = new THREE.Vector3(),
    q = new THREE.Vector3();
  for (let i = 0; i < S; i++) {
    const s = i / (S - 1);
    L.getPointAt(s, le);
    T.getPointAt(s, te);
    // The feather tips along the trailing edge: each tip a point, the gap between two drawn
    // in toward the leading edge.
    const inHand = s > sW;
    const u = inHand ? ((s - sW) / (1 - sW)) * hand : (s / sW) * arm;
    const f = u - Math.floor(u);
    const depth = (inHand ? notch * (1 + fingers * 3 * smooth(0.3, 0.9, (s - sW) / (1 - sW))) : notch) * Math.pow(Math.abs(Math.sin(Math.PI * f)), 0.6);
    // (The last primaries close in on the tip: no notches right at it.)
    const scallop = depth * (1 - smooth(0.9, 1, s));
    const t0 = thick * (1 - 0.7 * s);
    for (let r = 0; r < R; r++) {
      const top = r < C;
      const k = top ? C - 1 - r : r - (C - 1);
      const c = Math.pow(k / (C - 1), 1.35);
      const cc = c * (1 - scallop);
      q.lerpVectors(le, te, cc);
      // An airfoil: thickest a third back, rounded at the leading edge, thin at the trailing
      // edge; the underside hollow.
      const bulge = t0 * 2.6 * Math.sqrt(c) * (1 - c);
      q.y += top ? bulge : -0.35 * bulge;
      positions.push(q.x, q.y, q.z);
      spans.push(s);
      chords.push(c);
      tops.push(top);
      const fp = fold(s, c, top, top ? bulge : -0.35 * bulge);
      folded.push(fp[0], fp[1], fp[2]);
      // The feather lines: between the flight feathers, one whole number apart, the hand's
      // numbered on from the arm's; shown over the back part of the chord only, where the
      // flight feathers lie bare of their coverts.
      lines.push(inHand ? arm + hand * ((s - sW) / (1 - sW)) : arm * (s / sW));
      shares.push(smooth(0.34, 0.48, c));
    }
  }
  const index = [];
  for (let i = 0; i + 1 < S; i++)
    for (let r = 0; r + 1 < R; r++) {
      const a = i * R + r,
        b = (i + 1) * R + r;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const make = (array) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(array, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  let geometry = make(positions);
  // Turned so the upper side faces up.
  const probe = (Math.floor(S / 2) * R + Math.floor(C / 2)) * 3;
  if (geometry.attributes.normal.array[probe + 1] < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geometry = make(positions);
  }
  const foldedGeometry = make(folded);
  const result = {
    geometry,
    folded: { position: new Float32Array(folded), normal: new Float32Array(foldedGeometry.attributes.normal.array) },
    lines,
    shares,
    spans,
    chords,
    tops,
    sW,
    wrist: L.getPointAt(sW).toArray(),
    shoulder: lead[0],
  };
  foldedGeometry.dispose();
  return result;
}

// Where a wing lies folded against a body (its stations): the bend of the wing a little ahead
// of the shoulder at the top of the flank, the arm's feathers stacked short behind it, the
// hand reaching `length` back from there to the tip over the rump or the tail; each column
// from the leading edge at `top` (radians round from the back) down the flank toward
// `bottom`, the band narrowing to the tip.
// The arm's edges are tucked in under the body's surface -- its front under the breast
// feathers, its upper edge under the scapulars, its lower edge under the flank -- as a real
// folded wing's are: laid on top of the body whole, its square outline read as a panel stuck
// on the side. Only the hand lies free over the rump, where the primaries' tips show.
// (Laid so -- the span running back, the chord from the leading edge down the flank -- the
// wing lies turned over: its upper side faces the body and its underside faces out, which is
// why a folded wing takes its colours from foldPaint.)
function folder(stations, { shoulder, sW, length, top, bottom, reach = 0.32, rise = 0, gap = 0.015 }) {
  const size = sizeAlong(stations);
  return (s, c, isTop, lift) => {
    const g = s < sW ? reach * (s / sW) : reach + (1 - reach) * ((s - sW) / (1 - sW));
    const x = shoulder[0] + 0.06 * length - length * g;
    const narrow = 1 - 0.85 * Math.pow(g, 1.6);
    const phi = top + (bottom - top) * c * narrow + 0.15 * g * g;
    const b = size(x);
    const w = b.w,
      h = b.h;
    const n = new THREE.Vector3(0, Math.cos(phi) / h, Math.sin(phi) / w).normalize();
    const free = gap * length + (isTop ? Math.abs(lift) : 0) * 0.8 + rise * g * g;
    // (How far the arm's edges are drawn in: fully at the front, along the top and the bottom
    // of the band, and not at all once the hand begins.)
    const arm = 1 - smooth(reach * 0.8, reach * 1.6, g);
    const tuck = Math.max(1 - smooth(0.02, 0.16, g), arm * Math.max(1 - smooth(0.04, 0.2, c), smooth(0.72, 0.98, c)));
    const out = free + (-0.035 * length - free) * tuck;
    return [x, b.y + h * Math.cos(phi) + n.y * out, w * Math.sin(phi) + n.z * out];
  };
}

// Both wings into a plumage (the left one mirrored), with the body's frame `matrix` if the
// body is built tilted.
function addWings(plumage, w, paint, matrix = null, feathers = null) {
  const inHand = (s) => smooth(w.sW - 0.035, w.sW + 0.035, s);
  const pivot = at(matrix, w.shoulder),
    joint = at(matrix, w.wrist);
  const colour = (i) => paint(w.spans[i], w.chords[i], w.tops[i]);
  const weight = (p, i) => inHand(w.spans[i]);
  const place = (arrays) => {
    if (!matrix) return arrays;
    const position = arrays.position.slice(),
      normal = arrays.normal.slice();
    const v = new THREE.Vector3(),
      nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < position.length; i += 3) {
      v.set(position[i], position[i + 1], position[i + 2]).applyMatrix4(matrix);
      position.set([v.x, v.y, v.z], i);
      v.set(normal[i], normal[i + 1], normal[i + 2]).applyMatrix3(nm).normalize();
      normal.set([v.x, v.y, v.z], i);
    }
    return { position, normal };
  };
  const right = placed(w.geometry, matrix);
  const left = mirrored(right);
  const foldedRight = place(w.folded);
  const plume = feathers ? (p, n, i) => feathers(w.spans[i], w.chords[i], w.tops[i]) : null;
  // (Folded, every vertex shows the upper side's colour and feathers at its place on the wing:
  // the underside is what faces out then.)
  const foldPaint = (i) => {
    const c = paint(w.spans[i], w.chords[i], true);
    return [c[0], c[1], c[2], feathers ? feathers(w.spans[i], w.chords[i], true) : plumage.feathers];
  };
  plumage.add(right, { part: PART.wing, pivot, joint, weight, paint: (p, n, i) => colour(i), folded: foldedRight, line: (i) => w.lines[i], share: (i) => w.shares[i], foldPaint, feathers: plume });
  plumage.add(left, { part: PART.wing, pivot: [pivot[0], pivot[1], -pivot[2]], joint: [joint[0], joint[1], -joint[2]], weight, paint: (p, n, i) => colour(i), folded: mirroredArrays(foldedRight), line: (i) => w.lines[i], share: (i) => w.shares[i], foldPaint, feathers: plume });
}

// A ribbon: a flattened tube along a curve (a plume, a toe, a tooth), closed so it shows from
// both sides.
function ribbon(points, width, { flat = 0.18, radial = 6, up = new THREE.Vector3(0, 1, 0) } = {}) {
  return tube(points, width, { radial, flat, up });
}

// A leg from the hip down through the heel to the foot, with its toes (each [direction x, z,
// length]), both sides; `paint(p, n, lower)` colours it, lower below the heel.
function addLegs(plumage, { hip, heel, foot, radius, toes, toeRadius, paint, web = null, radial = 7 }) {
  for (const side of [1, -1]) {
    const z = (v) => [v[0], v[1], v[2] * side];
    const pts = curve([z(hip), z(heel), z(foot)], 14);
    const leg = tube(pts, radius, { radial });
    const heelY = heel[1];
    const lower = (p) => smooth(heelY + 0.02 * Math.abs(hip[1] - foot[1]), heelY - 0.02 * Math.abs(hip[1] - foot[1]), p.y);
    const rig = { part: PART.leg, pivot: z(hip), joint: z(heel), weight: (p) => lower(p) };
    plumage.add(leg, { ...rig, paint: (p, n) => paint(p, n, lower(p) > 0.5) });
    const base = new THREE.Vector3(...z(foot));
    for (const [dx, dz, length] of toes) {
      const dir = new THREE.Vector3(dx, 0, dz * side).normalize();
      const end = base.clone().addScaledVector(dir, length);
      const mid = base.clone().addScaledVector(dir, length * 0.5);
      mid.y += length * 0.08;
      end.y -= length * 0.04;
      const toe = tube([base.clone(), mid, end], (t) => toeRadius * (1 - 0.6 * t), { radial: 5 });
      plumage.add(toe, { ...rig, weight: () => 1, paint: (p, n) => paint(p, n, true) });
    }
    if (web) {
      const w = web(side);
      plumage.add(w, { ...rig, weight: () => 1, paint: (p, n) => paint(p, n, true) });
    }
  }
}

// An eye: a glossy bead, its pupil dark where it looks out to the side (`pupil`: how much of
// it, 1 all of it -- a dark eye -- down to a small black point in a pale iris).
function addEyes(plumage, centre, radius, iris, rig, pupil = 0.5) {
  for (const side of [1, -1]) {
    const e = blob([centre[0], centre[1], centre[2] * side], radius, radius, radius * 0.8, { widthSegments: 12, heightSegments: 10 });
    plumage.add(e, { ...rig, paint: (p, n) => (Math.abs(n.z) > 1 - 0.35 * pupil ? [0.008, 0.008, 0.008, EYE] : [...iris, EYE]) });
  }
}

// ---- The kingfisher: 17 cm of it, the dagger of a bill a quarter of that. A compact body, a
// big head, a short tail, short rounded wings; cobalt blue above with the turquoise stripe
// down the back, orange below, the white throat and neck patch, the orange ear patch, tiny
// red feet.
export function kingfisherShape() {
  const b = new Plumage({ feathers: 11, ruffle: 0.006, grain: 14 });
  const body = smoothed([
    { x: -0.47, w: 0, h: 0, y: 0.045 },
    { x: -0.45, w: 0.06, h: 0.05, y: 0.045 },
    { x: -0.37, w: 0.12, h: 0.12, y: 0.035 },
    { x: -0.23, w: 0.17, h: 0.19, y: 0.012 },
    { x: -0.06, w: 0.2, h: 0.23, y: 0 },
    { x: 0.1, w: 0.2, h: 0.235, y: 0.01 },
    { x: 0.22, w: 0.175, h: 0.21, y: 0.035 },
    // (The breast running on forward under the head, low: closed off behind the head, it left
    // the throat hanging over a dark notch, a head set on a body.)
    { x: 0.31, w: 0.14, h: 0.175, y: 0.05 },
    { x: 0.39, w: 0.095, h: 0.115, y: 0.035 },
    { x: 0.43, w: 0, h: 0, y: 0.035 },
  ], 22);
  const size = sizeAlong(body);
  const BLUE = hex(0x17627a),
    STRIPE = hex(0x3ccaf2),
    ORANGE = hex(0xd9701f),
    WHITE = hex(0xece4d2);
  b.add(loft(body, { radial: 22, belly: 0.95 }), {
    paint: (p) => {
      const { phi } = around(size, p);
      // Orange from the flanks down, blue above; the turquoise stripe down the middle of the
      // back from the mantle to the rump.
      const below = smooth(1.15, 1.45, phi);
      let c = mix3(BLUE, ORANGE, below);
      const stripe = (1 - smooth(0.42, 0.58, phi)) * smooth(-0.46, -0.34, p.x) * (1 - smooth(0.06, 0.16, p.x));
      c = mix3(c, STRIPE, stripe);
      const k = 0.92 + 0.14 * hash(p.x * 40, p.y * 40, p.z * 40);
      return [...tint(c, k), DOWN];
    },
  });
  const B = [0.22, 0.07, 0],
    J0 = [0.36, 0.12, 0];
  b.add(neckTube(B, J0, () => 0.125, { radial: 14 }), {
    part: PART.neck,
    pivot: B,
    joint: J0,
    weight: along,
    paint: (p, n) => [...(n.y < -0.3 ? ORANGE : n.y < 0.2 && Math.abs(n.z) > 0.6 ? WHITE : BLUE), DOWN],
  });
  const head = { part: PART.head, pivot: J0 };
  const skull = [
    { x: 0.25, w: 0, h: 0, y: 0.12 },
    { x: 0.28, w: 0.09, h: 0.1, y: 0.125 },
    { x: 0.34, w: 0.145, h: 0.155, y: 0.135 },
    { x: 0.42, w: 0.16, h: 0.165, y: 0.14 },
    { x: 0.5, w: 0.145, h: 0.15, y: 0.135 },
    { x: 0.57, w: 0.1, h: 0.105, y: 0.12 },
    { x: 0.62, w: 0.06, h: 0.062, y: 0.108 },
    { x: 0.64, w: 0, h: 0, y: 0.104 },
  ];
  const headSize = sizeAlong(skull);
  b.add(loft(smoothed(skull, 16), { radial: 22 }), {
    ...head,
    // (The crown finely spotted paler.)
    feathers: (p) => (around(headSize, p).phi < 0.9 ? -16 : 16),
    paint: (p, n) => {
      const { phi } = around(headSize, p);
      // The crown and the moustache stripe blue, finely barred paler; the orange lores
      // before the eye and the ear patch behind it, the white patch on the side of the neck
      // behind that; the throat white.
      let c = BLUE;
      const cheek = smooth(0.9, 1.15, phi) * (1 - smooth(1.55, 1.75, phi));
      const ear = cheek * smooth(0.3, 0.36, p.x) * (1 - smooth(0.52, 0.56, p.x));
      c = mix3(c, ORANGE, ear);
      const lore = cheek * smooth(0.54, 0.57, p.x) * (1 - smooth(0.6, 0.62, p.x));
      c = mix3(c, ORANGE, lore);
      const patch = cheek * (1 - smooth(0.3, 0.34, p.x));
      c = mix3(c, WHITE, patch);
      // (Below the cheek the blue moustache stripe, and under it the white throat.)
      c = mix3(c, WHITE, smooth(1.95, 2.3, phi));
      return [...c, DOWN];
    },
  });
  const bill = [
    { x: 0.585, w: 0.05, h: 0.056, y: 0.102 },
    { x: 0.7, w: 0.036, h: 0.042, y: 0.096 },
    { x: 0.85, w: 0.021, h: 0.026, y: 0.09 },
    { x: 0.98, w: 0.008, h: 0.01, y: 0.086 },
    { x: 1.02, w: 0, h: 0, y: 0.084 },
  ];
  b.add(loft(bill, { radial: 10, square: 0.4 }), { ...head, paint: () => [...hex(0x111113), BARE] });
  addEyes(b, [0.5, 0.162, 0.126], 0.024, hex(0x140c08), head, 1);
  // The short tail, stiff and dark blue.
  const tail = [
    { x: -0.36, w: 0.07, h: 0.025, y: 0.05 },
    { x: -0.5, w: 0.095, h: 0.026, y: 0.042 },
    { x: -0.66, w: 0.105, h: 0.02, y: 0.032 },
    { x: -0.72, w: 0.09, h: 0.015, y: 0.028 },
    { x: -0.745, w: 0, h: 0, y: 0.027 },
  ];
  b.add(loft(tail, { radial: 12 }), { part: PART.tail, pivot: [-0.42, 0.045, 0], paint: (p, n) => [...(n.y > 0 ? hex(0x154e6a) : hex(0x2c2622)), DOWN] });
  // Short rounded wings.
  const w = wing({
    lead: [
      [0.12, 0.15, 0.12],
      [0.15, 0.18, 0.32],
      [0.11, 0.19, 0.54],
      [-0.08, 0.18, 0.86],
      [-0.29, 0.16, 1.1],
    ],
    trail: [
      [-0.2, 0.13, 0.12],
      [-0.22, 0.14, 0.36],
      [-0.26, 0.15, 0.6],
      [-0.33, 0.155, 0.92],
      [-0.29, 0.16, 1.1],
    ],
    wrist: [0.11, 0.19, 0.54],
    arm: 9,
    hand: 10,
    notch: 0.07,
    thick: 0.035,
    S: 30,
    C: 6,
    paint: () => [0, 0, 0],
    fold: folder(body, { shoulder: [0.12, 0.15, 0.12], sW: 0.42, length: 0.62, top: 0.3, bottom: 1.45 }),
  });
  addWings(
    b,
    w,
    (s, c, top) => {
      if (!top) return [...(c < 0.45 ? hex(0xc98446) : hex(0x3a3532)), DOWN];
      // The coverts deep blue-green (spotted pale blue: the shader's spots), the flight
      // feathers blackish, their outer vanes blue.
      // (Blue still where the flight feathers show on the folded wing: only their tips dark.)
      const c0 = c < 0.42 ? hex(0x185c74) : mix3(hex(0x185a72), hex(0x122e3a), smooth(0.6, 0.98, c));
      return [...c0, DOWN];
    },
    null,
    (s, c, top) => (top && c < 0.42 ? -13 : 9),
  );
  // The tiny red feet, the legs hardly showing.
  addLegs(b, {
    hip: [0.03, -0.14, 0.07],
    heel: [0.05, -0.22, 0.08],
    foot: [0.07, -0.265, 0.08],
    radius: (t) => 0.028 * (1 - 0.4 * t),
    toes: [
      [1, 0.15, 0.08],
      [1, -0.1, 0.075],
      [-1, 0, 0.05],
    ],
    toeRadius: 0.012,
    paint: (p, n, lower) => [...(lower ? hex(0xd03a1c) : ORANGE), BARE * (lower ? 1 : 0)],
  });
  return {
    geometry: b.build(),
    // The neck's base and the head's joint (the neck runs straight between them at rest),
    // where on the head the eye is (what the head is turned about for a look), the bill's tip.
    neck: { base: B, joint: J0 },
    skull: [0.44, 0.13, 0],
    beak: [1.02, 0.084, 0],
    shoulder: w.shoulder,
    wrist: w.wrist,
    hip: [0.03, -0.14, 0.07],
    // Where its weapon is strapped: the push dagger along the top of the bill, from where the
    // bill leaves the head, forward along it.
    mounts: { beak: { part: "head", at: [0.6, 0.155, 0], along: [1, -0.05, 0] } },
  };
}

// ---- The goosander drake: 62 cm, long and low in the water; the head a glossy bottle green
// that shows black at a distance, with a smooth bulge on the nape; the thin red bill with its
// saw teeth and dark hooked nail; the body white washed salmon-pink, the back black, the rump
// and tail grey, the folded wing black along the back and white along the flank with the
// black primaries over the rump; big red feet set far back.
export function merganserShape() {
  const b = new Plumage({ feathers: 3.4, ruffle: 0.025, grain: 3 });
  const body = smoothed([
    { x: -2.35, w: 0, h: 0, y: 0.14 },
    { x: -2.25, w: 0.2, h: 0.13, y: 0.13 },
    { x: -1.95, w: 0.45, h: 0.36, y: 0.07 },
    { x: -1.35, w: 0.72, h: 0.58, y: 0.02 },
    { x: -0.5, w: 0.82, h: 0.66, y: 0 },
    { x: 0.4, w: 0.8, h: 0.65, y: 0 },
    { x: 1.05, w: 0.68, h: 0.57, y: 0.05 },
    { x: 1.45, w: 0.5, h: 0.46, y: 0.14 },
    { x: 1.72, w: 0.33, h: 0.34, y: 0.24 },
    { x: 1.86, w: 0, h: 0, y: 0.28 },
  ], 30);
  const size = sizeAlong(body);
  const GREEN = hex(0x0f2a1d),
    SALMON = hex(0xf2d6c6),
    BLACK = hex(0x131315),
    GREY = hex(0x767c82);
  b.add(loft(body, { radial: 26, belly: 0.85 }), {
    paint: (p) => {
      const { phi } = around(size, p);
      // The black back from the mantle down to the rump, grey behind it; white-salmon below.
      // (The mantle begins behind the base of the neck: carried on to the front of the body,
      // it showed as a black wedge on the breast under the raised neck.)
      const back = (1 - smooth(0.55, 0.72, phi)) * (1 - smooth(0.95, 1.25, p.x));
      let c = SALMON;
      const upper = p.x > -1.3 ? BLACK : GREY;
      c = mix3(c, mix3(GREY, BLACK, smooth(-1.5, -1.1, p.x)), back);
      // The rosy wash strongest on the breast and flanks, whiter toward the tail.
      c = mix3(c, hex(0xf4efe8), smooth(-0.5, -2, p.x) * (1 - back));
      const k = 0.94 + 0.1 * hash(p.x * 12, p.y * 12, p.z * 12);
      return [...tint(c, k), DOWN];
    },
  });
  // (The neck's base deep in the breast: from nearer the front, its end ring came out of the
  // breast as a black disc when the neck was raised floating.)
  const B = [1.3, 0.2, 0],
    J0 = [2.42, 0.44, 0];
  b.add(neckTube(B, J0, (t) => 0.34 - 0.06 * t, { radial: 18 }), {
    part: PART.neck,
    pivot: B,
    joint: J0,
    weight: along,
    paint: (p, n, i) => {
      const t = along(p, i);
      // The green hood ends in a sharp line round the lower neck.
      return t > 0.5 ? [...GREEN, SHEEN] : [...SALMON, DOWN];
    },
  });
  const head = { part: PART.head, pivot: J0 };
  // (Long and low, the forehead running flat into the bill, the nape swollen into a smooth
  // mane that hangs a little back over the neck.)
  const skull = [
    { x: 1.98, w: 0, h: 0, y: 0.5 },
    { x: 2.03, w: 0.2, h: 0.28, y: 0.52 },
    { x: 2.18, w: 0.29, h: 0.4, y: 0.56 },
    { x: 2.42, w: 0.3, h: 0.37, y: 0.57 },
    { x: 2.66, w: 0.29, h: 0.3, y: 0.54 },
    { x: 2.86, w: 0.23, h: 0.22, y: 0.47 },
    { x: 3.0, w: 0.16, h: 0.15, y: 0.41 },
    { x: 3.07, w: 0, h: 0, y: 0.39 },
  ];
  b.add(loft(smoothed(skull, 16), { radial: 22 }), {
    ...head,
    paint: (p) => {
      // (A little greener where the light catches the crown.)
      const k = 0.9 + 0.25 * hash(p.x * 30, p.y * 30, p.z * 30);
      return [...tint(p.y > 0.75 ? hex(0x163f2a) : GREEN, k), SHEEN];
    },
  });
  const RED = hex(0xb42818);
  const bill = [
    { x: 2.95, w: 0.13, h: 0.135, y: 0.385 },
    { x: 3.15, w: 0.095, h: 0.1, y: 0.368 },
    { x: 3.4, w: 0.068, h: 0.074, y: 0.356 },
    { x: 3.58, w: 0.052, h: 0.058, y: 0.346 },
    { x: 3.64, w: 0, h: 0, y: 0.334 },
  ];
  b.add(loft(bill, { radial: 12 }), { ...head, paint: (p) => [...(p.y > 0.4 ? tint(RED, 0.75) : RED), BARE] });
  // The dark nail hooked over the tip, and the saw teeth along both edges of the bill.
  b.add(blob([3.615, 0.33, 0], 0.05, 0.045, 0.04), { ...head, paint: () => [...hex(0x2a1410), BARE] });
  for (const side of [1, -1])
    for (let i = 0; i < 9; i++) {
      const x = 3.02 + i * 0.062;
      const s = sizeAlong(bill)(x);
      const root = new THREE.Vector3(x, s.y - s.h * 0.55, side * s.w * 0.85);
      const tip = root.clone().add(new THREE.Vector3(-0.035, -0.045, side * 0.012));
      b.add(ribbon([root, root.clone().lerp(tip, 0.5), tip], (t) => 0.014 * (1 - t), { flat: 0.4, radial: 4 }), { ...head, paint: () => [...hex(0x6a1810), BARE] });
    }
  addEyes(b, [2.74, 0.61, 0.245], 0.042, hex(0x5a1a10), head, 0.6);
  // The tail, short and grey.
  const tail = [
    { x: -2.15, w: 0.22, h: 0.065, y: 0.16 },
    { x: -2.5, w: 0.3, h: 0.05, y: 0.18 },
    { x: -2.85, w: 0.26, h: 0.035, y: 0.2 },
    { x: -3.0, w: 0.15, h: 0.025, y: 0.205 },
    { x: -3.05, w: 0, h: 0, y: 0.205 },
  ];
  b.add(loft(tail, { radial: 12 }), { part: PART.tail, pivot: [-2.25, 0.15, 0], paint: (p) => [...tint(GREY, 0.8 + 0.2 * hash(p.x * 20, 0, p.z * 20)), DOWN] });
  const w = wing({
    lead: [
      [0.75, 0.45, 0.42],
      [0.82, 0.5, 1.3],
      [0.62, 0.52, 2.1],
      [-0.2, 0.5, 3.2],
      [-1.1, 0.48, 4.1],
    ],
    trail: [
      [-0.5, 0.42, 0.42],
      [-0.62, 0.44, 1.3],
      [-0.72, 0.45, 2.1],
      [-1.05, 0.47, 3.3],
      [-1.1, 0.48, 4.1],
    ],
    wrist: [0.62, 0.52, 2.1],
    arm: 12,
    hand: 10,
    notch: 0.05,
    thick: 0.11,
    paint: () => [0, 0, 0],
    fold: folder(body, { shoulder: [0.75, 0.45, 0.42], sW: 0.43, length: 2.85, top: 0.52, bottom: 1.3 }),
  });
  addWings(b, w, (s, c, top) => {
    // The inner wing white (the secondaries and their coverts), its leading half black above
    // (where the black scapulars lie over it, so folded it shows as the drake's does: black
    // over the whole back, the white only low on the flank, most of it tucked under the flank
    // feathers); the hand black-brown; the root black. (The goosander never flies here: the
    // wing is seen folded.)
    const hand = smooth(w.sW - 0.02, w.sW + 0.03, s);
    // (The white washed a little salmon as the flank it lies on, so the folded wing does not
    // show as a whiter panel stuck on it.)
    let col = hex(0xf2e4da);
    if (top) col = mix3(hex(0x151517), col, smooth(0.5, 0.6, c));
    col = mix3(col, hex(0x1e1c1c), hand);
    if (top) col = mix3(col, BLACK, 1 - smooth(0.06, 0.14, s));
    if (!top) col = mix3(col, hex(0xd6d6d2), hand * 0.3);
    return [...col, DOWN];
  });
  // The legs set far back; big webbed feet.
  const web = (side) => {
    const g = new THREE.BufferGeometry();
    const ankle = new THREE.Vector3(-1.55, -0.88, 0.55 * side);
    // A fan from the ankle forward between the outer toes, thin, closed both sides.
    const rim = [];
    for (let i = 0; i <= 6; i++) {
      const a = -0.5 + i / 6;
      rim.push(new THREE.Vector3(Math.cos(a) * 0.72, -0.04 - 0.05 * Math.sin(Math.PI * (i / 6)), Math.sin(a) * 0.72 * side).add(ankle));
    }
    const positions = [];
    const index = [];
    // Two layers of a fan, turned opposite ways: from either side one of them faces the eye.
    for (const dy of [0.012, -0.012]) {
      const base = positions.length / 3;
      positions.push(ankle.x, ankle.y + dy, ankle.z);
      for (const r of rim) positions.push(r.x, r.y + dy, r.z);
      for (let i = 0; i < rim.length - 1; i++) index.push(base, base + 1 + i, base + 2 + i);
    }
    // (The underside faces the other way.)
    const half = index.length / 2;
    for (let i = half; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    if (side < 0) {
      const idx = g.index.array.slice();
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(Array.from(idx));
      g.computeVertexNormals();
    }
    return g;
  };
  addLegs(b, {
    hip: [-1.2, -0.3, 0.4],
    heel: [-1.35, -0.62, 0.52],
    foot: [-1.55, -0.88, 0.55],
    radius: (t) => 0.1 - 0.04 * t,
    toes: [
      [1, 0.45, 0.72],
      [1, 0, 0.78],
      [1, -0.5, 0.7],
    ],
    toeRadius: 0.028,
    web,
    paint: (p, n, lower) => [...(lower ? hex(0xdc5a22) : SALMON), lower ? BARE : DOWN],
  });
  return {
    geometry: b.build(),
    neck: { base: B, joint: J0 },
    skull: [2.6, 0.55, 0],
    beak: [3.64, 0.334, 0],
    shoulder: w.shoulder,
    wrist: w.wrist,
    hip: [-1.2, -0.3, 0.4],
    // The revolver strapped on the right shoulder, on the black of the mantle, its line
    // forward past the neck.
    mounts: { shoulder: { part: "body", at: [0.95, 0.66, 0.3], along: [1, 0, 0] } },
  };
}

// ---- The grey heron, standing: built at its real size with its feet at the origin (the
// enemy system stands it on the bed; birds.js draws it bigger). The body tilted up in front,
// grey above; the long white neck with its double line of black streaks down the front and
// the pale plumes hanging from its base over the breast; the white face, the black stripe
// from the eye back to the two long black crest plumes; the yellow dagger of a bill; the
// black patches at the bend of the wing; long yellowish legs with their long toes.
export const HERON = {
  // How much bigger than life the game draws it (so its head is where the enemy system
  // keeps it, 16 units over the water, with the neck in an S).
  scale: 2.2,
  // The body's tilt (nose up) and middle.
  tilt: 0.6,
  centre: [-0.62, 5.0, 0],
};
export function heronShape() {
  const b = new Plumage({ feathers: 3.2, ruffle: 0.03, grain: 2.5 });
  const matrix = new THREE.Matrix4().makeRotationZ(HERON.tilt).setPosition(...HERON.centre);
  const body = smoothed([
    { x: -2.25, w: 0, h: 0, y: 0.1 },
    { x: -2.15, w: 0.28, h: 0.18, y: 0.1 },
    { x: -1.6, w: 0.56, h: 0.52, y: 0.05 },
    { x: -0.7, w: 0.74, h: 0.8, y: 0 },
    { x: 0.3, w: 0.76, h: 0.86, y: 0 },
    { x: 1.1, w: 0.64, h: 0.8, y: 0.05 },
    { x: 1.7, w: 0.44, h: 0.6, y: 0.2 },
    { x: 2.05, w: 0.3, h: 0.38, y: 0.35 },
    { x: 2.2, w: 0, h: 0, y: 0.4 },
  ], 30);
  const size = sizeAlong(body);
  const GREY = hex(0x8a9095),
    PALE = hex(0xe4e4e0),
    BLACK = hex(0x19191c),
    YELLOW = hex(0xd9a83a),
    LEG = hex(0x9c8650);
  const inverse = matrix.clone().invert();
  const local = new THREE.Vector3();
  b.add(placed(loft(body, { radial: 26, belly: 0.9 }), matrix), {
    paint: (p) => {
      local.copy(p).applyMatrix4(inverse);
      const { phi } = around(size, local);
      // Grey above, paler grey-white below; the black patches on the sides of the breast
      // at the bend of the wing.
      let c = mix3(GREY, hex(0xcfcfcb), smooth(1.4, 2.0, phi));
      // (A soft oval, darkest at its middle: with square edges it read as a patch stuck on.)
      const patch = 1 - smooth(0.55, 1, Math.hypot((local.x - 1.4) / 0.38, (phi - 1.3) / 0.36));
      c = mix3(c, BLACK, 0.9 * patch);
      const k = 0.93 + 0.12 * hash(p.x * 9, p.y * 9, p.z * 9);
      return [...tint(c, k), DOWN];
    },
  });
  const B = at(matrix, [1.95, 0.4, 0]);
  const NECK = 4.3,
    RISE = 1.31; // the neck's length, and the angle it stands at when straight
  const J0 = [B[0] + Math.cos(RISE) * NECK, B[1] + Math.sin(RISE) * NECK, 0];
  const d0 = new THREE.Vector3(J0[0] - B[0], J0[1] - B[1], 0).normalize();
  // The front of the neck (toward the bill, square to it in the middle plane).
  const front = new THREE.Vector3(d0.y, -d0.x, 0);
  b.add(neckTube(B, J0, (t) => 0.36 - 0.18 * smooth(0, 0.7, t) + 0.02 * smooth(0.85, 1, t), { radial: 16, flat: 0.8, up: new THREE.Vector3(0, 0, 1), samples: 18 }), {
    part: PART.neck,
    pivot: B,
    joint: J0,
    weight: along,
    paint: (p, n, i) => {
      const t = along(p, i);
      const f = n.x * front.x + n.y * front.y;
      // The front of the neck white, with its double line of black streaks, grey behind;
      // the upper neck whiter.
      let c = mix3(hex(0xb6b9bb), PALE, smooth(-0.4, 0.2, f));
      c = mix3(c, hex(0xefefec), smooth(0.6, 0.9, t));
      // (Two rows of black dashes, one each side of the middle of the front.)
      const rows = Math.abs(n.z) > 0.12 && Math.abs(n.z) < 0.5 && f > 0.55;
      const dash = (t * 13 + (n.z > 0 ? 0.5 : 0)) % 1 < 0.6 && t > 0.1 && t < 0.82;
      if (rows && dash) c = tint(BLACK, 1.4);
      return [...c, DOWN];
    },
  });
  // The pale plumes hanging from the base of the neck over the breast.
  for (let i = 0; i < 7; i++) {
    const z = (i - 3) * 0.1;
    const root = new THREE.Vector3(B[0], B[1], 0).addScaledVector(d0, 0.5 + 0.1 * (i % 2)).addScaledVector(front, 0.28);
    root.z = z;
    const drop = 1.3 + 0.35 * Math.sin(i * 2.3);
    const mid = root.clone().add(new THREE.Vector3(0.28, -drop * 0.5, z * 0.4));
    const end = root.clone().add(new THREE.Vector3(0.18 - 0.05 * (i % 3), -drop, z * 0.8));
    b.add(ribbon([root, mid, end], (t) => 0.07 * (1 - 0.7 * t), { flat: 0.2, up: new THREE.Vector3(1, 0, 0) }), { paint: () => [...hex(0xd6d6d2), DOWN] });
  }
  // The head: its joint J0 at the back of the skull, the bill straight forward along +x.
  const S0 = [J0[0] + 0.32, J0[1] + 0.12, 0];
  const head = { part: PART.head, pivot: J0 };
  const skull = [
    { x: -0.5, w: 0, h: 0, y: 0.02 },
    { x: -0.45, w: 0.14, h: 0.16, y: 0.02 },
    { x: -0.25, w: 0.23, h: 0.25, y: 0.03 },
    { x: 0.05, w: 0.23, h: 0.24, y: 0.03 },
    { x: 0.35, w: 0.165, h: 0.17, y: 0.0 },
    { x: 0.5, w: 0.13, h: 0.14, y: -0.02 },
    { x: 0.55, w: 0, h: 0, y: -0.02 },
  ].map((s) => ({ ...s, x: s.x + S0[0], y: s.y + S0[1] }));
  const headSize = sizeAlong(skull);
  b.add(loft(smoothed(skull, 16), { radial: 20 }), {
    ...head,
    paint: (p) => {
      const x = p.x - S0[0];
      const { phi } = around(headSize, p);
      // The white face; the black stripe from above the eye back to the nape.
      let c = PALE;
      const stripe = smooth(0.35, 0.55, phi) * (1 - smooth(1.05, 1.2, phi)) * (1 - smooth(0.12, 0.22, x));
      c = mix3(c, BLACK, stripe);
      c = mix3(c, hex(0xf2f2ef), 1 - smooth(0.2, 0.45, phi));
      return [...c, DOWN];
    },
  });
  const bill = [
    { x: 0.42, w: 0.13, h: 0.15, y: -0.03 },
    { x: 0.9, w: 0.085, h: 0.1, y: -0.04 },
    { x: 1.35, w: 0.045, h: 0.055, y: -0.05 },
    { x: 1.62, w: 0.012, h: 0.015, y: -0.06 },
    { x: 1.68, w: 0, h: 0, y: -0.062 },
  ].map((s) => ({ ...s, x: s.x + S0[0], y: s.y + S0[1] }));
  b.add(loft(bill, { radial: 12, square: 0.2 }), { ...head, paint: (p) => [...(p.y > S0[1] - 0.02 ? hex(0x8f6e2c) : YELLOW), BARE] });
  addEyes(b, [S0[0] + 0.2, S0[1] + 0.08, 0.2], 0.045, hex(0xe8c020), head, 0.3);
  // The two long crest plumes from the nape, and a shorter pair.
  for (const [side, length, droop] of [
    [1, 1.9, 0.3],
    [-1, 1.8, 0.24],
    [1, 1.1, 0.12],
    [-1, 1.0, 0.1],
  ]) {
    // (Drooping steeply back and down from the nape as the head is modelled, bill level: the
    // heron holds its head bill down, and then they trail back over the nape.)
    const root = new THREE.Vector3(S0[0] - 0.32, S0[1] + 0.12, 0.05 * side);
    const mid = root.clone().add(new THREE.Vector3(-length * 0.34, -length * 0.36 - droop * 0.2, 0.05 * side));
    const end = root.clone().add(new THREE.Vector3(-length * 0.6, -length * 0.8 - droop, 0.08 * side));
    b.add(ribbon([root, mid, end], (t) => 0.055 * (1 - 0.85 * t), { flat: 0.25 }), { ...head, paint: () => [...BLACK, DOWN] });
  }
  // The short tail, drooping.
  const tail = [
    { x: -2.0, w: 0.3, h: 0.1, y: 0.12 },
    { x: -2.5, w: 0.36, h: 0.07, y: 0.08 },
    { x: -2.85, w: 0.3, h: 0.05, y: 0.04 },
    { x: -2.98, w: 0, h: 0, y: 0.03 },
  ];
  b.add(placed(loft(tail, { radial: 12 }), matrix), { part: PART.tail, pivot: at(matrix, [-2.1, 0.12, 0]), paint: () => [...tint(GREY, 0.9), DOWN] });
  // The wings: broad, the hand rounded and fingered; folded, grey with the black primaries
  // at the tip.
  const w = wing({
    lead: [
      [1.0, 0.62, 0.5],
      [1.1, 0.8, 2.2],
      [0.9, 0.85, 3.6],
      [0.2, 0.8, 6.0],
      [-1.3, 0.72, 7.9],
    ],
    trail: [
      [-1.4, 0.55, 0.5],
      [-1.5, 0.6, 2.2],
      [-1.6, 0.65, 3.6],
      [-1.9, 0.7, 6.1],
      [-1.3, 0.72, 7.9],
    ],
    wrist: [0.9, 0.85, 3.6],
    arm: 14,
    hand: 9,
    notch: 0.05,
    fingers: 1,
    thick: 0.16,
    S: 40,
    paint: () => [0, 0, 0],
    fold: folder(body, { shoulder: [1.0, 0.62, 0.5], sW: 0.46, length: 4.3, top: 0.28, bottom: 1.5, reach: 0.3 }),
  });
  addWings(
    b,
    w,
    (s, c, top) => {
      // Above: the coverts grey, the flight feathers black; the bend of the wing black too
      // (the patch that shows on the breast when it is folded). Below: grey.
      if (!top) return [...mix3(hex(0x7a7e84), hex(0x55585c), smooth(0.5, 0.7, c)), DOWN];
      let col = mix3(GREY, hex(0xa4aaaf), smooth(0.1, 0.3, c) * (1 - smooth(0.4, 0.5, c)));
      col = mix3(col, BLACK, smooth(0.5, 0.6, c) * smooth(0.25, 0.4, s));
      col = mix3(col, BLACK, smooth(w.sW - 0.02, w.sW + 0.06, s) * smooth(0.25, 0.4, c));
      col = mix3(col, tint(BLACK, 2), (1 - smooth(0.05, 0.15, c)) * smooth(w.sW - 0.08, w.sW - 0.03, s) * (1 - smooth(w.sW + 0.05, w.sW + 0.1, s)));
      return [...col, DOWN];
    },
    matrix,
  );
  // The legs: the feathered thigh in the body, the bare tibia and tarsus down to the long
  // toes spread on the bed.
  const HIP = [-0.1, 4.55, 0.3],
    HEEL = [-0.05, 1.8, 0.3],
    FOOT = [0.02, 0.1, 0.3];
  addLegs(b, {
    hip: HIP,
    heel: HEEL,
    foot: FOOT,
    radius: (t) => (t < 0.18 ? 0.3 - 0.9 * t : 0.13 - 0.05 * t),
    toes: [
      [1, 0.55, 0.95],
      [1, 0, 1.05],
      [1, -0.5, 0.9],
      [-1, 0.05, 0.55],
    ],
    toeRadius: 0.05,
    paint: (p, n) => [...(p.y > 3.7 ? tint(GREY, 1.2) : p.y > 3.2 ? hex(0xb09a5a) : LEG), p.y > 3.7 ? DOWN : BARE],
  });
  return {
    geometry: b.build(),
    neck: { base: B, joint: J0, length: NECK },
    skull: S0,
    beak: [S0[0] + 1.68, S0[1] - 0.062, 0],
    shoulder: at(matrix, w.shoulder),
    wrist: at(matrix, w.wrist),
    hip: HIP,
    heel: HEEL,
    feet: FOOT,
    // The harpoon gun strapped along the head, over the bill, pointing where the bill does.
    mounts: { head: { part: "head", at: [S0[0] + 0.2, S0[1] + 0.26, 0], along: [1, 0, 0] } },
  };
}

// ---- The northern gannet: 93 cm, a white torpedo with long, narrow, pointed wings, the
// whole hand black; the head and nape washed buff-yellow; the pale blue-grey dagger of a bill
// with its black lines; the bare black skin round the pale eye; the wedge of a tail; black
// webbed feet.
export function gannetShape() {
  const b = new Plumage({ feathers: 2.8, ruffle: 0.03, grain: 2.5 });
  const body = smoothed([
    { x: -2.95, w: 0, h: 0, y: 0.1 },
    { x: -2.85, w: 0.22, h: 0.15, y: 0.1 },
    { x: -2.35, w: 0.5, h: 0.42, y: 0.05 },
    { x: -1.35, w: 0.78, h: 0.68, y: 0 },
    { x: -0.2, w: 0.86, h: 0.76, y: 0 },
    { x: 0.8, w: 0.82, h: 0.72, y: 0.02 },
    { x: 1.6, w: 0.66, h: 0.6, y: 0.07 },
    // (The front tapering on into the neck, thinner than it, so the neck leaves the body at a
    // shallow angle: rounded off short in front of it, the two crossed square and drew a dark
    // ring round the neck.)
    { x: 2.2, w: 0.48, h: 0.48, y: 0.14 },
    { x: 2.45, w: 0.34, h: 0.34, y: 0.17 },
    { x: 2.62, w: 0, h: 0, y: 0.19 },
  ], 32);
  const WHITE = hex(0xf3f2ee),
    // (A pale straw wash, not a yellow: saturated, the head read as a yellow ball.)
    BUFF = hex(0xecd08c),
    BLACK = hex(0x141416);
  b.add(loft(body, { radial: 26, belly: 0.92 }), { paint: (p) => [...tint(WHITE, 0.95 + 0.07 * hash(p.x * 8, p.y * 8, p.z * 8)), DOWN] });
  const B = [2.0, 0.12, 0],
    J0 = [2.75, 0.22, 0];
  // (The neck as thick as the back of the head where it goes into it, and thinning inside the
  // head, so the two surfaces cross at an angle: a thinner neck showed the head as a helmet
  // set on it, one as thick all the way ran along the head's surface and flickered with it.)
  b.add(neckTube(B, J0, (t) => 0.5 - 0.08 * t - 0.1 * smooth(0.6, 1, t), { radial: 18 }), {
    part: PART.neck,
    pivot: B,
    joint: J0,
    weight: along,
    paint: (p, n, i) => [...mix3(WHITE, BUFF, smooth(0.35, 1, along(p, i)) * smooth(-0.3, 0.3, n.y)), DOWN],
  });
  const head = { part: PART.head, pivot: J0 };
  const skull = [
    { x: 2.2, w: 0, h: 0, y: 0.2 },
    { x: 2.3, w: 0.36, h: 0.38, y: 0.22 },
    { x: 2.7, w: 0.43, h: 0.45, y: 0.27 },
    { x: 3.0, w: 0.42, h: 0.43, y: 0.27 },
    { x: 3.3, w: 0.34, h: 0.34, y: 0.2 },
    { x: 3.52, w: 0.24, h: 0.25, y: 0.13 },
    { x: 3.6, w: 0, h: 0, y: 0.11 },
  ];
  const headSize = sizeAlong(skull);
  const EYE_AT = [3.22, 0.4, 0.31];
  b.add(loft(smoothed(skull, 16), { radial: 22 }), {
    ...head,
    paint: (p) => {
      const { phi } = around(headSize, p);
      // The buff-yellow crown and nape, white throat; the bare black skin round the eye and
      // forward to the bill, and the black line down the throat.
      // (The wash strongest on the crown and the nape, going on down the neck as the neck's
      // own does, so no line shows where the head joins it.)
      let c = mix3(BUFF, WHITE, smooth(1.25, 1.95, phi));
      const dEye = Math.hypot(p.x - EYE_AT[0], p.y - EYE_AT[1], Math.abs(p.z) - EYE_AT[2]);
      const mask = 1 - smooth(0.1, 0.14, dEye);
      const lore = smooth(3.22, 3.3, p.x) * smooth(1.05, 1.2, phi) * (1 - smooth(1.6, 1.75, phi));
      const gular = smooth(2.75, 2.95, phi) * smooth(3.0, 3.2, p.x);
      c = mix3(c, BLACK, Math.max(mask, lore, gular));
      return [...c, DOWN];
    },
  });
  const bill = [
    { x: 3.45, w: 0.23, h: 0.26, y: 0.12 },
    { x: 3.8, w: 0.17, h: 0.19, y: 0.08 },
    { x: 4.2, w: 0.1, h: 0.12, y: 0.04 },
    { x: 4.55, w: 0.045, h: 0.06, y: 0.0 },
    { x: 4.7, w: 0, h: 0, y: -0.03 },
  ];
  const billSize = sizeAlong(bill);
  b.add(loft(bill, { radial: 14 }), {
    ...head,
    paint: (p) => {
      const s = billSize(p.x);
      // Blue-grey, with the black line along the cutting edge and round its base.
      const edge = Math.abs(p.y - (s.y - 0.1 * s.h)) < 0.025 && Math.abs(p.z) > s.w * 0.6;
      const base = p.x < 3.52;
      return [...(edge || base ? BLACK : hex(0xb4bfca)), BARE];
    },
  });
  addEyes(b, EYE_AT, 0.05, hex(0xcfe0ea), head, 0.3);
  // The long wedge of a tail.
  const tail = [
    { x: -2.7, w: 0.3, h: 0.07, y: 0.12 },
    { x: -3.3, w: 0.42, h: 0.06, y: 0.1 },
    { x: -3.9, w: 0.32, h: 0.05, y: 0.08 },
    { x: -4.4, w: 0.12, h: 0.03, y: 0.06 },
    { x: -4.6, w: 0, h: 0, y: 0.055 },
  ];
  b.add(loft(tail, { radial: 12 }), { part: PART.tail, pivot: [-2.8, 0.1, 0], paint: (p) => [...tint(WHITE, 0.93 + 0.08 * hash(p.x * 10, 0, p.z * 10)), DOWN] });
  const w = wing({
    lead: [
      [0.95, 0.4, 0.55],
      [1.02, 0.46, 1.9],
      [0.8, 0.5, 3.7],
      [-0.3, 0.47, 6.1],
      [-1.5, 0.42, 8.3],
    ],
    trail: [
      [-0.55, 0.36, 0.55],
      [-0.5, 0.4, 1.9],
      [-0.52, 0.42, 3.6],
      [-1.1, 0.44, 6.0],
      [-1.5, 0.42, 8.3],
    ],
    wrist: [0.8, 0.5, 3.7],
    arm: 16,
    hand: 10,
    notch: 0.04,
    thick: 0.12,
    S: 40,
    paint: () => [0, 0, 0],
    fold: folder(body, { shoulder: [0.95, 0.4, 0.55], sW: 0.45, length: 4.3, top: 0.42, bottom: 1.45, reach: 0.3, rise: 0.12 }),
  });
  addWings(b, w, (s, c, top) => {
    // White, the whole hand black, both sides (the primaries and their coverts).
    const hand = smooth(w.sW - 0.01, w.sW + 0.05, s);
    return [...mix3(tint(WHITE, top ? 1 : 0.9), BLACK, hand), DOWN];
  });
  addLegs(b, {
    hip: [-1.3, -0.45, 0.35],
    heel: [-1.5, -0.72, 0.4],
    foot: [-1.68, -0.84, 0.42],
    radius: (t) => 0.1 - 0.03 * t,
    toes: [
      [1, 0.4, 0.62],
      [1, 0, 0.7],
      [1, -0.45, 0.6],
    ],
    toeRadius: 0.03,
    paint: (p, n, lower) => [...(lower ? hex(0x1c201c) : WHITE), lower ? BARE : DOWN],
  });
  return {
    geometry: b.build(),
    neck: { base: B, joint: J0 },
    skull: [3.0, 0.3, 0],
    beak: [4.7, -0.03, 0],
    shoulder: w.shoulder,
    wrist: w.wrist,
    hip: [-1.3, -0.45, 0.35],
    // The bombs hang under the roots of the wings, on the body itself (not the wings, which
    // fold back past them in the dive), where the enemy system lets them go: 8 % of its length
    // out to each side and a little below its middle.
    mounts: {
      left: { part: "body", at: [0.3, -0.42, -0.72], along: [1, 0, 0] },
      right: { part: "body", at: [0.3, -0.42, 0.72], along: [1, 0, 0] },
    },
  };
}

export const SHAPES = { kingfisher: kingfisherShape, merganser: merganserShape, heron: heronShape, gannet: gannetShape };
