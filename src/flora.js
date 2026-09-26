import * as THREE from "three";
import { CUT, blade, paletteAt, stem, stemStrand } from "./render/foliage.js";
import { randomGenerator } from "./render/geometry.js";

// What grows in a northern river and the sea beyond it, built from the aquarium's blade
// and stem generators so it sways in the same current:
//
//   fontinalis moss      dark trailing tufts on the stones of the brook
//   water crowfoot       long green tresses streaming in the riffles, white flowers at the
//                        surface in summer
//   pondweed             stems of broad translucent leaves in the pools and slow reaches
//   sedges               tufts at the shallow margins, leaning out through the surface
//   reeds                stands of stems in the quiet water of the lower river and estuary
//   eelgrass             meadows of long ribbons on the estuary's sand
//   kelp                 forests of stiff stalks crowned with brown fronds on the sea's rocks
//   sugar kelp           single long wavy blades
//   green algae          fine threads streaming from the stones in the riffles
//   water starwort       slender stems with pale leaf pairs and floating rosettes
//   water-milfoil        green bottle brushes in the slack water
//   turf                 bulbous rush and moss low over the gravel
//   bank grass           hanging in from the banks, trailing downstream
//   fallen leaves        alder, birch and willow on the bed of the quiet water
//
// and, above the water, the forest along the banks, kept simple: it is seen only in a leap.

const TAU = Math.PI * 2;
const vec = (x, y, z) => new THREE.Vector3(x, y, z);
// A plant's own stream of numbers, for what it grows beyond what it has always drawn from the
// river's: seeded from where it stands (and what for), so the river's stream, and everything
// grown from it after this plant, is left as it was.
function plantRandom(x, z, salt) {
  let h = 2166136261;
  for (const v of [x, z, salt]) h = Math.imul(h ^ Math.round(v * 1000), 16777619) >>> 0;
  return randomGenerator(h % 2147483647 || 7);
}
// A number in [0, 1) from a place, for what a plant is without drawing on the river's stream.
const hash2 = (x, z) => {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

// Every generator takes `random`, a seeded source, so a stretch of river grows the same
// plants every time it is built.
function ranger(random) {
  return (a, b) => a + (b - a) * random();
}

// The colours of what grows under the water, by species, as a photograph of it would show
// them (sRGB, which THREE.Color turns into the linear values the renderer works in): young
// growth, the body of a leaf, and old tissue (the foot of a stem, the lower leaves), fouled
// and darkened. Weed in a clear northern river is olive to yellow-green, browner with age
// and with the film of diatoms and silt it gathers -- never the lime of a lawn -- and dark:
// a leaf body reflects a tenth to a sixth of the light, moss on a stone less. (The bodies
// sit a third above what a photograph gives: the light that comes through a thin leaf is
// added by its material, but a plant seen against the bright water would read black.)
const PALETTE = {};
function palette(name, young, body, old, gain = 1.35) {
  PALETTE[name] = { young: new THREE.Color(young).multiplyScalar(Math.min(gain, 1.15)), body: new THREE.Color(body).multiplyScalar(gain), old: new THREE.Color(old).multiplyScalar(gain) };
}
palette("crowfoot", "#7a9234", "#4b6128", "#3d4222");
palette("milfoil", "#6d7f35", "#4a5d2a", "#3a3a22");
palette("starwort", "#7a8e3a", "#58702e", "#46522a");
palette("starwortStem", "#6a8030", "#4e6428", "#3e4424");
palette("pondweed", "#76823a", "#5f6a2a", "#4a4026");
palette("pondweedRed", "#80603a", "#6a4a2a", "#4a3624");
palette("pondweedStem", "#627030", "#4e5626", "#3e3a22");
palette("fontinalis", "#3c4a1e", "#2b3318", "#232812", 1.5);
palette("cladophora", "#6f8f2a", "#5b6a2c", "#54492a");
palette("sedge", "#66743a", "#4e5a2e", "#4a4428");
palette("burReed", "#6a7c34", "#55652c", "#464626");
palette("eelgrass", "#55702e", "#3f5a24", "#3a3a20");
palette("kelp", "#6a5424", "#4a3a1a", "#3a2e16");
palette("sugarKelp", "#7a6428", "#5c4a20", "#463818");
palette("bladderwrack", "#6a6428", "#4e4a1e", "#3e3a1a");
palette("dulse", "#74302e", "#5a2426", "#4a1e20");
palette("lily", "#4f6a2c", "#3f5424", "#3a3a20");
palette("lilyStalk", "#6a6e34", "#56582c", "#464226");
palette("horsetail", "#6a7a32", "#56662a", "#3e4422");
palette("rush", "#76703a", "#5e5230", "#483c24");
palette("turfMoss", "#5e6e2c", "#48562a", "#3a3e22");

// A plant's own shade of its species' colours. The three numbers each plant has always drawn
// for its colour are still drawn, in the same order, so the river's stream runs on as it
// did; now they only move it a little off its palette: the hue by up to 0.02, the saturation
// by a tenth, the lightness by an eighth.
function tones(p, h, s, l) {
  const out = {};
  for (const k of ["young", "body", "old"]) {
    const c = p[k].clone().offsetHSL((h - 0.5) * 0.04, 0, 0);
    const grey = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const sat = 1 + (s - 0.5) * 0.2;
    out[k] = new THREE.Color(grey + (c.r - grey) * sat, grey + (c.g - grey) * sat, grey + (c.b - grey) * sat).multiplyScalar(1 + (l - 0.5) * 0.24);
  }
  return out;
}
// The age of a leaf on a stem from how far up the stem it grows: the lower third old, the top
// fifth young.
const ageUp = (t) => 0.95 - 0.85 * t * t * (3 - 2 * t);

// Fontinalis: short dark strands trailing downstream from a point on a stone.
// A dense tuft: a mound of short shoots round the point and the long ones trailing.
export function mossTuft(batch, at, flow, random, size = 1) {
  const range = ranger(random);
  const count = Math.floor(range(12, 22));
  const root = at.clone();
  const hue = random();
  for (let i = 0; i < count; i++) {
    const trailing = i % 3 === 0;
    const a = trailing ? flow + range(-0.5, 0.5) : range(0, TAU);
    const d = vec(Math.cos(a), 0, Math.sin(a));
    const length = (trailing ? range(0.6, 1.6) : range(0.25, 0.6)) * size;
    const base = at.clone().add(vec(range(-0.25, 0.25) * size, 0, range(-0.25, 0.25) * size));
    const points = [
      base,
      base.clone().addScaledVector(d, length * 0.35).add(vec(0, length * (trailing ? 0.18 : 0.5), 0)),
      base.clone().addScaledVector(d, length).add(vec(0, length * (trailing ? range(-0.15, 0.05) : range(0.2, 0.5)), 0)),
    ];
    const color = tones(PALETTE.fontinalis, (hue + random()) / 2, random(), random());
    blade(batch, points, range(0.05, 0.09) * size * 1.25, color, root, 1.1, { rows: trailing ? 5 : 3, cols: 1, ribbon: true, thin: 0.9, age: [0.9, 0.15], cut: CUT.SCALES });
  }
}

// Moss and weed hanging from the roof of a cave or an overhang: dark strands down from the
// rock, their ends drawn a little way downstream.
export function hangingMoss(batch, at, flow, random, size = 1) {
  const range = ranger(random);
  const count = Math.floor(range(8, 15));
  const hue = random();
  for (let i = 0; i < count; i++) {
    const a = flow + range(-0.6, 0.6);
    const d = vec(Math.cos(a), 0, Math.sin(a));
    const length = range(0.4, 1.5) * size;
    const base = at.clone().add(vec(range(-0.35, 0.35) * size, range(-0.05, 0.05), range(-0.35, 0.35) * size));
    const points = [base, base.clone().addScaledVector(d, length * 0.12).add(vec(0, -length * 0.5, 0)), base.clone().addScaledVector(d, length * 0.4).add(vec(0, -length, 0))];
    const color = tones(PALETTE.fontinalis, (hue + random()) / 2, random(), random());
    blade(batch, points, range(0.04, 0.08) * size * 1.25, color, at, 1.2, { rows: 4, cols: 1, ribbon: true, thin: 0.9, age: [0.9, 0.2], cut: CUT.SCALES });
  }
}

// White petals, as white as a petal is (not paper): lit through from above as well.
const PETAL = new THREE.Color(0.78, 0.78, 0.72);

// Water crowfoot (Ranunculus fluitans): a clump of long stems streaming low down the
// current, each bearing all along it tassels of thread-fine leaves; the stems nearest the
// surface flower there in summer.
//
// (Grown from the numbers it has always drawn from the river's stream -- a stem's length,
// rise, drift, foot and colour, and its blade's own two -- and, for all that is new, from a
// stream of its own. Half the stems are no longer grown, only drawn for.)
export function crowfoot(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const stream = plantRandom(x, z, 1);
  const own = ranger(stream);
  const depth = surface - ground;
  const root = vec(x, ground - 0.05, z);
  const count = Math.floor(range(18, 34));
  const d = vec(Math.cos(flow), 0, Math.sin(flow));
  const side = vec(-d.z, 0, d.x);
  const up = vec(0, 1, 0);
  const tips = [];
  for (let i = 0; i < count; i++) {
    const length = range(0.45, 1) * Math.min(28, depth * 2.6 + 6) * scale;
    const rise = Math.min(depth * range(0.55, 0.95), length * 0.45);
    const drift = range(-1, 1) * length * 0.08;
    const base = root.clone().addScaledVector(side, range(-0.4, 0.4)).addScaledVector(d, range(-0.3, 0.3));
    const color = tones(PALETTE.crowfoot, random(), random(), random());
    const grown = own(0, 1) < 0.5;
    // Streaming low: it rises to a height of its own and runs out along the current, the
    // whole of it lowered together if it would reach the surface (never point by point,
    // which put corners in it).
    const lift = Math.min(depth * 0.7, length * 0.3) * (0.6 + (0.4 * rise) / Math.max(1e-3, Math.min(depth * 0.95, length * 0.45)));
    const k = Math.min(1, (surface - 0.3 - base.y) / Math.max(1e-3, lift));
    const points = [
      base,
      base.clone().addScaledVector(d, length * 0.12).addScaledVector(up, lift * 0.5 * k),
      base.clone().addScaledVector(d, length * 0.5).addScaledVector(up, lift * 0.9 * k).addScaledVector(side, drift),
      base.clone().addScaledVector(d, length).addScaledVector(up, lift * k).addScaledVector(side, drift * 1.4),
    ];
    const rows = Math.min(20, Math.max(6, Math.round(length / 0.9)));
    // (The width once drawn for a ribbon is still drawn; a stem is narrower.)
    range(0.03, 0.07);
    const tress = blade(batch, points, 0.025 * scale, color, root, 1.3, { rows, cols: 1, ribbon: true, thin: 1, twist: flow + Math.PI / 2, age: [0.9, 0.1], emit: grown });
    if (!tress) continue;
    tips.push(points[3]);
    // The tassels: every metre or so along the stem, alternately to either side, each a
    // spray of threads streaming back along it.
    let flip = 1;
    for (let at = 0.12 * tress.length + own(0.3, 0.9) * scale; at < tress.length * 0.97; at += own(0.8, 1.3) * scale) {
      const t = at / tress.length;
      const node = tress.curve.getPoint(t);
      const { tangent, side: across, normal } = tress.frame(t);
      const long = own(0.6, 1.3) * scale * (0.6 + 0.4 * Math.sin(Math.PI * t));
      flip = -flip;
      const tip = node.clone().addScaledVector(tangent, long).addScaledVector(across, flip * 0.15 * long);
      const mid = node.clone().addScaledVector(tangent, long * 0.5).addScaledVector(across, flip * 0.08 * long);
      const old = 0.9 - 0.8 * t;
      blade(batch, [node, mid, tip], long * 0.25, color, root, 1.3, {
        rows: 3,
        cols: 1,
        thin: 1,
        twist: flow + Math.PI / 2,
        age: [old + 0.05, old - 0.1],
        cut: CUT.BRUSH,
        attached: { direction: normal, tangent, distance: at, compliance: 1.3 },
        random: stream,
      });
    }
  }
  // A few flowers held at the surface: five white petals round a yellow eye, over the tips
  // of the stems that come nearest to it. (Where they once stood is still drawn for.)
  tips.sort((a, b) => b.y - a.y);
  const flowers = Math.floor(range(0, 5));
  for (let k = 0; k < flowers; k++) {
    range(4, 14);
    range(-1.2, 1.2);
    const tip = tips[k];
    const near = tip && surface - tip.y < 1.6;
    const at = near ? tip.clone() : root.clone();
    at.y = surface - 0.03;
    if (near) stem(batch, [tip.clone(), tip.clone().lerp(at, 0.5).addScaledVector(d, 0.1), at.clone()], 0.012 * scale, PALETTE.crowfoot, root, 0.6, null, { rows: 3, age: [0.3, 0] });
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU + range(-0.1, 0.1);
      const petal = at.clone().add(vec(Math.cos(a) * 0.14, 0.01, Math.sin(a) * 0.14));
      const mid = at.clone().add(vec(Math.cos(a) * 0.08, 0.015, Math.sin(a) * 0.08));
      blade(batch, [at, mid, petal], 0.06, PETAL, root, 0.4, { rows: 2, cols: 2, thin: 1, emit: near });
    }
  }
}

// Pondweed: a stem up through the water column with broad, translucent, wavy leaves.
export function pondweed(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const stems = Math.floor(range(3, 7));
  const root = vec(x, ground - 0.05, z);
  const d = vec(Math.cos(flow), 0, Math.sin(flow));
  // (A plant in three is of the red-leaved kind, Potamogeton alpinus: from a hash of where it
  // stands, not a draw.)
  const red = hash2(x, z) < 0.3;
  for (let k = 0; k < stems; k++) {
    const height = Math.min(surface - ground - 0.3, range(6, 16) * scale);
    if (height < 1.5) continue;
    const lean = range(0.2, 0.5) * height;
    const base = root.clone().add(vec(range(-0.6, 0.6), 0, range(-0.6, 0.6)));
    const points = [
      base,
      base.clone().addScaledVector(d, lean * 0.2).add(vec(0, height * 0.4, 0)),
      base.clone().addScaledVector(d, lean * 0.6).add(vec(0, height * 0.78, 0)),
      base.clone().addScaledVector(d, lean).add(vec(0, height, 0)),
    ];
    const { curve, length } = stem(batch, points, 0.035 * scale, PALETTE.pondweedStem, root, 0.9);
    const nodes = Math.floor(length / (0.9 * scale));
    for (let n = 1; n <= nodes; n++) {
      const t = n / (nodes + 0.3);
      const node = curve.getPoint(t);
      const a = flow + (n % 2 ? 1 : -1) * range(0.5, 1.1);
      const out = vec(Math.cos(a), range(0.1, 0.35), Math.sin(a)).normalize();
      const leaf = range(1.1, 2.1) * scale * (0.6 + 0.4 * Math.sin(Math.PI * t));
      const tip = node.clone().addScaledVector(out, leaf);
      tip.addScaledVector(d, leaf * 0.35);
      const mid = node.clone().addScaledVector(out, leaf * 0.5).add(vec(0, leaf * 0.08, 0));
      const color = tones(red ? PALETTE.pondweedRed : PALETTE.pondweed, random(), random(), random());
      const old = ageUp(t);
      blade(batch, [node, mid, tip], range(0.18, 0.3) * scale, color, root, 0.8, { rows: 6, cols: 3, thin: 1, browning: random() < 0.2 ? 0.3 : 0, age: [old + 0.1, old - 0.15] });
    }
  }
}

// Sedges: a tuft of leaves from a shallow margin, arching out and up through the surface.
export function sedge(batch, x, z, ground, surface, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.03, z);
  const count = Math.floor(range(10, 20));
  for (let i = 0; i < count; i++) {
    const a = range(0, TAU);
    const h = range(5, 12) * scale;
    const out = range(0.8, 2.6) * scale;
    const dir = vec(Math.cos(a), 0, Math.sin(a));
    const points = [
      root.clone(),
      root.clone().addScaledVector(dir, out * 0.15).add(vec(0, h * 0.55, 0)),
      root.clone().addScaledVector(dir, out * 0.55).add(vec(0, h * 0.95, 0)),
      root.clone().addScaledVector(dir, out).add(vec(0, h * 0.8, 0)),
    ];
    const above = points[2].y > surface;
    // (Above the water it keeps the colour of the grass on the banks.)
    const color = above ? new THREE.Color().setHSL(range(0.18, 0.24), range(0.4, 0.6), range(0.25, 0.35)) : tones(PALETTE.sedge, random(), random(), random());
    blade(batch, points, range(0.05, 0.09) * scale, color, root, 0.25, { rows: 10, cols: 1, ribbon: true, thin: 0.7, browning: range(0, 0.3), age: [0.85, 0.2] });
  }
}

// Reeds: a stand of tall thin stems from the bed up past the surface, each tapering to a
// point under a feathery plume that hangs to one side, with long narrow leaves standing out
// from it and drooping at their tips, the lower ones already straw.
export function reeds(batch, x, z, ground, surface, random, scale = 1) {
  // (Grown from a stream of its own, after drawing from the river's as many numbers as the
  // plain stems it replaced did: the rest of the river grows as it always has.)
  const stems = Math.floor(18 + 22 * random());
  const seed = random();
  for (let i = 1; i < stems * 8; i++) random();
  random = randomGenerator(Math.floor(seed * 2147483647));
  const range = ranger(random);
  const count = Math.floor(range(22, 44));
  const root = vec(x, ground - 0.05, z);
  // The stand leans one way, as the wind has set it.
  const wind = range(0, TAU);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(random()) * 3.2 * scale;
    const a = range(0, TAU);
    const base = vec(x + Math.cos(a) * r, ground - 0.05, z + Math.sin(a) * r);
    const height = surface - base.y + range(3.5, 8) * scale;
    const lean = range(0.03, 0.12) * height;
    const way = wind + range(-0.6, 0.6);
    const d = vec(Math.cos(way), 0, Math.sin(way));
    const points = [base, base.clone().addScaledVector(d, lean * 0.15).add(vec(0, height * 0.5, 0)), base.clone().addScaledVector(d, lean).add(vec(0, height, 0))];
    const straw = random() < 0.25;
    const color = straw ? new THREE.Color().setHSL(range(0.1, 0.13), range(0.35, 0.5), range(0.42, 0.55)) : new THREE.Color().setHSL(range(0.17, 0.22), range(0.35, 0.5), range(0.26, 0.36));
    const { curve, length } = stem(batch, points, range(0.022, 0.034) * scale, color, root, 0.14, null, { taper: 0.94, rows: 16 });
    // Leaves from the nodes of the upper part, two ranks, standing out and bending over.
    const leaves = Math.floor(range(3, 6));
    for (let k = 0; k < leaves; k++) {
      const t = range(0.35, 0.85) * (0.8 + 0.2 * (k / leaves));
      const node = curve.getPoint(t);
      if (node.y < surface) continue;
      const side = way + (k % 2 ? 1 : -1) * range(1.2, 1.9);
      const out = vec(Math.cos(side), 0, Math.sin(side));
      const long = range(0.22, 0.4) * height;
      const mid = node.clone().addScaledVector(out, long * 0.45).add(vec(0, long * 0.35, 0));
      const tip = node.clone().addScaledVector(out, long).add(vec(0, long * range(0.05, 0.25), 0));
      const leaf = new THREE.Color().setHSL(range(0.18, 0.24), range(0.35, 0.55), range(0.3, 0.4));
      blade(batch, [node, mid, tip], range(0.06, 0.1) * scale, t < 0.5 && random() < 0.5 ? leaf.lerp(new THREE.Color(0.55, 0.47, 0.3), 0.7) : leaf, root, 0.3, {
        rows: 7,
        cols: 1,
        ribbon: true,
        thin: 0.8,
        twist: side + Math.PI / 2,
        browning: range(0.1, 0.35),
        attached: stemStrand(curve, t, length, 0.14),
        random,
      });
    }
    // The plume: soft brown-purple sprays hanging off the top.
    if (random() < 0.8) {
      const plume = new THREE.Color().setHSL(range(0.04, 0.09), range(0.2, 0.35), range(0.3, 0.42));
      const sprays = Math.floor(range(4, 7));
      for (let k = 0; k < sprays; k++) {
        const b = way + range(-0.9, 0.9);
        const o = vec(Math.cos(b), 0, Math.sin(b));
        const long = range(0.07, 0.13) * height;
        const from = curve.getPoint(1 - range(0, 0.06));
        const mid = from.clone().addScaledVector(o, long * 0.45).add(vec(0, long * 0.1, 0));
        const tip = from.clone().addScaledVector(o, long * 0.8).add(vec(0, -long * range(0.2, 0.5), 0));
        blade(batch, [from, mid, tip], range(0.09, 0.16) * scale, plume, root, 0.5, { rows: 5, cols: 2, thin: 1, attached: stemStrand(curve, 1, length, 0.14), random });
      }
    }
  }
}

// Eelgrass: a tuft of long bright ribbons.
export function eelgrass(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const count = Math.floor(range(4, 9));
  const root = vec(x, ground - 0.03, z);
  for (let i = 0; i < count; i++) {
    const a = flow + range(-0.8, 0.8);
    const dir = vec(Math.cos(a), 0, Math.sin(a));
    const length = range(3, 10) * scale;
    const h = Math.min(length * range(0.55, 0.8), surface - ground - 0.3);
    const points = [
      root.clone(),
      root.clone().addScaledVector(dir, length * 0.08).add(vec(0, h * 0.55, 0)),
      root.clone().addScaledVector(dir, length * 0.4).add(vec(0, h * 0.95, 0)),
      root.clone().addScaledVector(dir, length * 0.8).add(vec(0, h * 0.85, 0)),
    ];
    const color = tones(PALETTE.eelgrass, random(), random(), random());
    blade(batch, points, range(0.05, 0.09) * scale, color, root, 1.1, { rows: 14, cols: 1, ribbon: true, thin: 1, browning: random() < 0.3 ? range(0.1, 0.3) : 0, age: [0.7, 0.3] });
  }
}

// Kelp: a stiff stalk and a crown of brown straps.
export function kelp(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.05, z);
  const height = Math.min(surface - ground - 2, range(8, 18) * scale);
  if (height < 3) return;
  const d = vec(Math.cos(flow), 0, Math.sin(flow));
  const lean = range(0.05, 0.25) * height;
  const points = [
    root.clone(),
    root.clone().addScaledVector(d, lean * 0.3).add(vec(0, height * 0.5, 0)),
    root.clone().addScaledVector(d, lean).add(vec(0, height, 0)),
  ];
  const { curve } = stem(batch, points, range(0.1, 0.18) * scale, PALETTE.kelp, root, 0.25, null, { age: [1, 0.6] });
  const top = curve.getPoint(1);
  const straps = Math.floor(range(5, 10));
  for (let i = 0; i < straps; i++) {
    const a = flow + range(-1.2, 1.2);
    const dir = vec(Math.cos(a), 0, Math.sin(a));
    const length = range(4, 11) * scale;
    const p = [
      top.clone(),
      top.clone().addScaledVector(dir, length * 0.3).add(vec(0, length * 0.25, 0)),
      top.clone().addScaledVector(dir, length * 0.7).add(vec(0, length * 0.2, 0)),
      top.clone().addScaledVector(dir, length).add(vec(0, length * range(-0.05, 0.15), 0)),
    ];
    for (const q of p) q.y = Math.min(q.y, surface - 0.3);
    // (A kelp blade grows from its foot: the tip is the oldest part, worn and paler.)
    const color = tones(PALETTE.kelp, random(), random(), random());
    blade(batch, p, range(0.35, 0.7) * scale, color, root, 1.0, { rows: 12, cols: 3, ribbon: true, thin: 0.9, twist: a + Math.PI / 2, age: [0.6, 0] });
  }
}

// Sugar kelp: one long crinkled blade on a short stalk.
export function sugarKelp(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.05, z);
  const a = flow + range(-0.6, 0.6);
  const dir = vec(Math.cos(a), 0, Math.sin(a));
  const length = range(10, 22) * scale;
  const h = Math.min(surface - ground - 0.5, length * range(0.3, 0.6));
  const p = [
    root.clone(),
    root.clone().addScaledVector(dir, length * 0.1).add(vec(0, h * 0.6, 0)),
    root.clone().addScaledVector(dir, length * 0.5).add(vec(0, h, 0)),
    root.clone().addScaledVector(dir, length).add(vec(0, h * 0.7, 0)),
  ];
  const color = tones(PALETTE.sugarKelp, random(), random(), random());
  blade(batch, p, range(0.8, 1.3) * scale, color, root, 1.0, { rows: 22, cols: 4, ribbon: true, thin: 1, twist: a + Math.PI / 2, age: [0.3, 0.8] });
}

// ---------------------------------------------------------------------------------------
// Five more of the river's and the shore's plants.

// A floating leaf: a flat round pad with its notch, the rim turned up a little, lying on
// the surface; it hardly sways, only rides the ripples. From below it is a dark disc against
// the light, veined, reddish where the sun comes through.
function pad(batch, centre, radius, notch, color, root, random) {
  const range = ranger(random);
  const rings = 3,
    segments = 16;
  const start = batch.positions.length / 3;
  const strand = { direction: vec(0, 1, 0), tangent: vec(1, 0, 0), distance: 0.2, compliance: 0.05 };
  const gap = 0.32;
  for (let r = 0; r <= rings; r++) {
    const f = r / rings;
    for (let k = 0; k <= segments; k++) {
      const a = notch + gap / 2 + (k / segments) * (TAU - gap);
      const rr = radius * f * (1 + 0.04 * Math.sin(a * 5 + radius));
      const p = centre.clone().add(vec(Math.cos(a) * rr, 0.08 * f * f * radius * 0.4, Math.sin(a) * rr));
      const c = color.clone().multiplyScalar(0.82 + 0.25 * f + 0.06 * Math.sin(a * 11));
      batch.vertex(p, [k / segments, f], c, root, strand, 0.45);
      if (r < rings && k < segments) {
        const i = start + r * (segments + 1) + k;
        batch.quad(i, i + 1, i + segments + 1, i + segments + 2);
      }
    }
  }
  void range;
}

// The yellow water-lily: pads on the slack water of the pools and the lower river, each on
// its long stalk from the mud; lettuce-like leaves under water at the foot; a yellow cup of
// a flower held just above the surface in summer.
export function waterLily(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.05, z);
  const depth = surface - ground;
  if (depth < 1.2) return;
  const stalk = PALETTE.lilyStalk;
  const pads = Math.floor(range(3, 7));
  for (let k = 0; k < pads; k++) {
    const a = range(0, TAU);
    const out = range(0.5, 2.5) * scale + depth * 0.25;
    const at = vec(x + Math.cos(a) * out, surface - 0.02, z + Math.sin(a) * out);
    const mid = root.clone().lerp(at, 0.5).add(vec(range(-0.4, 0.4), 0, range(-0.4, 0.4)));
    stem(batch, [root.clone(), mid, at.clone().add(vec(0, -0.05, 0))], 0.035 * scale, stalk, root, 0.35);
    const green = paletteAt(tones(PALETTE.lily, random(), random(), random()), 0.5);
    if (random() < 0.2) green.lerp(new THREE.Color("#6a5424"), 0.5);
    pad(batch, at, range(1.1, 2.1) * scale, range(0, TAU), green, root, random);
  }
  // The submerged leaves: thin, wavy, pale.
  for (let k = 0; k < 4; k++) {
    const a = range(0, TAU);
    const dir = vec(Math.cos(a), 0, Math.sin(a));
    const length = Math.min(depth * 0.6, range(1.2, 2.4) * scale);
    const tip = root.clone().addScaledVector(dir, length * 0.8).add(vec(0, length * 0.7, 0));
    blade(batch, [root.clone(), root.clone().addScaledVector(dir, length * 0.3).add(vec(0, length * 0.4, 0)), tip], range(0.5, 0.8) * scale, PALETTE.starwort, root, 0.9, { rows: 8, cols: 4, thin: 1, age: [0.8, 0.2] });
  }
  // A flower or two: five yellow sepals cupped round the centre, just clear of the water.
  const flowers = random() < 0.6 ? Math.floor(range(1, 3)) : 0;
  for (let k = 0; k < flowers; k++) {
    const a = range(0, TAU);
    const out = range(0.3, 1.8) * scale;
    const at = vec(x + Math.cos(a) * out, surface + 0.35 * scale, z + Math.sin(a) * out);
    stem(batch, [root.clone(), root.clone().lerp(at, 0.5), at], 0.03 * scale, stalk, root, 0.3);
    const yellow = new THREE.Color("#d8b028");
    for (let q = 0; q < 5; q++) {
      const b = (q / 5) * TAU + range(-0.1, 0.1);
      const dir = vec(Math.cos(b), 0, Math.sin(b));
      const r = 0.3 * scale;
      blade(batch, [at.clone(), at.clone().addScaledVector(dir, r * 0.7).add(vec(0, r * 0.45, 0)), at.clone().addScaledVector(dir, r * 0.9).add(vec(0, r * 1.1, 0))], r * 0.55, yellow, root, 0.2, { rows: 4, cols: 2, thin: 0.6, twist: b + Math.PI / 2 });
    }
  }
}

// Bladderwrack: olive-brown fronds forking again and again from a holdfast on the rocks of
// the shore, a pair of air bladders at each fork, lifting them toward the light.
export function bladderwrack(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.03, z);
  const olive = tones(PALETTE.bladderwrack, random(), random(), random());
  const bladder = paletteAt(olive, 0.3).multiplyScalar(1.2);
  const fork = (from, dir, length, depth) => {
    const to = from.clone().addScaledVector(dir, length);
    to.y = Math.min(to.y, surface - 0.2);
    const mid = from.clone().lerp(to, 0.5).add(vec(0, length * 0.05, 0));
    // (Older toward the holdfast, the growing tips the youngest.)
    const shade = range(0.85, 1.15);
    const c = {};
    for (const k in olive) c[k] = olive[k].clone().multiplyScalar(shade);
    blade(batch, [from, mid, to], length * 0.18 * scale, c, root, 0.7, { rows: 4, cols: 2, thin: 0.8, twist: Math.atan2(dir.z, dir.x) + Math.PI / 2, age: [0.35 + 0.2 * depth, 0.2 + 0.2 * depth] });
    if (depth > 0) {
      // The bladders, a pair of small swellings just below the fork.
      for (const side of [-1, 1]) {
        const at = from.clone().lerp(to, 0.8).add(vec(-dir.z * side * length * 0.08, 0, dir.x * side * length * 0.08));
        blade(batch, [at.clone().addScaledVector(dir, -length * 0.07), at, at.clone().addScaledVector(dir, length * 0.07)], length * 0.09, bladder, root, 0.7, { rows: 3, cols: 2, thin: 0.5 });
      }
      for (const turn of [-0.45, 0.45]) {
        const d = dir.clone().applyAxisAngle(vec(0, 1, 0), turn + range(-0.15, 0.15)).add(vec(0, range(0.05, 0.25), 0)).normalize();
        fork(to, d, length * range(0.7, 0.85), depth - 1);
      }
    }
  };
  const fronds = Math.floor(range(4, 7));
  for (let k = 0; k < fronds; k++) {
    const a = flow + range(-1.4, 1.4);
    const dir = vec(Math.cos(a), range(0.5, 1.1), Math.sin(a)).normalize();
    fork(root.clone(), dir, range(1.4, 2.4) * scale, 3);
  }
}

// Dulse and other red weeds: frilled wine-red blades in the shade of the kelp.
export function redWeed(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.03, z);
  const count = Math.floor(range(4, 8));
  for (let i = 0; i < count; i++) {
    const a = flow + range(-1.5, 1.5);
    const dir = vec(Math.cos(a), 0, Math.sin(a));
    const length = range(1.5, 4) * scale;
    const h = Math.min(surface - ground - 0.4, length * range(0.5, 0.9));
    const points = [root.clone(), root.clone().addScaledVector(dir, length * 0.2).add(vec(0, h * 0.6, 0)), root.clone().addScaledVector(dir, length * 0.6).add(vec(0, h, 0)), root.clone().addScaledVector(dir, length).add(vec(0, h * 0.8, 0))];
    const color = tones(PALETTE.dulse, random(), random(), random());
    blade(batch, points, range(0.35, 0.6) * scale, color, root, 1.0, { rows: 10, cols: 3, ribbon: true, thin: 1, twist: a + Math.PI / 2, age: [0.8, 0.2] });
  }
}

// Water horsetail: a stand of hollow jointed stems in the shallows of the brook, dark
// bands at the joints, straight up through the surface.
export function horsetail(batch, x, z, ground, surface, random, scale = 1) {
  const range = ranger(random);
  const count = Math.floor(range(10, 22));
  const root = vec(x, ground - 0.05, z);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(random()) * 1.8 * scale;
    const a = range(0, TAU);
    const base = vec(x + Math.cos(a) * r, ground - 0.05, z + Math.sin(a) * r);
    const top = Math.max(surface + range(1, 6) * scale, ground + range(3, 8) * scale);
    const lean = vec(range(-1, 1), 0, range(-1, 1)).multiplyScalar(0.3);
    const joints = Math.max(3, Math.floor((top - base.y) / (0.9 * scale)));
    let from = base;
    for (let j = 1; j <= joints; j++) {
      const t = j / joints;
      const to = base.clone().add(vec(lean.x * t, (top - base.y) * t, lean.z * t));
      const c = paletteAt(PALETTE.horsetail, 1 - t, new THREE.Color()).offsetHSL(j % 2 ? (random() - 0.5) * 0.04 : 0, 0, 0).multiplyScalar(j % 2 ? 1 : 0.85);
      // (A joint is straight: two rings of it are as good as nine.)
      stem(batch, [from, from.clone().lerp(to, 0.9), to], 0.045 * scale, c, root, 0.12, null, { rows: 2 });
      from = to;
    }
  }
}

// Bur-reed: long soft ribbons rising from the bed of the slow river and trailing out
// along the surface downstream.
export function burReed(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.03, z);
  const count = Math.floor(range(5, 10));
  const depth = surface - ground;
  for (let i = 0; i < count; i++) {
    const a = flow + range(-0.4, 0.4);
    const dir = vec(Math.cos(a), 0, Math.sin(a));
    const float = range(3, 9) * scale;
    const points = [root.clone(), root.clone().addScaledVector(dir, depth * 0.3).add(vec(0, depth * 0.6, 0)), root.clone().addScaledVector(dir, depth * 0.7 + float * 0.3).add(vec(0, depth - 0.08, 0)), root.clone().addScaledVector(dir, depth * 0.7 + float).add(vec(0, depth - 0.05, 0))];
    const color = tones(PALETTE.burReed, random(), random(), random());
    blade(batch, points, range(0.1, 0.16) * scale, color, root, 1.1, { rows: 16, cols: 1, ribbon: true, thin: 1, twist: a + Math.PI / 2, browning: random() < 0.3 ? 0.25 : 0, age: [0.8, 0.2] });
  }
}

// ---------------------------------------------------------------------------------------
// The small green life of a clear northern river, what makes it a garden and not a
// quarry: filamentous algae streaming from the stones in the riffles, water starwort and
// alternate water-milfoil in the slack water, low turf of bulbous rush and moss over the
// gravel, grass and sedge hanging in from the banks, and the leaves the trees drop.

// Filamentous green algae (Cladophora): fine bright threads streaming from a stone.
export function algae(batch, at, flow, random, size = 1) {
  const range = ranger(random);
  const count = Math.floor(range(7, 14));
  for (let i = 0; i < count; i++) {
    const a = flow + range(-0.35, 0.35);
    const d = vec(Math.cos(a), 0, Math.sin(a));
    const length = range(0.8, 2.6) * size;
    const base = at.clone().add(vec(range(-0.2, 0.2) * size, range(-0.05, 0.05), range(-0.2, 0.2) * size));
    const points = [
      base,
      base.clone().addScaledVector(d, length * 0.3).add(vec(0, length * 0.08, 0)),
      base.clone().addScaledVector(d, length).add(vec(0, length * range(-0.12, 0.04), 0)),
    ];
    const color = tones(PALETTE.cladophora, random(), random(), random());
    blade(batch, points, range(0.018, 0.035) * size * 2, color, at, 1.4, { rows: 6, cols: 1, ribbon: true, thin: 1, browning: random() < 0.25 ? 0.25 : 0, age: [1, 0], cut: CUT.BRUSH });
  }
}

// Water starwort (Callitriche): slender stems rising and leaning with the current, pairs of
// small pale leaves at each node, and where a stem reaches the surface a floating rosette.
export function starwort(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.03, z);
  const d = vec(Math.cos(flow), 0, Math.sin(flow));
  const stems = Math.floor(range(8, 16));
  const depth = surface - ground;
  for (let k = 0; k < stems; k++) {
    const height = Math.min(depth - 0.08, range(1.2, 4.5) * scale);
    if (height < 0.4) continue;
    const base = root.clone().add(vec(range(-0.5, 0.5) * scale, 0, range(-0.5, 0.5) * scale));
    const lean = range(0.2, 0.7) * height;
    const points = [
      base,
      base.clone().addScaledVector(d, lean * 0.25).add(vec(0, height * 0.5, 0)),
      base.clone().addScaledVector(d, lean * 0.7).add(vec(0, height * 0.88, 0)),
      base.clone().addScaledVector(d, lean).add(vec(0, height, 0)),
    ];
    const stemColor = tones(PALETTE.starwortStem, random(), 0.5, 0.5);
    blade(batch, points, 0.04 * scale, stemColor, root, 1, { rows: 6, cols: 1, ribbon: true, thin: 1, age: [0.9, 0.1] });
    const curve = new THREE.CubicBezierCurve3(...points);
    const nodes = Math.max(2, Math.floor(height / (0.45 * scale)));
    const leafColor = tones(PALETTE.starwort, random(), random(), random());
    for (let n = 1; n <= nodes; n++) {
      const node = curve.getPoint(n / (nodes + 0.5));
      const a0 = range(0, TAU);
      for (const side of [0, Math.PI]) {
        const a = a0 + side;
        const leaf = range(0.25, 0.45) * scale;
        const tip = node.clone().add(vec(Math.cos(a) * leaf, leaf * 0.35, Math.sin(a) * leaf)).addScaledVector(d, leaf * 0.3);
        const mid = node.clone().lerp(tip, 0.5).add(vec(0, leaf * 0.12, 0));
        const old = ageUp(n / (nodes + 0.5));
        blade(batch, [node, mid, tip], 0.14 * scale, leafColor, root, 0.9, { rows: 2, cols: 1, thin: 1, age: [old + 0.1, old - 0.1] });
      }
    }
    // The rosette on the surface.
    if (height > depth - 0.4) {
      const top = points[3].clone();
      top.y = surface - 0.04;
      const leaves = Math.floor(range(6, 10));
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * TAU + range(-0.2, 0.2);
        const leaf = range(0.3, 0.5) * scale;
        const tip = top.clone().add(vec(Math.cos(a) * leaf, 0.01, Math.sin(a) * leaf));
        const mid = top.clone().lerp(tip, 0.5).add(vec(0, 0.02, 0));
        blade(batch, [top, mid, tip], 0.2 * scale, leafColor, root, 0.5, { rows: 2, cols: 1, thin: 1, age: [0.15, 0] });
      }
    }
  }
}

// Alternate water-milfoil (Myriophyllum alterniflorum), the milfoil of clear, soft northern
// water: stems with whorls of fine, feathery leaves, like green bottle brushes.
export function milfoil(batch, x, z, ground, surface, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.03, z);
  const d = vec(Math.cos(flow), 0, Math.sin(flow));
  const stems = Math.floor(range(5, 10));
  const depth = surface - ground;
  for (let k = 0; k < stems; k++) {
    const height = Math.min(depth - 0.2, range(2, 7) * scale);
    if (height < 0.8) continue;
    const base = root.clone().add(vec(range(-0.6, 0.6) * scale, 0, range(-0.6, 0.6) * scale));
    const lean = range(0.3, 0.8) * height;
    const points = [
      base,
      base.clone().addScaledVector(d, lean * 0.2).add(vec(0, height * 0.45, 0)),
      base.clone().addScaledVector(d, lean * 0.65).add(vec(0, height * 0.85, 0)),
      base.clone().addScaledVector(d, lean).add(vec(0, height, 0)),
    ];
    const green = tones(PALETTE.milfoil, random(), random(), random());
    blade(batch, points, 0.045 * scale, green, root, 1.1, { rows: 7, cols: 1, ribbon: true, thin: 1, age: [1, 0.3] });
    const curve = new THREE.CubicBezierCurve3(...points);
    const whorls = Math.max(3, Math.floor(height / (0.28 * scale)));
    for (let n = 1; n <= whorls; n++) {
      const t = n / (whorls + 0.3);
      const node = curve.getPoint(t);
      const a0 = range(0, TAU);
      const leaf = range(0.35, 0.6) * scale * (1 - 0.35 * t);
      const old = ageUp(t);
      for (let i = 0; i < 4; i++) {
        const a = a0 + (i / 4) * TAU;
        const tip = node.clone().add(vec(Math.cos(a) * leaf, leaf * 0.45, Math.sin(a) * leaf)).addScaledVector(d, leaf * 0.4);
        blade(batch, [node, node.clone().lerp(tip, 0.5).add(vec(0, leaf * 0.1, 0)), tip], 0.17 * scale, green, root, 1, { rows: 2, cols: 1, thin: 1, age: [old + 0.05, old - 0.1], cut: CUT.FEATHER });
      }
    }
  }
}

// A tuft of the low turf over the gravel: bulbous rush, reddish-green in soft water, or a
// cushion of moss, a handful of short blades. (Fewer and broader than they once were: of the
// blades it has always drawn for, the first half or so is grown, the rest kept only as the
// numbers they drew. It casts no shadow worth its cost.)
export function turfTuft(batch, x, z, ground, flow, random, scale = 1, hue = 0.22) {
  const range = ranger(random);
  const root = vec(x, ground - 0.02, z);
  const count = Math.floor(range(5, 9));
  const grown = Math.ceil(count * 0.45);
  for (let i = 0; i < count; i++) {
    const a = flow + range(-1.6, 1.6);
    const dir = vec(Math.cos(a), 0, Math.sin(a));
    const h = range(0.35, 1.3) * scale;
    const out = range(0.15, 0.6) * scale;
    const points = [root.clone(), root.clone().addScaledVector(dir, out * 0.3).add(vec(0, h * 0.7, 0)), root.clone().addScaledVector(dir, out).add(vec(0, h, 0))];
    // (The hue it was given picks the kind: reddish rush below 0.2, olive moss above.)
    const color = tones(hue < 0.2 ? PALETTE.rush : PALETTE.turfMoss, random(), random(), random());
    blade(batch, points, range(0.05, 0.1) * scale * 2, color, root, 0.8, { rows: 3, cols: 1, ribbon: true, thin: 0.8, browning: random() < 0.3 ? range(0.2, 0.5) : 0, age: [0.9, 0.3], emit: i < grown, low: true, cut: CUT.BRUSH });
  }
}

// Grass and sedge from the bank, arching out over the water and hanging into it, the ends
// trailing downstream.
export function bankGrass(batch, x, z, ground, surface, out, flow, random, scale = 1) {
  const range = ranger(random);
  const root = vec(x, ground - 0.02, z);
  const d = vec(Math.cos(flow), 0, Math.sin(flow));
  const count = Math.floor(range(8, 16));
  for (let i = 0; i < count; i++) {
    const a = Math.atan2(out.z, out.x) + range(-0.7, 0.7);
    const dir = vec(Math.cos(a), 0, Math.sin(a));
    const reach = range(1.2, 3.5) * scale;
    const rise = range(0.5, 1.6) * scale;
    const hang = range(0.2, 1.2) * scale;
    const p1 = root.clone().addScaledVector(dir, reach * 0.3).add(vec(0, rise, 0));
    const p2 = root.clone().addScaledVector(dir, reach * 0.75).add(vec(0, rise * 0.7, 0));
    const p3 = root.clone().addScaledVector(dir, reach).addScaledVector(d, hang * 0.8);
    p3.y = Math.min(p2.y, surface - hang);
    const wet = p3.y < surface;
    // (The part hanging in the water takes the colours of the sedge under it.)
    const color = wet ? paletteAt(tones(PALETTE.sedge, random(), random(), random()), 0.5) : new THREE.Color().setHSL(range(0.18, 0.25), range(0.4, 0.6), range(0.22, 0.32));
    blade(batch, [root.clone(), p1, p2, p3], range(0.04, 0.08) * scale, color, root, 0.5, { rows: 8, cols: 1, ribbon: true, thin: 0.7, browning: range(0, 0.35) });
  }
}

// A fallen leaf on the bed: alder, birch or willow, soaked dark -- brown and rust, the odd
// one still a dull yellow. Leaf-shaped (pointed at both ends, widest a little below the
// middle, the edges curling up), and opaque: a leaf lying on the stones is not lit through.
const LEAF_COLORS = [
  [0.07, 0.45, 0.1],
  [0.08, 0.5, 0.13],
  [0.1, 0.5, 0.16],
  [0.05, 0.4, 0.08],
  [0.12, 0.42, 0.14],
];
export function fallenLeaf(batch, x, z, ground, random, scale = 1) {
  const range = ranger(random);
  const a = range(0, TAU);
  const length = range(0.35, 0.7) * scale;
  const dir = vec(Math.cos(a), 0, Math.sin(a));
  const base = vec(x, ground + 0.02, z);
  const tip = base.clone().addScaledVector(dir, length);
  const mid = base.clone().lerp(tip, 0.5).add(vec(0, range(0.005, 0.03), 0));
  const [h, sat, l] = LEAF_COLORS[Math.floor(random() * LEAF_COLORS.length)];
  const color = new THREE.Color().setHSL(h + range(-0.01, 0.01), sat, l * range(0.6, 0.85));
  // Laid flat: its width across the direction it points, never along it.
  blade(batch, [base, mid, tip], length * range(0.28, 0.4), color, base, 0.02, { rows: 6, cols: 2, thin: 0.12, twist: a + Math.PI / 2, cut: CUT.BEDLEAF, low: true });
}

// A spray of living leaves on the end of a branch that hangs over the water: alder and
// willow, some of it dipping under the surface.
export function leafSpray(batch, at, random, scale = 1) {
  const range = ranger(random);
  const count = Math.floor(range(10, 16));
  const hue = range(0.24, 0.3);
  for (let i = 0; i < count; i++) {
    const a = range(0, TAU);
    const dir = vec(Math.cos(a), range(-0.6, 0.3), Math.sin(a)).normalize();
    const length = range(0.7, 1.3) * scale;
    const base = at.clone().add(vec(range(-0.6, 0.6), range(-0.4, 0.3), range(-0.6, 0.6)).multiplyScalar(scale));
    const tip = base.clone().addScaledVector(dir, length);
    const mid = base.clone().lerp(tip, 0.5).add(vec(0, length * 0.08, 0));
    const color = new THREE.Color().setHSL(hue + range(-0.02, 0.02), range(0.4, 0.6), range(0.16, 0.26));
    blade(batch, [base, mid, tip], length * range(0.3, 0.42), color, at, 0.35, { rows: 5, cols: 2, thin: 0.8, twist: a + Math.PI / 2 });
  }
}

// ---------------------------------------------------------------------------------------
// The forest above the banks: spruce, pine and birch, each a handful of simple solids.
export class SolidBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
  }
  add(geometry, matrix, color, shade = null) {
    const g = geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const offset = this.positions.length / 3;
    const p = new THREE.Vector3(),
      n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
      const k = shade ? shade(p, n, i) : 1;
      this.colors.push(color.r * k, color.g * k, color.b * k);
    }
    const index = g.index;
    if (index) for (let i = 0; i < index.count; i++) this.indices.push(offset + index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.indices.push(offset + i);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    return g;
  }
  get empty() {
    return this.positions.length === 0;
  }
}

