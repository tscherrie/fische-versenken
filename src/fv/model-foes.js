// The enemies' weapons as solid things, strapped on the way the salmon's are: black webbing
// round the body, a plate or a clamp where the gun sits, and the gun itself -- the fixed
// weapon of each kind (kinds.js, `weapon.id`), modelled low-poly from its real shape in real
// materials, far too big for the animal that carries it. Nothing here may look like a toy:
// the joke is the contrast with the gentle fish game.
//
// Each kind's gear is one geometry for the gear material (model-parts.js: colour and surface
// per vertex), built in the frame its body is drawn in:
//   fish    the fish's model units (anatomy.js: 0.79 long, the snout at x 0.35, +y the back,
//           +z the fish's right); the harness is laid on the body's own profile
//   bird    the bird model's own units (creatures.js, enemies.js), which the bird's matrix
//           scales to its size
//   head    the heron's gun: world units, from its head along its aim (+x), the gun's top
//           toward the bird (+y)
//   larva   the larva's units (larva-shapes.js: a unit long, head at +x)
// A builder returns { kit, pivot, muzzles, part, recoil, aim, items, ... }: the gun (PART.gun
// and its moving part PART.a) turns about `pivot` toward its aim within `aim` [yaw, pitch]
// radians and kicks back along its bore; the mount and the harness (PART.mount) stay on the
// body; `part` says how the moving part moves (turned about `axis` through `pivot`, or slid
// along it); ammunition that goes and comes back (a bolt, the bombs, the throwing stars) is
// made of items (Kit.item) that the material hides beyond the count still loaded.

import * as THREE from "three";
import { BODIES } from "../anatomy.js";
import { PALETTE, bodyFrame, bodyShape, buildHarness } from "./model-harness.js";
import { Kit, PART, ZONE, circle, colour, curve, frame, rect, shade, stream, T, RX, RY, RZ, M, vec } from "./model-parts.js";
import { C, WEAPON_MODELS } from "./model-weapons.js";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
// The enemies' webbing: coyote brown, apart from the black guns, and light enough to read on
// a dark fish under water.
const WEB = 0x6b5a3e;
const BUCKLE = 0x2a2c2e;
// A ground edge or a bright blade: satin steel that catches what light there is under water
// (a mirror finish would only show the dark water round it).
const EDGE = 0xc4c8cc;

// ---------------------------------------------------------------------------------------
// The harness on a fish body.

const shapes = {};
const shape = (body) => (shapes[body] ??= bodyShape(BODIES[body]));
// Where the gill cover of a body lies (anatomy.js: its flare reaches from 0.02 behind this to
// 0.07 ahead of it).
const gillOf = (body) => BODIES[body].gill ?? BODIES[body].eye.x - 0.085;

// The body's section at x, `d` off the skin, as a ring of `n` points (top first, down the right
// side and up the left).
function section(S, x, d, n) {
  const out = [];
  for (let j = 0; j < n; j++) {
    const t = (j / n) * 2;
    out.push(S.off(x, Math.cos(Math.PI * t), t <= 1 ? 1 : -1, d).p);
  }
  return out;
}

// A webbing strap round the body at x: a band `w` wide standing `d` off the skin, with its two
// edges down to the skin (so it has a thickness where it is seen edge on). (Straps go behind
// the gill covers -- gillOf -- which flare out as the fish breathes and would swallow them.)
function strap(k, S, x, { w = 0.014, d = 0.003, n = 16, rgb = WEB } = {}) {
  k.paint(rgb, ZONE.fabric);
  k.loft([section(S, x - w / 2, d * 0.25, n), section(S, x - w / 2, d, n), section(S, x + w / 2, d, n), section(S, x + w / 2, d * 0.25, n)], { crease: 0.5 });
}
// A cam buckle on a strap, at v round the section (1 the top, -1 the belly) on `side`.
function buckle(k, S, x, v, side, size = 0.01) {
  const o = S.off(x, v, side, 0.003);
  k.push(frame(o.p, [1, 0, 0], o.n));
  k.paint(BUCKLE, ZONE.parker);
  k.bevelBox(-size * 0.55, size * 0.55, 0, size * 0.28, -size * 0.45, size * 0.45, size * 0.08);
  k.paint(shade(BUCKLE, 0.6), ZONE.rubber);
  k.box(-size * 0.4, size * 0.4, size * 0.28, size * 0.34, -size * 0.2, size * 0.2);
  k.pop();
}

// A plate over the skin from x0 to x1, across the columns `cols` ([v, side] pairs, one edge to
// the other), `d1` off the skin with its rim down to `d0`: the saddle on the back, a side plate.
function patch(k, S, x0, x1, cols, { d0 = 0.001, d1 = 0.0052, rows = 3, rgb = PALETTE.molle, zone = ZONE.polymer } = {}) {
  k.paint(rgb, zone);
  const at = (i, r, d) => S.off(x0 + ((x1 - x0) * r) / rows, cols[i][0], cols[i][1], d);
  const grid = [];
  for (let i = 0; i < cols.length; i++) {
    const row = [];
    for (let r = 0; r <= rows; r++) {
      const o = at(i, r, d1);
      row.push(k.vertex(o.p, o.n));
    }
    grid.push(row);
  }
  for (let i = 0; i + 1 < cols.length; i++) for (let r = 0; r < rows; r++) k.quad(grid[i][r], grid[i + 1][r], grid[i + 1][r + 1], grid[i][r + 1]);
  // The rim, all the way round.
  const rim = [];
  for (let i = 0; i < cols.length; i++) rim.push([i, 0]);
  for (let r = 1; r <= rows; r++) rim.push([cols.length - 1, r]);
  for (let i = cols.length - 2; i >= 0; i--) rim.push([i, rows]);
  for (let r = rows - 1; r >= 1; r--) rim.push([0, r]);
  const mid = at(cols.length >> 1, rows >> 1, d1).p;
  for (let m = 0; m < rim.length; m++) {
    const [i0, r0] = rim[m],
      [i1, r1] = rim[(m + 1) % rim.length];
    const a0 = at(i0, r0, d0).p,
      b0 = at(i1, r1, d0).p,
      a1 = at(i0, r0, d1).p,
      b1 = at(i1, r1, d1).p;
    const c = vec.scale(vec.add(a1, b1), 0.5);
    const out = vec.unit(vec.sub(c, mid));
    k.face([a0, b0, b1, a1], out);
  }
}
// Columns across the back from v = vmin on the left over the top to vmin on the right.
function backCols(vmin, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = -1 + (2 * i) / n;
    out.push([1 - (1 - vmin) * Math.abs(a), a < 0 ? -1 : 1]);
  }
  return out;
}
// Columns down one flank from v0 to v1.
function flankCols(v0, v1, side, n = 4) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push([v0 + ((v1 - v0) * i) / n, side]);
  return out;
}
// A steel strut from a to b (an outrigger arm, a post).
function strut(k, a, b, r, rgb = C.parker) {
  k.paint(rgb, ZONE.parker);
  k.tube([a, b], r, 6);
}
// A quick-release clamp: a jaw block round a gun at p (its bore along x), `r` its radius.
function clamp(k, p, r, len = r * 2.2) {
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.push(T(p[0], p[1], p[2]));
  k.lathe(
    [
      [-len / 2, r * 1.28],
      [len / 2, r * 1.28],
    ],
    10,
    { crease: 0.3 },
  );
  k.paint(C.steel, ZONE.steel);
  k.box(-len * 0.15, len * 0.15, r * 1.2, r * 1.6, -r * 0.35, r * 0.35);
  k.pop();
}

// A swivel mount: an arm (or a post) from the harness at `foot` to a ball joint at P, the gun's
// pivot (all that stays on the body), and on the joint a yoke that turns with the gun, clamped
// round its bore (radius r) at `clamps` (along the gun from P), the bore `lift` over the joint.
function swivel(k, foot, P, { r = 0.009, arm = 0.0055, clamps = [-0.012, 0.012], lift = 0.012 } = {}) {
  const part = k.part;
  k.part = PART.mount;
  strut(k, foot, P, arm);
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.sphere(P, arm * 1.7, { wide: 10, high: 6 });
  k.part = PART.gun;
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.bevelBox(P[0] + clamps[0], P[0] + clamps[1], P[1], P[1] + lift - r, P[2] - r * 0.55, P[2] + r * 0.55, r * 0.15);
  for (const dx of clamps) clamp(k, [P[0] + dx, P[1] + lift, P[2]], r, r * 1.5);
  k.part = part;
}

// ---------------------------------------------------------------------------------------
// The guns, each in its own frame: the bore along +x, the top +y, the origin where it sits in
// its mount; `s` scales it. Each returns its muzzles in that frame.

// Walnut in bands along a loft.
const wood = (base, seed) => {
  const rnd = stream(seed);
  return () => shade(base, 0.8 + rnd() * 0.4);
};
// A turned barrel with a dark bore at its mouth, from x0 to x1 round (cy, cz).
function barrel(k, x0, x1, r, { cy = 0, cz = 0, sides = 10, rgb = C.blued, zone = ZONE.steel, lip = 0.8 } = {}) {
  k.paint(rgb, zone);
  k.lathe(
    [
      [x0, r],
      [x1, r],
      [x1, r * lip],
      [x1 - r * 1.5, 0],
    ],
    sides,
    { centre: [cy, cz], band: (i) => (i < 1 ? rgb : C.bore), capStart: true },
  );
}
// A pistol grip hanging from (x, y) back and down at `rake` radians, h long.
function grip(k, x, y, h, w, t, rake = 0.3, rgb = 0x262626, zone = ZONE.polymer) {
  k.paint(rgb, zone);
  k.with(M(T(x, y, 0), RZ(-Math.PI / 2 - rake)), () => k.bevelBox(0, h, -w / 2, w / 2, -t / 2, t / 2, Math.min(w, t) * 0.25));
}

// The sawn-off double: side-by-side barrels cut short, a case-hardened action, two hammers,
// and the walnut grip sawn off behind the wrist. 0.33 long at s = 1.
function sawnoff(k, s) {
  const R = 0.011 * s,
    dz = 0.0112 * s;
  for (const side of [-1, 1]) barrel(k, 0.02 * s, 0.26 * s, R, { cz: side * dz, sides: 12 });
  k.paint(shade(C.blued, 1.3), ZONE.steel);
  k.box(0.02 * s, 0.26 * s, R * 0.55, R * 1.05, -dz * 0.45, dz * 0.45);
  k.paint(C.brass, ZONE.brass);
  k.sphere([0.255 * s, R * 1.2, 0], 0.0017 * s, { wide: 6, high: 4 });
  // The walnut forend under the barrels.
  k.zone = ZONE.wood;
  const w = wood(C.walnut, 7);
  k.loft(
    [0.03, 0.06, 0.09, 0.11].map((x) => rect(-R * 1.9, -R * 0.4, -dz * 1.45, dz * 1.45, R * 0.35).map(([y, z]) => [x * s, y, z])),
    { band: w, capStart: true, capEnd: true, crease: 0.3 },
  );
  // The action, its colour-case mottle a few tones of blue, straw and grey.
  const rnd = stream(21);
  const tones = [0x8d949c, 0x5b6f95, 0xa89058, 0x6e7788].map(colour);
  const from = k.count;
  k.paint(C.steel, ZONE.steel);
  k.bevelBox(-0.045 * s, 0.022 * s, -R * 1.5, R * 1.2, -dz * 1.55, dz * 1.55, R * 0.25);
  k.tint(from, () => tones[Math.floor(rnd() * tones.length)]);
  for (const side of [-1, 1])
    k.with(M(T(-0.03 * s, R * 1.1, side * dz * 0.7), RZ(0.5)), () => {
      k.paint(0x6c7178, ZONE.steel);
      k.bevelBox(-0.006 * s, 0.006 * s, 0, 0.014 * s, -0.0026 * s, 0.0026 * s, 0.001 * s);
    });
  // The grip, sawn off: raw wood where the stock was.
  const g = wood(C.walnut, 9);
  const dir = vec.unit([-Math.cos(28 * DEG), -Math.sin(28 * DEG), 0]);
  const start = [-0.04 * s, -R * 0.2, 0];
  const up = [Math.sin(28 * DEG) * -1, Math.cos(28 * DEG), 0].map((v) => -v);
  const rings = [
    [0, 0.013, 0.011],
    [0.02, 0.011, 0.01],
    [0.045, 0.014, 0.011],
    [0.06, 0.016, 0.012],
  ].map(([t, h, wz]) => circle(10, 1).map(([cy, cz]) => vec.add(vec.add(start, vec.scale(dir, t * s)), [up[0] * cy * h * s, up[1] * cy * h * s, cz * wz * s])));
  k.zone = ZONE.wood;
  k.loft(rings, { band: g, capStart: false, capEnd: true, capRgb: C.rawWood, crease: 0.3 });
  return [
    [0.262 * s, 0, -dz],
    [0.262 * s, 0, dz],
  ];
}

// A fighting knife: a clip-point blade (dark coated, a bright bevel along the edge), a steel
// guard, a ribbed black grip and a pommel. Blade forward along +x, edge down; `s` = 1 is 0.36
// long.
function knife(k, s, { edgeUp = false, bare = false } = {}) {
  const t = 0.0022 * s;
  const flip = edgeUp ? -1 : 1;
  const P = (x, y) => [x * s, flip * y * s];
  const blade = [P(0, -0.012), P(0.17, -0.013), P(0.215, -0.006), P(0.235, 0.002), P(0.2, 0.006), P(0.165, 0.011), P(0, 0.012)];
  // (A throwing knife is bare satin steel; a fighting knife's blade is coated dark.)
  if (bare) k.paint(0x7c8288, ZONE.alu);
  else k.paint(0x40444a, ZONE.parker);
  k.plate(blade, -t, t);
  // The ground edge: a bright strip down the belly and up the clip.
  k.paint(EDGE, ZONE.alu);
  const edge = [P(0.01, -0.0125), P(0.17, -0.0135), P(0.216, -0.0062), P(0.236, 0.0021), P(0.228, 0.001), P(0.205, -0.004), P(0.165, -0.0095), P(0.01, -0.0085)];
  k.plate(edge, -t * 1.05, t * 1.05, { sides: false });
  k.paint(C.steel, ZONE.steel);
  k.box(-0.006 * s, 0, -0.02 * s, 0.02 * s, -0.004 * s, 0.004 * s);
  k.paint(0x242424, ZONE.rubber);
  k.lathe(
    [
      [-0.11, 0.0085],
      [-0.1, 0.0095],
      [-0.075, 0.0088],
      [-0.05, 0.0098],
      [-0.025, 0.0088],
      [-0.006, 0.0092],
    ].map(([x, r]) => [x * s, r * s]),
    8,
    { ry: 1.25, crease: 0.9 },
  );
  k.paint(C.steel, ZONE.steel);
  k.lathe(
    [
      [-0.125, 0.004],
      [-0.121, 0.0085],
      [-0.11, 0.009],
    ].map(([x, r]) => [x * s, r * s]),
    8,
  );
  return [[0.235 * s, 0.002 * s * flip, 0]];
}

// A submachine gun in the MP5's pattern: a stamped receiver with its cocking tube, a slim
// barrel in the handguard, a curved magazine, a pistol grip, the stock collapsed. 0.36 long.
function smg(k, s) {
  const S1 = (v) => v * s;
  k.paint(0x3e4145, ZONE.parker);
  k.bevelBox(S1(-0.08), S1(0.08), S1(-0.012), S1(0.012), S1(-0.009), S1(0.009), S1(0.003));
  k.paint(0x46494d, ZONE.parker);
  k.cylinder(S1(0.02), S1(0.16), S1(0.0055), S1(0.0055), 8, { centre: [S1(0.016), 0] });
  // Handguard, barrel, the front sight hood.
  k.paint(0x2c2c2c, ZONE.polymer);
  k.lathe(
    [
      [0.08, 0.009],
      [0.085, 0.0115],
      [0.15, 0.0105],
      [0.155, 0.008],
    ].map(([x, r]) => [S1(x), S1(r)]),
    10,
    { ry: 1.2, centre: [S1(-0.002), 0] },
  );
  barrel(k, S1(0.15), S1(0.215), S1(0.0045), { rgb: 0x44474b });
  k.paint(0x3e4145, ZONE.parker);
  k.cylinder(S1(0.155), S1(0.17), S1(0.007), S1(0.007), 8, { centre: [S1(0.014), 0] });
  // The rear sight drum.
  k.cylinder(S1(-0.06), S1(-0.045), S1(0.006), S1(0.006), 8, { centre: [S1(0.017), 0] });
  // The curved magazine, the grip, the collapsed stock's arms and butt pad.
  const mag = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * 0.35;
    const y = -0.012 - i * 0.017,
      x = 0.03 + Math.sin(a) * 0.05 * (i / 5);
    mag.push(rect(-0.0045, 0.0045, -0.008, 0.008, 0.002).map(([z, xx]) => [S1(x + xx), S1(y), S1(z)]));
  }
  k.paint(0x242526, ZONE.parker);
  k.loft(mag, { capStart: true, capEnd: true, crease: 0.4 });
  grip(k, S1(-0.035), S1(-0.01), S1(0.05), S1(0.02), S1(0.015), 0.35);
  k.paint(0x46494d, ZONE.parker);
  for (const z of [-1, 1]) k.box(S1(-0.13), S1(-0.08), S1(-0.002), S1(0.004), S1(z * 0.009 - 0.002), S1(z * 0.009 + 0.002));
  k.paint(C.rubber, ZONE.rubber);
  k.bevelBox(S1(-0.14), S1(-0.13), S1(-0.02), S1(0.012), S1(-0.012), S1(0.012), S1(0.003));
  return [[S1(0.216), 0, 0]];
}

// A heavy semi-automatic pistol: a long slide with serrations (the moving part: it runs back
// with each shot), a frame with a light rail, a steel magazine base, a rubber grip. 0.24 long.
function pistol(k, s, slide) {
  const S1 = (v) => v * s;
  // The slide (PART.a, set by the caller) and the barrel's mouth in it.
  slide.paint(0x4a4e54, ZONE.parker);
  slide.bevelBox(S1(-0.09), S1(0.105), S1(0.002), S1(0.024), S1(-0.0105), S1(0.0105), S1(0.003));
  slide.paint(0x2e3033, ZONE.parker);
  for (let i = 0; i < 6; i++) slide.box(S1(-0.085 + i * 0.006), S1(-0.082 + i * 0.006), S1(0.006), S1(0.022), S1(-0.0107), S1(0.0107));
  slide.paint(C.bore, ZONE.rubber);
  slide.disc(S1(0.1052), S1(0.0055), { centre: [S1(0.013), 0], sides: 8 });
  slide.paint(C.steel, ZONE.steel);
  slide.box(S1(0.09), S1(0.097), S1(0.024), S1(0.028), S1(-0.0015), S1(0.0015));
  slide.box(S1(-0.085), S1(-0.078), S1(0.024), S1(0.028), S1(-0.006), S1(0.006));
  // The frame, the trigger guard, the grip.
  k.paint(0x44474b, ZONE.parker);
  k.bevelBox(S1(-0.07), S1(0.1), S1(-0.012), S1(0.003), S1(-0.009), S1(0.009), S1(0.002));
  k.paint(0x222326, ZONE.parker);
  for (let i = 0; i < 3; i++) k.box(S1(0.055 + i * 0.013), S1(0.061 + i * 0.013), S1(-0.016), S1(-0.012), S1(-0.008), S1(0.008));
  k.paint(0x44474b, ZONE.parker);
  k.tube(curve([[S1(0.02), S1(-0.012), 0], [S1(0.022), S1(-0.03), 0], [S1(-0.012), S1(-0.032), 0], [S1(-0.025), S1(-0.02), 0]], 8), S1(0.0022), 5);
  grip(k, S1(-0.045), S1(-0.008), S1(0.075), S1(0.032), S1(0.021), 0.28, 0x222222, ZONE.rubber);
  k.paint(C.steel, ZONE.steel);
  k.with(M(T(S1(-0.066), S1(-0.075), 0), RZ(-0.28)), () => k.bevelBox(S1(-0.005), S1(0.042), S1(-0.004), S1(0.002), S1(-0.012), S1(0.012), S1(0.0015)));
  return [[S1(0.106), S1(0.013), 0]];
}

// A pump-action shotgun with a pistol grip and no stock: the receiver, the barrel with its
// bead, the tube magazine under it, and the ribbed fore-end (the moving part: it is pumped
// back and forward after every shot). 0.5 long.
function pumpgun(k, s, pump) {
  const S1 = (v) => v * s;
  k.paint(0x404347, ZONE.parker);
  k.bevelBox(S1(-0.06), S1(0.07), S1(-0.017), S1(0.017), S1(-0.012), S1(0.012), S1(0.004));
  k.paint(C.steel, ZONE.steel);
  k.box(S1(-0.02), S1(0.035), S1(-0.004), S1(0.008), S1(0.0118), S1(0.0126));
  barrel(k, S1(0.07), S1(0.43), S1(0.0092), { cy: S1(0.006), rgb: 0x2d3035, sides: 12 });
  k.paint(C.brass, ZONE.brass);
  k.sphere([S1(0.425), S1(0.017), 0], S1(0.0022), { wide: 6, high: 4 });
  k.paint(0x46494d, ZONE.parker);
  k.cylinder(S1(0.07), S1(0.39), S1(0.0078), S1(0.0078), 10, { centre: [S1(-0.012), 0] });
  k.cylinder(S1(0.39), S1(0.4), S1(0.0082), S1(0.0082), 10, { centre: [S1(-0.012), 0] });
  // The fore-end round the tube, ribbed.
  pump.paint(0x242424, ZONE.polymer);
  const ribs = [];
  for (let i = 0; i <= 10; i++) ribs.push([S1(0.13 + i * 0.011), S1(i % 2 ? 0.0145 : 0.0132)]);
  pump.lathe(ribs, 10, { centre: [S1(-0.01), 0], ry: 1.1, crease: 0.9 });
  grip(k, S1(-0.045), S1(-0.012), S1(0.085), S1(0.03), S1(0.022), 0.35, 0x222222, ZONE.polymer);
  k.paint(0x404347, ZONE.parker);
  k.tube(curve([[S1(0.0), S1(-0.017), 0], [S1(0.002), S1(-0.036), 0], [S1(-0.03), S1(-0.037), 0], [S1(-0.04), S1(-0.02), 0]], 8), S1(0.0026), 5);
  return [[S1(0.431), S1(0.006), 0]];
}

// An assault rifle in the Kalashnikov's pattern: a stamped receiver, the curved steel
// magazine, the gas tube over the barrel, walnut handguards, a slanted muzzle brake, the
// underfolding stock folded. 0.62 long.
function rifle(k, s) {
  const S1 = (v) => v * s;
  k.paint(0x46494d, ZONE.parker);
  k.bevelBox(S1(-0.11), S1(0.09), S1(-0.018), S1(0.014), S1(-0.012), S1(0.012), S1(0.003));
  k.paint(0x2e3033, ZONE.parker);
  k.bevelBox(S1(-0.1), S1(0.085), S1(0.014), S1(0.02), S1(-0.011), S1(0.011), S1(0.004));
  const w = wood(0x6a3a1c, 13);
  k.zone = ZONE.wood;
  k.loft(
    [0.09, 0.12, 0.17, 0.2].map((x) => rect(-0.013, 0.004, -0.013, 0.013, 0.004).map(([y, z]) => [S1(x), S1(y), S1(z)])),
    { band: w, capStart: true, capEnd: true, crease: 0.3 },
  );
  k.loft(
    [0.1, 0.19].map((x) => rect(0.012, 0.022, -0.009, 0.009, 0.003).map(([y, z]) => [S1(x), S1(y), S1(z)])),
    { band: w, capStart: true, capEnd: true, crease: 0.3 },
  );
  k.paint(0x46494d, ZONE.parker);
  k.cylinder(S1(0.19), S1(0.27), S1(0.0065), S1(0.0065), 8, { centre: [S1(0.017), 0] });
  barrel(k, S1(0.2), S1(0.46), S1(0.0068), { rgb: 0x44474c, sides: 10 });
  k.paint(0x3a3c40, ZONE.parker);
  k.box(S1(0.3), S1(0.315), S1(0.004), S1(0.03), S1(-0.004), S1(0.004));
  k.lathe(
    [
      [0.46, 0.0095],
      [0.5, 0.0095],
      [0.5, 0.005],
    ].map(([x, r]) => [S1(x), S1(r)]),
    8,
  );
  // The magazine: curved forward, ribbed.
  const mag = [];
  for (let i = 0; i <= 7; i++) {
    const a = (i / 7) * 0.7;
    const cx = 0.05 + (Math.sin(a) * 0.14) / 0.7 * 0.5,
      cy = -0.018 - (i / 7) * 0.105;
    mag.push(rect(-0.013 + (i === 7 ? 0.002 : 0), 0.013, -0.008, 0.008, 0.002).map(([dx, z]) => [S1(cx + dx), S1(cy), S1(z)]));
  }
  k.paint(0x4a4d52, ZONE.parker);
  k.loft(mag, { capStart: true, capEnd: true, crease: 0.4 });
  grip(k, S1(-0.075), S1(-0.016), S1(0.07), S1(0.026), S1(0.018), 0.35, 0x3a2414, ZONE.polymer);
  // The underfolder's arms folded along the belly of the receiver, its butt plate forward.
  k.paint(C.steel, ZONE.steel);
  for (const z of [-1, 1]) k.box(S1(-0.12), S1(0.07), S1(-0.024), S1(-0.02), S1(z * 0.011 - 0.0015), S1(z * 0.011 + 0.0015));
  k.box(S1(0.06), S1(0.075), S1(-0.034), S1(-0.02), S1(-0.012), S1(0.012));
  return [[S1(0.502), 0, 0]];
}

// The elephant gun: a side-by-side double rifle for dangerous game, heavy barrels on a
// matted rib with its express sights, a long walnut forend, a steel action with hammers and
// the stock cut to a pistol grip, and a red laser module under the barrels (the pike's aim).
// 0.7 long.
function elephantGun(k, s) {
  const S1 = (v) => v * s;
  const R = S1(0.0135),
    dz = S1(0.0142);
  // The barrels: heavy at the breech, tapering to the muzzles, blued.
  for (const side of [-1, 1]) {
    k.paint(0x4c5766, ZONE.steel);
    k.lathe(
      [
        [0.03, 1.12],
        [0.12, 1.0],
        [0.44, 0.9],
        [0.5, 0.9],
        [0.5, 0.62],
        [0.48, 0],
      ].map(([x, r]) => [S1(x), R * r]),
      14,
      { centre: [0, side * dz], band: (i) => (i < 3 ? 0x4c5766 : i === 3 ? 0x5a6574 : C.bore) },
    );
  }
  // The matted rib between them, the standing express sight, the ivory front bead.
  k.paint(0x6a7482, ZONE.steel);
  k.box(S1(0.03), S1(0.5), R * 0.55, R * 1.02, -dz * 0.5, dz * 0.5);
  k.paint(C.brightSteel, ZONE.steel);
  k.box(S1(0.12), S1(0.13), R * 1.0, R * 1.75, -dz * 0.75, dz * 0.75);
  k.box(S1(0.485), S1(0.495), R * 0.95, R * 1.5, -dz * 0.12, dz * 0.12);
  k.paint(0xe8e0c8, ZONE.ceramic);
  k.sphere([S1(0.49), R * 1.6, 0], S1(0.0028), { wide: 6, high: 4 });
  // A barrel band with the sling swivel near the muzzles.
  k.paint(0x3e4652, ZONE.steel);
  k.lathe(
    [
      [0.4, 1.0],
      [0.415, 1.0],
    ].map(([x, r]) => [S1(x), R * 2.05 * r]),
    12,
    { ry: 0.55 },
  );
  k.paint(C.steel, ZONE.steel);
  k.with(T(S1(0.407), -R * 1.35, 0), () => k.torus(S1(0.006), S1(0.0012), { major: 8, minor: 4 }));
  // The long walnut forend under the barrels.
  const w = wood(C.walnut, 17);
  k.zone = ZONE.wood;
  k.loft(
    [0.035, 0.07, 0.17, 0.25, 0.27].map((x, i) => rect(-R * (i === 4 ? 1.7 : 2.15), -R * 0.35, -dz * (i >= 3 ? 1.35 : 1.6), dz * (i >= 3 ? 1.35 : 1.6), R * 0.45).map(([y, z]) => [S1(x), y, z])),
    { band: w, capStart: true, capEnd: true, crease: 0.3 },
  );
  // The action: engraved steel, left bright; its hammers, the top lever, the trigger guard.
  k.paint(0xa4aab2, ZONE.steel);
  k.bevelBox(S1(-0.06), S1(0.035), -R * 1.75, R * 1.3, -dz * 1.65, dz * 1.65, R * 0.3);
  k.paint(0x6c727a, ZONE.steel);
  k.box(S1(-0.058), S1(0.033), -R * 0.2, R * 0.1, -dz * 1.67, dz * 1.67);
  for (const side of [-1, 1])
    k.with(M(T(S1(-0.045), R * 1.15, side * dz * 0.85), RZ(0.55)), () => {
      k.paint(0x5e646c, ZONE.steel);
      k.bevelBox(S1(-0.008), S1(0.008), 0, S1(0.022), S1(-0.0035), S1(0.0035), S1(0.0012));
    });
  k.paint(0x5e646c, ZONE.steel);
  k.with(M(T(S1(-0.02), R * 1.3, 0), RY(-0.3)), () => k.bevelBox(S1(-0.03), 0, 0, S1(0.004), S1(-0.004), S1(0.004), S1(0.0012)));
  k.tube(curve([[S1(0.02), -R * 1.75, 0], [S1(0.015), -R * 3.1, 0], [S1(-0.035), -R * 3.2, 0], [S1(-0.05), -R * 2.1, 0]], 8), S1(0.0024), 5);
  // The grip, cut short and capped with steel.
  const g = wood(C.walnut, 19);
  const rings = [0, 0.03, 0.06, 0.085].map((t, i) => {
    const c = [S1(-0.055 - t * 0.9), -R * 0.6 - S1(t * 0.45), 0];
    const h = S1([0.02, 0.017, 0.019, 0.021][i]),
      wz = S1([0.017, 0.015, 0.016, 0.017][i]);
    return circle(10, 1).map(([cy, cz]) => [c[0] + cy * h * 0.45, c[1] + cy * h, c[2] + cz * wz]);
  });
  k.zone = ZONE.wood;
  k.loft(rings, { band: g, capStart: false, capEnd: true, capRgb: C.steel, crease: 0.3 });
  // The laser module in its band under the muzzles: the pike's aim.
  k.paint(0x303236, ZONE.parker);
  k.bevelBox(S1(0.36), S1(0.43), -R * 2.35, -R * 1.0, S1(-0.009), S1(0.009), S1(0.002));
  k.paint([2.2, 0.08, 0.05], ZONE.light);
  k.disc(S1(0.4305), S1(0.0032), { centre: [-R * 1.7, 0], sides: 8 });
  return [
    [S1(0.5), 0, -dz],
    [S1(0.5), 0, dz],
  ];
}

// A cattle prod: a fibreglass shaft in yellow and black, the handle with its battery pack,
// two electrodes at the tip; the arc between them (an item, shown while it is live). 0.42 long.
function prod(k, s) {
  const S1 = (v) => v * s;
  k.paint(0x222222, ZONE.polymer);
  k.bevelBox(S1(-0.06), S1(0.04), S1(-0.014), S1(0.014), S1(-0.011), S1(0.011), S1(0.004));
  k.paint(0xc9a21a, ZONE.paint);
  k.box(S1(-0.058), S1(-0.02), S1(0.014), S1(0.016), S1(-0.008), S1(0.008));
  k.paint([0.1, 2.5, 0.3], ZONE.light);
  k.box(S1(0.02), S1(0.028), S1(0.014), S1(0.017), S1(-0.002), S1(0.002));
  k.paint(0xd8b02a, ZONE.polymer);
  k.cylinder(S1(0.04), S1(0.33), S1(0.0065), S1(0.0055), 8, { band: (i) => (i ? 0xd8b02a : 0x222222) });
  k.paint(0x222222, ZONE.rubber);
  for (const x of [0.12, 0.2, 0.28]) k.cylinder(S1(x), S1(x + 0.015), S1(0.0072), S1(0.0068), 8);
  k.cylinder(S1(0.33), S1(0.35), S1(0.0085), S1(0.0085), 8);
  k.paint(C.brass, ZONE.brass);
  for (const y of [-1, 1])
    k.tube(
      [
        [S1(0.35), S1(y * 0.004), 0],
        [S1(0.38), S1(y * 0.008), 0],
        [S1(0.415), S1(y * 0.008), 0],
      ],
      S1(0.0018),
      5,
    );
  // The arc: a jagged glowing thread across the gap.
  k.item(0, 1);
  k.paint([0.55, 0.75, 1.6], ZONE.glow);
  const arc = [];
  const rnd = stream(5);
  for (let i = 0; i <= 5; i++) arc.push([S1(0.414 + (rnd() - 0.5) * 0.004), S1(-0.008 + i * 0.0032), S1((rnd() - 0.5) * 0.004)]);
  k.tube(arc, S1(0.0009), 4);
  k.item(null);
  return [[S1(0.42), 0, 0]];
}

// A machete: a long black blade widening toward its tip, a bright ground edge along its belly,
// a riveted rubber grip with a lanyard hole. Edge down, 0.46 long.
function machete(k, s) {
  const S1 = (v) => v * s;
  const t = S1(0.0024);
  // A bolo's belly: narrow at the handle, widening to its weight near the tip.
  const blade = [
    [0, -0.013],
    [0.18, -0.024],
    [0.29, -0.034],
    [0.335, -0.028],
    [0.355, -0.01],
    [0.345, 0.006],
    [0.3, 0.013],
    [0, 0.012],
  ].map(([x, y]) => [S1(x), S1(y)]);
  k.paint(0x5a5e62, ZONE.steel);
  k.plate(blade, -t, t);
  // The black-coated spine, and the ground edge bright along the belly.
  k.paint(0x2e3033, ZONE.parker);
  k.plate(
    [
      [0.002, 0.004],
      [0.3, 0.006],
      [0.3, 0.0135],
      [0.002, 0.0125],
    ].map(([x, y]) => [S1(x), S1(y)]),
    -t * 1.05,
    t * 1.05,
    { sides: false },
  );
  k.paint(EDGE, ZONE.alu);
  k.plate(
    [
      [0.005, -0.0135],
      [0.18, -0.0245],
      [0.29, -0.0345],
      [0.336, -0.0285],
      [0.356, -0.0098],
      [0.346, -0.0085],
      [0.325, -0.024],
      [0.28, -0.028],
      [0.18, -0.0185],
      [0.005, -0.009],
    ].map(([x, y]) => [S1(x), S1(y)]),
    -t * 1.08,
    t * 1.08,
    { sides: false },
  );
  k.paint(0x1e1e1e, ZONE.rubber);
  k.bevelBox(S1(-0.11), S1(0.0), S1(-0.012), S1(0.012), S1(-0.009), S1(0.009), S1(0.004));
  k.paint(0x5a3a1c, ZONE.wood);
  k.box(S1(-0.004), S1(0.004), S1(-0.017), S1(0.016), S1(-0.006), S1(0.006));
  k.paint(C.brass, ZONE.brass);
  for (const x of [-0.08, -0.03]) for (const z of [-1, 1]) k.cylinder(S1(x - 0.003), S1(x + 0.003), S1(0.003), S1(0.003), 6, { centre: [0, z * S1(0.0092)] });
  return [[S1(0.355), 0, 0]];
}

// A heavy revolver (a .500's frame): a long barrel with its underlug and ribbed top, the
// cylinder (the moving part: it turns a sixth with every shot), the frame, a hammer and the
// rubber grip. 0.42 long; the cylinder's axis at y = 0.
function revolver(k, s, cylinder) {
  const S1 = (v) => v * s;
  const bore = S1(0.011);
  k.paint(0x9ea4aa, ZONE.steel);
  k.bevelBox(S1(0.04), S1(0.29), bore - S1(0.009), bore + S1(0.011), S1(-0.011), S1(0.011), S1(0.003));
  k.bevelBox(S1(0.04), S1(0.29), bore - S1(0.026), bore - S1(0.006), S1(-0.009), S1(0.009), S1(0.004));
  k.paint(C.bore, ZONE.rubber);
  k.disc(S1(0.2905), S1(0.0055), { centre: [bore, 0], sides: 8 });
  k.paint(0x8e949a, ZONE.steel);
  k.bevelBox(S1(-0.045), S1(0.045), S1(-0.024), S1(0.03), S1(-0.012), S1(0.012), S1(0.004));
  k.box(S1(-0.02), S1(0.035), S1(0.029), S1(0.035), S1(-0.004), S1(0.004));
  k.with(M(T(S1(-0.045), S1(0.028), 0), RZ(0.7)), () => k.bevelBox(S1(-0.004), S1(0.004), 0, S1(0.02), S1(-0.004), S1(0.004), S1(0.0012)));
  grip(k, S1(-0.03), S1(-0.02), S1(0.1), S1(0.036), S1(0.026), 0.35, 0x202020, ZONE.rubber);
  k.paint(0x8e949a, ZONE.steel);
  k.tube(curve([[S1(0.02), S1(-0.024), 0], [S1(0.025), S1(-0.045), 0], [S1(-0.01), S1(-0.05), 0], [S1(-0.025), S1(-0.034), 0]], 8), S1(0.0028), 5);
  // The cylinder: fluted steel, the chambers' mouths at its front.
  cylinder.paint(0xa2a8ae, ZONE.steel);
  cylinder.lathe(
    [
      [-0.035, 0.018],
      [-0.03, 0.023],
      [0.03, 0.023],
      [0.036, 0.019],
    ].map(([x, r]) => [S1(x), S1(r)]),
    12,
    { crease: 0.5 },
  );
  cylinder.paint(C.bore, ZONE.rubber);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    cylinder.disc(S1(0.0362), S1(0.0045), { centre: [Math.cos(a) * S1(0.012), Math.sin(a) * S1(0.012)], sides: 6 });
  }
  return [[S1(0.291), bore, 0]];
}

// A band-powered speargun: a long aluminium barrel with its rail, the spear lying in it (an
// item: gone once it has flown, back when it is reloaded), two thick rubbers from the muzzle
// to the notches, a pistol grip with the line release. Its muzzle end is at +x.
function speargun(k, s) {
  const S1 = (v) => v * s;
  // The barrel: an aluminium tube with the spear's track along its top.
  k.paint(0x5a6168, ZONE.alu);
  k.bevelBox(S1(-0.1), S1(0.72), S1(-0.02), S1(0.01), S1(-0.016), S1(0.016), S1(0.005));
  k.paint(0x3a3d40, ZONE.parker);
  k.box(S1(-0.08), S1(0.7), S1(0.01), S1(0.013), S1(-0.006), S1(0.006));
  // The muzzle with the rubbers' anchor, the grip, the butt.
  k.paint(0x242526, ZONE.polymer);
  k.bevelBox(S1(0.7), S1(0.76), S1(-0.024), S1(0.016), S1(-0.028), S1(0.028), S1(0.006));
  grip(k, S1(0.02), S1(-0.018), S1(0.11), S1(0.035), S1(0.026), 0.3, 0x242526, ZONE.polymer);
  k.paint(0x2e2f30, ZONE.polymer);
  k.bevelBox(S1(-0.16), S1(-0.1), S1(-0.026), S1(0.014), S1(-0.02), S1(0.02), S1(0.006));
  // The rubbers, from the muzzle back over the barrel to their wishbone.
  k.paint(0x3a3028, ZONE.rubber);
  for (const z of [-1, 1]) k.tube([[S1(0.745), S1(0.006), S1(z * 0.026)], [S1(0.5), S1(0.022), S1(z * 0.016)], [S1(0.26), S1(0.024), S1(z * 0.007)]], S1(0.0075), 6);
  k.paint(C.steel, ZONE.steel);
  k.tube([[S1(0.26), S1(0.024), S1(-0.007)], [S1(0.255), S1(0.031), 0], [S1(0.26), S1(0.024), S1(0.007)]], S1(0.0025), 4);
  // The spear, shaft and barbed tip.
  k.item(0, 1);
  k.paint(0xb4b8bc, ZONE.alu);
  k.cylinder(S1(0.0), S1(0.86), S1(0.005), S1(0.005), 6, { centre: [S1(0.018), 0] });
  k.paint(EDGE, ZONE.alu);
  k.lathe(
    [
      [0.86, 0.0075],
      [0.905, 0.0],
    ].map(([x, r]) => [S1(x), S1(r)]),
    6,
    { centre: [S1(0.018), 0] },
  );
  k.plate(
    [
      [0.845, 0.005],
      [0.815, 0.02],
      [0.824, 0.005],
    ].map(([x, y]) => [S1(x), S1(y) + S1(0.018)]),
    S1(-0.0016),
    S1(0.0016),
  );
  k.item(null);
  return [[S1(0.905), S1(0.018), 0]];
}

// A pistol crossbow grown big: a stock with a pistol grip and a scope, recurve limbs across
// the front, the string (the moving part: slid forward when it is loose), and the bolt with
// its fletches and broadhead (an item). 0.2 long, the limbs 0.24 across at s = 1.
function crossbow(k, s, string) {
  const S1 = (v) => v * s;
  k.paint(0x303235, ZONE.polymer);
  k.bevelBox(S1(-0.07), S1(0.14), S1(-0.008), S1(0.008), S1(-0.009), S1(0.009), S1(0.003));
  grip(k, S1(-0.03), S1(-0.006), S1(0.06), S1(0.024), S1(0.018), 0.4, 0x303235, ZONE.polymer);
  k.paint(0x44474b, ZONE.parker);
  k.cylinder(S1(-0.05), S1(0.04), S1(0.0065), S1(0.0065), 10, { centre: [S1(0.022), 0] });
  k.paint(C.bore, ZONE.glass);
  k.disc(S1(0.0405), S1(0.005), { centre: [S1(0.022), 0], sides: 10 });
  k.paint(0x44474b, ZONE.parker);
  k.box(S1(-0.01), S1(0.005), S1(0.008), S1(0.016), S1(-0.003), S1(0.003));
  // The riser and the limbs, swept forward at their tips.
  k.paint(0x404346, ZONE.parker);
  k.box(S1(0.12), S1(0.15), S1(-0.012), S1(0.01), S1(-0.02), S1(0.02));
  k.paint(0x26282a, ZONE.polymer);
  for (const z of [-1, 1]) {
    const path = [
      [0.135, 0, 0.018],
      [0.13, 0, 0.06],
      [0.118, 0, 0.1],
      [0.125, 0, 0.12],
    ].map(([x, y, zz]) => [S1(x), S1(y), S1(zz * z)]);
    k.tube(curve(path, 7), (t) => S1(0.007 - 0.004 * t), 5);
  }
  // The string, drawn back to the latch (string part: slid forward, loose, when unloaded).
  string.paint(0x2e2a24, ZONE.fabric);
  for (const z of [-1, 1])
    string.tube(
      [
        [S1(0.125), 0, S1(z * 0.12)],
        [S1(0.0), S1(0.004), S1(z * 0.004)],
      ],
      S1(0.0012),
      4,
    );
  // The bolt.
  k.item(0, 1);
  k.paint(0x7e858c, ZONE.alu);
  k.cylinder(S1(0.0), S1(0.2), S1(0.003), S1(0.003), 6, { centre: [S1(0.011), 0] });
  k.paint(EDGE, ZONE.alu);
  k.lathe(
    [
      [0.2, 0.004],
      [0.232, 0],
    ].map(([x, r]) => [S1(x), S1(r)]),
    4,
    { centre: [S1(0.011), 0] },
  );
  k.paint(0xb02a1e, ZONE.polymer);
  for (let i = 0; i < 3; i++)
    k.with(M(T(0, S1(0.011), 0), RX((i / 3) * TAU)), () =>
      k.plate(
        [
          [0.005, 0.002],
          [0.035, 0.002],
          [0.025, 0.011],
          [0.005, 0.009],
        ].map(([x, y]) => [S1(x), S1(y)]),
        S1(-0.0006),
        S1(0.0006),
      ),
    );
  k.item(null);
  return [[S1(0.232), S1(0.011), 0]];
}

// A framing nailer: a yellow body with the black motor housing, the nose with its safety tip,
// the strip of nails in its magazine slanting back, the rubber grip and the air coupling.
function nailgun(k, s) {
  const S1 = (v) => v * s;
  k.paint(0xd0a21c, ZONE.polymer);
  k.bevelBox(S1(-0.12), S1(0.06), S1(-0.02), S1(0.03), S1(-0.02), S1(0.02), S1(0.008));
  k.paint(0x262626, ZONE.polymer);
  k.lathe(
    [
      [0.02, 0.028],
      [0.03, 0.032],
      [0.09, 0.032],
      [0.1, 0.026],
    ].map(([x, r]) => [S1(x), S1(r)]),
    12,
    { centre: [S1(0.008), 0], crease: 0.5 },
  );
  k.paint(0x55585c, ZONE.parker);
  k.bevelBox(S1(0.1), S1(0.2), S1(-0.018), S1(-0.002), S1(-0.008), S1(0.008), S1(0.002));
  k.paint(C.steel, ZONE.steel);
  k.bevelBox(S1(0.2), S1(0.225), S1(-0.02), S1(0.0), S1(-0.006), S1(0.006), S1(0.002));
  // The magazine, slanted back and down, the nails' heads showing along its top.
  k.with(M(T(S1(0.12), S1(-0.02), 0), RZ(-Math.PI + 0.35)), () => {
    k.paint(0x44474b, ZONE.parker);
    k.bevelBox(0, S1(0.2), S1(-0.012), S1(0.006), S1(-0.007), S1(0.007), S1(0.002));
    k.paint(0xa8acb0, ZONE.steel);
    k.box(S1(0.005), S1(0.19), S1(0.006), S1(0.009), S1(-0.004), S1(0.004));
  });
  grip(k, S1(-0.085), S1(-0.018), S1(0.07), S1(0.03), S1(0.024), 0.1, 0x222222, ZONE.rubber);
  k.paint(C.brass, ZONE.brass);
  k.cylinder(S1(-0.14), S1(-0.12), S1(0.006), S1(0.006), 8, { centre: [S1(-0.005), 0] });
  return [[S1(0.226), S1(-0.01), 0]];
}

// A switchblade: the black handle with its steel bolsters and the button, the blade (the
// moving part: folded back into the handle, or flicked open about the pivot at the handle's
// front). Handle 0.14, blade 0.13 at s = 1.
function switchblade(k, s, blade) {
  const S1 = (v) => v * s;
  k.paint(0x222222, ZONE.polymer);
  k.bevelBox(S1(-0.14), S1(0.0), S1(-0.008), S1(0.008), S1(-0.006), S1(0.006), S1(0.003));
  k.paint(C.brightSteel, ZONE.steel);
  k.bevelBox(S1(-0.16), S1(-0.14), S1(-0.008), S1(0.008), S1(-0.0062), S1(0.0062), S1(0.003));
  k.bevelBox(S1(-0.012), S1(0.006), S1(-0.008), S1(0.008), S1(-0.0062), S1(0.0062), S1(0.003));
  k.paint(0xa8201a, ZONE.polymer);
  k.cylinder(S1(-0.028), S1(-0.02), S1(0.0025), S1(0.0025), 6, { centre: [S1(0.008), S1(-0.004)] });
  blade.paint(EDGE, ZONE.alu);
  blade.plate(
    [
      [0.0, -0.006],
      [0.1, -0.006],
      [0.135, 0.0],
      [0.1, 0.006],
      [0.0, 0.006],
    ].map(([x, y]) => [S1(x), S1(y)]),
    S1(-0.0016),
    S1(0.0016),
  );
  return [[S1(0.135), 0, 0]];
}

// A push dagger: a double-edged blade standing straight out of a T-handle, with its steel
// saddle strapped over the beak. Blade along +x from the handle at the origin, `len` long.
function pushDagger(k, len, r) {
  const t = len * 0.012;
  k.paint(EDGE, ZONE.alu);
  k.lathe(
    [
      [0, 0.12 * len],
      [0.6 * len, 0.1 * len],
      [len, 0],
    ],
    4,
    { ry: t / (0.12 * len), crease: 0.2, flat: true },
  );
  k.paint(0x44484d, ZONE.parker);
  k.lathe(
    [
      [0, 0.05 * len],
      [0.75 * len, 0.035 * len],
      [len * 0.95, 0],
    ],
    4,
    { ry: (t * 1.25) / (0.05 * len), crease: 0.2, flat: true },
  );
  // The T-handle across the beak's top, black micarta.
  k.paint(0x262626, ZONE.polymer);
  k.with(M(T(-0.03 * len, 0, 0), RY(Math.PI / 2)), () => k.cylinder(-0.24 * len, 0.24 * len, 0.045 * len, 0.045 * len, 8));
  return [[len, 0, 0]];
}

// A throwing star: four points, a hole in the middle (a dark disc), in bright steel.
function star(k, r) {
  const points = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 ? r * 0.3 : r;
    points.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  k.paint(0xb4b9be, ZONE.alu);
  k.plate(points, -r * 0.05, r * 0.05);
  k.paint(0x2a2c2e, ZONE.parker);
  k.cylinder(-r * 0.06, r * 0.06, r * 0.14, r * 0.14, 8);
}

// An aircraft bomb as the gannet's fall (enemies.js, a unit long, nose first along +x): the
// olive body, the rounded nose, the tapered tail with its four fins, the yellow band.
function bomb(k, L) {
  k.paint(0x292b1b, ZONE.paint);
  k.lathe(
    [
      [-0.3, 0.1],
      [-0.28, 0.13],
      [0.1, 0.13],
      [0.18, 0.12],
      [0.25, 0.09],
      [0.3, 0.045],
      [0.31, 0],
    ].map(([x, r]) => [x * L, r * L]),
    12,
    { crease: 0.7 },
  );
  k.lathe(
    [
      [-0.3, 0.1],
      [-0.52, 0.03],
    ].map(([x, r]) => [x * L, r * L]),
    10,
  );
  k.paint(0xa08418, ZONE.paint);
  k.cylinder(0.04 * L, 0.07 * L, 0.132 * L, 0.132 * L, 12);
  k.paint(0x22241a, ZONE.paint);
  for (let i = 0; i < 4; i++)
    k.with(RX((i / 4) * TAU + Math.PI / 4), () =>
      k.plate(
        [
          [-0.58, 0],
          [-0.4, 0],
          [-0.42, 0.17],
          [-0.58, 0.17],
        ].map(([x, y]) => [x * L, y * L]),
        -0.006 * L,
        0.006 * L,
      ),
    );
  // The suspension lug on top.
  k.paint(C.steel, ZONE.steel);
  k.torus(0.03 * L, 0.008 * L, { major: 8, minor: 4 });
}

// ---------------------------------------------------------------------------------------
// The kinds: where each weapon sits on its body.

// A gun in its frame at `at` on the body, turned by `turn` (a matrix), built by fn(kit, parts).
function place(k, at, turn, fn) {
  k.push(M(T(at[0], at[1], at[2]), turn ?? new THREE.Matrix4()));
  const muzzles = fn();
  k.pop();
  const m = M(T(at[0], at[1], at[2]), turn ?? new THREE.Matrix4());
  return muzzles.map((p) => new THREE.Vector3(...p).applyMatrix4(m).toArray());
}
// The kit a kind's gear is built in: its harness and mount first.
function kits() {
  return { main: new Kit({ part: PART.mount }) };
}

// The bullhead: the sawn-off on a plate across its broad head, strapped round behind the eyes
// and in front of the dorsal fin.
function gearBullhead() {
  const S = shape("bullhead");
  const { main: k } = kits();
  // (Between the dorsal fin, which begins at 0.12, and the gill covers.)
  strap(k, S, 0.133, { w: 0.013 });
  strap(k, S, 0.164, { w: 0.013 });
  buckle(k, S, 0.164, 0.05, -1);
  patch(k, S, 0.124, 0.173, backCols(0.35));
  const P = [0.15, S.top(0.15) + 0.022, 0];
  swivel(k, [0.15, S.top(0.15) + 0.005, 0], P, { r: 0.012, clamps: [-0.012, 0.014], lift: 0.016 });
  k.part = PART.gun;
  const muzzles = place(k, [P[0] + 0.03, P[1] + 0.016, P[2]], null, () => sawnoff(k, 1.05));
  return { frame: "fish", kit: k, pivot: P, muzzles, recoil: { d: 0.02, flip: 12 * DEG, time: 0.16 }, aim: [0.4, 0.35] };
}

// The young trout: a fighting knife in a steel clip on its right cheek, the blade forward past
// its snout like a bayonet, on a strap round behind the gills.
function gearTroutParr() {
  const S = shape("parr");
  const { main: k } = kits();
  strap(k, S, 0.13, { w: 0.013 });
  strap(k, S, 0.168, { w: 0.013 });
  buckle(k, S, 0.13, 0.2, -1, 0.012);
  patch(k, S, 0.122, 0.176, flankCols(-0.3, 0.5, 1, 3), { rgb: PALETTE.molle });
  // The knife's clip on an arm forward from the side plate, clear of the gill cover.
  const P = [0.2, -0.01, S.width(0.2) + 0.022];
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.box(0.135, 0.2, P[1] - 0.004, P[1] + 0.004, S.width(0.15) + 0.004, P[2] - 0.008);
  k.box(0.17, 0.2, P[1] - 0.012, P[1] + 0.012, P[2] - 0.016, P[2] - 0.008);
  k.part = PART.gun;
  const muzzles = place(k, [P[0] + 0.02, P[1], P[2]], RY(-3 * DEG), () => knife(k, 1.05));
  return { frame: "fish", kit: k, pivot: P, muzzles, melee: "thrust", recoil: { d: 0, flip: 0, time: 0.1 } };
}

// The brown trout: the submachine gun on an outrigger clamp on its right flank, the arm from a
// saddle in front of the dorsal fin.
function gearTrout() {
  const S = shape("trout");
  const { main: k } = kits();
  strap(k, S, 0.095, { w: 0.015 });
  strap(k, S, 0.17, { w: 0.015 });
  buckle(k, S, 0.17, 0.15, -1, 0.013);
  buckle(k, S, 0.095, 0.15, -1, 0.013);
  patch(k, S, 0.085, 0.18, backCols(0.45));
  // An outrigger arm from the saddle down to a swivel on the right flank.
  const P = [0.135, 0.046, S.width(0.135) + 0.03];
  swivel(k, S.off(0.13, 0.72, 1, 0.005).p, P, { r: 0.012, clamps: [-0.014, 0.014], lift: 0.012 });
  k.part = PART.gun;
  const muzzles = place(k, [P[0] + 0.045, P[1] + 0.012, P[2]], null, () => smg(k, 1.3));
  return { frame: "fish", kit: k, pivot: P, muzzles, recoil: { d: 0.012, flip: 4 * DEG, time: 0.07 }, aim: [0.35, 0.35] };
}

// The old king: the salmon's own harness and minigun (model-weapons.js), which fit a trout of
// his build.
function gearKing() {
  const F = bodyFrame("salmon");
  const k = buildHarness(F, { detail: true });
  const b = WEAPON_MODELS.minigun.build(F);
  k.append(b.main);
  k.append(b.parts.barrels.kit);
  const pivot = [0.11, F.side.y, F.side.z];
  return {
    frame: "fish",
    kit: k,
    pivot,
    muzzles: [[0.431, F.side.y, F.side.z]],
    part: { pivot: b.parts.barrels.pivot, axis: [1, 0, 0], slide: false },
    spins: true,
    recoil: { d: 0.003, flip: 0, time: 0.04 },
    aim: [0.3, 0.3],
  };
}

// The minnow: three razor blades on a strap round the shoal fish, two standing out from its
// flanks like fins with their edges forward, one up in front of the dorsal fin.
function gearMinnow() {
  const S = shape("minnow");
  const k = new Kit({ part: PART.mount, detail: false });
  strap(k, S, 0.14, { w: 0.014, n: 12 });
  const bladeShape = [
    [-0.045, -0.02],
    [0.045, -0.02],
    [0.05, -0.015],
    [0.05, 0.015],
    [0.045, 0.02],
    [-0.045, 0.02],
    [-0.05, 0.015],
    [-0.05, -0.015],
  ];
  const blade = (o, n, lean) => {
    // Its frame: x along the body (tipped forward by `lean`), y out of the skin, z round.
    k.push(M(frame(o, [1, 0, 0], n), RZ(lean)));
    k.paint(PALETTE.darkSteel, ZONE.parker);
    k.box(-0.012, 0.012, 0, 0.01, -0.009, 0.009);
    k.with(M(T(0, 0.03, 0), RX(Math.PI / 2)), () => {
      k.paint(EDGE, ZONE.alu);
      k.plate(bladeShape, -0.0012, 0.0012);
      k.paint(0x2e3033, ZONE.parker);
      k.box(-0.03, 0.03, -0.0035, 0.0035, -0.0014, 0.0014);
    });
    k.pop();
  };
  for (const side of [-1, 1]) {
    const o = S.off(0.14, 0.05, side, 0.002);
    blade(o.p, o.n, 0);
  }
  const top = S.off(0.14, 1, 1, 0.002);
  blade(top.p, top.n, -0.35);
  return { frame: "fish", kit: k, pivot: [0.14, 0, 0], muzzles: null, melee: "static" };
}

// The stickleback: a bandolier of throwing stars slung round it from its back behind the head
// down to its belly, four stars on its right side (one missing while it throws the next).
function gearStickleback() {
  const S = shape("minnow");
  const k = new Kit({ part: PART.mount, detail: false });
  // The bandolier: a strap round the body at a slant.
  const n = 14,
    w = 0.012;
  const ring = (dx, d) => {
    const out = [];
    for (let j = 0; j < n; j++) {
      const t = (j / n) * 2;
      const x = 0.12 + 0.05 * Math.cos(Math.PI * t) + dx;
      out.push(S.off(x, Math.cos(Math.PI * t), t <= 1 ? 1 : -1, d).p);
    }
    return out;
  };
  k.paint(0x2b2a20, ZONE.fabric);
  k.loft([ring(-w / 2, 0.0005), ring(-w / 2, 0.0022), ring(w / 2, 0.0022), ring(w / 2, 0.0005)], { crease: 0.5 });
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.2;
    const v = Math.cos(Math.PI * t);
    const x = 0.12 + 0.05 * v;
    const o = S.off(x, v, 1, 0.0025);
    k.item(3 - i, 4);
    k.with(M(frame(o.p, [1, 0, 0], o.n), RX(-Math.PI / 2), RZ(i * 0.4)), () => star(k, 0.032));
    k.item(null);
  }
  return { frame: "fish", kit: k, pivot: [0.13, 0, 0], muzzles: [[0.3, 0.02, 0.03]], items: 4, throws: true };
}

// The grayling: a crossbow on a riser over its head, in front of its great dorsal fin.
function gearGrayling() {
  const S = shape("grayling");
  const { main: k } = kits();
  // (In front of the great dorsal fin, which begins at 0.14, behind the gill covers.)
  strap(k, S, 0.15, { w: 0.012 });
  strap(k, S, 0.178, { w: 0.012 });
  buckle(k, S, 0.178, 0.1, -1, 0.012);
  patch(k, S, 0.143, 0.185, backCols(0.4));
  const P = [0.168, S.top(0.168) + 0.026, 0];
  swivel(k, [0.165, S.top(0.165) + 0.005, 0], P, { r: 0.01, clamps: [-0.01, 0.012], lift: 0.014 });
  k.part = PART.gun;
  // (The string is built in the gun's frame: moved there as the gun is.)
  const at = [P[0] + 0.01, P[1] + 0.014, P[2]];
  const string = new Kit({ part: PART.a });
  string.push(T(...at));
  const muzzles = place(k, at, null, () => crossbow(k, 1.1, string));
  k.append(string);
  return { frame: "fish", kit: k, pivot: P, muzzles, part: { pivot: [0, 0, 0], axis: [1, 0, 0], slide: true }, string: 0.1 * 1.1, items: 1, recoil: { d: 0.01, flip: 3 * DEG, time: 0.12 }, aim: [0.35, 0.35] };
}

// The perch: a heavy pistol in a clamp on its right flank behind the gill cover, under the
// tall spiny dorsal fin.
function gearPerch() {
  const S = shape("perch");
  const { main: k } = kits();
  strap(k, S, 0.1, { w: 0.014 });
  strap(k, S, 0.175, { w: 0.014 });
  buckle(k, S, 0.175, 0.35, -1, 0.012);
  patch(k, S, 0.09, 0.183, flankCols(-0.2, 0.55, 1, 4));
  // A short arm off the side plate under the spiny dorsal fin to the pistol's swivel.
  const P = [0.14, 0.022, S.width(0.14) + 0.024];
  swivel(k, S.off(0.14, 0.1, 1, 0.005).p, P, { r: 0.011, clamps: [-0.012, 0.012], lift: 0.012 });
  k.part = PART.gun;
  const at = [P[0] + 0.01, P[1] + 0.012, P[2]];
  const slide = new Kit({ part: PART.a });
  slide.push(T(...at));
  const muzzles = place(k, at, null, () => pistol(k, 0.95, slide));
  k.append(slide);
  return { frame: "fish", kit: k, pivot: P, muzzles, part: { pivot: [0, 0, 0], axis: [1, 0, 0], slide: true }, blowback: 0.035, recoil: { d: 0.012, flip: 10 * DEG, time: 0.14 }, aim: [0.35, 0.35] };
}

// The cod: the pump-action shotgun in two clamps on an arm down its right flank.
function gearCod() {
  const S = shape("cod");
  const { main: k } = kits();
  strap(k, S, 0.09, { w: 0.015 });
  strap(k, S, 0.165, { w: 0.015 });
  buckle(k, S, 0.09, 0.2, -1, 0.013);
  patch(k, S, 0.08, 0.175, flankCols(0.1, 0.8, 1, 4));
  const P = [0.125, 0.03, S.width(0.125) + 0.03];
  swivel(k, S.off(0.125, 0.5, 1, 0.005).p, P, { r: 0.013, clamps: [-0.016, 0.016], lift: 0.013 });
  k.part = PART.gun;
  const at = [P[0] + 0.0, P[1] + 0.013, P[2]];
  const pump = new Kit({ part: PART.a });
  pump.push(T(...at));
  const muzzles = place(k, at, null, () => pumpgun(k, 0.85, pump));
  k.append(pump);
  return { frame: "fish", kit: k, pivot: P, muzzles, part: { pivot: [0, 0, 0], axis: [1, 0, 0], slide: true }, pump: 0.05, recoil: { d: 0.022, flip: 9 * DEG, time: 0.2 }, aim: [0.35, 0.4] };
}

// The pike: the elephant gun on a saddle over its long back, its barrels far out past the
// snout, the red laser under them.
function gearPike() {
  const S = shape("pike");
  const { main: k } = kits();
  strap(k, S, -0.07, { w: 0.016 });
  strap(k, S, 0.1, { w: 0.016 });
  buckle(k, S, -0.07, 0.1, -1, 0.013);
  buckle(k, S, 0.1, 0.1, -1, 0.013);
  patch(k, S, -0.085, 0.115, backCols(0.4), { rows: 4 });
  // A pintle on the saddle: a post with its braces, the gun in the yoke on top.
  const P = [0.03, S.top(0.03) + 0.03, 0];
  swivel(k, [0.03, S.top(0.03) + 0.005, 0], P, { r: 0.016, arm: 0.007, clamps: [-0.02, 0.022], lift: 0.02 });
  for (const s of [-1, 1]) strut(k, S.off(0.0, 0.8, s, 0.005).p, [0.03, P[1] - 0.008, 0], 0.003);
  k.part = PART.gun;
  const muzzles = place(k, [P[0] + 0.02, P[1] + 0.02, P[2]], null, () => elephantGun(k, 0.95));
  return { frame: "fish", kit: k, pivot: P, muzzles, recoil: { d: 0.045, flip: 14 * DEG, time: 0.45 }, aim: [0.3, 0.3] };
}

// The eel: the cattle prod down its right side, the electrodes past its snout.
function gearEel() {
  const S = shape("eel");
  const { main: k } = kits();
  strap(k, S, 0.1, { w: 0.013 });
  strap(k, S, 0.2, { w: 0.013 });
  const P = [0.15, 0.004, S.width(0.15) + 0.017];
  for (const x of [0.1, 0.2]) {
    const o = S.off(x, 0.1, 1, 0.002);
    strut(k, o.p, [x, P[1], P[2] - 0.006], 0.004);
  }
  k.part = PART.gun;
  const muzzles = place(k, [P[0] - 0.03, P[1], P[2]], null, () => prod(k, 1.0));
  return { frame: "fish", kit: k, pivot: P, muzzles, melee: "shock", items: 1 };
}

// The otter: a machete strapped to the right of its chest, where a foreleg would hold it, the
// blade forward and up; it comes down with the blow.
function gearOtter() {
  const S = shape("otter");
  const { main: k } = kits();
  strap(k, S, 0.12, { w: 0.018 });
  strap(k, S, 0.19, { w: 0.018 });
  buckle(k, S, 0.19, 0.3, -1, 0.014);
  patch(k, S, 0.108, 0.2, flankCols(-0.45, 0.3, 1, 4));
  const P = [0.17, -0.02, S.width(0.17) + 0.022];
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.box(0.14, 0.2, P[1] - 0.012, P[1] + 0.012, P[2] - 0.022, P[2] - 0.01);
  k.part = PART.gun;
  const muzzles = place(k, [P[0] + 0.03, P[1], P[2]], RZ(0.28), () => machete(k, 0.92));
  return { frame: "fish", kit: k, pivot: P, muzzles, melee: "chop" };
}

// The herring: a holster plate on its right flank with three throwing knives, handles back
// (one gone while it throws the next).
function gearHerring() {
  const S = shape("herring");
  const k = new Kit({ part: PART.mount, detail: false });
  strap(k, S, 0.085, { w: 0.013, n: 12 });
  strap(k, S, 0.165, { w: 0.013, n: 12 });
  patch(k, S, 0.075, 0.175, flankCols(-0.4, 0.6, 1, 4), { rgb: 0x2b2c24 });
  for (let i = 0; i < 3; i++) {
    const v = 0.35 - i * 0.3;
    const o = S.off(0.12, v, 1, 0.007);
    k.item(2 - i, 3);
    k.with(M(frame(o.p, [1, 0, 0], o.n), RX(-Math.PI / 2)), () => {
      k.with(T(-0.025, 0, 0), () => knife(k, 0.55, { bare: true }));
    });
    k.item(null);
  }
  return { frame: "fish", kit: k, pivot: [0.13, 0, 0], muzzles: [[0.24, 0.02, 0.04]], items: 3, throws: true };
}

// The mackerel: the assault rifle clamped on an arm down its right flank, in front of the first
// dorsal fin.
function gearMackerel() {
  const S = shape("mackerel");
  const { main: k } = kits();
  strap(k, S, 0.095, { w: 0.014 });
  strap(k, S, 0.172, { w: 0.014 });
  buckle(k, S, 0.172, 0.2, -1, 0.012);
  patch(k, S, 0.085, 0.18, backCols(0.35));
  const P = [0.135, 0.04, S.width(0.135) + 0.028];
  swivel(k, S.off(0.13, 0.7, 1, 0.005).p, P, { r: 0.011, clamps: [-0.014, 0.014], lift: 0.012 });
  k.part = PART.gun;
  const muzzles = place(k, [P[0] + 0.02, P[1] + 0.012, P[2]], null, () => rifle(k, 0.78));
  return { frame: "fish", kit: k, pivot: P, muzzles, recoil: { d: 0.012, flip: 5 * DEG, time: 0.08 }, aim: [0.35, 0.35] };
}

// The kingfisher (its dive model, creatures.js: the beak a cone from x 0.46 to 0.82): the push
// dagger's saddle strapped over the beak, the blade on past its tip.
function gearKingfisher() {
  const k = new Kit({ part: PART.mount });
  const beak = (x) => 0.035 * (1 - (x - 0.46) / 0.36);
  for (const x of [0.52, 0.62]) {
    k.paint(WEB, ZONE.fabric);
    k.cylinder(x - 0.012, x + 0.012, beak(x) + 0.006, beak(x + 0.012) + 0.006, 8, { centre: [0.01, 0] });
  }
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.bevelBox(0.5, 0.66, 0.01 + beak(0.5) * 0.6, 0.01 + beak(0.5) * 0.6 + 0.012, -0.018, 0.018, 0.004);
  k.part = PART.gun;
  const muzzles = place(k, [0.66, 0.035, 0], null, () => pushDagger(k, 0.5));
  return { frame: "bird", kit: k, pivot: [0.66, 0.035, 0], muzzles, melee: "static" };
}

// The goosander (creatures.js: its body about x -2.2 ... 2.2, the neck forward to the head at
// 2.85): a chest harness, and the revolver in a holster clamp at the right of its breast, the
// barrel along the neck.
function gearMerganser() {
  const k2 = new Kit({ part: PART.mount });
  // Straps round the body behind the wings' shoulders and in front of them (ellipses round
  // its section there).
  for (const [x, ry, rz, y0] of [
    [0.3, 0.92, 1.0, 0.05],
    [1.25, 0.66, 0.74, 0.06],
  ]) {
    const ring = (dx, grow) => circle(16, ry + grow, 0, rz + grow).map(([y, z]) => [x + dx, y + y0, z]);
    k2.paint(WEB, ZONE.fabric);
    k2.loft([ring(-0.06, 0.01), ring(-0.06, 0.05), ring(0.06, 0.05), ring(0.06, 0.01)], { crease: 0.5 });
  }
  const P = [1.3, -0.25, 0.86];
  k2.paint(PALETTE.molle, ZONE.polymer);
  k2.bevelBox(0.7, 1.45, -0.5, 0.05, 0.62, 0.72, 0.03);
  k2.paint(PALETTE.darkSteel, ZONE.parker);
  k2.box(1.0, 1.4, P[1] - 0.12, P[1] + 0.1, 0.7, P[2] - 0.05);
  k2.part = PART.gun;
  const cyl = new Kit({ part: PART.a });
  cyl.push(T(P[0] - 0.4, P[1], P[2]));
  const muzzles = place(k2, [P[0] - 0.4, P[1], P[2]], null, () => revolver(k2, 5.2, cyl));
  k2.append(cyl);
  return { frame: "bird", kit: k2, pivot: P, muzzles, part: { pivot: [P[0] - 0.4, P[1], P[2]], axis: [1, 0, 0], slide: false }, revolver: true, recoil: { d: 0.12, flip: 16 * DEG, time: 0.22 }, aim: [0.35, 0.4] };
}

// The heron's harpoon gun (the frame of its aim: +x along the bill from the head, +y toward its
// body): lashed under the bill with two straps round the head, the spear on past the bill's tip.
function gearHeron() {
  const k = new Kit({ part: PART.mount });
  for (const x of [0.6, 2.2]) {
    const r = 0.42 - x * 0.08;
    k.paint(WEB, ZONE.fabric);
    k.cylinder(x - 0.14, x + 0.14, r + 0.02, r, 10);
  }
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.box(0.4, 2.4, -0.5, -0.26, -0.12, 0.12);
  k.part = PART.gun;
  const P = [0.0, -0.75, 0];
  const muzzles = place(k, [-0.6, -0.75, 0], null, () => speargun(k, 9.5));
  return { frame: "head", kit: k, pivot: P, muzzles, items: 1, recoil: { d: 0.35, flip: 0, time: 0.3 } };
}

// The gannet (its glide model: the body an ellipsoid 3.1 x 0.72 x 0.8 at the origin): a
// harness of two straps round the body with a rack under each wing root, a bomb hung from each
// on its lug and sway braces; each is gone once it has fallen, and back once it has reloaded.
function gearGannet() {
  const k = new Kit({ part: PART.mount });
  for (const x of [-0.6, 0.9]) {
    const f = Math.sqrt(1 - (x / 3.1) ** 2);
    const ring = (dx, grow) => circle(18, 0.72 * f + grow, 0, 0.8 * f + grow).map(([y, z]) => [x + dx, y, z]);
    k.paint(WEB, ZONE.fabric);
    k.loft([ring(-0.1, 0.01), ring(-0.1, 0.05), ring(0.1, 0.05), ring(0.1, 0.01)], { crease: 0.5 });
  }
  const L = 1.48;
  const y = -0.52,
    z = 0.74;
  for (const side of [1, -1]) {
    // The rack: a steel beam under the wing root from strap to strap, with its sway braces.
    k.paint(PALETTE.darkSteel, ZONE.parker);
    k.bevelBox(-0.7, 1.0, y + 0.2, y + 0.3, side * z - 0.06, side * z + 0.06, 0.02);
    k.paint(C.steel, ZONE.steel);
    for (const x of [-0.25, 0.45]) for (const s2 of [-1, 1]) k.tube([[x, y + 0.22, side * z], [x + s2 * 0.12, y + 0.12, side * z + s2 * 0.08]], 0.018, 4);
    // Right first (slot 1), then left (slot 2): the gannet lets the left one go first.
    k.item(side > 0 ? 0 : 1, 2);
    k.with(T(0.1, y, side * z), () => bomb(k, L));
    k.item(null);
  }
  return { frame: "bird", kit: k, pivot: [0, 0, 0], muzzles: null, bombs: 2 };
}

// The dragonfly larva (a unit long, head at +x, the wing pads' top at y 0.12): the switchblade
// strapped along its back, the blade flicking open over its head as it draws up to strike.
function gearDragonflyLarva() {
  const k = new Kit({ part: PART.mount });
  for (const x of [0.02, 0.2]) {
    k.paint(WEB, ZONE.fabric);
    const ring = (dx, grow) => circle(14, 0.1 + grow, 0, 0.13 + grow).map(([yy, zz]) => [x + dx, yy + 0.03, zz]);
    k.loft([ring(-0.018, 0.0), ring(-0.018, 0.012), ring(0.018, 0.012), ring(0.018, 0.0)], { crease: 0.5 });
  }
  const P = [0.26, 0.15, 0];
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.box(0.0, 0.22, 0.12, 0.138, -0.022, 0.022);
  k.part = PART.gun;
  const blade = new Kit({ part: PART.a });
  blade.push(T(P[0], P[1], P[2]));
  const muzzles = place(k, P, null, () => switchblade(k, 1.7, blade));
  k.append(blade);
  return { frame: "larva", kit: k, pivot: P, muzzles, part: { pivot: P, axis: [0, 0, 1], slide: false }, flick: true, melee: "flick" };
}

// The diving beetle larva: the nail gun on a plate over its thorax, the nose forward past its
// jaws.
function gearBeetleLarva() {
  const k = new Kit({ part: PART.mount });
  for (const x of [0.02, 0.18]) {
    const ring = (dx, grow) => circle(14, 0.055 + grow, 0, 0.09 + grow).map(([yy, zz]) => [x + dx, yy + 0.005, zz]);
    k.paint(WEB, ZONE.fabric);
    k.loft([ring(-0.02, 0.0), ring(-0.02, 0.012), ring(0.02, 0.012), ring(0.02, 0.0)], { crease: 0.5 });
  }
  k.paint(PALETTE.darkSteel, ZONE.parker);
  k.box(-0.02, 0.22, 0.06, 0.075, -0.03, 0.03);
  const P = [0.1, 0.095, 0];
  swivel(k, [0.1, 0.07, 0], P, { r: 0.022, arm: 0.008, clamps: [-0.02, 0.02], lift: 0.03 });
  k.part = PART.gun;
  const muzzles = place(k, [P[0] + 0.03, P[1] + 0.03, P[2]], null, () => nailgun(k, 1.4));
  return { frame: "larva", kit: k, pivot: P, muzzles, recoil: { d: 0.02, flip: 6 * DEG, time: 0.1 }, aim: [0.4, 0.45] };
}

// Every armed kind (kinds.js) and its gear. (The jellyfish's sea mine is part of its own
// model in enemies.js; the sand eel carries nothing.)
export const FOE_GEAR = {
  bullhead: gearBullhead,
  troutParr: gearTroutParr,
  trout: gearTrout,
  king: gearKing,
  minnow: gearMinnow,
  stickleback: gearStickleback,
  grayling: gearGrayling,
  perch: gearPerch,
  cod: gearCod,
  pike: gearPike,
  eel: gearEel,
  otter: gearOtter,
  herring: gearHerring,
  mackerel: gearMackerel,
  kingfisher: gearKingfisher,
  merganser: gearMerganser,
  heron: gearHeron,
  gannet: gearGannet,
  dragonflyLarva: gearDragonflyLarva,
  beetleLarva: gearBeetleLarva,
};
