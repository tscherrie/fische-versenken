// The workshop for the weapon models and the harness: a small kit that builds low-poly
// solids (boxes, turned parts, tubes along a path, rings, plates) straight into one set of
// vertex buffers. Every vertex carries its colour and a code for the kind of surface it is
// (webbing, polymer, steel, brass, a glowing lens ...), so that all the gear of all the
// players is drawn with ONE material: one shader to compile, and a whole weapon in one draw.
//
// Model units throughout: the fish's body is 0.79 long, +x runs from the tail to the head,
// +y is the back and +z the fish's right.

import * as THREE from "three";

// The kinds of surface. The material looks up roughness and metalness by this number
// (SURFACES), so a steel pin next to a walnut grip in the same mesh still shines like steel.
export const ZONE = {
  fabric: 0, // nylon webbing, cord, rope
  polymer: 1, // moulded plastic, the saddle
  alu: 2, // anodised aluminium
  steel: 3, // bare or blued steel (blued = a darker colour)
  wood: 4, // oiled walnut
  brass: 5, // brass, bronze, copper
  lacquer: 6, // the scabbard's black lacquer
  glow: 7, // lit from inside by the weapon (lens, hot barrels, coil): the object's glow
  polished: 8, // mirror steel (a drawn blade)
  ceramic: 9, // white-grey ceramic (the particle beam)
  rubber: 10, // foam, rubber, the dark inside of a slot
  paint: 11, // painted steel (tanks, ammo cans, mines)
  parker: 12, // matte parkerised steel
  glass: 13, // lenses and sight windows
  light: 14, // always lit (a pilot flame, a red dot, a status lamp)
  bronze: 15, // old gun bronze, dulled
};

// Roughness and metalness by zone (baked into each vertex: see Kit.geometry).
export const SURFACES = [
  [0.92, 0], // fabric
  [0.58, 0], // polymer
  [0.42, 0.3], // anodised aluminium: a dyed oxide over metal, more lacquer than mirror
  [0.36, 1], // steel
  [0.62, 0], // wood
  [0.3, 1], // brass
  [0.15, 0.1], // lacquer
  [0.25, 0.2], // glow
  [0.1, 1], // mirror steel
  [0.35, 0], // ceramic
  [0.95, 0], // rubber
  [0.55, 0.08], // paint
  [0.62, 0.6], // parkerised steel
  [0.06, 0.4], // glass
  [0.5, 0], // lamp
  [0.52, 0.55], // old gun bronze: warm, dulled by the sea
];

// How a vertex follows the spawner's hump (the fish's own shader lifts its back by up to 42 %):
// rigid (the belly, moving parts, which the code places itself), follow (the harness: every
// vertex rises exactly like the skin under it), or riding up with the rail or the side clamps
// as one rigid piece (a weapon must not bend).
export const MODE = { rigid: 0, follow: 1, rail: 2, side: 3 };

// What a vertex of a weapon belongs to, for the one-draw weapon: 0 the mount (clamp feet,
// bands, cradles, the cables to the fire-control box: bolted to the fish, never moves), 1 the
// gun (kicks back with each shot), 2 and 3 moving parts (barrels that turn or break open, a
// cylinder, a drawn sword and its arm, doors ...), each placed by a matrix of its own.
export const PART = { mount: 0, gun: 1, a: 2, b: 3 };

// The darkest a painted surface gets (linear): black gun parts under water otherwise read as
// holes. Real holes (a bore, a chamber mouth: colours below 0.003) stay black.
export const ALBEDO_FLOOR = 0.03;
export function lift(rgb) {
  return rgb.map((c) => (c < 0.003 ? c : ALBEDO_FLOOR + c * (1 - ALBEDO_FLOOR)));
}
const colourScratch = new THREE.Color();
// A colour for the vertex buffers, linear, from a hex number (sRGB) or an [r, g, b] list.
export function colour(c) {
  if (Array.isArray(c)) return c;
  colourScratch.setHex(c);
  return [colourScratch.r, colourScratch.g, colourScratch.b];
}
// A colour lighter or darker by a factor.
export function shade(c, f) {
  const [r, g, b] = colour(c);
  return [r * f, g * f, b * f];
}
export function mixColour(a, b, t) {
  const [ar, ag, ab] = colour(a),
    [br, bg, bb] = colour(b);
  return [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t];
}

// Matrices, short.
export const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
export const RX = (a) => new THREE.Matrix4().makeRotationX(a);
export const RY = (a) => new THREE.Matrix4().makeRotationY(a);
export const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);
export const S = (x, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z);
export const M = (...ms) => ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4());
// A frame at `origin` whose local x runs along `xAxis` and local y as close to `yHint` as
// possible (local z = x cross y).
export function frame(origin, xAxis, yHint) {
  const x = new THREE.Vector3(...xAxis).normalize();
  const z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(...yHint)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin[0], origin[1], origin[2]);
}

// A repeatable random stream (the colour-case mottling, the patina), so that every build of
// a weapon looks the same.
export function stream(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const v = new THREE.Vector3(),
  n = new THREE.Vector3();
const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};
export const vec = { sub, add, scale, cross, dot, unit };

// A circle of `count` points of radius r in the local y-z plane (round the x axis).
export function circle(count, r, phase = 0, ry = r) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * TAU;
    out.push([Math.cos(a) * ry, Math.sin(a) * r]);
  }
  return out;
}
// A rectangle in the y-z plane with its corners cut by `b` (8 points), or plain (4).
export function rect(y0, y1, z0, z1, b = 0) {
  if (b <= 0)
    return [
      [y0, z0],
      [y1, z0],
      [y1, z1],
      [y0, z1],
    ];
  return [
    [y0 + b, z0],
    [y1 - b, z0],
    [y1, z0 + b],
    [y1, z1 - b],
    [y1 - b, z1],
    [y0 + b, z1],
    [y0, z1 - b],
    [y0, z0 + b],
  ];
}

// Per vertex, besides place and normal: its colour and what it is (INFO numbers each).
const INFO = 6; // zone, mode, part, team, slot (1-based, 0 = none), slots

export class Kit {
  constructor({ part = PART.mount, mode = MODE.rigid, detail = true } = {}) {
    this.positions = [];
    this.normals = [];
    this.rgbs = [];
    this.info = [];
    this.indices = [];
    this.matrix = new THREE.Matrix4();
    this.normalMatrix = new THREE.Matrix3();
    this.stack = [];
    this.rgb = [0.5, 0.5, 0.5];
    this.zone = ZONE.steel;
    this.mode = mode;
    this.part = part;
    // Team fabric: the colour is a factor on the player's webbing colour (co-op).
    this.team = 0;
    // An item that can be hidden (a rocket in its tube, a torpedo's nose, a mine): its slot
    // of `slots` (see models.js: the ammunition window).
    this.slot = 0;
    this.slots = 0;
    // Small detail (stitch rows, rail teeth, bolt heads, D-rings) is left out when false.
    this.detail = detail;
  }
  get count() {
    return this.positions.length / 3;
  }
  // The colour and surface for what is built next.
  paint(c, zone = this.zone) {
    this.rgb = colour(c);
    this.zone = zone;
    return this;
  }
  // What is built next is item `slot` (0-based) of `slots`; item(null) ends the items.
  item(slot, slots) {
    this.slot = slot === null ? 0 : slot + 1;
    this.slots = slot === null ? 0 : slots;
    return this;
  }
  push(m) {
    this.stack.push([this.matrix.clone(), this.rgb, this.zone, this.mode, this.part, this.team]);
    if (m) this.matrix.multiply(m);
    this.normalMatrix.getNormalMatrix(this.matrix);
    return this;
  }
  pop() {
    const [m, rgb, zone, mode, part, team] = this.stack.pop();
    this.matrix.copy(m);
    this.rgb = rgb;
    this.zone = zone;
    this.mode = mode;
    this.part = part;
    this.team = team;
    this.normalMatrix.getNormalMatrix(this.matrix);
    return this;
  }
  // Build inside a frame (the paint and mode set inside are undone afterwards).
  with(m, build) {
    this.push(m);
    build(this);
    this.pop();
    return this;
  }
  vertex(p, normal, rgb = this.rgb) {
    v.set(p[0], p[1], p[2]).applyMatrix4(this.matrix);
    n.set(normal[0], normal[1], normal[2]).applyMatrix3(this.normalMatrix).normalize();
    this.positions.push(v.x, v.y, v.z);
    this.normals.push(n.x, n.y, n.z);
    this.rgbs.push(rgb[0], rgb[1], rgb[2]);
    this.info.push(this.zone, this.mode, this.part, this.team, this.slot, this.slots);
    return this.count - 1;
  }
  // A triangle, wound so that its front faces the way its vertices' normals point (so no
  // primitive has to get its winding right by hand); slivers of no area are left out.
  tri(a, b, c) {
    const P = this.positions,
      N = this.normals;
    const ax = P[a * 3],
      ay = P[a * 3 + 1],
      az = P[a * 3 + 2];
    const e1 = [P[b * 3] - ax, P[b * 3 + 1] - ay, P[b * 3 + 2] - az];
    const e2 = [P[c * 3] - ax, P[c * 3 + 1] - ay, P[c * 3 + 2] - az];
    const f = cross(e1, e2);
    const area = Math.hypot(f[0], f[1], f[2]);
    if (area < 1e-13) return;
    const s = [N[a * 3] + N[b * 3] + N[c * 3], N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]];
    if (dot(f, s) >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }
  quad(a, b, c, d) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  // A flat convex polygon (points in the current frame) facing `normal`.
  face(points, normal, rgb = this.rgb) {
    const ids = points.map((p) => this.vertex(p, normal, rgb));
    for (let i = 1; i < ids.length - 1; i++) this.tri(ids[0], ids[i], ids[i + 1]);
  }

  // An axis-aligned box in the current frame.
  box(x0, x1, y0, y1, z0, z1, rgb = this.rgb) {
    const c = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    const faces = [
      [[0, 3, 7, 4], [-1, 0, 0]],
      [[1, 5, 6, 2], [1, 0, 0]],
      [[0, 4, 5, 1], [0, -1, 0]],
      [[3, 2, 6, 7], [0, 1, 0]],
      [[0, 1, 2, 3], [0, 0, -1]],
      [[4, 7, 6, 5], [0, 0, 1]],
    ];
    for (const [ids, nrm] of faces) this.face(ids.map((i) => c[i]), nrm, rgb);
    return this;
  }
  // A box with its four long edges (along x) cut at 45 degrees by `b`.
  bevelBox(x0, x1, y0, y1, z0, z1, b, rgb = this.rgb) {
    return this.prism(x0, x1, rect(y0, y1, z0, z1, b), { rgb });
  }
  // A straight prism along x from a convex section in the y-z plane (flat faces), with an
  // optional taper: the far end scaled by `taper` round (cy, cz) and shifted by `shift`.
  prism(x0, x1, section, { rgb = this.rgb, taper = 1, shift = [0, 0], centre = null, caps = [true, true], smooth = false } = {}) {
    const cy = centre ? centre[0] : section.reduce((s, p) => s + p[0], 0) / section.length;
    const cz = centre ? centre[1] : section.reduce((s, p) => s + p[1], 0) / section.length;
    const a = section.map(([y, z]) => [x0, y, z]);
    const b = section.map(([y, z]) => [x1, cy + (y - cy) * taper + shift[0], cz + (z - cz) * taper + shift[1]]);
    return this.loft([a, b], { flat: !smooth, capStart: caps[0], capEnd: caps[1], rgb });
  }

  // A surface through rings of 3D points (each ring closed round, all rings the same size).
  // flat: every face its own normal; otherwise smooth round the rings, with a crease between
  // bands that meet at a sharp angle (a turned part's shoulders stay sharp). band(i) may give
  // each band its own colour (crisp stripes: bands do not share vertices); caps close the ends.
  loft(rings, { flat = false, capStart = false, capEnd = false, rgb = this.rgb, band = null, capRgb = null, crease = 0.6, open = false } = {}) {
    const R = rings.length,
      C = rings[0].length;
    const wrap = open ? C - 1 : C;
    const centre = rings.map((ring) => scale(ring.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / C));
    // Face normals of each band (quads i..i+1 x j..j+1), turned away from the axis.
    const faceN = [];
    for (let i = 0; i < R - 1; i++) {
      const row = [];
      const axis = scale(add(centre[i], centre[i + 1]), 0.5);
      for (let j = 0; j < wrap; j++) {
        const j1 = (j + 1) % C;
        const p00 = rings[i][j],
          p01 = rings[i][j1],
          p10 = rings[i + 1][j],
          p11 = rings[i + 1][j1];
        let f = unit(cross(sub(p11, p00), sub(p10, p01)));
        const mid = scale(add(add(p00, p01), add(p10, p11)), 0.25);
        if (dot(f, sub(mid, axis)) < 0) f = scale(f, -1);
        row.push(f);
      }
      faceN.push(row);
    }
    // The normal of ring i's vertex j as part of band b: its band's two faces round j, and the
    // neighbouring band's too where the surface bends gently across ring i.
    const vertexNormal = (i, j, b) => {
      const jm = open ? Math.max(0, j - 1) : (j - 1 + C) % C;
      const jj = open ? Math.min(wrap - 1, j) : j % C;
      let s = add(faceN[b][jm], faceN[b][jj]);
      const other = b === i ? i - 1 : i;
      if (other >= 0 && other < R - 1) {
        const o = add(faceN[other][jm], faceN[other][jj]);
        if (dot(unit(o), unit(s)) > crease) s = add(s, o);
      }
      return unit(s);
    };
    for (let i = 0; i < R - 1; i++) {
      const colourOf = band ? colour(band(i)) : rgb;
      if (flat) {
        for (let j = 0; j < wrap; j++) {
          const j1 = (j + 1) % C;
          const f = faceN[i][j];
          const q = [rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]].map((p) => this.vertex(p, f, colourOf));
          this.quad(q[0], q[1], q[2], q[3]);
        }
      } else {
        const a = [],
          b = [];
        for (let j = 0; j < C; j++) {
          a.push(this.vertex(rings[i][j], vertexNormal(i, j, i), colourOf));
          b.push(this.vertex(rings[i + 1][j], vertexNormal(i + 1, j, i), colourOf));
        }
        for (let j = 0; j < wrap; j++) {
          const j1 = (j + 1) % C;
          this.quad(a[j], a[j1], b[j1], b[j]);
        }
      }
    }
    const cap = (i, towards) => {
      const ring = rings[i];
      let f = [0, 0, 0];
      for (let j = 0; j < C; j++) f = add(f, cross(ring[j], ring[(j + 1) % C]));
      f = unit(f);
      if (dot(f, sub(centre[towards], centre[i])) > 0) f = scale(f, -1);
      const c = capRgb ? colour(capRgb) : band ? colour(band(i === 0 ? 0 : R - 2)) : rgb;
      const mid = this.vertex(centre[i], f, c);
      const ids = ring.map((p) => this.vertex(p, f, c));
      for (let j = 0; j < C; j++) this.tri(mid, ids[j], ids[(j + 1) % C]);
    };
    if (capStart && R > 1) cap(0, 1);
    if (capEnd && R > 1) cap(R - 1, R - 2);
    return this;
  }

  // A turned part along x: profile [[x, r], ...] (r may be 0 at a tip), `sides` round.
  lathe(profile, sides = 12, { phase = 0, rgb = this.rgb, band = null, capStart = true, capEnd = true, flat = false, ry = 1, crease = 0.6, centre = [0, 0] } = {}) {
    const rings = profile.map(([x, r]) => circle(sides, r, phase, r * ry).map(([y, z]) => [x, y + centre[0], z + centre[1]]));
    return this.loft(rings, { rgb, band, capStart: capStart && profile[0][1] > 1e-6, capEnd: capEnd && profile[profile.length - 1][1] > 1e-6, flat, crease });
  }
  // A cylinder (or a cone frustum) along x.
  cylinder(x0, x1, r0, r1 = r0, sides = 12, options = {}) {
    return this.lathe(
      [
        [x0, r0],
        [x1, r1],
      ],
      sides,
      options,
    );
  }

  // A tube along a path of 3D points, `sides` round; r may be a number or a function of the
  // path's fraction t. The rings are carried along without twisting (parallel transport).
  tube(path, r, sides = 6, { rgb = this.rgb, band = null, capStart = true, capEnd = true, flat = false, phase = 0 } = {}) {
    const rings = [];
    let normal = null;
    for (let i = 0; i < path.length; i++) {
      const prev = path[Math.max(0, i - 1)],
        next = path[Math.min(path.length - 1, i + 1)];
      const t = unit(sub(next, prev));
      if (!normal) {
        const helper = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        normal = unit(cross(cross(t, helper), t));
      } else normal = unit(sub(normal, scale(t, dot(normal, t))));
      const binormal = cross(t, normal);
      const radius = typeof r === "function" ? r(i / (path.length - 1)) : r;
      const ring = [];
      for (let j = 0; j < sides; j++) {
        const a = phase + (j / sides) * TAU;
        ring.push(add(path[i], add(scale(normal, Math.cos(a) * radius), scale(binormal, Math.sin(a) * radius))));
      }
      rings.push(ring);
    }
    return this.loft(rings, { rgb, band, capStart, capEnd, flat });
  }

  // A flat disc facing +x (or -x) at x, round (cy, cz): a tube's mouth, a lens, a lid.
  disc(x, r, { centre = [0, 0], sides = 10, facing = 1, rgb = this.rgb, ry = r } = {}) {
    const mid = this.vertex([x, centre[0], centre[1]], [facing, 0, 0], rgb);
    const ids = circle(sides, r, 0, ry).map(([y, z]) => this.vertex([x, y + centre[0], z + centre[1]], [facing, 0, 0], rgb));
    for (let j = 0; j < sides; j++) this.tri(mid, ids[j], ids[(j + 1) % sides]);
    return this;
  }

  // A sphere (or an ellipsoid with radii r, ry, rz) at c.
  sphere(c, r, { wide = 12, high = 8, rgb = this.rgb, ry = r, rz = r } = {}) {
    const rows = [];
    for (let i = 0; i <= high; i++) {
      const th = (i / high) * Math.PI;
      const row = [];
      for (let j = 0; j <= wide; j++) {
        const ph = (j / wide) * TAU;
        const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        row.push(this.vertex([c[0] + d[0] * r, c[1] + d[1] * ry, c[2] + d[2] * rz], unit([d[0] / r, d[1] / ry, d[2] / rz]), rgb));
      }
      rows.push(row);
    }
    for (let i = 0; i < high; i++) for (let j = 0; j < wide; j++) this.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
    return this;
  }

  // A ring (torus) in the local y-z plane round the x axis: major radius R, tube radius r,
  // over `arc` radians from `start` (a whole ring by default).
  torus(R, r, { major = 16, minor = 6, arc = TAU, start = 0, rgb = this.rgb, rz = R } = {}) {
    const whole = Math.abs(arc - TAU) < 1e-6;
    const steps = whole ? major : major + 1;
    const rows = [];
    for (let i = 0; i < steps; i++) {
      const ph = start + (i / major) * arc;
      const radial = [0, Math.cos(ph), Math.sin(ph)];
      const centre = [0, Math.cos(ph) * R, Math.sin(ph) * rz];
      const row = [];
      for (let j = 0; j < minor; j++) {
        const th = (j / minor) * TAU;
        const d = add(scale(radial, Math.cos(th)), [Math.sin(th), 0, 0]);
        row.push(this.vertex(add(centre, scale(d, r)), d, rgb));
      }
      rows.push(row);
    }
    for (let i = 0; i < major; i++) {
      const i1 = whole ? (i + 1) % major : i + 1;
      if (i1 >= rows.length) break;
      for (let j = 0; j < minor; j++) {
        const j1 = (j + 1) % minor;
        this.quad(rows[i][j], rows[i][j1], rows[i1][j1], rows[i1][j]);
      }
    }
    return this;
  }

  // A flat plate: a polygon (may be concave) in the local x-y plane, from z0 to z1.
  plate(points, z0, z1, { rgb = this.rgb, sides = true } = {}) {
    const shape = points.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(shape, []);
    for (const [z, nz] of [
      [z0, -1],
      [z1, 1],
    ]) {
      const ids = points.map(([x, y]) => this.vertex([x, y, z], [0, 0, nz], rgb));
      for (const [a, b, c] of tris) this.tri(ids[a], ids[b], ids[c]);
    }
    if (sides) {
      const clockwise = THREE.ShapeUtils.isClockWise(shape);
      for (let i = 0; i < points.length; i++) {
        const p = points[i],
          q = points[(i + 1) % points.length];
        let nx = q[1] - p[1],
          ny = -(q[0] - p[0]);
        if (clockwise) (nx = -nx), (ny = -ny);
        const l = Math.hypot(nx, ny) || 1;
        const f = [nx / l, ny / l, 0];
        this.face(
          [
            [p[0], p[1], z0],
            [q[0], q[1], z0],
            [q[0], q[1], z1],
            [p[0], p[1], z1],
          ],
          f,
          rgb,
        );
      }
    }
    return this;
  }

  // A quad split into a diamond in its middle and four corner triangles, each with its own
  // colour (the wrap of a sword grip, the holes of a perforated heat shield). Corners in
  // order round; normals per corner.
  diamond(corners, normals, inner, outer) {
    const mid = (a, b) => scale(add(a, b), 0.5);
    const e = [0, 1, 2, 3].map((i) => mid(corners[i], corners[(i + 1) % 4]));
    const en = [0, 1, 2, 3].map((i) => unit(add(normals[i], normals[(i + 1) % 4])));
    const d = e.map((p, i) => this.vertex(p, en[i], inner));
    this.quad(d[0], d[1], d[2], d[3]);
    for (let i = 0; i < 4; i++) {
      const c = this.vertex(corners[i], normals[i], outer);
      const a = this.vertex(e[i], en[i], outer);
      const b = this.vertex(e[(i + 3) % 4], en[(i + 3) % 4], outer);
      this.tri(c, a, b);
    }
  }

  // Recolour the vertices made since `from` by a function of their place and colour (patina
  // in a bronze gun's recesses, rust streaks on a mine). A fourth value sets the surface kind
  // too (the windings of a coil that glow).
  tint(from, fn) {
    const P = this.positions,
      G = this.rgbs;
    for (let i = from; i < this.count; i++) {
      const rgb = fn([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], [G[i * 3], G[i * 3 + 1], G[i * 3 + 2]], i);
      if (!rgb) continue;
      G[i * 3] = rgb[0];
      G[i * 3 + 1] = rgb[1];
      G[i * 3 + 2] = rgb[2];
      if (rgb.length > 3) this.info[i * INFO] = rgb[3];
    }
    return this;
  }

  // Everything another kit built, added to this one (a weapon's moving parts into its mesh).
  append(other) {
    const base = this.count;
    for (const [to, from] of [
      [this.positions, other.positions],
      [this.normals, other.normals],
      [this.rgbs, other.rgbs],
      [this.info, other.info],
    ])
      for (const v of from) to.push(v);
    for (const i of other.indices) this.indices.push(base + i);
    return this;
  }

  // The buffers, as a geometry for the gear material: position, normal, aGear (linear colour
  // and a code: zone + 16 mode + 64 part + 256 team) and aSurf (roughness, metalness, slot,
  // slots). Four vertex buffers.
  geometry() {
    const n = this.count;
    const gear = new Float32Array(n * 4),
      surf = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const [zone, mode, part, team, slot, slots] = this.info.slice(i * INFO, i * INFO + INFO);
      let rgb = this.rgbs.slice(i * 3, i * 3 + 3);
      // (Glow and lamps keep their colour, team fabric is a factor: the team colour is lifted.)
      if (!team && zone !== ZONE.glow && zone !== ZONE.light) rgb = lift(rgb);
      gear.set([rgb[0], rgb[1], rgb[2], zone + 16 * mode + 64 * part + 256 * team], i * 4);
      surf.set([SURFACES[zone][0], SURFACES[zone][1], slot, slots], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("aGear", new THREE.BufferAttribute(gear, 4));
    g.setAttribute("aSurf", new THREE.BufferAttribute(surf, 4));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
  // Rewrite an existing geometry's positions and normals from this kit (same topology).
  writeInto(g) {
    const p = g.attributes.position,
      q = g.attributes.normal;
    if (p.count !== this.count) return false;
    p.array.set(this.positions);
    q.array.set(this.normals);
    p.needsUpdate = q.needsUpdate = true;
    return true;
  }
  get triangles() {
    return this.indices.length / 3;
  }
}

// Points along a Catmull-Rom curve through `points`, `count` in all.
export function curve(points, count) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  return c.getPoints(count - 1).map((p) => [p.x, p.y, p.z]);
}
// A coil (helix) round the straight line from a to b: `turns` turns of radius r.
export function helix(a, b, turns, r, perTurn = 8) {
  const axis = sub(b, a);
  const t = unit(axis);
  const helper = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = unit(cross(t, helper)),
    w = cross(t, u);
  const out = [];
  const steps = Math.max(2, Math.round(turns * perTurn));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const ang = f * turns * TAU;
    const env = Math.min(1, f * 6, (1 - f) * 6);
    out.push(add(add(a, scale(axis, f)), add(scale(u, Math.cos(ang) * r * env), scale(w, Math.sin(ang) * r * env))));
  }
  return out;
}
// The convex hull (anticlockwise) of 2D points.
export function hull2(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossZ = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [],
    upper = [];
  for (const q of p) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
// A closed 2D polygon resampled to `count` points evenly spaced along its outline.
export function resample(poly, count, start = 0) {
  const lengths = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    lengths.push(lengths[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[poly.length];
  const out = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const d = (((start + k / count) % 1) + 1) % 1 * total;
    seg = 0;
    while (seg < poly.length - 1 && lengths[seg + 1] < d) seg++;
    const a = poly[seg],
      b = poly[(seg + 1) % poly.length];
    const f = (d - lengths[seg]) / Math.max(1e-9, lengths[seg + 1] - lengths[seg]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
