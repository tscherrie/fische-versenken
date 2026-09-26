// The harness ("Geschirr") that straps the weapons to the fish: webbing straps round the
// body, a saddle plate on the back with a Picatinny rail on the centreline, steel outriggers
// to quick-release clamps on both flanks, and on the salmon body a keel rail under the belly.
// The newborn alevin gets none of that: it is lashed to its laser with one orange ratchet
// strap, like cargo, until the fry is issued the real thing.
//
// Everything is built from the fish's own body profile (the Hermite splines of anatomy.js,
// copied here rather than imported because anatomy.js keeps changing upstream), so the straps
// sit on the skin wherever it is. All numbers are model units (the body is 0.79 long).

import * as THREE from "three";
import { BODIES } from "../anatomy.js";
import { Kit, MODE, ZONE, colour, frame, hull2, resample, shade } from "./model-parts.js";

// The gear's colours (sRGB hex; the kit makes them linear).
export const PALETTE = {
  // Webbing, one colour per co-op player: black, coyote, ranger green, wolf grey. (The
  // harness is built once for everyone: its webbing is "team fabric", tinted per player by
  // the material.)
  webbing: [0x1e1f1c, 0x7b6142, 0x4b5340, 0x6b6e70],
  // A shade lighter than the parr's olive back, so the saddle reads from above.
  saddle: 0x666b48,
  molle: 0x454931,
  rail: 0x2b2d30,
  anodised: 0x2b2f33,
  steel: 0x6f7377,
  darkSteel: 0x34373b,
  blued: 0x22262c,
  polymer: 0x1e1e1e,
  foam: 0x151515,
  orange: 0xe8641e,
  // The co-op ID tapes (until the co-op HUD has its player colours): amber, blue, green, red.
  id: [0xf2b134, 0x3fa7f5, 0x62d26f, 0xef5a5a],
};

// ---------------------------------------------------------------------------------------
// The body: a copy of anatomy.js's profile splines and section surface.

function spline(knots) {
  const xs = knots.map((k) => k[0]);
  const ys = knots.map((k) => k[1]);
  const last = xs.length - 1;
  const slopes = ys.map((_, i) => {
    if (i === 0) return (ys[1] - ys[0]) / (xs[1] - xs[0]);
    if (i === last) return (ys[last] - ys[last - 1]) / (xs[last] - xs[last - 1]);
    return (ys[i + 1] - ys[i - 1]) / (xs[i + 1] - xs[i - 1]);
  });
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[last]) return ys[last];
    let lo = 0,
      hi = last;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xs[m] <= x) lo = m;
      else hi = m;
    }
    const span = xs[lo + 1] - xs[lo];
    const u = (x - xs[lo]) / span;
    const u2 = u * u,
      u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[lo] + (u3 - 2 * u2 + u) * span * slopes[lo] + (-2 * u3 + 3 * u2) * ys[lo + 1] + (u3 - u2) * span * slopes[lo + 1];
  };
}

// A body's shape from its plan: top(x), bottom(x), width(x), the skin at (x, v, side) with v
// from -1 (belly) to 1 (back), and off(): a point d off the skin along the section's outward
// normal, with that normal.
export function bodyShape(plan) {
  const knots = plan.profile.slice().reverse();
  const top = spline(knots.map((k) => [k[0], k[1]]));
  const bottom = spline(knots.map((k) => [k[0], k[2]]));
  const width = spline(knots.map((k) => [k[0], k[3]]));
  const surface = (x, v, side) => {
    const t = top(x),
      b = bottom(x),
      c = (t + b) * 0.5;
    const y = v >= 0 ? c + v * (t - c) : c + v * (c - b);
    const fullness = v >= 0 ? 1.85 : 2.4;
    const waist = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(v), 2.1)), 1 / fullness);
    return [x, y, side * Math.max(width(x) * waist, 0.0003)];
  };
  const off = (x, v, side, d) => {
    const e = 0.004;
    const a = surface(x, Math.min(1, v + e), 1),
      b = surface(x, Math.max(-1, v - e), 1);
    // The section's tangent turned a quarter outward (worked out on the right side, then
    // mirrored).
    let ny = -(a[2] - b[2]),
      nz = a[1] - b[1];
    const l = Math.hypot(ny, nz) || 1;
    ny /= l;
    nz /= l;
    const p = surface(x, v, 1);
    return { p: [x, p[1] + ny * d, side * (p[2] + nz * d)], n: [0, ny, side * nz] };
  };
  // The v on the back (0.4 ... 1) where a surface d off the skin is |z| from the middle.
  const vAtZ = (x, z, d) => {
    let lo = 0.3,
      hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (off(x, m, 1, d).p[2] > Math.abs(z)) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  return { top, bottom, width, surface, off, vAtZ };
}

// Where everything goes on each body: the straps, the saddle, the rail's top, the clamps of the
// outriggers and the default side axis through their jaws, the keel rail. (Clearances checked
// against the pectoral fins' beat, the dorsal fin, the gill covers' flare and the jaw.)
export function bodyFrame(kind) {
  const plan = BODIES[kind];
  const F = { kind, plan, ...bodyShape(plan) };
  if (kind === "alevin") {
    // The ratchet strap's clamp block carries the laser; there are no side clamps.
    F.railTop = 0.051;
    F.clamp = { y: 0.046, z: 0.04 };
    F.side = { y: 0.05, z: 0.04 };
    F.keel = null;
    return F;
  }
  F.rear = 0.092;
  F.front = kind === "parr" ? 0.15 : 0.143;
  F.saddle = [0.08, F.front + 0.007];
  F.railTop = F.top(0.12) + 0.008;
  F.clamp = kind === "parr" ? { y: 0.052, z: 0.05 } : { y: 0.06, z: 0.054 };
  F.side = { y: F.clamp.y + 0.004, z: F.clamp.z };
  F.keel = kind === "salmon" ? { top: -0.08, bottom: -0.086, x0: 0.07, x1: 0.17 } : null;
  F.D_IN = 0.0022;
  F.D_OUT = 0.0047;
  // The fire-control box sits on the saddle's left rear; its cables leave from its front.
  const vf = F.vAtZ(0.093, 0.016, F.D_OUT);
  const o = F.off(0.093, vf, -1, F.D_OUT);
  F.fcb = { p: o.p, n: o.n, out: [0.102, o.p[1] + o.n[1] * 0.004, o.p[2] + o.n[2] * 0.004] };
  return F;
}

// ---------------------------------------------------------------------------------------
// Parts of the harness.

// Team fabric: factors on the player's webbing colour (the stitching 25 % lighter).
const WEB = [1, 1, 1],
  STITCH = [1.25, 1.25, 1.25];

// One webbing strap round the body at x = xc: a flat band 0.014 wide sitting 0.0005-0.002 off
// the skin, with two lighter rows of edge stitching (left out on eco).
function webStrap(k, F, xc) {
  const N = 26;
  const cols = k.detail ? [-0.007, -0.0058, -0.0049, 0.0049, 0.0058, 0.007] : [-0.007, 0.007];
  const bands = k.detail ? [WEB, STITCH, WEB, STITCH, WEB] : [WEB];
  const at = (x, j, d) => {
    const t = ((j % N) / N) * 2;
    return F.off(x, Math.cos(Math.PI * t), t <= 1 ? 1 : -1, d);
  };
  k.team = 1;
  k.paint(WEB, ZONE.fabric);
  for (let b = 0; b < bands.length; b++) {
    const rgb = colour(bands[b]);
    const a = [],
      c = [];
    for (let j = 0; j <= N; j++) {
      const p = at(xc + cols[b], j, 0.002),
        q = at(xc + cols[b + 1], j, 0.002);
      a.push(k.vertex(p.p, p.n, rgb));
      c.push(k.vertex(q.p, q.n, rgb));
    }
    for (let j = 0; j < N; j++) k.quad(a[j], a[j + 1], c[j + 1], c[j]);
  }
  // The band's two edges.
  for (const s of [-1, 1]) {
    const x = xc + s * 0.007;
    const inner = [],
      outer = [];
    for (let j = 0; j <= N; j++) {
      inner.push(k.vertex(at(x, j, 0.0005).p, [s, 0, 0]));
      outer.push(k.vertex(at(x, j, 0.002).p, [s, 0, 0]));
    }
    for (let j = 0; j < N; j++) k.quad(inner[j], inner[j + 1], outer[j + 1], outer[j]);
  }
  k.team = 0;
}

// The hardware on a strap at v = 0.25: a black side-release buckle on the left flank, a steel
// tri-glide with the strap's end under an elastic keeper on the right.
function strapHardware(k, F, xc) {
  for (const side of [-1, 1]) {
    const o = F.off(xc, 0.25, side, 0.002);
    // Local frame: x along the body, y out of the skin, z round the loop.
    k.push(frame(o.p, [1, 0, 0], o.n));
    if (side < 0) {
      k.paint(PALETTE.polymer, ZONE.polymer);
      // The female housing and the male tongue with its two release prongs.
      k.box(-0.0078, 0.0078, 0, 0.0038, -0.0095, 0.0005);
      k.box(-0.0066, 0.0066, 0.0006, 0.0028, 0.0005, 0.0085);
      k.paint(shade(PALETTE.polymer, 0.6), ZONE.rubber);
      k.box(-0.0079, -0.0062, 0.0008, 0.0032, -0.0082, -0.0032);
      k.box(0.0062, 0.0079, 0.0008, 0.0032, -0.0082, -0.0032);
    } else {
      k.paint(PALETTE.steel, ZONE.steel);
      // A rectangular frame with a middle bar.
      k.box(-0.0074, 0.0074, 0, 0.0025, -0.004, -0.0028);
      k.box(-0.0074, 0.0074, 0, 0.0025, 0.0028, 0.004);
      k.box(-0.0074, 0.0074, 0.0002, 0.0027, -0.0006, 0.0006);
      k.box(-0.0074, -0.0062, 0, 0.0025, -0.004, 0.004);
      k.box(0.0062, 0.0074, 0, 0.0025, -0.004, 0.004);
      // The strap's end doubled back over the band, and its keeper.
      k.team = 1;
      k.paint(WEB, ZONE.fabric);
      k.box(-0.0066, 0.0066, 0.0001, 0.0011, 0.004, 0.0165);
      k.paint(shade(WEB, 0.55), ZONE.rubber);
      k.box(-0.0071, 0.0071, -0.0004, 0.0016, 0.0115, 0.0152);
      k.team = 0;
    }
    k.pop();
  }
}

// The saddle plate: an olive polymer shell lofted over both straps across the top 40 % of the
// body, chamfered corners, a black foam lip round its edge, three rows of MOLLE loops and four
// bolt heads where it is bolted to the straps.
function saddle(k, F) {
  const [x0, x1] = F.saddle;
  const A = 20,
    R = 8;
  const xm = (x0 + x1) / 2;
  const cols = [];
  for (let i = 0; i <= A; i++) {
    const a = -1 + (2 * i) / A;
    cols.push({ a, v: 1 - 0.4 * Math.abs(a), side: a < 0 ? -1 : 1 });
  }
  // The chamfer: columns near the side edges start later and end earlier.
  const arc = [0];
  for (let i = 1; i <= A; i++) {
    const p = F.off(xm, cols[i].v, cols[i].side, F.D_OUT).p,
      q = F.off(xm, cols[i - 1].v, cols[i - 1].side, F.D_OUT).p;
    arc.push(arc[i - 1] + Math.hypot(p[1] - q[1], p[2] - q[2]));
  }
  const total = arc[A];
  const chamfer = 0.0075;
  cols.forEach((c, i) => (c.inset = Math.max(0, chamfer - Math.min(arc[i], total - arc[i]))));
  const xAt = (i, r) => {
    const c = cols[i];
    return x0 + c.inset + ((x1 - c.inset - (x0 + c.inset)) * r) / R;
  };
  const at = (i, r, d) => F.off(xAt(i, r), cols[i].v, cols[i].side, d);
  k.paint(PALETTE.saddle, ZONE.polymer);
  const grid = [];
  for (let i = 0; i <= A; i++) {
    const row = [];
    for (let r = 0; r <= R; r++) {
      const o = at(i, r, F.D_OUT);
      row.push(k.vertex(o.p, o.n));
    }
    grid.push(row);
  }
  for (let i = 0; i < A; i++) for (let r = 0; r < R; r++) k.quad(grid[i][r], grid[i + 1][r], grid[i + 1][r + 1], grid[i][r + 1]);
  // The rim: the shell's thickness in olive, the foam lip under it in black.
  const rim = [];
  for (let i = 0; i <= A; i++) rim.push([i, 0]);
  for (let r = 1; r <= R; r++) rim.push([A, r]);
  for (let i = A - 1; i >= 0; i--) rim.push([i, R]);
  for (let r = R - 1; r >= 1; r--) rim.push([0, r]);
  const centre = F.off(xm, 1, 1, F.D_OUT).p;
  for (let m = 0; m < rim.length; m++) {
    const [i0, r0] = rim[m],
      [i1, r1] = rim[(m + 1) % rim.length];
    const a = at(i0, r0, F.D_OUT),
      b = at(i1, r1, F.D_OUT);
    const e = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
    const sn = [a.n[0] + b.n[0], a.n[1] + b.n[1], a.n[2] + b.n[2]];
    let w = [e[1] * sn[2] - e[2] * sn[1], e[2] * sn[0] - e[0] * sn[2], e[0] * sn[1] - e[1] * sn[0]];
    const l = Math.hypot(...w) || 1;
    w = w.map((c) => c / l);
    const mid = [(a.p[0] + b.p[0]) / 2 - centre[0], (a.p[1] + b.p[1]) / 2 - centre[1], (a.p[2] + b.p[2]) / 2 - centre[2]];
    if (w[0] * mid[0] + w[1] * mid[1] + w[2] * mid[2] < 0) w = w.map((c) => -c);
    for (const [d0, d1, c, z] of [
      [F.D_IN, F.D_OUT, PALETTE.saddle, ZONE.polymer],
      [0.0003, F.D_IN, PALETTE.foam, ZONE.rubber],
    ]) {
      k.paint(c, z);
      const bulge = z === ZONE.rubber ? 0.0006 : 0;
      const p0 = at(i0, r0, d0).p,
        p1 = at(i1, r1, d0).p,
        q0 = at(i0, r0, d1).p,
        q1 = at(i1, r1, d1).p;
      const push = (p) => [p[0] + w[0] * bulge, p[1] + w[1] * bulge, p[2] + w[2] * bulge];
      k.face([push(p0), push(p1), q1, q0], w);
    }
  }
  // MOLLE: three rows of webbing loops across the saddle, bar-tacked into loops, clear of the
  // rail in the middle and of the outrigger feet at the edges.
  k.paint(PALETTE.molle, ZONE.fabric);
  const loops = [
    [0.16, 0.36],
    [0.4, 0.6],
    [0.64, 0.82],
  ];
  for (const xr of [0.106, 0.119, 0.132]) {
    for (const side of [-1, 1])
      for (const [a0, a1] of loops) {
        const steps = 3;
        const ring = (x, d) => {
          const out = [];
          for (let s = 0; s <= steps; s++) {
            const a = a0 + ((a1 - a0) * s) / steps;
            out.push(F.off(x, 1 - 0.4 * a, side, d));
          }
          return out;
        };
        const d0 = F.D_OUT - 0.0002,
          d1 = F.D_OUT + 0.0007;
        const back = ring(xr - 0.00225, d1),
          front = ring(xr + 0.00225, d1);
        const top = [];
        for (let s = 0; s <= steps; s++) top.push([k.vertex(back[s].p, back[s].n), k.vertex(front[s].p, front[s].n)]);
        for (let s = 0; s < steps; s++) k.quad(top[s][0], top[s + 1][0], top[s + 1][1], top[s][1]);
        for (const [x, nx] of [
          [xr - 0.00225, -1],
          [xr + 0.00225, 1],
        ]) {
          const lo = ring(x, d0),
            hi = ring(x, d1);
          for (let s = 0; s < steps; s++) k.face([lo[s].p, lo[s + 1].p, hi[s + 1].p, hi[s].p], [nx, 0, 0]);
        }
      }
  }
  // Bolt heads (hex, on washers) where the saddle is bolted to the straps (not on eco).
  if (!k.detail) return;
  for (const xb of [F.rear, F.front])
    for (const side of [-1, 1]) {
      const a = 0.58;
      const o = F.off(xb, 1 - 0.4 * a, side, F.D_OUT);
      k.with(frame(o.p, o.n, [1, 0, 0]), () => {
        k.paint(PALETTE.darkSteel, ZONE.steel);
        k.cylinder(-0.0002, 0.0004, 0.0027, 0.0027, 8, { capStart: false });
        k.paint(PALETTE.steel, ZONE.steel);
        k.lathe(
          [
            [0.0004, 0.0019],
            [0.0014, 0.0019],
            [0.0017, 0.0014],
          ],
          6,
          { flat: true },
        );
      });
    }
}

// The Picatinny rail on the centreline: a riser that follows the saddle, the dovetail, and
// eight cross-slot teeth.
function rail(k, F) {
  const r = F.railTop,
    x0 = 0.084,
    x1 = 0.148;
  k.paint(PALETTE.rail, ZONE.alu);
  const rings = [];
  for (let i = 0; i <= 8; i++) {
    const x = x0 + ((x1 - x0) * i) / 8;
    const yb = F.top(x) + 0.0036,
      yt = r - 0.0034;
    rings.push([
      [x, yb, -0.0034],
      [x, yb, 0.0034],
      [x, yt, 0.0034],
      [x, yt, -0.0034],
    ]);
  }
  k.loft(rings, { flat: true, capStart: true, capEnd: true });
  const dove = [
    [r - 0.0035, -0.003],
    [r - 0.0035, 0.003],
    [r - 0.0026, 0.0041],
    [r - 0.0019, 0.0041],
    [r - 0.0012, 0.0033],
    [r - 0.0012, -0.0033],
    [r - 0.0019, -0.0041],
    [r - 0.0026, -0.0041],
  ];
  k.prism(x0, x1, dove);
  // The cross-slot teeth (not on eco).
  if (!k.detail) return;
  for (let i = 0; i < 8; i++) {
    const x = x0 + 0.004 + i * 0.008;
    k.prism(x - 0.00225, x + 0.00225, [
      [r - 0.0013, -0.0035],
      [r - 0.0013, 0.0035],
      [r - 0.0004, 0.004],
      [r, 0.0034],
      [r, -0.0034],
      [r - 0.0004, -0.004],
    ]);
  }
}

// The four outriggers: square steel tube from the saddle's edge up and out to a quick-release
// clamp block with its lever, a foot plate on the saddle and a D-ring beside it.
function outriggers(k, F) {
  const C = F.clamp;
  for (const side of [-1, 1])
    for (const xa of [0.1, 0.145]) {
      const vr = 1 - 0.4 * 0.9;
      const root = F.off(xa, vr, side, F.D_OUT);
      const end = [xa, C.y - 0.003, side * (C.z - 0.0035)];
      k.paint(PALETTE.darkSteel, ZONE.steel);
      k.with(frame(root.p, root.n, [1, 0, 0]), () => {
        k.bevelBox(-0.0003, 0.0011, -0.0062, 0.0062, -0.0048, 0.0048, 0.0012);
      });
      k.paint(PALETTE.darkSteel, ZONE.parker);
      const start = [root.p[0], root.p[1] + root.n[1] * 0.0008, root.p[2] + root.n[2] * 0.0008];
      k.tube([start, end], 0.0025 * Math.SQRT2, 4, { flat: true, phase: Math.PI / 4 });
      // Co-op: an ID tape round the arm in the player's colour (team 2: the material's ID
      // colour; an item, so it is hidden when the fish swims alone).
      const dir = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
      const mid = [start[0] + dir[0] * 0.45, start[1] + dir[1] * 0.45, start[2] + dir[2] * 0.45];
      k.team = 2;
      k.item(0, 1);
      k.paint([1, 1, 1], ZONE.fabric);
      k.with(frame(mid, dir, [1, 0, 0]), () => k.bevelBox(-0.003, 0.003, -0.0031, 0.0031, -0.0031, 0.0031, 0.0007));
      k.item(null);
      k.team = 0;
      // The clamp block with two jaws on top, and its lever on the outboard face.
      k.paint(PALETTE.anodised, ZONE.alu);
      const zc = side * C.z;
      const zs = (a, b) => [Math.min(zc + side * a, zc + side * b), Math.max(zc + side * a, zc + side * b)];
      k.bevelBox(xa - 0.005, xa + 0.005, C.y - 0.005, C.y + 0.0045, zc - 0.004, zc + 0.004, 0.0012);
      for (const [a, b] of [
        [-0.004, -0.0024],
        [0.0024, 0.004],
      ]) {
        const [z0, z1] = zs(a, b);
        k.box(xa - 0.0042, xa + 0.0042, C.y + 0.0045, C.y + 0.0068, z0, z1);
      }
      k.paint(PALETTE.darkSteel, ZONE.steel);
      const zl = zc + side * 0.0048;
      k.with(M4(xa - 0.004, C.y - 0.0025, zl, 0.35), () => {
        k.box(0, 0.0105, -0.0011, 0.0011, -0.0007, 0.0007);
        k.box(0.0092, 0.0112, -0.0016, 0.0016, -0.0009, 0.0009);
      });
      k.cylinder(xa - 0.0048, xa - 0.0036, 0.0013, 0.0013, 6, { centre: [C.y - 0.0025, zl] });
      // A D-ring standing just behind the arm's foot.
      if (!k.detail) continue;
      const o = F.off(xa - 0.0072, vr + 0.03, side, F.D_OUT);
      const bx = [0, o.n[2], -o.n[1]];
      k.with(frame(o.p, bx[1] * side >= 0 ? bx : bx.map((c) => -c), o.n), () => {
        k.paint(PALETTE.steel, ZONE.steel);
        k.torus(0.0034, 0.0007, { major: 6, minor: 4, arc: Math.PI, start: -Math.PI / 2 });
      });
    }
}
// A turn about z, then a move (the clamp levers).
function M4(x, y, z, a) {
  return new THREE.Matrix4().makeRotationZ(a).setPosition(x, y, z);
}

// The fire-control box: the solenoids on the weapons get their pulses from here (a fish
// cannot pull a trigger). Black, with a status lamp and a cable gland at its front.
function fireControl(k, F) {
  const { p, n } = F.fcb;
  k.with(frame(p, n, [1, 0, 0]), () => {
    k.paint(PALETTE.polymer, ZONE.polymer);
    k.bevelBox(0, 0.008, -0.008, 0.008, -0.005, 0.005, 0.0012);
    k.paint(PALETTE.darkSteel, ZONE.steel);
    k.box(0.002, 0.0055, 0.008, 0.0095, -0.0022, 0.0022);
    k.paint([0.1, 1.2, 0.3], ZONE.light);
    k.box(0.008, 0.0086, 0.0035, 0.0055, 0.0018, 0.0034);
  });
}

// The belly cradle (salmon body only): a steel U-channel keel rail on the centreline, hung
// from a lug at the bottom of each strap. An empty cradle is a bare rail, ready for ordnance.
function cradle(k, F) {
  const { top, bottom, x0, x1 } = F.keel;
  k.paint(PALETTE.steel, ZONE.steel);
  k.box(x0, x1, top - 0.0012, top, -0.005, 0.005);
  k.box(x0, x1, bottom, top - 0.0012, -0.005, -0.0038);
  k.box(x0, x1, bottom, top - 0.0012, 0.0038, 0.005);
  for (const xs of [F.rear, F.front]) {
    const yb = F.bottom(xs) - 0.0018;
    k.paint(PALETTE.darkSteel, ZONE.steel);
    k.box(xs - 0.003, xs + 0.003, top - 0.0004, yb + 0.0006, -0.003, 0.003);
    k.paint(PALETTE.steel, ZONE.steel);
    k.with(new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(xs, top - 0.003, 0), () => k.cylinder(-0.0056, 0.0056, 0.0011, 0.0011, 6));
  }
}

// The whole harness for the parr or the salmon body, in one geometry, for every player (the
// webbing takes each player's colour in the material). Each vertex rises with the spawner's
// hump exactly like the skin under it. detail false: the eco build (no stitch rows, rail
// teeth, bolt heads or D-rings).
export function buildHarness(F, { detail = true } = {}) {
  const k = new Kit({ mode: MODE.follow, detail });
  webStrap(k, F, F.rear);
  webStrap(k, F, F.front);
  strapHardware(k, F, F.rear);
  strapHardware(k, F, F.front);
  saddle(k, F);
  rail(k, F);
  outriggers(k, F);
  fireControl(k, F);
  if (F.keel) cradle(k, F);
  return k;
}

// ---------------------------------------------------------------------------------------
// The alevin's ratchet strap. Its loop is the convex hull of the body's section and the yolk
// sac's at x = 0.12, so it is rebuilt (same vertices, new places) as the yolk is used up and
// the strap visibly ratchets tighter.

export function buildAlevinGear(F, yolk) {
  const k = new Kit({ mode: MODE.follow });
  const x = 0.12;
  const s = 0.25 + 0.75 * Math.max(0, Math.min(1, yolk));
  const cy = -0.075 + 0.05 * (1 - s);
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * 2;
    const p = F.surface(x, Math.cos(Math.PI * t), t <= 1 ? 1 : -1);
    pts.push([p[2], p[1]]);
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    pts.push([Math.cos(a) * 0.055 * s, cy + Math.sin(a) * 0.062 * s]);
  }
  let hull = hull2(pts);
  let topAt = 0;
  hull.forEach((p, i) => {
    if (p[1] > hull[topAt][1]) topAt = i;
  });
  hull = hull.slice(topAt).concat(hull.slice(0, topAt));
  const N = 36;
  const loop = resample(hull, N);
  const normals = loop.map((p, i) => {
    const a = loop[(i - 1 + N) % N],
      b = loop[(i + 1) % N];
    const tz = b[0] - a[0],
      ty = b[1] - a[1];
    const l = Math.hypot(tz, ty) || 1;
    return [ty / l, -tz / l];
  });
  const at = (i, d) => [loop[i % N][0] + normals[i % N][0] * d, loop[i % N][1] + normals[i % N][1] * d];
  const orange = colour(PALETTE.orange),
    line = shade(PALETTE.orange, 0.55);
  const cols = [-0.009, -0.0079, -0.0072, 0.0072, 0.0079, 0.009];
  const bands = [orange, line, orange, line, orange];
  for (let b = 0; b < bands.length; b++) {
    k.paint(bands[b], ZONE.fabric);
    const a = [],
      c = [];
    for (let j = 0; j <= N; j++) {
      const [z, y] = at(j, 0.002);
      const nrm = [0, normals[j % N][1], normals[j % N][0]];
      a.push(k.vertex([x + cols[b], y, z], nrm));
      c.push(k.vertex([x + cols[b + 1], y, z], nrm));
    }
    for (let j = 0; j < N; j++) k.quad(a[j], a[j + 1], c[j + 1], c[j]);
  }
  k.paint(orange, ZONE.fabric);
  for (const sx of [-1, 1]) {
    const xe = x + sx * 0.009;
    const inner = [],
      outer = [];
    for (let j = 0; j <= N; j++) {
      const [zi, yi] = at(j, 0.0005),
        [zo, yo] = at(j, 0.002);
      inner.push(k.vertex([xe, yi, zi], [sx, 0, 0]));
      outer.push(k.vertex([xe, yo, zo], [sx, 0, 0]));
    }
    for (let j = 0; j < N; j++) k.quad(inner[j], inner[j + 1], outer[j + 1], outer[j]);
  }
  // The ratchet on the left flank where body meets yolk (y about -0.015).
  let best = 0;
  loop.forEach((p, i) => {
    if (p[0] < 0 && Math.abs(p[1] + 0.015) < Math.abs(loop[best][1] + 0.015) + (loop[best][0] < 0 ? 0 : 1)) best = i;
  });
  const [rz, ry] = at(best, 0.002);
  const nrm = [0, normals[best][1], normals[best][0]];
  k.with(frame([x, ry, rz], [1, 0, 0], nrm), () => {
    k.paint(PALETTE.steel, ZONE.steel);
    // Two side plates, the spool between them, and the handle folded over.
    k.box(-0.0085, -0.0068, 0, 0.0065, -0.01, 0.01);
    k.box(0.0068, 0.0085, 0, 0.0065, -0.01, 0.01);
    k.paint(PALETTE.darkSteel, ZONE.steel);
    k.cylinder(-0.0068, 0.0068, 0.0028, 0.0028, 8, { centre: [0.0034, -0.0035] });
    k.paint(PALETTE.steel, ZONE.steel);
    k.box(-0.0078, 0.0078, 0.0062, 0.008, -0.002, 0.0098);
    k.paint(PALETTE.polymer, ZONE.rubber);
    k.box(-0.0055, 0.0055, 0.0065, 0.0085, 0.0098, 0.0125);
  });
  // The clamp block on top, threaded on the strap: it carries the laser.
  const topY = at(0, 0.002)[1];
  k.paint(PALETTE.anodised, ZONE.alu);
  k.bevelBox(0.105, 0.135, topY - 0.0006, F.railTop - 0.0012, -0.005, 0.005, 0.0012);
  for (let i = 0; i < 4; i++) {
    const xc = 0.108 + i * 0.008;
    k.box(xc - 0.0022, xc + 0.0022, F.railTop - 0.0012, F.railTop, -0.0042, 0.0042);
  }
  return k;
}
