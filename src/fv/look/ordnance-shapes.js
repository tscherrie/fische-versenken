// The shapes of what the weapons put into the water: the players' ordnance in flight (the
// torpedo with its screws, the rocket, the horned mine, the grenade harpoon, the cannon ball),
// what the enemies throw and shoot that is a thing and not a bullet (the crossbow's bolt, the
// heron's spear, throwing stars and knives, nails, the gannet's bombs), the bullets and
// pellets once they are spent, the empty cases the guns throw out, and the harpoon's line.
//
// Built with the weapons' own kit (model-parts.js), so they share the gear's colours and
// surfaces, and where a launcher already holds the round (the rockets' red tips in the pods,
// the torpedoes' noses in the tubes, the mines on the rack, the harpoon under the chin) the
// round is built by the very function that built it there (model-weapons.js): a rocket fired
// is the one that stood in the tube.
//
// Each shape points along +x. The players' ordnance is in the fish's model units (the body
// 0.79 long), its point at the origin, so it is placed by where the shot is and scaled by the
// shooter's length as the launcher on it is; everything else is one unit long (or across),
// round its middle, and scaled to its size when it is placed.

import { Kit, ZONE, colour, mixColour, shade, stream, M, T, RX, RY, RZ } from "../model-parts.js";
import { C, MINE_HORN, MINE_R, ROCKET_R, TORPEDO_GREY, harpoonShaft, hornedMine, rocketTip, torpedoNose } from "../model-weapons.js";

const DEG = Math.PI / 180;

// The geometry of a kit, its surfaces made duller where it is asked: nothing shinier than
// roughness `matte`. (The spent rounds and the empty cases are matte bits on the bed, not
// jewellery: under water brass and lead lose their shine at once, and a case that mirrors
// only the dim water round it goes black against a lit flank; a little less mirror keeps it
// brass.)
// (`metal`: nothing more metallic than that. A small blade seen against the dark bed mirrors
// the bed and goes black; a little less mirror and more of its own grey keeps its shape.)
function finish(k, matte = 0, metal = 1) {
  const g = k.geometry();
  const s = g.attributes.aSurf;
  for (let i = 0; i < s.count; i++) {
    if (s.getX(i) < matte) s.setX(i, matte);
    if (s.getY(i) > metal) s.setY(i, metal);
  }
  return g;
}

// A flat fin: `outline` [[x, r], ...] in the plane through the axis, `t` thick, turned `n`
// ways round the axis (from `phase`).
function fins(k, outline, t, n = 4, phase = 0) {
  for (let i = 0; i < n; i++) k.with(RX(phase + (i / n) * Math.PI * 2), () => k.plate(outline, -t / 2, t / 2));
}

// ---- The players' ordnance (model units, the point at the origin).

// The torpedo: the warhead of the loaded tubes (olive drab, red ring, yellow tip band) on a
// grey body with a white stencil band and seams, a tapered afterbody with four fins, and the
// stub of the propeller shaft. The screws are a shape of their own (they turn).
export const TORPEDO = { radius: 0.0115 - 0.0017, length: 0.2152, screws: [-0.2045, -0.2078] };
export function torpedoShape() {
  const k = new Kit();
  const rn = TORPEDO.radius;
  // (The nose in the tube is built with the kit's own surface, and so is this one.)
  torpedoNose(k, rn, [0, 0], -0.2152);
  // (Lighter than the tubes: a painted body that still reads as grey in the dim water.)
  const body = 0x656d75;
  k.paint(body, ZONE.paint);
  k.cylinder(-0.172, -0.0272, rn, rn, 12, { capStart: false, capEnd: false });
  // Seams at the section joints, and the stencil band.
  k.paint(shade(TORPEDO_GREY, 0.75), ZONE.paint);
  for (const x of [-0.0282, -0.118]) k.cylinder(x, x + 0.001, rn + 0.0002, rn + 0.0002, 12, { capStart: false, capEnd: false });
  k.paint(0xdcdcd2, ZONE.paint);
  k.cylinder(-0.075, -0.069, rn + 0.0001, rn + 0.0001, 12, { capStart: false, capEnd: false });
  // The afterbody, tapering to the shaft.
  k.paint(body, ZONE.paint);
  k.lathe(
    [
      [-0.2015, 0.0022],
      [-0.1975, 0.0036],
      [-0.1895, 0.0062],
      [-0.1805, 0.0085],
      [-0.172, rn],
    ],
    12,
    { crease: 0.3 },
  );
  // Four fins, their trailing edges at the screws (the rudders and the hydroplanes).
  k.paint(shade(TORPEDO_GREY, 1.05), ZONE.paint);
  fins(
    k,
    [
      [-0.2005, 0.0026],
      [-0.1845, 0.0074],
      [-0.1885, 0.0134],
      [-0.2005, 0.0134],
    ],
    0.0007,
    4,
    Math.PI / 4,
  );
  k.paint(C.steel, ZONE.steel);
  k.cylinder(-0.2095, -0.2012, 0.0011, 0.0011, 6);
  return finish(k);
}
// One of the contra-rotating screws: a bronze hub and four twisted blades.
export function torpedoScrewShape() {
  const k = new Kit();
  k.paint(0x8a6a3a, ZONE.brass);
  k.cylinder(-0.0012, 0.0012, 0.0016, 0.0014, 8);
  const blade = [
    [-0.0014, 0.0012],
    [0.0012, 0.0014],
    [0.0016, 0.0045],
    [0.0006, 0.0072],
    [-0.0012, 0.0066],
    [-0.0019, 0.0035],
  ];
  for (let i = 0; i < 4; i++)
    k.with(M(RX((i / 4) * Math.PI * 2), RY(-55 * DEG)), () => {
      // (Outline [chord, radius] in the plate's x-y plane; turned so the chord lies across the
      // shaft with the blade's pitch.)
      k.plate(blade, -0.00035, 0.00035);
    });
  return finish(k);
}

// The rocket: the red tip of the pods, an olive-drab warhead with its yellow band, the motor
// tube, and four fins round the nozzle. Its nozzle at the origin, the tip ahead: the shot's
// point is where its motor burns (weapons.js draws the nozzle's glow there).
export const ROCKET = { radius: ROCKET_R, length: 0.158 };
export function rocketShape() {
  const k = new Kit();
  rocketTip(k, [0, 0], -0.2346, 10);
  k.paint(C.oliveDrab, ZONE.paint);
  k.cylinder(-0.034, -0.0061, ROCKET_R, ROCKET_R, 10, { capStart: false, capEnd: false });
  k.paint(C.yellow, ZONE.paint);
  k.cylinder(-0.021, -0.0175, ROCKET_R + 0.00006, ROCKET_R + 0.00006, 10, { capStart: false, capEnd: false });
  k.paint(C.steel, ZONE.steel);
  k.cylinder(-0.0355, -0.034, ROCKET_R + 0.0001, ROCKET_R + 0.0001, 10);
  k.paint(0x3a3e30, ZONE.paint);
  k.cylinder(-0.15, -0.0355, 0.0041, 0.0041, 10, { capStart: false, capEnd: false });
  // The nozzle, flared, black inside.
  k.paint(0x2a2b2c, ZONE.steel);
  k.lathe(
    [
      [-0.158, 0.0037],
      [-0.1535, 0.003],
      [-0.15, 0.0041],
    ],
    10,
    { capStart: false, capEnd: false },
  );
  k.paint(C.bore, ZONE.rubber);
  k.disc(-0.1578, 0.0033, { sides: 10, facing: -1 });
  k.paint(0x3a3e30, ZONE.paint);
  fins(
    k,
    [
      [-0.1505, 0.0036],
      [-0.138, 0.0036],
      [-0.1425, 0.0096],
      [-0.1505, 0.0096],
    ],
    0.0005,
    4,
    Math.PI / 4,
  );
  return finish(k).translate(ROCKET.length, 0, 0);
}

// The horned mine as it hangs from the rack: its short chain and anchor plate below it (the
// first of the rack's mines, rust and all). Its middle at the origin.
export function mineShape() {
  const k = new Kit();
  const rise = Math.sin(40 * DEG);
  // (As far down to the plate as the rack's mines hang.)
  const drop = 0.1245 - 0.086 - Math.max(rise * (MINE_R + MINE_HORN), MINE_R + 0.003) - 0.0006;
  hornedMine(k, 0, 0, stream(21), drop);
  return finish(k);
}

// The grenade harpoon as it lay under the chin, its point at the origin. Where its line is
// tied: the eye near its tail.
export const HARPOON = { length: 0.345, eye: [0.243 - 0.545, 0.0048, 0.0035] };
export function harpoonShape() {
  const k = new Kit();
  harpoonShaft(k, 0, -0.545);
  return finish(k);
}

// The cannon's ball: cast iron with a crust of rust in patches, a wooden fuse plug bound in
// brass, and the fuse, whose burning end glows (the material's glow: blue under water).
export const BALL = { radius: 0.0104, fuse: 0.0104 + 0.0052 };
export function ballShape() {
  const k = new Kit();
  const R = BALL.radius;
  const from = k.count;
  // (Cast iron that has lain in a ship's locker: dull grey, crusted brown with rust in
  // patches, the mould's seam round its middle; not a black ball: that is a cartoon's bomb.)
  k.paint(0x5a5650, ZONE.polymer);
  k.sphere([0, 0, 0], R, { wide: 14, high: 10 });
  const rust = stream(7);
  k.tint(from, ([x, y, z], rgb) => {
    if (Math.abs(z) < 0.0005) return colour(0x34322e);
    const n = Math.sin(x * 1400 + y * 900) * Math.sin(z * 1300 - x * 500) + Math.sin(y * 2300 + z * 700) * 0.4 + (rust() - 0.5) * 0.5;
    return n > 0 ? mixColour(rgb, 0x6b3a1a, Math.min(0.75, n * 1.1)) : null;
  });
  // (Up the local y axis: the plug, the brass band, the cord, and its end.)
  k.with(RZ(Math.PI / 2), () => {
    k.paint(0x3b2a1b, ZONE.wood);
    k.cylinder(R - 0.0012, R + 0.0021, 0.0026, 0.0021, 8);
    k.paint(C.brass, ZONE.brass);
    k.cylinder(R + 0.0006, R + 0.0012, 0.00265, 0.0025, 8, { capStart: false, capEnd: false });
    k.paint(0x1c1712, ZONE.fabric);
    k.cylinder(R + 0.0021, R + 0.0046, 0.0008, 0.0007, 5);
    k.paint([0.35, 0.6, 1.4], ZONE.glow);
    k.sphere([BALL.fuse, 0, 0], 0.0011, { wide: 6, high: 4 });
  });
  return finish(k);
}

// ---- The enemies' things: one unit long (a star one across), round the middle, the point
// along +x.

// The gannet's bomb: a low-drag general-purpose bomb, olive drab with the yellow bands of high
// explosive, a steel nose fuze, two suspension lugs and a tail of four swept fins.
export function bombShape() {
  const k = new Kit();
  const R = 0.075;
  k.paint(0x474c33, ZONE.paint);
  k.lathe(
    [
      [-0.42, 0.036],
      [-0.35, 0.05],
      [-0.25, 0.066],
      [-0.15, R],
      [0.25, R],
      [0.32, 0.072],
      [0.4, 0.063],
      [0.455, 0.048],
      [0.485, 0.03],
      [0.495, 0.014],
    ],
    14,
    { crease: 0.4 },
  );
  k.paint(C.yellow, ZONE.paint);
  for (const [x0, x1] of [
    [0.19, 0.215],
    [-0.12, -0.095],
  ])
    k.cylinder(x0, x1, R + 0.0006, R + 0.0006, 14, { capStart: false, capEnd: false });
  k.paint(C.steel, ZONE.steel);
  k.cylinder(0.494, 0.522, 0.0145, 0.011, 8);
  k.paint(0x2a2b2c, ZONE.paint);
  k.disc(-0.4195, 0.036, { sides: 14, facing: -1 });
  // The lugs on top.
  k.paint(C.steel, ZONE.steel);
  for (const x of [0.12, -0.08]) k.with(M(T(x, R + 0.006, 0), RY(Math.PI / 2)), () => k.torus(0.009, 0.0028, { major: 8, minor: 4, arc: Math.PI, start: 0 }));
  // The fins.
  k.paint(0x3f4430, ZONE.paint);
  fins(
    k,
    [
      [-0.46, 0.026],
      [-0.3, 0.056],
      [-0.4, 0.13],
      [-0.47, 0.13],
    ],
    0.006,
    4,
    Math.PI / 4,
  );
  return finish(k, 0.5);
}

// A crossbow bolt: a dark aluminium shaft, three vanes, a three-bladed broadhead.
export function boltShape() {
  const k = new Kit();
  k.paint(0x2a2d30, ZONE.alu);
  k.cylinder(-0.465, 0.36, 0.016, 0.016, 6);
  k.paint(0x121212, ZONE.polymer);
  k.cylinder(-0.5, -0.465, 0.013, 0.017, 6);
  k.paint(0x2f3a24, ZONE.polymer);
  fins(
    k,
    [
      [-0.45, 0.014],
      [-0.29, 0.014],
      [-0.36, 0.05],
      [-0.44, 0.052],
    ],
    0.004,
    3,
  );
  k.paint(C.steel, ZONE.steel);
  k.cylinder(0.35, 0.41, 0.02, 0.016, 6);
  k.paint(0x9a9ea2, ZONE.steel);
  fins(
    k,
    [
      [0.37, 0.012],
      [0.5, 0.0],
      [0.39, 0.058],
    ],
    0.004,
    3,
  );
  return finish(k, 0.4, 0.6);
}

// The heron's spear: a long stainless shaft, a tri-cut point, the flopper barb folded back
// along it, and the tabs the bands pull on.
export function spearShape() {
  const k = new Kit();
  k.paint(0x9a9ea2, ZONE.steel);
  k.cylinder(-0.5, 0.44, 0.0105, 0.0105, 6);
  k.lathe(
    [
      [0.44, 0.0105],
      [0.5, 0],
    ],
    3,
  );
  k.paint(0x6c7074, ZONE.steel);
  k.with(RZ(-6 * DEG), () =>
    k.plate(
      [
        [0.35, 0.008],
        [0.43, 0.012],
        [0.36, 0.026],
      ],
      -0.003,
      0.003,
    ),
  );
  for (const x of [-0.32, -0.12])
    k.plate(
      [
        [x - 0.02, 0.008],
        [x + 0.02, 0.008],
        [x + 0.012, 0.024],
        [x - 0.012, 0.024],
      ],
      -0.0035,
      0.0035,
    );
  return finish(k, 0.4, 0.5);
}

// A throwing star: four points, blued, a boss round the middle hole; flat in the x-z plane
// (it spins about y), one unit across.
export function starShape() {
  const k = new Kit();
  const points = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? 0.13 : 0.5;
    // (Each point curved a little, as a shuriken's cutting edge is.)
    const skew = i % 2 ? 0.12 : 0;
    points.push([Math.cos(a + skew) * r, Math.sin(a + skew) * r]);
  }
  k.with(RX(Math.PI / 2), () => {
    k.paint(0x5c636b, ZONE.steel);
    k.plate(points, -0.018, 0.018);
    k.paint(0x121314, ZONE.rubber);
    k.disc(0, 0.055, { sides: 10 });
    for (const s of [-1, 1]) k.with(RY(s * Math.PI / 2), () => k.cylinder(0.018, 0.026, 0.1, 0.085, 10, { capStart: false }));
  });
  return finish(k, 0.42, 0.5);
}

// A throwing knife: a double-edged spear-point blade in satin steel and a tang wrapped in
// black cord; flat in the x-y plane (it tumbles about z).
export function knifeShape() {
  const k = new Kit();
  k.paint(0x7e8286, ZONE.steel);
  k.plate(
    [
      [0.5, 0],
      [0.16, 0.075],
      [-0.06, 0.066],
      [-0.06, -0.066],
      [0.16, -0.075],
    ],
    -0.012,
    0.012,
  );
  k.paint(0x151515, ZONE.fabric);
  k.box(-0.46, -0.06, -0.045, 0.045, -0.018, 0.018);
  k.paint(0x5e6266, ZONE.steel);
  k.box(-0.5, -0.46, -0.05, 0.05, -0.014, 0.014);
  return finish(k, 0.42, 0.5);
}

// A nail from the nail gun: a steel shank with a diamond point and a flat head.
export function nailShape() {
  const k = new Kit();
  k.paint(0x8d9094, ZONE.steel);
  k.cylinder(-0.48, 0.42, 0.03, 0.03, 6);
  k.lathe(
    [
      [0.42, 0.03],
      [0.5, 0],
    ],
    4,
  );
  k.cylinder(-0.5, -0.48, 0.075, 0.075, 8);
  return finish(k, 0.45, 0.6);
}

// ---- Bullets and pellets once spent, and the empty cases: one unit long, round the middle.

// A jacketed bullet, copper gone dull brown in the water.
export function bulletShape() {
  const k = new Kit();
  k.paint(0x8a5a32, ZONE.brass);
  k.lathe(
    [
      [-0.5, 0.15],
      [-0.47, 0.2],
      [0.02, 0.2],
      [0.22, 0.18],
      [0.36, 0.13],
      [0.46, 0.065],
      [0.5, 0],
    ],
    7,
  );
  return finish(k, 0.6, 0.6);
}
// A lead pellet (one across).
export function pelletShape() {
  const k = new Kit();
  k.paint(0x5d6064, ZONE.parker);
  k.sphere([0, 0, 0], 0.5, { wide: 6, high: 4 });
  return finish(k, 0.7);
}

// The empty cases: dull brass (a shotgun's shell red plastic on a brass head), a primer in the
// base, the mouth dark.
const CASE_BRASS = 0x9a7a3c;
function caseShape(profile, mouth, { hull = null, head = 0 } = {}) {
  const k = new Kit();
  k.paint(CASE_BRASS, ZONE.brass);
  if (hull) {
    // (The brass head up to `head`, the hull on it.)
    k.lathe(profile.filter(([x]) => x <= head), 8, { capEnd: false });
    k.paint(hull, ZONE.polymer);
    k.lathe(profile.filter(([x]) => x >= head), 8, { capStart: false, capEnd: false });
  } else k.lathe(profile, 8, { capEnd: false });
  k.paint(0x0c0a08, ZONE.rubber);
  k.disc(0.495, mouth, { sides: 8 });
  k.paint(0x7c7a74, ZONE.steel);
  k.disc(-0.5005, Math.min(0.08, profile[0][1] * 0.45), { sides: 6, facing: -1 });
  return finish(k, 0.55, 0.6);
}
export const CASES = {
  // 9 mm: short and straight.
  pistol: () =>
    caseShape(
      [
        [-0.5, 0.25],
        [-0.46, 0.265],
        [-0.42, 0.265],
        [-0.4, 0.21],
        [-0.36, 0.21],
        [-0.34, 0.26],
        [0.5, 0.25],
      ],
      0.22,
    ),
  // A rifle's, necked (7.62 mm).
  rifle: () =>
    caseShape(
      [
        [-0.5, 0.113],
        [-0.48, 0.118],
        [-0.45, 0.118],
        [-0.44, 0.098],
        [-0.41, 0.098],
        [-0.39, 0.118],
        [0.18, 0.112],
        [0.28, 0.09],
        [0.32, 0.085],
        [0.5, 0.085],
      ],
      0.07,
    ),
  // A fired shotgun shell: the crimp opened.
  shell: () =>
    caseShape(
      [
        [-0.5, 0.16],
        [-0.47, 0.162],
        [-0.46, 0.15],
        [-0.3, 0.15],
        [-0.29, 0.148],
        [0.45, 0.148],
        [0.5, 0.152],
      ],
      0.135,
      { hull: 0x7a1c16, head: -0.3 },
    ),
  // The big one (.50, and the elephant gun's).
  big: () =>
    caseShape(
      [
        [-0.5, 0.1],
        [-0.48, 0.104],
        [-0.45, 0.104],
        [-0.44, 0.085],
        [-0.41, 0.085],
        [-0.39, 0.104],
        [0.18, 0.098],
        [0.3, 0.07],
        [0.34, 0.068],
        [0.5, 0.068],
      ],
      0.055,
    ),
};

// A stretch of the harpoon's line: hemp, from x 0 to 1, one unit thick (scaled when placed).
export function lineShape() {
  const k = new Kit();
  k.paint(0x9a8058, ZONE.fabric);
  k.cylinder(0, 1, 0.5, 0.5, 5, { capStart: false, capEnd: false });
  return finish(k);
}

// (For the look's tests: every shape by name, and its triangles.)
export const SHAPES = { torpedo: torpedoShape, screw: torpedoScrewShape, rocket: rocketShape, mine: mineShape, harpoon: harpoonShape, ball: ballShape, bomb: bombShape, bolt: boltShape, spear: spearShape, star: starShape, knife: knifeShape, nail: nailShape, bullet: bulletShape, pellet: pelletShape, line: lineShape, ...Object.fromEntries(Object.entries(CASES).map(([name, make]) => [`case-${name}`, make])) };
