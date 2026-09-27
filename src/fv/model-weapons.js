// The weapons as solid things: real guns, blades and launchers modelled low-poly from their
// real shapes (receivers, barrels with dark bores, heat sinks, hinge pins, valve wheels,
// lacquered scabbards), in real materials, comically large where the design says so. The joke
// is the contrast with the pretty fish game, so nothing here may look like a toy.
//
// Each weapon is built once per body (parr, salmon; the laser also for the alevin) in the
// body's model units, placed on that body's mounts: the rail's top for the middle, the clamps
// of the outriggers for the sides (F.side: the axis through their jaws), the keel rail for the
// belly. A builder returns the weapon's kit, the kits of its moving parts and its muzzles:
//   { main: Kit, parts: { name: { kit, pivot, axis, ... } }, muzzles: [[x, y, z], ...] }
// All of it becomes ONE mesh (one draw): each vertex says which part it belongs to (PART: the
// mount bolted to the fish, the gun that kicks, two moving parts with matrices of their own),
// and ammunition that can run out is made of items (Kit.item) the material hides.

import * as THREE from "three";
import { Kit, MODE, PART, ZONE, circle, colour, curve, frame, helix, hull2, mixColour, rect, shade, stream, T, RX, RY, RZ, M, vec } from "./model-parts.js";
import { PALETTE } from "./model-harness.js";

const DEG = Math.PI / 180;

// Weapon colours (sRGB hex).
export const C = {
  anodised: 0x2b2f33,
  anodisedLight: 0x3a3f45,
  bareAlu: 0x747a80,
  blued: 0x4a5462,
  parker: 0x46484b,
  gunmetal: 0x3a3d42,
  steel: 0x6f7377,
  brightSteel: 0xb8bcc0,
  mirror: 0xcfd3d6,
  polymer: 0x1e1e1e,
  rubber: 0x121212,
  bore: 0x050505,
  olive: 0x464c2a,
  oliveDrab: 0x4e5238,
  fde: 0xa68b5b,
  walnut: 0x5b3a1e,
  walnutDark: 0x3f2714,
  rawWood: 0x9c7348,
  brass: 0xc9a44a,
  bronze: 0x6a4e2c,
  copper: 0x9c5f30,
  red: 0xa8201a,
  yellow: 0xe0b020,
  white: 0xe8e6dc,
  lacquer: 0x0b0b0c,
  horn: 0x1a1512,
  ito: 0x141414,
  samegawa: 0xe7e2d2,
  navy: 0x4e555c,
  ceramic: 0xc2c4c0,
  orange: 0xe86a10,
};

// A polygon round (cy, cz) in the y-z plane.
const ring2 = (count, r, cy, cz, phase = 0) => circle(count, r, phase).map(([y, z]) => [y + cy, z + cz]);
// A turn about the x axis through (y, z).
const aboutX = (a, y, z) => M(T(0, y, z), RX(a), T(0, -y, -z));
// Sorted range helper for mirrored sides.
const span = (a, b) => [Math.min(a, b), Math.max(a, b)];

// A thin cable along a curve through `points` (the solenoids' leads, the power cable).
function cable(k, points, r = 0.0009, count = 12, rgb = C.rubber) {
  k.paint(rgb, ZONE.rubber);
  k.tube(curve(points, count), r, 4);
}

// The lead from the fire-control box on the saddle to a weapon's solenoid at `to`, laid over
// the saddle (it follows the skin with the spawner's hump). `via` lifts it over the rail.
function fcbLead(k, F, to, via = []) {
  if (!F.fcb) return;
  const mode = k.mode,
    part = k.part;
  k.mode = MODE.follow;
  k.part = PART.mount;
  const o = F.fcb.out;
  cable(k, [o, [o[0] + 0.004, o[1] + 0.001, o[2]], ...via, to], 0.0009, 12);
  k.mode = mode;
  k.part = part;
}

// A point on the saddle's outer face at body x and |z| (for laying cables over it).
function onSaddle(F, x, z, lift = 0.0011) {
  const v = F.vAtZ(x, Math.abs(z), F.D_OUT);
  const o = F.off(x, v, z < 0 ? -1 : 1, F.D_OUT + lift);
  return o.p;
}

// The solenoid that pulls the trigger: a small black box with a cable gland.
function solenoid(k, x0, x1, y0, y1, z0, z1) {
  k.paint(C.polymer, ZONE.polymer);
  k.bevelBox(x0, x1, y0, y1, z0, z1, Math.min(0.001, (y1 - y0) / 4));
  k.paint(C.steel, ZONE.steel);
  k.cylinder(x0 - 0.0016, x0, 0.0013, 0.0013, 6, { centre: [(y0 + y1) / 2, (z0 + z1) / 2] });
}

// A case-hardened box: each face a small grid with mottled colours (blue, straw, grey, brown),
// as colour-case hardening looks on an old action.
function mottledBox(k, x0, x1, y0, y1, z0, z1, seed, div = 4) {
  const rnd = stream(seed);
  const tones = [0x9a9ea3, 0x5b6f95, 0xb09658, 0x7d6446, 0x8a9ab0, 0x50555e].map(colour);
  const pick = () => {
    const a = tones[Math.floor(rnd() * tones.length)],
      b = tones[Math.floor(rnd() * tones.length)];
    return mixColour(a, b, rnd());
  };
  const faces = [
    [[x0, y0, z0], [x0, y1, z0], [x0, y0, z1], [-1, 0, 0]],
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z0], [1, 0, 0]],
    [[x0, y0, z0], [x0, y0, z1], [x1, y0, z0], [0, -1, 0]],
    [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [0, 1, 0]],
    [[x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [0, 0, -1]],
    [[x0, y0, z1], [x0, y1, z1], [x1, y0, z1], [0, 0, 1]],
  ];
  k.zone = ZONE.steel;
  for (const [o, a, b, nrm] of faces) {
    const ua = vec.sub(a, o),
      ub = vec.sub(b, o);
    const ids = [];
    for (let i = 0; i <= div; i++) {
      const row = [];
      for (let j = 0; j <= div; j++) row.push(k.vertex(vec.add(o, vec.add(vec.scale(ua, i / div), vec.scale(ub, j / div))), nrm, pick()));
      ids.push(row);
    }
    for (let i = 0; i < div; i++) for (let j = 0; j < div; j++) k.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
  }
}

// Wood with a grain: bands of slightly different browns along a loft.
const grain = (base, seed) => {
  const rnd = stream(seed);
  return () => shade(base, 0.82 + rnd() * 0.36);
};

// =======================================================================================
// Kompaktlaser ("piu"): the fry's directed-energy weapon on the rail. Black anodised receiver
// with a heat sink, an octagonal shroud, an emitter head with a recessed red lens (it glows
// with the heat: the gun is its own heat gauge), a red-dot sight, a laser warning label, and a
// coiled power cable to a battery box on the left rear clamp.

function buildPiu(F) {
  const k = new Kit({ part: PART.gun, mode: MODE.rail });
  const r = F.railTop,
    b = r + 0.016;
  // The rail clamp foot, with a quick-release lever on its right (the mount: it stays put when
  // the gun kicks).
  k.part = PART.mount;
  k.paint(C.anodised, ZONE.alu);
  k.bevelBox(0.1, 0.13, r, r + 0.0056, -0.0066, 0.0066, 0.001);
  k.box(0.1, 0.13, r - 0.0032, r, -0.0066, -0.0045);
  k.box(0.1, 0.13, r - 0.0032, r, 0.0045, 0.0066);
  k.paint(C.steel, ZONE.steel);
  k.with(M(T(0.104, r - 0.0012, 0.0073), RZ(0.1)), () => k.box(0, 0.021, -0.0011, 0.0011, -0.0006, 0.0006));
  k.with(M(T(0.1045, r - 0.0012, 0.0073), RY(-Math.PI / 2)), () => k.cylinder(-0.001, 0.001, 0.0017, 0.0017, 8));
  k.part = PART.gun;
  // Receiver and battery housing, a red anodised end plate (what the chase camera sees) and a
  // white stencil strip on top.
  k.paint(C.anodised, ZONE.alu);
  k.bevelBox(0.09, 0.22, b - 0.011, b + 0.011, -0.01, 0.01, 0.0028);
  k.paint(0xb3201a, ZONE.alu);
  k.bevelBox(0.0888, 0.0901, b - 0.0098, b + 0.0098, -0.0088, 0.0088, 0.0022);
  k.paint(C.white, ZONE.paint);
  k.box(0.152, 0.184, b + 0.011, b + 0.0113, -0.0042, 0.0042);
  // A seam and a milled step along the housing (the two shells bolted together).
  k.paint(C.anodisedLight, ZONE.alu);
  k.box(0.15, 0.218, b - 0.0022, b + 0.0022, -0.0104, 0.0104);
  k.paint(C.steel, ZONE.steel);
  for (const x of [0.157, 0.211])
    for (const z of [-0.0106, 0.0104]) k.with(M(T(x, b, z), RY(z > 0 ? -Math.PI / 2 : Math.PI / 2)), () => k.cylinder(0, 0.0003, 0.0011, 0.0011, 6));
  // Heat sink: six bare aluminium fins across the rear, standing proud of the top and both
  // sides.
  k.paint(C.bareAlu, ZONE.parker);
  for (let i = 0; i < 6; i++) {
    const x = 0.095 + i * 0.01;
    k.bevelBox(x - 0.001, x + 0.001, b - 0.0068, b + 0.0148, -0.0145, 0.0145, 0.0022);
  }
  // The octagonal barrel shroud with four milled slots.
  k.paint(0x25272b, ZONE.alu);
  k.prism(0.22, 0.37, ring2(8, 0.009, b, 0, Math.PI / 8));
  k.paint(C.rubber, ZONE.rubber);
  for (const x of [0.245, 0.31])
    for (const s of [-1, 1]) {
      const [z0, z1] = span(s * 0.0079, s * 0.0086);
      k.box(x, x + 0.045, b - 0.0017, b + 0.0017, z0, z1);
    }
  // A red anodised ring where the shroud meets the head (the laser's warning colour).
  k.paint(0x9a1a16, ZONE.alu);
  k.cylinder(0.3645, 0.368, 0.0095, 0.0095, 16, { centre: [b, 0] });
  // The emitter head: a turned cylinder, the lens recessed in it, a crown of four prongs.
  k.paint(0x18191c, ZONE.alu);
  k.lathe(
    [
      [0.368, 0.0092],
      [0.3705, 0.012],
      [0.393, 0.012],
      [0.395, 0.0106],
      [0.395, 0.0079],
      [0.3893, 0.0072],
      [0.3893, 0.0],
    ],
    16,
    { centre: [b, 0] },
  );
  k.paint([0.55, 0.035, 0.02], ZONE.glow);
  k.lathe(
    [
      [0.3895, 0.0071],
      [0.3903, 0.0066],
      [0.3911, 0.004],
      [0.3915, 0],
    ],
    16,
    { centre: [b, 0] },
  );
  k.paint(C.brightSteel, ZONE.polished);
  for (let i = 0; i < 4; i++)
    k.with(aboutX(Math.PI / 4 + (i * Math.PI) / 2, b, 0), () =>
      k.prism(0.3945, 0.4065, rect(b + 0.0092, b + 0.0122, -0.0014, 0.0014), { taper: 0.55, shift: [-0.001, 0] }),
    );
  // The red-dot sight on top: a squat body with a tinted window and the dot.
  k.paint(C.anodised, ZONE.alu);
  k.box(0.187, 0.205, b + 0.011, b + 0.0128, -0.0042, 0.0042);
  k.bevelBox(0.19, 0.204, b + 0.0128, b + 0.02, -0.005, 0.005, 0.0015);
  k.paint([0.02, 0.05, 0.06], ZONE.glass);
  k.box(0.2041, 0.2044, b + 0.0138, b + 0.0192, -0.0037, 0.0037);
  k.paint([1, 0.05, 0.02], ZONE.light);
  k.box(0.1955, 0.1962, b + 0.0162, b + 0.0169, -0.0004, 0.0004);
  // The laser warning label on the right: a black-bordered yellow triangle.
  const tri = (s, cx, cy) => [
    [cx - s / 2, cy - s * 0.29],
    [cx + s / 2, cy - s * 0.29],
    [cx, cy + s * 0.58],
  ];
  k.paint(C.polymer, ZONE.polymer);
  k.plate(tri(0.0125, 0.166, b - 0.0005), 0.0099, 0.01012, { sides: false });
  k.paint(C.yellow, ZONE.polymer);
  k.plate(tri(0.0095, 0.166, b - 0.0005), 0.01012, 0.01022, { sides: false });
  k.paint(C.polymer, ZONE.polymer);
  k.plate(tri(0.0032, 0.166, b - 0.0005), 0.01022, 0.0103, { sides: false });
  if (F.fcb) {
    // The battery box on the left rear clamp, olive with a yellow band, and the coiled cable.
    const Cc = F.clamp;
    k.part = PART.mount;
    k.mode = MODE.side;
    const zc = -Cc.z;
    k.paint(C.oliveDrab, ZONE.paint);
    k.bevelBox(0.088, 0.112, Cc.y + 0.0045, Cc.y + 0.0165, zc - 0.006, zc + 0.006, 0.0015);
    k.paint(C.yellow, ZONE.paint);
    k.box(0.097, 0.1015, Cc.y + 0.0042, Cc.y + 0.0168, zc - 0.0063, zc + 0.0063);
    k.paint(C.steel, ZONE.steel);
    k.cylinder(0.112, 0.1145, 0.0026, 0.0022, 8, { centre: [Cc.y + 0.0105, zc] });
    k.mode = MODE.follow;
    k.paint(C.rubber, ZONE.rubber);
    const a = [0.1148, Cc.y + 0.0105, zc],
      e = [0.0925, b - 0.0085, -0.0078];
    const coil = helix(vec.add(a, [0.004, 0.003, 0.004]), vec.add(e, [0.006, -0.002, -0.006]), 6, 0.0026, 6);
    k.tube([a, ...coil, e], 0.00095, 4);
    fcbLead(k, F, [0.093, b - 0.0105, -0.003], [[0.098, F.fcb.out[1] + 0.006, -0.009]]);
  }
  return { main: k, muzzles: [[0.395, b, 0]] };
}

// =======================================================================================
// Abgesägte Doppelflinte: a side-by-side 12-gauge cut down to a stub, on the right clamps.
// Blued barrels with a rib and dark bores, a colour-case hardened action with two hammer
// spurs and a top lever, a sawn-off walnut pistol-grip stub, a solenoid for a trigger. The
// barrels are their own part: they drop open on the hinge pin to reload.

function buildFlinte(F) {
  const k = new Kit({ part: PART.gun, mode: MODE.side });
  const ya = F.side.y,
    za = F.side.z;
  const R = 0.0068,
    dz = 0.0069;
  const pin = [0.1585, ya - 0.0094, za];
  // Barrels (a moving part, rigid; the code lifts it with the hump).
  const bk = new Kit({ part: PART.a });
  bk.paint(C.blued, ZONE.steel);
  const face = shade(C.steel, 1.1);
  for (const s of [-1, 1])
    bk.lathe(
      [
        [0.1268, R + 0.0002],
        [0.3, R],
        [0.3375, R],
        [0.34, R + 0.0005],
        [0.345, R + 0.0005],
        [0.345, 0.005],
        [0.337, 0.005],
        [0.337, 0],
      ],
      16,
      { centre: [ya, za + s * dz], band: (i) => (i < 4 ? C.blued : i === 4 ? face : C.bore) },
    );
  // The rib on top and the one below, the brass bead, the lumps and the walnut forend.
  bk.paint(shade(C.blued, 1.25), ZONE.steel);
  bk.box(0.13, 0.343, ya + 0.004, ya + 0.0074, za - 0.0027, za + 0.0027);
  bk.box(0.166, 0.343, ya - 0.0074, ya - 0.004, za - 0.0024, za + 0.0024);
  bk.paint(C.brass, ZONE.brass);
  bk.sphere([0.3395, ya + 0.0083, za], 0.0012, { wide: 8, high: 5 });
  bk.paint(C.blued, ZONE.steel);
  bk.box(0.132, 0.157, ya - 0.0105, ya - 0.005, za - 0.005, za + 0.005);
  const wood = grain(C.walnut, 3);
  const fore = [];
  for (let i = 0; i <= 5; i++) {
    const x = 0.167 + i * 0.0094;
    const t = i === 0 || i === 5 ? 0.8 : 1;
    fore.push(rect(ya - 0.0126, ya - 0.0056, za - 0.0094 * t, za + 0.0094 * t, 0.0028).map(([y, z]) => [x, y, z]));
  }
  bk.zone = ZONE.wood;
  bk.loft(fore, { band: wood, capStart: true, capEnd: true, crease: 0.3 });
  bk.paint(C.blued, ZONE.steel);
  bk.box(0.2125, 0.2155, ya - 0.0123, ya - 0.0064, za - 0.003, za + 0.003);
  // The action: a standing breech the barrels close against, and the bar under them,
  // colour-case hardened; the fences, the hinge pin.
  mottledBox(k, 0.1162, 0.1268, ya - 0.0118, ya + 0.0084, za - 0.0142, za + 0.0142, 11);
  mottledBox(k, 0.1268, 0.1605, ya - 0.0118, ya - 0.0071, za - 0.0138, za + 0.0138, 12);
  k.paint(0x8a8f96, ZONE.steel);
  for (const s of [-1, 1]) k.sphere([0.1268, ya + 0.0016, za + s * 0.0118], 0.0042, { wide: 10, high: 6 });
  k.paint(C.steel, ZONE.steel);
  k.with(M(T(pin[0], pin[1], za), RY(Math.PI / 2)), () => k.cylinder(-0.0142, 0.0142, 0.0024, 0.0024, 10));
  // The top lever, and the two hammers with their chequered spurs.
  k.paint(C.blued, ZONE.steel);
  k.with(M(T(0.1262, ya + 0.0084, za), RY(-0.25)), () => k.bevelBox(-0.019, 0, 0, 0.0019, -0.0028, 0.0028, 0.0007));
  for (const s of [-1, 1])
    k.with(M(T(0.1195, ya + 0.003, za + s * 0.0074), RZ(0.55)), () => {
      k.paint(0x767b83, ZONE.steel);
      k.bevelBox(-0.0042, 0.0042, 0, 0.0105, -0.0019, 0.0019, 0.0008);
      k.paint(C.blued, ZONE.parker);
      k.box(-0.0058, -0.0014, 0.0096, 0.0121, -0.0022, 0.0022);
    });
  // The sawn-off pistol grip: walnut, angled 30 degrees down and back and a little out, a
  // chequered wrist flaring to the raw end where the stock was sawn off.
  const dir = vec.unit([-Math.cos(30 * DEG), -Math.sin(30 * DEG), 0.22]);
  const start = [0.1172, ya - 0.0016, za + 0.0032];
  const up = vec.unit(vec.cross(vec.cross(dir, [0, 1, 0]), dir));
  const side = vec.cross(dir, up);
  const rings = [
    [0, 0.0086, 0.0062],
    [0.006, 0.007, 0.0054],
    [0.015, 0.0067, 0.0052],
    [0.024, 0.0078, 0.0056],
    [0.032, 0.0094, 0.006],
    [0.038, 0.0099, 0.0061],
  ].map(([s, h, w]) => {
    const c = vec.add(start, vec.scale(dir, s));
    return circle(12, 1).map(([cy, cz]) => vec.add(c, vec.add(vec.scale(up, cy * h), vec.scale(side, cz * w))));
  });
  const walnut = grain(C.walnut, 5);
  k.zone = ZONE.wood;
  k.loft(rings, { band: (i) => (i === 1 || i === 2 ? 0x33200f : walnut()), capStart: false, capEnd: true, capRgb: C.rawWood, crease: 0.3 });
  // A bracket from the grip down into the rear clamp's jaws (the mount).
  k.part = PART.mount;
  k.paint(C.blued, ZONE.steel);
  k.box(0.097, 0.1035, ya - 0.0048, ya + 0.0008, za - 0.0022, za + 0.0062);
  k.part = PART.gun;
  // The solenoid where the trigger guard was.
  solenoid(k, 0.1255, 0.1425, ya - 0.0162, ya - 0.0116, za - 0.005, za + 0.005);
  fcbLead(k, F, [0.124, ya - 0.0139, za], [onSaddle(F, 0.108, -0.006), onSaddle(F, 0.112, 0.012), [0.118, ya - 0.019, za - 0.013]]);
  // The two spent hulls (red, brass heads) in the chambers: shown only while they fly out as
  // the action breaks open (an item the material hides otherwise).
  const hk = new Kit({ part: PART.b });
  hk.item(0, 1);
  for (const s of [-1, 1]) {
    hk.paint(0xb02a1e, ZONE.polymer);
    hk.cylinder(0.1305, 0.1485, 0.0052, 0.0052, 10, { centre: [ya, za + s * dz] });
    hk.paint(C.brass, ZONE.brass);
    hk.lathe(
      [
        [0.1266, 0.0061],
        [0.1278, 0.0061],
        [0.1278, 0.0054],
        [0.1305, 0.0054],
      ],
      10,
      { centre: [ya, za + s * dz], capEnd: false },
    );
  }
  return {
    main: k,
    parts: { barrels: { kit: bk, pivot: pin, axis: "z" }, hulls: { kit: hk, pivot: [0.127, ya, za] } },
    muzzles: [
      [0.3455, ya, za - dz],
      [0.3455, ya, za + dz],
    ],
  };
}

// =======================================================================================
// Revolver-Granatwerfer: a six-shot 40 mm launcher lying on its left side on the right
// clamps, so its fat cylinder bulges outboard. FDE polymer and black steel; a folded skeleton
// stock reaches back beside the dorsal fin. The cylinder turns 60 degrees per shot.

function buildGranate(F) {
  const k = new Kit({ part: PART.gun, mode: MODE.side });
  const ya = F.side.y,
    za = F.side.z;
  const cyl = [ya, za + 0.014];
  // Receiver over both clamps.
  k.paint(C.fde, ZONE.polymer);
  k.bevelBox(0.094, 0.1475, ya - 0.0095, ya + 0.0085, za - 0.0075, za + 0.0118, 0.0022);
  // A Picatinny strip on top, a recessed panel on the outboard face, the stock's hinge block
  // and a sling swivel.
  k.paint(C.polymer, ZONE.parker);
  k.box(0.1, 0.142, ya + 0.0085, ya + 0.0102, za - 0.0035, za + 0.0075);
  for (let t = 0; t < 5; t++) k.box(0.103 + t * 0.0082, 0.1068 + t * 0.0082, ya + 0.0102, ya + 0.0112, za - 0.0038, za + 0.0078);
  k.paint(shade(C.fde, 0.72), ZONE.polymer);
  k.box(0.102, 0.14, ya - 0.006, ya + 0.004, za + 0.0118, za + 0.0122);
  k.paint(C.parker, ZONE.parker);
  k.bevelBox(0.0935, 0.1005, ya - 0.0085, ya + 0.0075, za + 0.0015, za + 0.0105, 0.0015);
  k.with(M(T(0.097, ya, za + 0.006), RX(Math.PI / 2)), () => k.cylinder(-0.0092, 0.0092, 0.0016, 0.0016, 8));
  k.paint(C.steel, ZONE.steel);
  k.with(M(T(0.12, ya - 0.0095, za + 0.006), RZ(Math.PI / 2)), () => k.torus(0.0022, 0.0006, { major: 8, minor: 3, arc: Math.PI, start: -Math.PI / 2 }));
  // The rear frame plate behind the cylinder (tan: what the chase camera sees of it), the
  // frame straps round it, the front plate.
  k.paint(C.fde, ZONE.polymer);
  k.cylinder(0.1465, 0.1515, 0.0205, 0.0205, 16, { centre: cyl });
  k.paint(C.parker, ZONE.parker);
  k.box(0.1515, 0.2195, ya - 0.0045, ya + 0.0045, za - 0.0118, za - 0.0081);
  k.box(0.1515, 0.2195, cyl[0] - 0.004, cyl[0] + 0.004, cyl[1] + 0.0219, cyl[1] + 0.0252);
  // The spring housing in front of the cylinder: bands like the coils of its spring.
  k.lathe(
    [
      [0.2045, 0.011],
      [0.2075, 0.011],
      [0.2105, 0.0104],
      [0.2135, 0.011],
      [0.2165, 0.0104],
      [0.2195, 0.011],
    ],
    14,
    { centre: cyl, band: (i) => (i % 2 ? 0x3d3e3b : C.parker) },
  );
  k.bevelBox(0.2195, 0.225, ya - 0.012, ya + 0.012, za - 0.012, cyl[1] + 0.0135, 0.0045);
  // The rifled barrel with its crown and dark bore.
  k.lathe(
    [
      [0.225, 0.0096],
      [0.37, 0.0096],
      [0.3705, 0.0103],
      [0.3765, 0.0103],
      [0.3765, 0.0074],
      [0.366, 0.0074],
      [0.366, 0],
    ],
    16,
    { centre: [ya, za], band: (i) => (i < 3 ? C.parker : i === 3 ? C.gunmetal : C.bore) },
  );
  // The FDE handguard with four short rails.
  k.paint(C.fde, ZONE.polymer);
  k.prism(0.232, 0.3, ring2(8, 0.0132, ya, za, Math.PI / 8));
  k.paint(C.polymer, ZONE.polymer);
  for (let i = 0; i < 4; i++)
    k.with(aboutX((i * Math.PI) / 2, ya, za), () => {
      k.box(0.236, 0.296, ya + 0.0118, ya + 0.0136, za - 0.0024, za + 0.0024);
      for (let t = 0; t < 5; t++) k.box(0.24 + t * 0.0115, 0.2442 + t * 0.0115, ya + 0.0136, ya + 0.0145, za - 0.0026, za + 0.0026);
    });
  // The flip-up ladder sight, and a forward grip stub angled outboard.
  k.paint(C.polymer, ZONE.parker);
  k.box(0.262, 0.27, ya + 0.0145, ya + 0.0165, za - 0.004, za + 0.004);
  k.with(M(T(0.264, ya + 0.0162, za), RZ(-0.35)), () => {
    for (const s of [-1, 1]) k.box(-0.0008, 0.0008, 0, 0.0135, s * 0.0034 - 0.0006, s * 0.0034 + 0.0006);
    for (const h of [0.004, 0.0085, 0.0128]) k.box(-0.0007, 0.0007, h, h + 0.0011, -0.0034, 0.0034);
  });
  k.paint(C.fde, ZONE.polymer);
  const gdir = vec.unit([0.08, -0.55, 0.83]);
  const g0 = [0.272, ya - 0.004, za + 0.0105];
  k.tube([g0, vec.add(g0, vec.scale(gdir, 0.021))], 0.0046, 10, { band: (i) => C.fde });
  // The folded skeleton stock beside the dorsal fin, and its rubber butt plate.
  k.paint(C.parker, ZONE.parker);
  for (const s of [-1, 1])
    k.tube(
      [
        [0.0965, ya + s * 0.0055, za + 0.0055],
        [0.0045, ya + s * 0.0055, za + 0.008],
      ],
      0.0016,
      6,
    );
  k.paint(C.rubber, ZONE.rubber);
  k.bevelBox(0.0, 0.0048, ya - 0.0132, ya + 0.0132, za + 0.0028, za + 0.0132, 0.003);
  solenoid(k, 0.106, 0.1225, ya - 0.0142, ya - 0.0095, za - 0.0035, za + 0.0045);
  fcbLead(k, F, [0.1045, ya - 0.0122, za + 0.0005], [onSaddle(F, 0.104, -0.004), onSaddle(F, 0.1, 0.014), [0.101, ya - 0.018, za - 0.01]]);
  // The cylinder: fluted, six chambers on a circle of 0.014 round its axis, one of them on the
  // bore; dark chamber mouths with the gold noses of the loaded grenades in them.
  const ck = new Kit({ part: PART.a });
  ck.paint(0x2a2b2d, ZONE.parker);
  const section = [];
  for (let c = 0; c < 6; c++)
    for (let m = 0; m < 4; m++) {
      const psi = -Math.PI / 2 + c * (Math.PI / 3) + m * (Math.PI / 12);
      const rad = m === 2 ? 0.0184 : m === 0 ? 0.0215 : 0.0211;
      section.push([Math.cos(psi) * rad, Math.sin(psi) * rad]);
    }
  const ringAt = (x, f) => section.map(([y, z]) => [x, cyl[0] + y * f, cyl[1] + z * f]);
  ck.loft([ringAt(0.1518, 0.92), ringAt(0.1532, 1), ringAt(0.2028, 1), ringAt(0.2042, 0.92)], { capStart: true, capEnd: true, crease: 0.5 });
  for (let c = 0; c < 6; c++) {
    const psi = -Math.PI / 2 + c * (Math.PI / 3);
    const cy = cyl[0] + Math.cos(psi) * 0.014,
      cz = cyl[1] + Math.sin(psi) * 0.014;
    ck.paint(C.bore, ZONE.rubber);
    ck.cylinder(0.2036, 0.2044, 0.0072, 0.0072, 12, { centre: [cy, cz] });
    ck.paint(0xb89a3c, ZONE.brass);
    ck.lathe(
      [
        [0.2036, 0.0052],
        [0.2041, 0.0042],
        [0.2045, 0.0018],
        [0.2046, 0],
      ],
      10,
      { centre: [cy, cz] },
    );
    ck.paint(C.brass, ZONE.brass);
    ck.cylinder(0.1512, 0.152, 0.0068, 0.0068, 10, { centre: [cy, cz] });
  }
  return {
    main: k,
    // The cylinder turns about its axis; for the reload it swings 40 degrees outboard on its
    // crane (an axis along x below it).
    parts: { cylinder: { kit: ck, pivot: [0.178, cyl[0], cyl[1]], axis: "x", crane: [cyl[0] - 0.026, cyl[1] - 0.008] } },
    muzzles: [[0.3765, ya, za]],
  };
}

// =======================================================================================
// Katana, worn samurai-style on the left clamps, edge up, hilt forward: a black lacquered
// saya with a horn mouth and a steel end cap, a white sageo cord wrapped round both clamps,
// and a hydraulic draw arm with a gripper on the hilt. The sword is its own part (it is
// drawn and swept across in front of the snout), and so is the arm.

// The sword in its own frame: the tsuba's centre at the origin, the blade along +x with its
// edge toward +y, the grip along -x.
export const BLADE = 0.49;
function buildSword({ length: blade = BLADE, sori = 0.012, tsukaRgb = [C.ito, C.samegawa], guard = "round", grip = 0.135, width = 0.018 } = {}) {
  const k = new Kit({ part: PART.a });
  // The blade: seven faces round (edge, hamon, ji, shinogi-ji, mune), curved toward the edge.
  const steps = 9;
  const ringAt = (u) => {
    const x = 0.006 + u * (blade - 0.006);
    const bow = sori * 4 * u * (1 - u);
    const w = width - width * 0.25 * u,
      t = width * 0.233 - width * 0.09 * u;
    const wave = 0.07 * Math.sin(u * 37);
    const edge = [x, bow + w / 2, 0];
    const hamon = (s) => [x, bow + w / 2 - w * (0.3 + wave), s * t * 0.34];
    const shinogi = (s) => [x, bow - w / 2 + w * 0.32, s * t * 0.5];
    const mune = (s) => [x, bow - w / 2, s * t * 0.32];
    return [edge, hamon(1), shinogi(1), mune(1), mune(-1), shinogi(-1), hamon(-1)];
  };
  const faceRgb = [colour(0xe8eaec), colour(C.mirror), colour(0xa9aeb3), colour(0x9ea3a8), colour(0xa9aeb3), colour(C.mirror), colour(0xe8eaec)];
  const faceZone = [ZONE.steel, ZONE.polished, ZONE.polished, ZONE.polished, ZONE.polished, ZONE.polished, ZONE.steel];
  const rings = [];
  for (let i = 0; i <= steps; i++) rings.push(ringAt((i / steps) * 0.93));
  // The point (kissaki): everything runs into the tip, just off the back line.
  const tip = [blade, -0.0035, 0];
  rings.push(rings[0].map(() => tip));
  for (let i = 0; i < rings.length - 1; i++)
    for (let f = 0; f < 7; f++) {
      const f1 = (f + 1) % 7;
      const a = rings[i][f],
        b = rings[i][f1],
        c = rings[i + 1][f1],
        d = rings[i + 1][f];
      let nrm = vec.unit(vec.cross(vec.sub(c, a), vec.sub(d, b)));
      const mid = vec.scale(vec.add(vec.add(a, b), vec.add(c, d)), 0.25);
      const axis = [mid[0], (rings[i][0][1] + rings[i][3][1]) / 2, 0];
      if (vec.dot(nrm, vec.sub(mid, axis)) < 0) nrm = vec.scale(nrm, -1);
      k.zone = faceZone[f];
      const ids = [a, b, c, d].map((p) => k.vertex(p, nrm, faceRgb[f]));
      k.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  // The habaki (brass collar), the seppa and the tsuba.
  k.paint(C.brass, ZONE.brass);
  k.bevelBox(0.0006, 0.011, -0.0102, 0.0102, -0.0032, 0.0032, 0.0012);
  k.cylinder(0.0, 0.0006, 0.0088, 0.0088, 12, { ry: 1.25 });
  k.cylinder(-0.0036, -0.003, 0.0088, 0.0088, 12, { ry: 1.25 });
  k.paint(0x2a2826, ZONE.steel);
  if (guard === "round") k.lathe([[-0.003, 0.0138], [-0.0022, 0.0142], [-0.0008, 0.0142], [0, 0.0138]], 18, { crease: 0.3 });
  else {
    // A big square iron guard with cut corners.
    k.prism(-0.0042, 0, [
      [-0.015, -0.0105],
      [-0.0105, -0.015],
      [0.0105, -0.015],
      [0.015, -0.0105],
      [0.015, 0.0105],
      [0.0105, 0.015],
      [-0.0105, 0.015],
      [-0.015, 0.0105],
    ]);
  }
  // The grip: fuchi, the diamond wrap (black silk over white ray skin), the kashira.
  const L = grip;
  k.paint(0x2a2622, ZONE.steel);
  k.cylinder(-0.0086, -0.0036, 0.0064, 0.0066, 10, { ry: 1.32 });
  const seg = Math.round(L / 0.0125);
  const x0 = -0.0086,
    x1 = -(L - 0.006);
  // An 8-sided oval: vertex 0 on top, 2 on the right flank, 4 below, 6 on the left flank. On
  // each flank a row of white ray-skin diamonds shows between the crossings of the black silk.
  const HY = 0.0063,
    HZ = 0.0047;
  const swell = (x) => 1 + 0.06 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI);
  const oval = (x) => {
    const f = swell(x);
    return [0, 1, 2, 3, 4, 5, 6, 7].map((j) => [x, Math.cos((j * Math.PI) / 4) * HY * f, Math.sin((j * Math.PI) / 4) * HZ * f]);
  };
  const nrm = (p) => vec.unit([0, p[1] / HY, p[2] / HZ]);
  const [ito, same] = tsukaRgb.map(colour);
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  k.zone = ZONE.fabric;
  const put = (pts, rgb) => {
    const ids = pts.map((p) => k.vertex(p, nrm(p), rgb));
    if (ids.length === 3) k.tri(ids[0], ids[1], ids[2]);
    else k.quad(ids[0], ids[1], ids[2], ids[3]);
  };
  for (let i = 0; i < seg; i++) {
    const xa = x0 + ((x1 - x0) * i) / seg,
      xb = x0 + ((x1 - x0) * (i + 1)) / seg;
    const ra = oval(xa),
      rb = oval(xb),
      rm = oval((xa + xb) / 2);
    for (let j = 0; j < 8; j++) {
      const j1 = (j + 1) % 8;
      const flank = j1 === 2 || j1 === 6 ? j1 : j === 2 || j === 6 ? j : -1;
      if (flank < 0) {
        put([ra[j], ra[j1], rb[j1], rb[j]], ito);
        continue;
      }
      const other = flank === j ? j1 : j;
      const tipPoint = lerp(rm[flank], rm[other], 0.8);
      put([ra[flank], tipPoint, rb[flank]], same);
      put([ra[other], ra[flank], tipPoint], ito);
      put([rb[flank], rb[other], tipPoint], ito);
      put([rb[other], ra[other], tipPoint], ito);
    }
  }
  k.paint(0x1c1a18, ZONE.steel);
  k.lathe(
    [
      [x1, 0.0066],
      [x1 - 0.005, 0.0064],
      [x1 - 0.0065, 0.0045],
      [x1 - 0.0066, 0],
    ],
    10,
    { ry: 1.32 },
  );
  return { kit: k, tip: [blade, -0.0035, 0], grip: [-L * 0.45, 0, 0] };
}

// The saya's centre line: from its mouth just behind the tsuba back along the pitched,
// curved axis (the same curve as the blade inside, bulging toward the edge, up).
function sayaAxis(F, s, { pitch = 5 * DEG, sori = 0.012, x0 = 0.2325, blade = BLADE, lift = 0.006 } = {}) {
  const y0 = F.clamp.y + lift;
  const u = s / blade;
  return [x0 - s * Math.cos(pitch), y0 + s * Math.sin(pitch) + sori * 4 * u * (1 - u), -F.side.z];
}

// A sword on the left clamps: the saya along its pitched, curved axis with its fittings, the
// sageo cord round the clamps, the sword itself (a part: it is drawn) and the arm that draws
// it (a part, reaching from its pivot to the grip).
function buildBlade(F, spec) {
  const { length, saya: Ls, sayaR, arm = "draw", fittings = 0x8a8d90, cord = C.white } = spec;
  // Everything but the sword and its arm is bolted to the clamps (the mount).
  const k = new Kit({ part: PART.mount, mode: MODE.side });
  const za = F.side.z,
    Cc = F.clamp;
  const axis = (s) => sayaAxis(F, s, { blade: length });
  // The saya: a lacquered oval along its curve, horn mouth, a kurigata knob, iron bands on a
  // long one, a steel end cap.
  const ss = [0, 0.0055, 0.006];
  for (let s = 0.05; s < Ls - 0.02; s += 0.055) ss.push(s);
  ss.push(Ls - 0.016, Ls - 0.0155, Ls);
  const bands = spec.bands ?? [];
  const rings = ss.map((s) => {
    const p = axis(s);
    const q = axis(Math.min(Ls, s + 0.004)),
      o = axis(Math.max(0, s - 0.004));
    const t = vec.unit(vec.sub(o, q));
    const up = vec.unit(vec.sub([0, 1, 0], vec.scale(t, t[1])));
    const side = vec.cross(t, up);
    const f = (s < 0.006 ? 1.06 : 1) * (1 - 0.1 * (s / Ls));
    return circle(10, sayaR[0] * f, 0, sayaR[1] * f).map(([cy, cz]) => vec.add(p, vec.add(vec.scale(up, cy), vec.scale(side, cz))));
  });
  k.zone = ZONE.lacquer;
  const last = rings.length - 2;
  k.loft(rings, {
    band: (i) => (i === 0 ? C.horn : i === 1 ? 0x3a302a : i >= last - 1 ? fittings : C.lacquer),
    capStart: true,
    capEnd: true,
    crease: 0.4,
  });
  for (const s0 of bands) {
    const p = axis(s0);
    k.paint(0x3a3835, ZONE.steel);
    k.with(frame(p, vec.sub(axis(s0 + 0.004), p), [0, 1, 0]), () => k.cylinder(-0.003, 0.003, sayaR[0] * 1.08, sayaR[0] * 1.08, 10, { ry: sayaR[1] / sayaR[0] }));
  }
  k.paint(C.horn, ZONE.lacquer);
  const kp = axis(0.042);
  k.bevelBox(kp[0] - 0.004, kp[0] + 0.004, kp[1] - 0.004, kp[1] + 0.0005, kp[2] - sayaR[0] - 0.002, kp[2] - sayaR[0] + 0.001, 0.001);
  // The sageo: a cord from the kurigata, wrapped twice round the saya and each left clamp.
  k.paint(cord, ZONE.fabric);
  const wrapAt = (xc) => {
    const s = (0.2325 - xc) / Math.cos(5 * DEG);
    const p = axis(s);
    const topY = p[1] + sayaR[1] + 0.0004,
      botY = Cc.y - 0.0058;
    const cy = (topY + botY) / 2,
      hy = (topY - botY) / 2;
    const path = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 4;
      path.push([xc - 0.0028 + (i / 20) * 0.0056, cy + Math.cos(a) * hy, p[2] + Math.sin(a) * (sayaR[0] + 0.0018)]);
    }
    return path;
  };
  for (const xc of [0.1, 0.145]) k.tube(wrapAt(xc), 0.00085, 4);
  const knot = vec.add(kp, [0, -0.002, -sayaR[0] - 0.001]);
  k.sphere(knot, 0.0019, { wide: 8, high: 5 });
  k.tube(curve([knot, vec.add(knot, [-0.018, -0.006, -0.002]), [0.155, Cc.y + 0.001, -za - sayaR[0] - 0.0027], [0.1485, Cc.y - 0.002, -za - sayaR[0] - 0.0018]], 10), 0.00085, 5);
  k.tube(curve([knot, vec.add(knot, [0.004, -0.01, -0.001]), vec.add(knot, [0.001, -0.017, 0.0])], 6), 0.0008, 5);
  // The sword and where it rests.
  const sword = buildSword(spec);
  const sheath = sheathedSword(F);
  const gripWorld = new THREE.Vector3(...sword.grip).applyMatrix4(sheath);
  // The arm: a hydraulic draw arm on the front left clamp (katana), or a mast on a slewing
  // ring on the rail that raises the blade above the back and whirls it (nodachi). Built
  // along +x from its pivot; the code turns it toward the grip and stretches it.
  let pivot, target;
  const ak = new Kit({ part: PART.b });
  if (arm === "draw") {
    pivot = [0.145, Cc.y - 0.0005, -za - 0.0062];
    target = [gripWorld.x, gripWorld.y - 0.0062, gripWorld.z - 0.0048];
  } else {
    pivot = [0.12, F.railTop + 0.0068, 0];
    target = [gripWorld.x, gripWorld.y + 0.0072, gripWorld.z + 0.004];
    // The slewing ring on the rail, with its bolt circle.
    k.mode = MODE.rail;
    k.paint(C.gunmetal, ZONE.steel);
    k.with(M(T(0.12, F.railTop, 0), RZ(Math.PI / 2)), () => {
      k.lathe(
        [
          [0, 0.0235],
          [0.0045, 0.024],
          [0.0045, 0.018],
          [0.0062, 0.017],
          [0.0062, 0.0],
        ],
        16,
        { crease: 0.5 },
      );
      k.paint(C.steel, ZONE.steel);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.cylinder(0.0045, 0.0055, 0.0014, 0.0014, 6, { centre: [Math.cos(a) * 0.021, Math.sin(a) * 0.021], capStart: false });
      }
    });
    k.mode = MODE.side;
  }
  const length0 = Math.hypot(...vec.sub(target, pivot));
  if (arm === "draw") {
    ak.paint(C.steel, ZONE.steel);
    ak.bevelBox(-0.004, 0.004, -0.0035, 0.0035, -0.003, 0.003, 0.001);
    ak.paint(C.anodised, ZONE.alu);
    ak.lathe(
      [
        [0.003, 0.0034],
        [0.005, 0.0041],
        [length0 * 0.6, 0.0041],
        [length0 * 0.6 + 0.002, 0.0032],
      ],
      10,
    );
    ak.paint(C.brightSteel, ZONE.polished);
    ak.cylinder(length0 * 0.6, length0 - 0.004, 0.0017, 0.0017, 8);
  } else {
    ak.paint(C.gunmetal, ZONE.steel);
    ak.bevelBox(-0.006, 0.008, -0.004, 0.004, -0.006, 0.006, 0.0015);
    ak.paint(C.oliveDrab, ZONE.paint);
    ak.bevelBox(0.004, length0 - 0.004, -0.0035, 0.0035, -0.006, 0.006, 0.0014);
    ak.paint(C.anodised, ZONE.alu);
    ak.cylinder(0.01, length0 * 0.62, 0.0036, 0.0036, 10, { centre: [0.0065, 0] });
    ak.paint(C.brightSteel, ZONE.polished);
    ak.cylinder(length0 * 0.62, length0 * 0.9, 0.0016, 0.0016, 8, { centre: [0.0065, 0] });
  }
  ak.paint(C.gunmetal, ZONE.steel);
  ak.bevelBox(length0 - 0.0045, length0 + 0.0015, -0.003, 0.003, -0.0032, 0.0032, 0.0009);
  for (const s of [-1, 1]) ak.with(M(T(length0, 0.0025, s * 0.0028), RZ(0.5)), () => ak.bevelBox(0, 0.0015, 0, 0.008, -0.0011, 0.0011, 0.0004));
  const armFrame = frame(pivot, vec.sub(target, pivot), [0, 1, 0]);
  return {
    main: k,
    parts: {
      sword: { kit: sword.kit, matrix: sheath, tip: sword.tip, grip: sword.grip, blade: length },
      arm: { kit: ak, matrix: armFrame, pivot, length: length0, offset: vec.sub(target, [gripWorld.x, gripWorld.y, gripWorld.z]), anchor: arm === "draw" ? "side" : "rail" },
    },
    muzzles: [[0, 0, 0]],
  };
}

const buildKatana = (F) => buildBlade(F, { length: 0.49, saya: 0.535, sayaR: [0.0048, 0.0108], grip: 0.135, guard: "round", width: 0.018 });

// Where the sword sits when sheathed: its tsuba at the saya's mouth, the blade pointing back
// into the saya, pitched up 5 degrees toward the rear, edge up.
export function sheathedSword(F, { lift = 0.006, x = 0.235 } = {}) {
  const y0 = F.clamp.y + lift;
  return M(T(x, y0 - 0.0002, -F.side.z), RZ(-5 * DEG), RY(Math.PI));
}

// =======================================================================================
// Flammenwerfer: a backpack and a lance. Two olive fuel cylinders with red valve wheels lie
// side by side on the saddle, a pressure bottle between them on top, strapped down with two
// webbing cradle straps; a braided hose runs from the valves round to the steel lance on the
// right clamps, with its perforated heat shield, nozzle, igniter and a small blue pilot
// flame that burns whenever the weapon is carried.

function buildFlammen(F) {
  // (The pack and the lance shake as one while the jet roars; the rail bracket's foot stays.)
  const k = new Kit({ part: PART.gun, mode: MODE.rail });
  const r = F.railTop;
  const yt = r + 0.001;
  const white = colour(0xd8d6c8);
  // The fuel tanks (domed both ends, a white stencil band) with valves and red wheels.
  for (const s of [-1, 1]) {
    const zc = s * 0.018;
    k.paint(C.olive, ZONE.paint);
    k.lathe(
      [
        [0.087, 0],
        [0.089, 0.0072],
        [0.0935, 0.0115],
        [0.1, 0.013],
        [0.138, 0.013],
        [0.152, 0.013],
        [0.188, 0.013],
        [0.1945, 0.0115],
        [0.199, 0.0072],
        [0.201, 0],
      ],
      12,
      { centre: [yt, zc], band: (i) => (i === 4 ? white : C.olive), crease: 0.3 },
    );
    // A second white stencil band toward the rear.
    k.paint(white, ZONE.paint);
    k.cylinder(0.106, 0.112, 0.01315, 0.01315, 12, { centre: [yt, zc], capStart: false, capEnd: false });
    k.paint(C.steel, ZONE.steel);
    k.cylinder(0.2, 0.2075, 0.0026, 0.0026, 8, { centre: [yt, zc] });
    k.cylinder(0.2045, 0.208, 0.0034, 0.0034, 8, { centre: [yt, zc] });
    k.paint(C.red, ZONE.paint);
    k.with(T(0.2095, yt, zc), () => {
      k.torus(0.0042, 0.00085, { major: 10, minor: 4 });
      for (let i = 0; i < 3; i++) k.with(RX((i * Math.PI * 2) / 3), () => k.box(-0.0006, 0.0006, 0, 0.0042, -0.0006, 0.0006));
    });
  }
  // The pressure bottle in the groove on top.
  const yb = r + 0.0152;
  k.paint(shade(C.olive, 0.8), ZONE.paint);
  k.lathe(
    [
      [0.094, 0],
      [0.095, 0.004],
      [0.098, 0.0072],
      [0.102, 0.008],
      [0.158, 0.008],
      [0.162, 0.0072],
      [0.165, 0.004],
      [0.166, 0],
    ],
    12,
    { centre: [yb, 0], crease: 0.3 },
  );
  k.paint(C.steel, ZONE.steel);
  k.cylinder(0.1655, 0.172, 0.0022, 0.0022, 8, { centre: [yb, 0] });
  k.paint(C.red, ZONE.paint);
  k.with(T(0.1725, yb, 0), () => k.torus(0.003, 0.0007, { major: 10, minor: 4 }));
  // The cross bracket on the rail at x 0.12: a clamp foot and steel bands round both tanks.
  k.part = PART.mount;
  k.paint(C.anodised, ZONE.alu);
  k.bevelBox(0.114, 0.126, r, r + 0.0022, -0.0062, 0.0062, 0.0006);
  k.box(0.114, 0.126, r - 0.003, r, -0.0063, -0.0045);
  k.box(0.114, 0.126, r - 0.003, r, 0.0045, 0.0063);
  k.part = PART.gun;
  k.paint(PALETTE.darkSteel, ZONE.steel);
  for (const s of [-1, 1]) k.with(T(0.12, yt, s * 0.018), () => k.torus(0.0134, 0.0012, { major: 14, minor: 3 }));
  // Two webbing cradle straps round the whole pack, in the harness colour.
  const hullPts = [];
  for (const [cy, cz, rr] of [
    [yt, -0.018, 0.0138],
    [yt, 0.018, 0.0138],
    [yb, 0, 0.0088],
  ])
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      hullPts.push([cz + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  const hull = hull2(hullPts);
  for (const xs of [0.101, 0.181]) {
    // (Team fabric: the player's webbing colour.)
    k.team = 1;
    k.paint([1, 1, 1], ZONE.fabric);
    const ringA = hull.map(([z, y]) => [xs - 0.003, y, z]),
      ringB = hull.map(([z, y]) => [xs + 0.003, y, z]);
    k.loft([ringA, ringB], { crease: 0.95 });
    k.team = 0;
    k.paint(C.polymer, ZONE.polymer);
    const top = hull.reduce((a, p) => (p[1] > a[1] ? p : a));
    k.box(xs - 0.0036, xs + 0.0036, top[1] - 0.0005, top[1] + 0.0022, top[0] - 0.0045, top[0] + 0.0045);
  }
  // The manifold joining both valves, and the braided hose round to the lance.
  const ya = F.side.y,
    za = F.side.z;
  k.paint(C.steel, ZONE.steel);
  k.box(0.2085, 0.2135, yt - 0.0028, yt + 0.0028, -0.0205, 0.0205);
  k.mode = MODE.follow;
  const hose = curve(
    [
      [0.2135, yt, 0.012],
      [0.224, yt - 0.001, 0.02],
      [0.229, (yt + ya) / 2, za - 0.004],
      [0.215, ya + 0.0065, za + 0.0015],
      [0.185, ya + 0.0072, za + 0.0035],
      [0.155, ya + 0.0068, za + 0.0026],
      [0.139, ya + 0.004, za + 0.0012],
    ],
    16,
  );
  k.tube(hose, 0.0034, 6, { band: (i) => (i % 2 ? 0x8d9296 : 0x4f5357) });
  // The lance on the right clamps.
  k.mode = MODE.side;
  k.paint(C.steel, ZONE.steel);
  k.lathe(
    [
      [0.098, 0.0045],
      [0.1, 0.006],
      [0.325, 0.006],
    ],
    12,
    { centre: [ya, za] },
  );
  k.paint(C.gunmetal, ZONE.steel);
  k.bevelBox(0.12, 0.141, ya - 0.0062, ya + 0.0062, za - 0.0062, za + 0.0062, 0.0014);
  k.paint(C.red, ZONE.paint);
  k.with(M(T(0.131, ya + 0.0062, za), RZ(0.3)), () => k.bevelBox(-0.0015, 0.0015, 0, 0.009, -0.0012, 0.0012, 0.0004));
  // The perforated heat shield: a sleeve whose every panel shows a dark hole.
  const shield = [];
  for (let i = 0; i <= 4; i++) shield.push(ring2(10, 0.009, ya, za).map(([y, z]) => [0.25 + (i / 4) * 0.07, y, z]));
  const hole = colour(0x0c0c0c),
    metal = colour(0x8a8e92);
  k.zone = ZONE.steel;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 10; j++) {
      const j1 = (j + 1) % 10;
      const corners = [shield[i][j], shield[i][j1], shield[i + 1][j1], shield[i + 1][j]];
      const normals = corners.map((p) => vec.unit([0, p[1] - ya, p[2] - za]));
      k.diamond(corners, normals, (i + j) % 2 ? metal : hole, metal);
    }
  k.paint(0x8a8e92, ZONE.steel);
  k.lathe(
    [
      [0.2485, 0.0062],
      [0.25, 0.0094],
      [0.2512, 0.0094],
    ],
    10,
    { centre: [ya, za], capStart: false },
  );
  k.lathe(
    [
      [0.3188, 0.0094],
      [0.32, 0.0094],
      [0.3215, 0.0062],
    ],
    10,
    { centre: [ya, za], capEnd: false },
  );
  // Nozzle, igniter, pilot flame.
  k.paint(C.brass, ZONE.brass);
  k.lathe(
    [
      [0.325, 0.0062],
      [0.3285, 0.0058],
      [0.335, 0.0068],
      [0.336, 0.0068],
      [0.336, 0.0042],
      [0.331, 0.0036],
      [0.331, 0],
    ],
    12,
    { centre: [ya, za], band: (i) => (i < 3 ? C.brass : C.bore) },
  );
  k.paint(C.polymer, ZONE.polymer);
  k.bevelBox(0.316, 0.329, ya - 0.0112, ya - 0.0064, za - 0.0026, za + 0.0026, 0.0008);
  k.paint(C.steel, ZONE.steel);
  k.tube(
    [
      [0.329, ya - 0.009, za],
      [0.3365, ya - 0.0082, za],
      [0.338, ya - 0.0064, za],
    ],
    0.0005,
    4,
  );
  k.paint([0.25, 0.55, 1.8], ZONE.light);
  k.lathe(
    [
      [0.3378, 0.0012],
      [0.3395, 0.0019],
      [0.342, 0.0012],
      [0.3445, 0],
    ],
    8,
    { centre: [ya - 0.0062, za] },
  );
  solenoid(k, 0.101, 0.117, ya - 0.0118, ya - 0.0068, za - 0.0035, za + 0.0035);
  fcbLead(k, F, [0.0995, ya - 0.0093, za], [onSaddle(F, 0.098, -0.004), onSaddle(F, 0.098, 0.016), [0.098, ya - 0.016, za - 0.012]]);
  return { main: k, muzzles: [[0.336, ya, za]] };
}


// =======================================================================================
// Shared pieces for belly weapons: the cradle's clamp bands, which wrap the weapon and hang
// it from the keel rail, and screw-jack sway braces for the heavy ones.

// A steel band 0.004 wide at x round the convex outline of the weapon's section (points in
// (z, y)) and up round the keel rail.
function bellyBand(k, F, x, outline) {
  const keel = F.keel;
  const pts = outline.concat([
    [-0.0055, keel.top + 0.0005],
    [0.0055, keel.top + 0.0005],
  ]);
  const out = hull2(pts);
  // Push the band 0.0008 out from the outline.
  const cz = out.reduce((a, p) => a + p[0], 0) / out.length,
    cy = out.reduce((a, p) => a + p[1], 0) / out.length;
  const grow = out.map(([z, y]) => {
    const d = Math.hypot(z - cz, y - cy) || 1;
    return [z + ((z - cz) / d) * 0.0008, y + ((y - cy) / d) * 0.0008];
  });
  k.paint(PALETTE.darkSteel, ZONE.parker);
  const a = grow.map(([z, y]) => [x - 0.002, y, z]),
    b = grow.map(([z, y]) => [x + 0.002, y, z]);
  k.loft([a, b], { crease: 0.9, capStart: false, capEnd: false });
  // The band's screw lug under the rail.
  k.paint(PALETTE.darkSteel, ZONE.steel);
  k.box(x - 0.0025, x + 0.0025, keel.bottom - 0.002, keel.bottom, -0.0035, 0.0035);
}
// Outline points of a circle in (z, y).
const disc = (cz, cy, r, n = 16) => circle(n, r).map(([a, b]) => [cz + b, cy + a]);

// A screw-jack sway brace from the keel rail's side down to a point on the weapon.
function swayBrace(k, F, x, to) {
  const from = [x, F.keel.top - 0.001, Math.sign(to[2]) * 0.0052];
  k.paint(PALETTE.steel, ZONE.steel);
  k.tube([from, to], 0.0015, 6);
  const mid = vec.scale(vec.add(from, to), 0.5);
  k.paint(PALETTE.darkSteel, ZONE.steel);
  k.tube([vec.add(mid, vec.scale(vec.sub(to, from), -0.12)), vec.add(mid, vec.scale(vec.sub(to, from), 0.12))], 0.0023, 6);
}

// =======================================================================================
// Minigun: six barrels round a hub on the right clamps, a rotor housing with its electric
// drive, and the ammo can on the left clamps as counterweight; the feed chute arcs over the
// saddle from the can to the feeder, the silhouette of the smolt run. The barrel cluster is
// its own part and spins.

function buildMinigun(F) {
  const k = new Kit({ part: PART.gun, mode: MODE.side });
  const ya = F.side.y,
    za = F.side.z;
  // The barrel cluster (spins about the axis; the barrels glow with the heat).
  const bk = new Kit({ part: PART.a });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cy = ya + Math.cos(a) * 0.009,
      cz = za + Math.sin(a) * 0.009;
    bk.zone = ZONE.glow;
    bk.lathe(
      [
        [0.17, 0.0036],
        [0.425, 0.0035],
        [0.431, 0.0035],
        [0.431, 0.0022],
        [0.426, 0.0022],
        [0.426, 0],
      ],
      8,
      { centre: [cy, cz], band: (j) => (j < 2 ? 0x3b3e43 : C.bore) },
    );
  }
  bk.paint(C.parker, ZONE.parker);
  bk.cylinder(0.168, 0.428, 0.0042, 0.0042, 10, { centre: [ya, za] });
  for (const [x0, x1] of [
    [0.296, 0.304],
    [0.414, 0.421],
  ])
    bk.lathe(
      [
        [x0, 0.012],
        [x0 + 0.0015, 0.0132],
        [x1 - 0.0015, 0.0132],
        [x1, 0.012],
      ],
      18,
      { centre: [ya, za], crease: 0.5 },
    );
  // The rotor housing, the drive motor on its outboard top, the delinking feeder.
  k.paint(C.parker, ZONE.parker);
  k.lathe(
    [
      [0.108, 0.013],
      [0.11, 0.016],
      [0.162, 0.016],
      [0.163, 0.0172],
      [0.169, 0.0172],
      [0.17, 0.0145],
    ],
    18,
    { centre: [ya, za], crease: 0.5 },
  );
  k.paint(C.oliveDrab, ZONE.paint);
  k.bevelBox(0.115, 0.146, ya + 0.0085, ya + 0.0245, za + 0.004, za + 0.02, 0.003);
  k.paint(shade(C.oliveDrab, 0.7), ZONE.paint);
  for (let i = 0; i < 5; i++) k.box(0.118 + i * 0.0058, 0.1205 + i * 0.0058, ya + 0.0245, ya + 0.0265, za + 0.006, za + 0.018);
  k.paint(C.polymer, ZONE.polymer);
  k.bevelBox(0.088, 0.111, ya - 0.011, ya + 0.013, za - 0.013, za + 0.011, 0.0025);
  solenoid(k, 0.093, 0.107, ya - 0.017, ya - 0.011, za - 0.004, za + 0.004);
  // The ammo can on the left clamps: OD green, a yellow band, a lid with a handle and latch.
  // It and the feed chute are the mount: they do not kick with the gun.
  k.part = PART.mount;
  const Cc = F.clamp,
    zl = -(Cc.z + 0.006);
  const y0 = Cc.y + 0.004;
  k.paint(C.olive, ZONE.paint);
  k.bevelBox(0.093, 0.153, y0, y0 + 0.041, zl - 0.0175, zl + 0.0175, 0.0025);
  k.paint(shade(C.olive, 0.8), ZONE.paint);
  k.bevelBox(0.0915, 0.1545, y0 + 0.041, y0 + 0.045, zl - 0.018, zl + 0.018, 0.0012);
  k.paint(C.yellow, ZONE.paint);
  k.box(0.093, 0.153, y0 + 0.028, y0 + 0.032, zl - 0.0178, zl + 0.0178);
  k.paint(C.steel, ZONE.steel);
  k.box(0.113, 0.133, y0 + 0.045, y0 + 0.0465, zl - 0.0025, zl + 0.0025);
  k.box(0.1445, 0.1485, y0 + 0.03, y0 + 0.0455, zl - 0.0182, zl - 0.0175);
  // The feed chute: hinged links on a curve from the can's inboard top, over the rail, down
  // to the feeder.
  const chute = curve(
    [
      [0.116, y0 + 0.043, zl + 0.012],
      [0.117, F.railTop + 0.026, -0.02],
      [0.115, F.railTop + 0.03, 0.0],
      [0.111, F.railTop + 0.024, 0.02],
      [0.104, ya + 0.022, za - 0.01],
      [0.1, ya + 0.014, za - 0.004],
    ],
    60,
  );
  const lengths = [0];
  for (let i = 1; i < chute.length; i++) lengths.push(lengths[i - 1] + Math.hypot(...vec.sub(chute[i], chute[i - 1])));
  const total = lengths[lengths.length - 1];
  const links = 9;
  for (let n = 0; n < links; n++) {
    const d = ((n + 0.5) / links) * total;
    let i = 1;
    while (i < chute.length - 1 && lengths[i] < d) i++;
    const p = chute[i],
      t = vec.unit(vec.sub(chute[i], chute[i - 1]));
    const along = (total / links) * 0.44;
    k.with(frame(p, t, [0, 1, 0]), () => {
      k.paint(0x2a2b2a, ZONE.parker);
      k.bevelBox(-along, along, -0.0032, 0.0032, -0.0075, 0.0075, 0.0009);
      k.paint(C.brightSteel, ZONE.steel);
      k.box(along - 0.0008, along + 0.0008, -0.0034, 0.0034, -0.0078, 0.0078);
      // The belt shows through the slot on top: brass cases, a copper tip every fourth.
      k.paint(n % 2 ? C.brass : 0xd8b050, ZONE.brass);
      k.box(-along * 0.8, along * 0.8, 0.0032, 0.0041, -0.0048, 0.0048);
    });
  }
  // The belt coming out of the can: a row of brass rounds with copper tips.
  for (let i = 0; i < 5; i++) {
    const x = 0.104 + i * 0.0048;
    k.paint(C.brass, ZONE.brass);
    k.with(M(T(x, y0 + 0.0469, zl + 0.004), RY(-Math.PI / 2)), () => k.cylinder(-0.009, 0.004, 0.0019, 0.0019, 6));
    k.paint(C.copper, ZONE.brass);
    k.with(M(T(x, y0 + 0.0469, zl + 0.004), RY(-Math.PI / 2)), () => k.cylinder(0.004, 0.0072, 0.0019, 0.0006, 6));
  }
  k.part = PART.gun;
  fcbLead(k, F, [0.093, ya - 0.014, za], [onSaddle(F, 0.098, -0.004), onSaddle(F, 0.096, 0.016), [0.095, ya - 0.02, za - 0.012]]);
  return {
    main: k,
    parts: { barrels: { kit: bk, pivot: [0, ya, za], axis: "x" } },
    muzzles: [[0.431, ya + 0.009, za]],
  };
}

// =======================================================================================
// Twin rocket pods: two seven-tube pods, one on each side, banded into both clamps. The red
// warhead tips in the tube mouths go one by one as the rockets leave (a part whose draw range
// shrinks), and come back one by one as the tubes are refilled.

const POD_TUBES = [
  [0, 0],
  ...[0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i * Math.PI) / 3 + Math.PI / 6) * 0.0125, Math.sin((i * Math.PI) / 3 + Math.PI / 6) * 0.0125]),
];
function buildRaketen(F) {
  const k = new Kit({ part: PART.gun, mode: MODE.side });
  const ya = F.side.y,
    za = F.side.z;
  const order = [];
  for (let t = 0; t < 7; t++) for (const s of [-1, 1]) order.push([s, t]);
  for (const s of [-1, 1]) {
    const zc = s * za;
    k.paint(C.oliveDrab, ZONE.paint);
    k.lathe(
      [
        [0.03, 0.0],
        [0.031, 0.009],
        [0.034, 0.0155],
        [0.039, 0.019],
        [0.045, 0.02],
        [0.187, 0.02],
        [0.187, 0.02005],
        [0.194, 0.02005],
        [0.194, 0.02],
        [0.226, 0.02],
        [0.2265, 0.0206],
        [0.2305, 0.0206],
        [0.2305, 0.0192],
      ],
      16,
      { centre: [ya, zc], band: (i) => (i === 5 || i === 6 || i === 7 ? C.yellow : i >= 9 ? C.gunmetal : C.oliveDrab), crease: 0.4 },
    );
    for (const [ty, tz] of POD_TUBES) {
      k.paint(C.bore, ZONE.rubber);
      k.disc(0.2307, 0.0048, { centre: [ya + ty, zc + tz], sides: 8 });
    }
    // The rear: a yellow band and a bright aluminium cap ring (what the chase camera sees).
    k.paint(C.yellow, ZONE.paint);
    k.cylinder(0.053, 0.059, 0.02008, 0.02008, 16, { centre: [ya, zc], capStart: false, capEnd: false });
    k.paint(C.bareAlu, ZONE.steel);
    k.cylinder(0.0445, 0.0475, 0.0204, 0.0204, 16, { centre: [ya, zc], capStart: false, capEnd: false });
    // Two steel bands with lugs down into the clamps (the mount: the pods kick inside them).
    k.part = PART.mount;
    for (const xb of [0.1, 0.145]) {
      k.paint(PALETTE.darkSteel, ZONE.steel);
      k.cylinder(xb - 0.0022, xb + 0.0022, 0.0212, 0.0212, 16, { centre: [ya, zc], capStart: false, capEnd: false });
      k.box(xb - 0.003, xb + 0.003, F.clamp.y + 0.002, ya - 0.018, zc - 0.003, zc + 0.003);
    }
    k.part = PART.gun;
  }
  // The warhead tips, one item per tube in firing order (the material hides fired ones).
  const tk = new Kit({ part: PART.gun, mode: MODE.side });
  for (let n = 0; n < order.length; n++) {
    const [s, t] = order[n];
    const [ty, tz] = POD_TUBES[t];
    tk.item(n, order.length);
    tk.paint(C.red, ZONE.paint);
    tk.lathe(
      [
        [0.2285, 0.0044],
        [0.2328, 0.0034],
        [0.2346, 0],
      ],
      7,
      { centre: [ya + ty, s * za + tz] },
    );
  }
  const muzzles = order.map(([s, t]) => [0.234, ya + POD_TUBES[t][0], s * za + POD_TUBES[t][1]]);
  fcbLead(k, F, [0.1, F.clamp.y - 0.002, -za], [[0.101, F.fcb ? F.fcb.out[1] - 0.004 : 0, -0.03]]);
  return { main: k, parts: { tips: { kit: tk } }, ammo: { count: order.length, kind: "rack" }, muzzles };
}

// =======================================================================================
// Belly torpedoes: steel launch tubes under the belly, dark naval grey with a white stencil
// band, flanged mouths, breech caps with little handwheels; two tubes on the smolt, a rack of
// 2 x 2 from the postsmolt on. A loaded tube stands with its muzzle door folded down and the
// torpedo's nose (red warhead ring) showing; an empty one has its door shut until it is
// reloaded. The noses are items; the doors are the moving parts, hinged on the outboard side
// of each mouth (the left tubes' doors share one hinge line, the right ones' another).

const TORPEDO_GREY = 0x3a4148;
function buildTorpedo(F, four = false) {
  const k = new Kit({ part: PART.mount, mode: MODE.rigid });
  const tubes = four
    ? [
        [-0.0965, -0.011],
        [-0.0965, 0.011],
        [-0.116, -0.011],
        [-0.116, 0.011],
      ]
    : [
        [-0.099, -0.013],
        [-0.099, 0.013],
      ];
  const r = four ? 0.0095 : 0.0115;
  const lip = r + 0.0016;
  for (const [ty, tz] of tubes) {
    k.paint(TORPEDO_GREY, ZONE.paint);
    k.lathe(
      [
        [0.0, r * 0.7],
        [0.004, r * 0.95],
        [0.007, r],
        [0.192, r],
        [0.1925, lip],
        [0.2, lip],
        [0.2, r - 0.0014],
        [0.19, r - 0.0014],
        [0.19, 0],
      ],
      12,
      { centre: [ty, tz], band: (i) => (i < 2 ? shade(TORPEDO_GREY, 0.8) : i < 5 ? TORPEDO_GREY : C.bore), crease: 0.4 },
    );
    k.paint(C.red, ZONE.paint);
    k.with(M(T(-0.0015, ty, tz)), () => k.torus(0.0036, 0.0006, { major: 8, minor: 3 }));
    k.paint(C.steel, ZONE.steel);
    k.cylinder(-0.0015, 0.0004, 0.001, 0.001, 6, { centre: [ty, tz] });
    // Weld seams, and the white stencil band near the mouth.
    k.paint(shade(TORPEDO_GREY, 0.7), ZONE.paint);
    for (const x of [0.06, 0.125]) k.cylinder(x, x + 0.0015, r + 0.0004, r + 0.0004, 12, { centre: [ty, tz], capStart: false, capEnd: false });
    k.paint(0xdcdcd2, ZONE.paint);
    k.cylinder(0.168, 0.176, r + 0.0003, r + 0.0003, 12, { centre: [ty, tz], capStart: false, capEnd: false });
    // The door's hinge knuckle on the mouth's outboard side.
    k.paint(PALETTE.darkSteel, ZONE.steel);
    k.with(M(T(0.2012, ty, tz + Math.sign(tz) * (lip + 0.0006)), RZ(Math.PI / 2)), () => k.cylinder(-0.0045, 0.0045, 0.0011, 0.0011, 6));
  }
  // The cradle's bands round the tubes, and braces for the heavy rack.
  const outline = tubes.flatMap(([ty, tz]) => disc(tz, ty, r + 0.0003));
  for (const x of [0.09, 0.15]) bellyBand(k, F, x, outline);
  if (four) for (const s of [-1, 1]) swayBrace(k, F, 0.12, [0.12, -0.0875, s * 0.02]);
  // The noses of the loaded torpedoes (items, in launch order), standing out of the mouths:
  // an olive-drab warhead with a red ring and a yellow tip band.
  const nk = new Kit({ part: PART.mount });
  tubes.forEach(([ty, tz], n) => {
    nk.item(n, tubes.length);
    const rn = r - 0.0017;
    nk.lathe(
      [
        [0.188, rn],
        [0.2, rn],
        [0.2045, rn],
        [0.2075, rn * 0.93],
        [0.2105, rn * 0.78],
        [0.2135, rn * 0.5],
        [0.2152, 0],
      ],
      10,
      { centre: [ty, tz], band: (i) => (i === 1 ? C.red : i === 3 ? C.yellow : 0x4e5436), crease: 0.2 },
    );
  });
  // The muzzle doors: a lid for each mouth, built shut (the code swings them forward and
  // outboard, open, while a tube behind them is loaded).
  const doors = tubes.map(([, tz]) => (tz < 0 ? PART.a : PART.b));
  const dk = [new Kit({ part: PART.a }), new Kit({ part: PART.b })];
  tubes.forEach(([ty, tz], n) => {
    const d = dk[doors[n] - PART.a];
    d.paint(shade(TORPEDO_GREY, 1.08), ZONE.paint);
    d.lathe(
      [
        [0.2003, lip],
        [0.2028, lip],
        [0.2036, lip * 0.8],
        [0.2036, 0],
      ],
      12,
      { centre: [ty, tz], crease: 0.5 },
    );
    // A dog bar across it, and the hinge block on its outboard edge.
    const out = Math.sign(tz);
    d.paint(C.steel, ZONE.steel);
    d.box(0.2036, 0.2046, ty - 0.001, ty + 0.001, tz - lip * 0.6, tz + lip * 0.6);
    const [z0, z1] = span(tz + out * (lip - 0.002), tz + out * (lip + 0.0012));
    d.box(0.2003, 0.2031, ty - 0.0035, ty + 0.0035, z0, z1);
  });
  const hinge = (side) => [0.2012, 0, side * (lip + 0.0006 + Math.abs(tubes[0][1]))];
  const served = (part) => doors.map((d, n) => (d === part ? n : -1)).filter((n) => n >= 0);
  return {
    main: k,
    parts: {
      noses: { kit: nk },
      doorA: { kit: dk[0], pivot: hinge(-1), axis: "y", open: 100 * DEG, tubes: served(PART.a) },
      doorB: { kit: dk[1], pivot: hinge(1), axis: "y", open: -100 * DEG, tubes: served(PART.b) },
    },
    ammo: { count: tubes.length, kind: "tubes", reload: four ? 4.5 : 3.0 },
    muzzles: tubes.map(([ty, tz]) => [0.216, ty, tz]),
  };
}

// =======================================================================================
// Naval mines: a steel rail under the belly holds three horned contact mines in U-cups: fat
// black spheres with rust streaks and a red band, five long lead Hertz horns with bright
// caps, a lifting eye, and under each a short chain to a flat anchor plate. The rearmost
// rolls off on a drop and the others slide back (items, moving together as one part).

function buildMinen(F) {
  const k = new Kit({ part: PART.mount, mode: MODE.rigid });
  const R = 0.0155,
    horn = 0.011,
    rise = Math.sin(40 * DEG),
    out = Math.cos(40 * DEG);
  // The sphere's centre: its lifting eye and the horn tops just under the belly limit (-0.086).
  const yc = -0.086 - Math.max(rise * (R + horn), R + 0.003) - 0.0006;
  // The rail, hung from the cradle's bands.
  k.paint(PALETTE.steel, ZONE.parker);
  k.box(-0.006, 0.162, -0.0895, -0.0868, -0.006, 0.006);
  for (const x of [0.09, 0.15]) {
    k.paint(PALETTE.darkSteel, ZONE.steel);
    k.box(x - 0.002, x + 0.002, -0.0872, F.keel.bottom + 0.0002, -0.006, 0.006);
  }
  // The U-cups: two arms down from the rail, a ring round each mine's waist.
  const cups = [0.022, 0.07, 0.118];
  for (const x of cups) {
    k.paint(PALETTE.darkSteel, ZONE.parker);
    for (const s of [-1, 1]) {
      const [z0, z1] = span(s * (R + 0.0006), s * (R + 0.0024));
      k.box(x - 0.0035, x + 0.0035, yc - 0.002, -0.0888, z0, z1);
    }
    k.with(T(x, yc - 0.001, 0), () => k.with(RZ(Math.PI / 2), () => k.torus(R + 0.0014, 0.0011, { major: 16, minor: 4 })));
  }
  // The mines, in the order they are dropped: the rearmost first.
  const mk = new Kit({ part: PART.a });
  const rust = stream(21);
  cups.forEach((x, n) => {
    mk.item(n, cups.length);
    const from = mk.count;
    mk.paint(0x1c1d1e, ZONE.paint);
    mk.sphere([x, yc, 0], R, { wide: 12, high: 8 });
    mk.tint(from, ([px, py, pz], rgb) => {
      const nse = Math.sin(px * 900 + pz * 700) * Math.sin(py * 1200 + px * 300) + (rust() - 0.5) * 0.6;
      const streak = Math.max(0, nse) * Math.max(0, 1 - (py - yc + R) / (2 * R));
      if (Math.abs(py - yc) < 0.0011) return colour(0x6e1e16);
      return mixColour(rgb, 0x3e2616, Math.min(0.3, streak * 0.6));
    });
    // Five Hertz horns on the upper half, sticking well out (they must read from the side and
    // from below): pale lead, with bright glass-vial caps.
    for (let h = 0; h < 5; h++) {
      const a = (h / 5) * Math.PI * 2 + Math.PI / 10;
      const dir = vec.unit([Math.cos(a) * out, rise, Math.sin(a) * out]);
      const base = vec.add([x, yc, 0], vec.scale(dir, R - 0.001));
      const top = vec.add(base, vec.scale(dir, horn));
      mk.paint(0xa4a8ac, ZONE.steel);
      mk.tube([base, vec.add(base, vec.scale(dir, horn * 0.72))], 0.0024, 6, { capStart: false, capEnd: false });
      mk.paint(0xe2e6ea, ZONE.polished);
      mk.tube([vec.add(base, vec.scale(dir, horn * 0.72)), top], 0.002, 6, { capStart: false });
    }
    mk.paint(C.steel, ZONE.steel);
    mk.with(M(T(x, yc + R + 0.0006, 0), RY(Math.PI / 2)), () => mk.torus(0.0024, 0.0007, { major: 6, minor: 3, rz: 0.0024 }));
    // A short chain and the flat anchor plate below.
    mk.paint(0x3a3b3c, ZONE.steel);
    mk.tube(helix([x, yc - R + 0.0004, 0], [x, -0.1245, 0], 1.5, 0.0013, 5), 0.0006, 3, { capStart: false, capEnd: false });
    mk.paint(0x2a2b2c, ZONE.paint);
    mk.bevelBox(x - 0.0065, x + 0.0065, -0.1275, -0.1245, -0.0065, 0.0065, 0.0009);
  });
  mk.item(null);
  return {
    main: k,
    parts: { mines: { kit: mk, step: cups[1] - cups[0] } },
    ammo: { count: cups.length, kind: "drop" },
    muzzles: [[cups[0] - R, yc, 0]],
  };
}

// =======================================================================================
// Panzerbuechse .50: an anti-materiel rifle on the rail like a narwhal's tusk: matte black
// receiver with dark-earth panels, a fluted barrel, a giant double-chamber muzzle brake, a
// scope on two rings, a box magazine, folded bipod legs, a solenoid for a trigger group.

function buildPanzerbuechse(F) {
  const k = new Kit({ part: PART.mount, mode: MODE.rail });
  const r = F.railTop,
    b = r + 0.014;
  const earth = 0x5b4a36;
  // The rail mount stays; the rifle slides back on it with each shot.
  k.paint(C.anodised, ZONE.alu);
  k.bevelBox(0.1, 0.14, r, r + 0.0025, -0.0066, 0.0066, 0.0008);
  for (const s of [-1, 1]) k.box(0.1, 0.14, r - 0.0032, r, s > 0 ? 0.0045 : -0.0066, s > 0 ? 0.0066 : -0.0045);
  k.part = PART.gun;
  // Receiver, with its panels and the bolt handle on the right.
  k.paint(0x222326, ZONE.parker);
  k.bevelBox(0.085, 0.235, b - 0.012, b + 0.012, -0.008, 0.008, 0.0025);
  k.paint(earth, ZONE.polymer);
  for (const s of [-1, 1]) k.box(0.1, 0.19, b - 0.008, b + 0.004, s > 0 ? 0.0079 : -0.0083, s > 0 ? 0.0083 : -0.0079);
  k.paint(C.gunmetal, ZONE.steel);
  k.with(M(T(0.112, b + 0.006, 0.008), RY(-0.9)), () => {
    k.cylinder(0, 0.011, 0.0012, 0.0012, 6);
    k.sphere([0.012, 0, 0], 0.0026, { wide: 8, high: 6 });
  });
  // Fluted barrel: a star of twelve, bright where the flutes are cut.
  const flutes = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? 0.0056 : 0.0066;
    flutes.push([b + Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  k.paint(0x2c2e31, ZONE.parker);
  k.loft(
    [
      flutes.map(([y, z]) => [0.235, y, z]),
      flutes.map(([y, z]) => [0.56, y, z]),
    ],
    { crease: 0.2, capStart: true, capEnd: true },
  );
  // The muzzle brake: plates round two chambers, windows through both sides.
  k.paint(0x26282b, ZONE.parker);
  k.box(0.56, 0.605, b + 0.0045, b + 0.007, -0.007, 0.007);
  k.box(0.56, 0.605, b - 0.007, b - 0.0045, -0.007, 0.007);
  for (const [x0, x1] of [
    [0.56, 0.566],
    [0.5795, 0.5865],
    [0.599, 0.605],
  ])
    k.box(x0, x1, b - 0.0045, b + 0.0045, -0.007, 0.007);
  k.paint(C.bore, ZONE.rubber);
  k.box(0.566, 0.599, b - 0.0045, b + 0.0045, -0.0062, 0.0062);
  k.cylinder(0.6051, 0.6055, 0.0042, 0.0042, 10, { centre: [b, 0] });
  // A bright steel band where the brake is screwed on (the tusk's tip catches the light).
  k.paint(C.brightSteel, ZONE.polished);
  k.cylinder(0.552, 0.56, 0.0071, 0.0071, 16, { centre: [b, 0] });
  // Bipod legs folded along the barrel.
  k.paint(0x1c1d1f, ZONE.parker);
  k.bevelBox(0.25, 0.268, b - 0.009, b - 0.0045, -0.006, 0.006, 0.0012);
  for (const s of [-1, 1]) k.tube([[0.262, b - 0.0082, s * 0.0045], [0.41, b - 0.0082, s * 0.0045]], 0.0013, 6);
  // The magazine under the receiver's front.
  k.paint(0x1e1f21, ZONE.parker);
  k.bevelBox(0.205, 0.235, b - 0.032, b - 0.012, -0.0062, 0.0062, 0.0012);
  // The scope: tube, turrets, bells, rings, lenses.
  const ys = r + 0.035 - 0.011;
  k.paint(0x1a1b1d, ZONE.alu);
  k.lathe(
    [
      [0.12, 0.009],
      [0.125, 0.0105],
      [0.142, 0.0105],
      [0.148, 0.008],
      [0.222, 0.008],
      [0.232, 0.011],
      [0.25, 0.011],
    ],
    16,
    { centre: [ys, 0], crease: 0.5 },
  );
  k.cylinder(0.18, 0.192, 0.0055, 0.0055, 10, { centre: [ys + 0.0085, 0] });
  k.with(M(T(0.186, ys, 0.0085), RX(Math.PI / 2)), () => k.cylinder(-0.006, 0.006, 0.0045, 0.0045, 10));
  k.paint([0.05, 0.08, 0.12], ZONE.glass);
  k.cylinder(0.2502, 0.2506, 0.0098, 0.0098, 16, { centre: [ys, 0] });
  k.cylinder(0.1196, 0.12, 0.0078, 0.0078, 16, { centre: [ys, 0] });
  k.paint(0x222326, ZONE.parker);
  for (const x of [0.155, 0.212]) {
    k.box(x - 0.004, x + 0.004, b + 0.011, ys - 0.006, -0.004, 0.004);
    k.cylinder(x - 0.004, x + 0.004, 0.0094, 0.0094, 14, { centre: [ys, 0] });
  }
  solenoid(k, 0.12, 0.138, b - 0.018, b - 0.012, -0.004, 0.004);
  fcbLead(k, F, [0.118, b - 0.015, 0], [[0.105, F.fcb ? F.fcb.out[1] + 0.004 : 0, -0.008]]);
  return { main: k, muzzles: [[0.605, b, 0]] };
}

// =======================================================================================
// Arc thrower: a horizontal Tesla coil along the keel: a capacitor bank, a base drum, a copper
// secondary whose windings glow when it fires, an aluminium toroid, and two copper emitter
// rods on ceramic insulators reaching forward below the open jaw.

function buildBlitz(F) {
  const k = new Kit({ part: PART.mount, mode: MODE.rigid });
  const y = -0.106;
  // Capacitors, blue with silver caps.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const cy = y + Math.cos(a) * 0.0072,
      cz = Math.sin(a) * 0.0072;
    k.lathe(
      [
        [0.0, 0.004],
        [0.0015, 0.005],
        [0.028, 0.005],
        [0.03, 0.0042],
      ],
      10,
      { centre: [cy, cz], band: (j) => (j === 1 ? 0x24407a : 0xa9adb1), crease: 0.4 },
    );
  }
  k.paint(C.polymer, ZONE.polymer);
  k.cylinder(0.029, 0.041, 0.014, 0.014, 18, { centre: [y, 0] });
  // The secondary coil: copper with windings that glow (lines of the glow zone).
  const coil = [[0.04, 0.0102]];
  for (let i = 0; i < 8; i++) {
    const x = 0.043 + i * 0.0072;
    coil.push([x, 0.0102], [x + 0.0012, 0.0105], [x + 0.0024, 0.0105], [x + 0.0036, 0.0102]);
  }
  coil.push([0.1, 0.0102]);
  const cstart = k.count;
  k.paint(C.copper, ZONE.brass);
  k.lathe(coil, 12, { centre: [y, 0], band: (j) => ((j - 1) % 4 === 1 ? [0.55, 0.75, 1.0] : C.copper), crease: 0.99 });
  // Mark the glowing windings (the pale bands) as glow: they flicker when it arcs.
  k.tint(cstart, (p, rgb) => (rgb[2] > 0.9 && rgb[0] < 0.6 ? [...rgb, ZONE.glow] : null));
  // The toroid top-load facing forward, and the emitter rods on their insulators.
  k.paint(0xb4b8bc, ZONE.polished);
  k.with(T(0.11, y, 0), () => k.torus(0.015, 0.005, { major: 16, minor: 7 }));
  k.paint(0x9a9ea2, ZONE.steel);
  k.cylinder(0.1, 0.11, 0.004, 0.009, 12, { centre: [y, 0] });
  for (const s of [-1, 1]) {
    k.paint(C.copper, ZONE.brass);
    k.cylinder(0.105, 0.3, 0.0025, 0.0022, 8, { centre: [-0.1, s * 0.0055] });
    k.sphere([0.3, -0.1, s * 0.0055], 0.003, { wide: 8, high: 6 });
  }
  k.paint(C.ceramic, ZONE.ceramic);
  for (const x of [0.16, 0.21, 0.26])
    k.lathe(
      [
        [x - 0.003, 0.004],
        [x - 0.002, 0.0098],
        [x + 0.002, 0.0098],
        [x + 0.003, 0.004],
      ],
      12,
      { centre: [-0.1, 0], ry: 0.7 },
    );
  bellyBand(k, F, 0.09, disc(0, y, 0.0106));
  bellyBand(k, F, 0.15, [
    [-0.009, -0.1035],
    [0.009, -0.1035],
    [-0.009, -0.0965],
    [0.009, -0.0965],
  ]);
  return { main: k, muzzles: [[0.303, -0.1, 0]] };
}

// =======================================================================================
// Particle beam: the one that came from space. White-grey ceramic and gunmetal, low on the
// rail: a finned emitter housing, a three-stage accelerator tube with cyan rings at its
// joints (brighter with focus), a crown of focusing prongs, and braided coolant hoses to two
// small tanks on the front clamps.

function buildStrahl(F) {
  const k = new Kit({ part: PART.mount, mode: MODE.rail });
  const r = F.railTop,
    b = r + 0.016;
  k.paint(C.anodised, ZONE.alu);
  k.bevelBox(0.1, 0.16, r, r + 0.004, -0.0066, 0.0066, 0.0008);
  for (const s of [-1, 1]) k.box(0.1, 0.16, r - 0.0032, r, s > 0 ? 0.0045 : -0.0066, s > 0 ? 0.0066 : -0.0045);
  k.part = PART.gun;
  k.paint(C.ceramic, ZONE.ceramic);
  k.bevelBox(0.09, 0.18, r + 0.004, r + 0.028, -0.014, 0.014, 0.005);
  k.paint(C.gunmetal, ZONE.steel);
  for (let i = 0; i < 6; i++) {
    const x = 0.097 + i * 0.0085;
    k.bevelBox(x - 0.0012, x + 0.0012, r + 0.006, r + 0.031, -0.0155, 0.0155, 0.003);
  }
  // The accelerator: three stages, gunmetal collars, cyan rings in between.
  const stages = [
    [0.18, 0.3, 0.013],
    [0.3, 0.4, 0.01],
    [0.4, 0.5, 0.007],
  ];
  for (const [x0, x1, rr] of stages) {
    k.paint(C.ceramic, ZONE.ceramic);
    k.lathe(
      [
        [x0, rr * 0.9],
        [x0 + 0.003, rr],
        [x1 - 0.003, rr],
        [x1, rr * 0.9],
      ],
      18,
      { centre: [b, 0], crease: 0.5 },
    );
    k.paint(C.gunmetal, ZONE.steel);
    k.cylinder(x0 + 0.004, x0 + 0.01, rr + 0.0012, rr + 0.0012, 18, { centre: [b, 0] });
  }
  k.paint([0.25, 0.95, 1.0], ZONE.glow);
  for (const [x, rr] of [
    [0.3, 0.0112],
    [0.4, 0.0082],
    [0.5, 0.0058],
  ])
    k.cylinder(x - 0.0016, x + 0.0016, rr, rr, 18, { centre: [b, 0] });
  k.paint(C.gunmetal, ZONE.steel);
  for (let i = 0; i < 4; i++)
    k.with(aboutX(Math.PI / 4 + (i * Math.PI) / 2, b, 0), () => k.prism(0.498, 0.53, rect(b + 0.004, b + 0.0075, -0.0013, 0.0013), { taper: 0.5, shift: [-0.0015, 0] }));
  // Coolant tanks on the front clamps and their braided hoses (the mount).
  k.part = PART.mount;
  const ya = F.side.y,
    za = F.side.z;
  for (const s of [-1, 1]) {
    k.mode = MODE.side;
    k.paint(C.ceramic, ZONE.ceramic);
    k.lathe(
      [
        [0.127, 0],
        [0.128, 0.005],
        [0.131, 0.008],
        [0.163, 0.008],
        [0.166, 0.005],
        [0.167, 0],
      ],
      14,
      { centre: [ya + 0.004, s * za], crease: 0.3 },
    );
    k.paint([0.25, 0.95, 1.0], ZONE.glow);
    k.cylinder(0.144, 0.15, 0.0082, 0.0082, 14, { centre: [ya + 0.004, s * za] });
    k.mode = MODE.follow;
    k.tube(
      curve(
        [
          [0.167, ya + 0.004, s * za],
          [0.175, ya + 0.008, s * (za - 0.006)],
          [0.172, r + 0.012, s * 0.022],
          [0.165, r + 0.016, s * 0.0145],
        ],
        16,
      ),
      0.0021,
      6,
      { band: (i) => (i % 2 ? 0x7a7f84 : 0x3d4145) },
    );
  }
  k.mode = MODE.rail;
  fcbLead(k, F, [0.092, r + 0.008, -0.01], [[0.098, F.fcb ? F.fcb.out[1] + 0.005 : 0, -0.012]]);
  return { main: k, muzzles: [[0.53, b, 0]] };
}

// =======================================================================================
// Grenade harpoon: a Norwegian whaling gun under the belly. A short fat black barrel with
// brass fittings on a fork yoke from the keel rail, the loaded harpoon sticking out under the
// chin (a part: gone once fired, back after the reload), and a rope tub with coiled hemp.

function buildHarpune(F) {
  // The barrel kicks back in its yoke; the yoke, the rope tub and the band stay.
  const k = new Kit({ part: PART.gun, mode: MODE.rigid });
  const y = -0.104;
  k.paint(0x1f2022, ZONE.steel);
  k.lathe(
    [
      [0.097, 0.0],
      [0.098, 0.009],
      [0.1, 0.0145],
      [0.104, 0.016],
      [0.236, 0.0152],
      [0.2365, 0.0164],
      [0.2405, 0.0164],
      [0.2405, 0.0062],
      [0.232, 0.0055],
      [0.232, 0],
    ],
    16,
    { centre: [y, 0], band: (i) => (i >= 7 ? C.bore : i >= 5 ? C.brass : 0x1f2022), crease: 0.5 },
  );
  k.paint(C.brass, ZONE.brass);
  for (const x of [0.112, 0.19]) k.cylinder(x, x + 0.005, 0.0163, 0.0163, 16, { centre: [y, 0] });
  // The trunnion pin and the firing lever at the breech (with the barrel).
  k.paint(C.brass, ZONE.brass);
  k.with(M(T(0.151, y, 0), RY(Math.PI / 2)), () => k.cylinder(-0.021, 0.021, 0.0028, 0.0028, 10));
  k.paint(C.steel, ZONE.steel);
  k.with(M(T(0.1, y - 0.004, 0.008), RZ(-2.4)), () => k.bevelBox(0, 0.018, -0.0012, 0.0012, -0.0012, 0.0012, 0.0004));
  // The fork yoke from the keel rail, slotted for the trunnions to slide back in.
  k.part = PART.mount;
  k.paint(PALETTE.darkSteel, ZONE.steel);
  for (const s of [-1, 1]) k.bevelBox(0.136, 0.164, y - 0.004, F.keel.bottom, s > 0 ? 0.0165 : -0.0195, s > 0 ? 0.0195 : -0.0165, 0.002);
  k.box(0.134, 0.166, F.keel.bottom - 0.0025, F.keel.bottom, -0.0195, 0.0195);
  k.paint(C.bore, ZONE.rubber);
  for (const s of [-1, 1]) k.box(0.139, 0.155, y - 0.003, y + 0.003, s * 0.0194 - 0.0003, s * 0.0194 + 0.0003);
  // The rope tub (wooden staves, iron hoops) with coiled tan hemp, and the line to the harpoon.
  k.paint(0x5d4128, ZONE.wood);
  const tub = [];
  for (let i = 0; i <= 3; i++) tub.push(circle(18, 0.02).map(([cy, cz]) => [i * 0.0165, y + cy, cz]));
  k.loft(tub, { band: grain(0x5d4128, 9), capStart: true, crease: 0.3 });
  k.paint(0x2c2a28, ZONE.steel);
  for (const x of [0.006, 0.043]) k.cylinder(x, x + 0.003, 0.0204, 0.0204, 18, { centre: [y, 0] });
  k.paint(0xb89b6a, ZONE.fabric);
  for (let i = 0; i < 5; i++) k.with(T(0.047 - i * 0.004, y, 0), () => k.torus(0.0145 - (i % 2) * 0.004, 0.002, { major: 14, minor: 5 }));
  k.tube(
    curve(
      [
        [0.048, y + 0.012, 0.006],
        [0.08, y + 0.0165, 0.0075],
        [0.17, y + 0.0172, 0.008],
        [0.236, y + 0.0172, 0.0075],
        [0.244, y + 0.006, 0.0035],
      ],
      18,
    ),
    0.0008,
    5,
  );
  bellyBand(k, F, 0.09, disc(0, y, 0.0163));
  // The harpoon: black shaft, folded barbs, brass grenade head. (An item: gone once fired,
  // until the winch has it back.)
  k.part = PART.gun;
  const hk = new Kit({ part: PART.gun });
  hk.item(0, 1);
  hk.paint(0x161718, ZONE.parker);
  hk.cylinder(0.2, 0.49, 0.004, 0.004, 10, { centre: [y, 0] });
  hk.paint(C.steel, ZONE.steel);
  hk.with(M(T(0.243, y + 0.0048, 0.0035)), () => hk.torus(0.002, 0.0006, { major: 8, minor: 4 }));
  hk.paint(0x2a2b2c, ZONE.steel);
  for (let i = 0; i < 4; i++)
    hk.with(aboutX(Math.PI / 4 + (i * Math.PI) / 2, y, 0), () => hk.prism(0.455, 0.49, rect(y + 0.0036, y + 0.0062, -0.0007, 0.0007), { taper: 0.4, shift: [-0.0022, 0] }));
  hk.paint(C.brass, ZONE.brass);
  hk.lathe(
    [
      [0.487, 0.0045],
      [0.49, 0.008],
      [0.513, 0.008],
      [0.518, 0.0062],
      [0.545, 0],
    ],
    14,
    { centre: [y, 0], crease: 0.5 },
  );
  hk.paint(C.red, ZONE.paint);
  hk.cylinder(0.5, 0.5035, 0.0082, 0.0082, 14, { centre: [y, 0] });
  return { main: k, parts: { harpoon: { kit: hk } }, ammo: { count: 1, kind: "rack", reload: 3.0 }, muzzles: [[0.545, y, 0]] };
}

// =======================================================================================
// Ship's cannon: an 18th-century bronze gun, turned, exaggerated so it reads at a glance: a
// fat breech with a cascabel knob, a raised base ring, two thick reinforce rings, dolphins
// (lifting handles) on top, a long chase and a big tulip muzzle; warm bronze with the raised
// rings brighter, dark verdigris only in the recesses, a vent with a fuse ember that glows
// while it is charged. The gun and its trunnions slide back 0.04 in a steel cradle: two long
// slotted cheek plates on a base plate bolted to both right clamps (the mount, which stays).
// A shot locker on the left clamps is the counterweight.

function buildKanone(F) {
  const k = new Kit({ part: PART.gun, mode: MODE.side });
  const Cc = F.clamp;
  const ya = F.side.y + 0.022,
    za = F.side.z + 0.016;
  const bronze = 0x7a5a32,
    ring = 0xa8844a,
    verdigris = 0x2f5a48;
  const profile = [
    [0.017, 0.0],
    [0.0175, 0.0045],
    [0.0205, 0.0082],
    [0.0255, 0.0088],
    [0.03, 0.0065],
    [0.0325, 0.0048],
    [0.036, 0.0052],
    [0.0385, 0.012],
    [0.0395, 0.0205],
    [0.041, 0.0294],
    [0.0475, 0.0296],
    [0.049, 0.0278],
    [0.19, 0.0262],
    [0.19, 0.0308],
    [0.201, 0.0308],
    [0.201, 0.0256],
    [0.33, 0.0236],
    [0.33, 0.0284],
    [0.339, 0.0284],
    [0.339, 0.0222],
    [0.518, 0.0192],
    [0.518, 0.0218],
    [0.525, 0.0218],
    [0.525, 0.0186],
    [0.544, 0.0179],
    [0.556, 0.0198],
    [0.567, 0.0236],
    [0.575, 0.0263],
    [0.582, 0.0263],
    [0.584, 0.0242],
    [0.584, 0.0106],
    [0.571, 0.0104],
    [0.571, 0],
  ];
  // The raised rings (base ring, reinforces, chase astragal, muzzle lip) in brighter,
  // more metallic bronze.
  const raised = new Set([9, 10, 13, 14, 17, 18, 21, 22, 27, 28]);
  const from = k.count;
  k.paint(bronze, ZONE.bronze);
  k.lathe(profile, 16, {
    centre: [ya, za],
    band: (i) => (i >= profile.length - 3 ? C.bore : raised.has(i) ? ring : bronze),
    crease: 0.55,
  });
  // Verdigris in the recesses only: the fillets beside each ring and the cascabel's neck, a
  // little darker and greener (the surface stays bronze).
  const recesses = [0.0325, 0.049, 0.19, 0.201, 0.33, 0.339, 0.518, 0.525];
  k.tint(from, ([px], rgb) => {
    if (rgb[0] < 0.01) return null;
    let t = 0;
    for (const x of recesses) t = Math.max(t, 1 - Math.abs(px - x) / 0.006);
    return t > 0 ? mixColour(rgb, verdigris, 0.3 * t) : null;
  });
  // The ring faces at the breech and the rings, in the brighter bronze (zone: brass).
  k.tint(from, ([px, py, pz], rgb, i) => {
    const rr = Math.hypot(py - ya, pz - za);
    const onRing = (px > 0.0405 && px < 0.048 && rr > 0.028) || (px > 0.1895 && px < 0.2015 && rr > 0.0285) || (px > 0.3295 && px < 0.3395 && rr > 0.0265) || (px > 0.5175 && px < 0.5255 && rr > 0.0205) || (px > 0.574 && px < 0.5835 && rr > 0.025);
    return onRing ? [...colour(ring), ZONE.brass] : null;
  });
  // The dolphins over the trunnions, the vent field with its ember, the firing solenoid.
  k.paint(ring, ZONE.brass);
  for (const s of [-1, 1])
    k.with(frame([0.232, ya + 0.0238, za + s * 0.0075], [0, 0, 1], [1, 0, 0]), () => k.torus(0.0078, 0.0022, { major: 10, minor: 5, arc: Math.PI }));
  k.paint(ring, ZONE.brass);
  k.bevelBox(0.058, 0.074, ya + 0.0262, ya + 0.0284, za - 0.0065, za + 0.0065, 0.0008);
  // The ember in the vent: dark until the fuse burns (the object's glow is the charge).
  k.paint([0.12, 0.05, 0.02], ZONE.glow);
  k.with(M(T(0.066, ya + 0.0282, za), RZ(Math.PI / 2)), () =>
    k.lathe(
      [
        [0.0, 0.0026],
        [0.0032, 0.0016],
        [0.0052, 0],
      ],
      6,
    ),
  );
  solenoid(k, 0.078, 0.094, ya + 0.025, ya + 0.031, za - 0.004, za + 0.004);
  // The trunnions (they slide with the gun in the cradle's slots).
  k.paint(bronze, ZONE.bronze);
  k.with(M(T(0.14, ya, za), RY(Math.PI / 2)), () => k.cylinder(-0.0345, 0.0345, 0.0062, 0.0062, 12));
  k.paint(ring, ZONE.brass);
  for (const s of [-1, 1]) k.with(M(T(0.14, ya, za + s * 0.0275), RY(Math.PI / 2)), () => k.cylinder(-0.0012, 0.0012, 0.0085, 0.0085, 12));
  // The cradle: base plate on both right clamps, two long cheek plates with the trunnion
  // slots, cap squares bolted over the slots.
  k.part = PART.mount;
  k.paint(PALETTE.darkSteel, ZONE.parker);
  const yb = Cc.y + 0.0045;
  k.bevelBox(0.093, 0.158, yb, yb + 0.003, za - 0.038, za + 0.038, 0.0015);
  for (const s of [-1, 1]) {
    const zp = za + s * 0.036;
    k.paint(PALETTE.darkSteel, ZONE.parker);
    k.bevelBox(0.093, 0.158, yb + 0.003, ya + 0.011, zp - 0.002, zp + 0.002, 0.003);
    k.paint(C.bore, ZONE.rubber);
    const [z0, z1] = span(zp + s * 0.002, zp + s * 0.0024);
    k.box(0.0975, 0.1475, ya - 0.0064, ya + 0.0064, z0, z1);
    k.paint(C.steel, ZONE.steel);
    for (const x of [0.097, 0.154])
      for (const y of [yb + 0.007, ya + 0.007]) k.with(M(T(x, y, zp + s * 0.0022), RY(s > 0 ? -Math.PI / 2 : Math.PI / 2)), () => k.cylinder(0, 0.0008, 0.0014, 0.0014, 6));
  }
  // The shot locker on the left clamps: dark wood, iron bands, a brass plate.
  const zl = -(Cc.z + 0.004);
  k.paint(0x3b2a1b, ZONE.wood);
  k.bevelBox(0.102, 0.142, Cc.y + 0.004, Cc.y + 0.034, zl - 0.015, zl + 0.015, 0.0015);
  k.paint(0x2a2a2a, ZONE.steel);
  for (const x of [0.108, 0.136]) k.box(x - 0.0015, x + 0.0015, Cc.y + 0.0038, Cc.y + 0.0345, zl - 0.0154, zl + 0.0154);
  k.box(0.102, 0.142, Cc.y + 0.0335, Cc.y + 0.0355, zl - 0.0154, zl + 0.0154);
  k.paint(C.brass, ZONE.brass);
  k.box(0.119, 0.125, Cc.y + 0.026, Cc.y + 0.032, zl - 0.0158, zl - 0.0151);
  return { main: k, muzzles: [[0.584, ya, za]] };
}

// =======================================================================================
// Nodachi: the spawner's great sword, longer than the fish, on the left clamps; a slewing ring
// on the rail carries the mast that raises it above the back and whirls it round.

const buildNodachi = (F) =>
  buildBlade(F, { length: 0.75, saya: 0.825, sayaR: [0.0058, 0.0138], grip: 0.205, guard: "square", width: 0.024, sori: 0.02, tsukaRgb: [C.ito, 0x8a1410], arm: "mast", bands: [0.2, 0.42, 0.64], fittings: 0x3a3835, cord: 0x8a1410 });

// =======================================================================================
// Chainsaw: a two-stroke under the chest and the bar out front like a sawfish's rostrum. It
// reads as a chainsaw from any side: safety-orange top housing over a dark grey crankcase,
// the black air-filter cover and fins, the pull start, a rear D-handle with its throttle, the
// tubular front wrap handle round the engine and the chain-brake guard in front of it, the
// grey sprocket cover with its bar nuts, a dark bar with a bright chain. The chain's teeth
// are two items with the teeth in alternate places, swapped every frame while it runs.

function buildSaege(F) {
  // (Engine, bar and chain shake as one while it runs; the cradle's bands stay.)
  const k = new Kit({ part: PART.gun, mode: MODE.rigid });
  const orange = C.orange,
    grey = 0x44474a,
    black = 0x1c1c1c;
  // Housing: orange top, grey crankcase below, a black filter cover and cooling fins on the
  // left, the pull start behind them.
  k.paint(orange, ZONE.paint);
  k.bevelBox(0.04, 0.16, -0.108, -0.0875, -0.02, 0.02, 0.006);
  k.paint(grey, ZONE.polymer);
  k.bevelBox(0.046, 0.157, -0.123, -0.1075, -0.019, 0.019, 0.005);
  k.paint(black, ZONE.polymer);
  k.bevelBox(0.082, 0.138, -0.1055, -0.0905, -0.0222, -0.0195, 0.002);
  k.paint(0x2a2a2a, ZONE.parker);
  for (let i = 0; i < 5; i++) {
    const x = 0.088 + i * 0.0105;
    k.bevelBox(x - 0.0012, x + 0.0012, -0.121, -0.1075, -0.0225, -0.019, 0.001);
  }
  k.paint(black, ZONE.polymer);
  k.with(M(T(0.062, -0.1, -0.02), RY(Math.PI / 2)), () =>
    k.lathe(
      [
        [0, 0.012],
        [0.003, 0.012],
        [0.0045, 0.009],
      ],
      16,
    ),
  );
  k.paint(orange, ZONE.polymer);
  k.bevelBox(0.052, 0.072, -0.1035, -0.0965, -0.0275, -0.0245, 0.001);
  // The muffler on the right rear: perforated steel.
  k.paint(0x8f9398, ZONE.steel);
  k.bevelBox(0.058, 0.098, -0.118, -0.1, 0.019, 0.0262, 0.002);
  k.paint(0x3a3b3c, ZONE.parker);
  for (let i = 0; i < 4; i++) k.cylinder(0.061, 0.095, 0.0009, 0.0009, 6, { centre: [-0.104 - i * 0.0035, 0.0263] });
  // The grey sprocket cover on the right front, with its two bar nuts.
  k.paint(grey, ZONE.polymer);
  k.bevelBox(0.128, 0.182, -0.1185, -0.0915, 0.0035, 0.0245, 0.005);
  k.paint(C.brightSteel, ZONE.steel);
  for (const x of [0.162, 0.174]) k.with(M(T(x, -0.1025, 0.0245), RY(-Math.PI / 2)), () => k.lathe([[0, 0.0026], [0.0022, 0.0026], [0.0028, 0.0018]], 6, { flat: true }));
  // The rear D-handle, black, with the orange throttle trigger inside it.
  k.paint(black, ZONE.polymer);
  k.tube(
    curve(
      [
        [0.042, -0.0915, 0],
        [0.02, -0.093, 0],
        [0.0085, -0.103, 0],
        [0.0085, -0.116, 0],
        [0.018, -0.1235, 0],
        [0.046, -0.1215, 0],
      ],
      12,
    ),
    0.0036,
    6,
  );
  k.paint(orange, ZONE.polymer);
  k.bevelBox(0.028, 0.038, -0.1, -0.0935, -0.002, 0.002, 0.0008);
  // The front wrap handle: a black tube from the left flank down round under the crankcase
  // and up the right side to the sprocket cover; the chain-brake guard in front of it.
  k.paint(black, ZONE.polymer);
  const wrap = [];
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI * (i / 14);
    wrap.push([0.148 - 0.004 * Math.sin(a), -0.108 - 0.0165 * Math.sin(a), -Math.cos(a) * 0.0232]);
  }
  k.tube([[0.14, -0.093, -0.0232], ...wrap, [0.14, -0.098, 0.0232]], 0.0027, 6);
  k.paint(0x121212, ZONE.polymer);
  k.with(M(T(0.1605, -0.1265, 0), RY(Math.PI / 2), RX(0.2)), () =>
    k.plate(
      [
        [-0.019, 0],
        [0.019, 0],
        [0.017, 0.016],
        [-0.017, 0.016],
      ],
      -0.0012,
      0.0012,
    ),
  );
  // The bar: a dark steel plate with a rounded nose and a sprocket, bolted under the cover.
  const yb = -0.102,
    h = 0.015;
  const bar = [];
  bar.push([0.16, yb - h], [0.615, yb - h]);
  for (let i = 1; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    bar.push([0.615 + Math.cos(a) * h, yb + Math.sin(a) * h]);
  }
  bar.push([0.615, yb + h], [0.16, yb + h]);
  k.paint(0x3c4044, ZONE.parker);
  k.plate(bar, -0.002, 0.002);
  k.paint(0x6a6e72, ZONE.steel);
  k.cylinder(0.612, 0.618, 0.0028, 0.0028, 10, { centre: [yb, 0] });
  k.with(M(T(0.615, yb, 0), RY(Math.PI / 2)), () => k.cylinder(-0.0026, 0.0026, 0.006, 0.006, 12));
  // The chain round the bar's edge: a bright line, and its teeth (two items).
  const edge = (t) => {
    const straight = 0.615 - 0.16,
      arc = Math.PI * (h + 0.0015),
      total = 2 * straight + arc;
    let d = t * total;
    if (d < straight) return [[0.16 + d, yb + h + 0.0015], [0, 1]];
    d -= straight;
    if (d < arc) {
      const a = Math.PI / 2 - d / (h + 0.0015);
      return [[0.615 + Math.cos(a) * (h + 0.0015), yb + Math.sin(a) * (h + 0.0015)], [Math.cos(a), Math.sin(a)]];
    }
    d -= arc;
    return [[0.615 - d, yb - h - 0.0015], [0, -1]];
  };
  const N = 64;
  const outline = [];
  for (let i = 0; i < N; i++) outline.push(edge(i / N)[0]);
  k.paint(0xc4c8cc, ZONE.steel);
  for (let i = 0; i < N - 1; i++) {
    const [p, q] = [outline[i], outline[i + 1]];
    const dx = q[0] - p[0],
      dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = dy / l,
      ny = -dx / l;
    const o = 0.0014;
    const a = [p[0] - nx * o, p[1] - ny * o],
      b2 = [q[0] - nx * o, q[1] - ny * o];
    k.face(
      [
        [p[0], p[1], 0.0028],
        [q[0], q[1], 0.0028],
        [b2[0], b2[1], 0.0028],
        [a[0], a[1], 0.0028],
      ],
      [0, 0, 1],
    );
    k.face(
      [
        [p[0], p[1], -0.0028],
        [a[0], a[1], -0.0028],
        [b2[0], b2[1], -0.0028],
        [q[0], q[1], -0.0028],
      ],
      [0, 0, -1],
    );
    k.face(
      [
        [p[0], p[1], -0.0028],
        [q[0], q[1], -0.0028],
        [q[0], q[1], 0.0028],
        [p[0], p[1], 0.0028],
      ],
      [nx, ny, 0].map((c) => -c),
    );
  }
  const T0 = 46;
  for (let i = 0; i < T0; i++) {
    const [p, nrm] = edge(i / T0);
    k.item(i % 2, 2);
    k.paint(0xd0d4d8, ZONE.steel);
    const side = (Math.floor(i / 2) % 2 ? 1 : -1) * 0.0017;
    const along = [-nrm[1], nrm[0]];
    k.with(frame([p[0], p[1], side], [along[0], along[1], 0], [nrm[0], nrm[1], 0]), () =>
      k.prism(-0.0026, 0.0026, [
        [0, -0.0012],
        [0.0032, -0.0012],
        [0.0026, 0.0012],
        [0, 0.0012],
      ]),
    );
  }
  k.item(null);
  // Cradle bands and sway braces for the heavy engine (the mount).
  k.part = PART.mount;
  const box = [
    [-0.0205, -0.1235],
    [0.0205, -0.1235],
    [-0.0205, -0.087],
    [0.0205, -0.087],
  ];
  bellyBand(k, F, 0.09, box);
  bellyBand(k, F, 0.15, box);
  for (const s of [-1, 1]) swayBrace(k, F, 0.12, [0.12, -0.0885, s * 0.019]);
  return { main: k, parts: {}, ammo: { count: 2, kind: "chain" }, muzzles: [[0.632, yb, 0]] };
}

// =======================================================================================
// The roster: where each weapon sits, how it kicks, and its builder.
//   anchor: what it rides on (rail, side clamps, keel rail): what the spawner's hump lifts it
//           by, and the point a small fish's weapon is scaled about ("gag scale")
//   bodies: the bodies it is built for (belly weapons need the salmon's keel rail)
//   recoil: slide back d (model units) and muzzle flip (radians) over `time` seconds, turning
//           about `pivot` (x of the rear mount); only the gun kicks, never its mount

export const WEAPON_MODELS = {
  piu: { place: "back", anchor: "rail", bodies: ["alevin", "parr", "salmon"], recoil: { d: 0.004, flip: 0, time: 0.05 }, build: buildPiu },
  flinte: { place: "back", anchor: "side", side: 1, bodies: ["parr", "salmon"], recoil: { d: 0.012, flip: 8 * DEG, time: 0.12, pivot: 0.1 }, shells: 2, reload: 0.9, rest: 1.5, build: buildFlinte },
  granate: { place: "back", anchor: "side", side: 1, bodies: ["parr", "salmon"], recoil: { d: 0.01, flip: 10 * DEG, time: 0.15, pivot: 0.1 }, shells: 6, reload: 2.4, build: buildGranate },
  katana: { place: "back", anchor: "side", side: -1, bodies: ["parr", "salmon"], recoil: { d: 0, flip: 0, time: 0.1 }, idle: 1.5, build: buildKatana },
  flammen: { place: "back", anchor: "rail", bodies: ["parr", "salmon"], recoil: { d: 0, flip: 0, time: 0.05 }, build: buildFlammen },
  minigun: { place: "back", anchor: "side", side: 1, bodies: ["parr", "salmon"], recoil: { d: 0.003, flip: 0, time: 0.04 }, build: buildMinigun },
  raketen: { place: "back", anchor: "side", side: 0, bodies: ["parr", "salmon"], recoil: { d: 0.006, flip: 0, time: 0.1 }, reload: 3.5, rest: 2, build: buildRaketen },
  torpedo: { place: "belly", anchor: "rigid", bodies: ["salmon"], recoil: { d: 0, flip: 0, time: 0.1 }, build: (F) => buildTorpedo(F, false) },
  torpedo4: { place: "belly", anchor: "rigid", bodies: ["salmon"], recoil: { d: 0, flip: 0, time: 0.1 }, build: (F) => buildTorpedo(F, true) },
  minen: { place: "belly", anchor: "rigid", bodies: ["salmon"], recoil: { d: 0, flip: 0, time: 0.1 }, reload: 3, rest: 0.6, build: buildMinen },
  panzerbuechse: { place: "back", anchor: "rail", bodies: ["parr", "salmon"], recoil: { d: 0.02, flip: 3 * DEG, time: 0.22, pivot: 0.1 }, build: buildPanzerbuechse },
  blitz: { place: "belly", anchor: "rigid", bodies: ["salmon"], recoil: { d: 0, flip: 0, time: 0.05 }, build: buildBlitz },
  strahl: { place: "back", anchor: "rail", bodies: ["parr", "salmon"], recoil: { d: 0, flip: 0, time: 0.05 }, build: buildStrahl },
  harpune: { place: "belly", anchor: "rigid", bodies: ["salmon"], recoil: { d: 0.01, flip: 0, time: 0.2 }, build: buildHarpune },
  kanone: { place: "back", anchor: "side", side: 1, bodies: ["parr", "salmon"], recoil: { d: 0.04, flip: 4 * DEG, time: 0.4, pivot: 0.14 }, build: buildKanone },
  nodachi: { place: "back", anchor: "side", side: -1, bodies: ["parr", "salmon"], recoil: { d: 0, flip: 0, time: 0.1 }, idle: 1.0, build: buildNodachi },
  saege: { place: "belly", anchor: "rigid", bodies: ["salmon"], recoil: { d: 0, flip: 0, time: 0.05 }, build: buildSaege },
};
