// The enemy system: everything that attacks the salmon. Each enemy is a plain record with an
// id and an owner (the player whose game runs it: always the local one alone, one of the
// players in co-op), hit points, and a small plan of attack (kinds.js). They are drawn with
// the base game's own fish bodies, one instanced crowd per kind, created before the first
// frame so their materials are compiled with everything else.
//
// A beaten enemy rolls onto its back and drifts up, belly first, as dead fish do -- limp,
// not swimming; it drifts on the surface with the current a while and then goes. A small one can be eaten there.

import * as THREE from "three";
import { attribute, uniform, vec3 } from "three/tsl";
import { MODEL_LENGTH, createFishMesh } from "../anatomy.js";
import { bed, clamp, current, level, locate, place, regionWeights, section } from "../course.js";
import { creatureMaterial, gannetGeometry, heronHeadGeometry, heronLegsGeometry, kingfisherGeometry, merganserGeometry } from "../creatures.js";
import { SolidBatch } from "../flora.js";
import { waterLit } from "../render/water.js";
import { KINDS } from "./kinds.js";

// The pieces the stand-in bodies below are put together from (as creatures.js builds its).
const PART = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  cone: new THREE.ConeGeometry(1, 1, 10).translate(0, 0.5, 0),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0),
};
function put(batch, geometry, [x, y, z], [sx, sy, sz], color, rotation = null) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rotation ? new THREE.Quaternion().setFromEuler(rotation) : new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  batch.add(geometry, m, new THREE.Color(...color));
}

// The gannet gliding, its wings spread: white, the wings long, narrow and pointed, with
// black hands; the head washed buff-yellow, the dark bare skin round the eye, the long
// pale dagger of a bill. Beak first along +x, as long as the base game's plunging gannet
// (9 units, 90 cm), twice that across the wings.
function gannetGlideGeometry() {
  const b = new SolidBatch();
  const white = [0.93, 0.93, 0.9];
  const black = [0.06, 0.06, 0.07];
  put(b, PART.sphere, [0, 0, 0], [3.1, 0.72, 0.8], white);
  put(b, PART.sphere, [2.7, 0.1, 0], [1.1, 0.5, 0.48], white);
  put(b, PART.sphere, [3.3, 0.18, 0], [0.62, 0.44, 0.42], [0.9, 0.78, 0.45]);
  for (const z of [-0.3, 0.3]) put(b, PART.sphere, [3.55, 0.27, z], [0.13, 0.07, 0.05], [0.08, 0.08, 0.1]);
  put(b, PART.cone, [3.8, 0.12, 0], [0.2, 1.4, 0.16], [0.62, 0.66, 0.72], new THREE.Euler(0, 0, -Math.PI / 2));
  put(b, PART.cone, [-2.6, 0.05, 0], [0.45, 1.7, 0.16], white, new THREE.Euler(0, 0, Math.PI / 2));
  // Each wing: the arm out from the shoulder, the hand swept a little back from the wrist,
  // its long black primaries to a point (each piece well into the next, so that the wing
  // reads as one).
  for (const side of [-1, 1]) {
    put(b, PART.sphere, [0.25, 0.25, side * 2.3], [1.05, 0.1, 2.6], white, new THREE.Euler(0, -side * 0.05, 0));
    put(b, PART.sphere, [-0.1, 0.28, side * 5.2], [0.8, 0.09, 2.7], white, new THREE.Euler(0, -side * 0.14, 0));
    put(b, PART.sphere, [-0.7, 0.3, side * 7.4], [0.48, 0.08, 1.6], black, new THREE.Euler(0, -side * 0.22, 0));
  }
  return b.geometry();
}

// The birds' stand-in bodies: the base game's own models (creatures.js), until the look
// gives them models of their own. Each is laid along +x, beak first.
// (The heron's are its legs with the body high above them, standing on the bed, and its
// neck and head apart, which move. The gannet has its own, spread for the glide, and the
// base game's, the wings swept back, for the plunge.)
const BIRD_MODELS = { kingfisher: kingfisherGeometry, merganser: merganserGeometry, heron: heronLegsGeometry, gannet: gannetGlideGeometry };
const PLUNGE_MODELS = { gannet: gannetGeometry };

// The jellyfish's stand-in, one unit tall (scaled to its size), its bell up along +y: a
// glassy bell, milky, with the brown marks of a compass jellyfish, its tentacles hanging
// from the margin and four frilled arms from the middle, all in one translucent geometry
// (`alpha` how much of the light it stops, `glow` how much it glows, per vertex); and apart
// from it the sea mine strapped under the bell, a dark iron ball with its horns, hung on
// three straps from inside the bell. From the top of the bell to the bottom of the mine is a
// little under a unit, as long as the line a shot tests an enemy's body along.
function jellyGeometry() {
  const positions = [],
    normals = [],
    colors = [],
    alphas = [],
    glows = [],
    indices = [];
  const vertex = (x, y, z, nx, ny, nz, color, alpha, glow) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(...color);
    alphas.push(alpha);
    glows.push(glow);
    return positions.length / 3 - 1;
  };
  // The bell: rings from the top down to the margin, which flares out a little.
  const rings = 9,
    segments = 32;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const r = 0.36 * Math.sin(t * Math.PI * 0.5) + 0.02 * t * t * t;
      const y = 0.1 + 0.32 * Math.cos(t * Math.PI * 0.5);
      const n = new THREE.Vector3(Math.cos(a) * r, (y - 0.02) * 1.6, Math.sin(a) * r).normalize();
      const mark = Math.pow(Math.abs(Math.cos(a * 8)), 12) * Math.sin(t * Math.PI) > 0.35;
      vertex(Math.cos(a) * r, y, Math.sin(a) * r, n.x, n.y, n.z, mark ? [0.42, 0.26, 0.2] : [0.74, 0.79, 0.8], 0.16 + 0.3 * t * t, 0.1 + 0.9 * t * t * t);
      if (i < rings && j < segments) {
        const k = i * (segments + 1) + j;
        indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
      }
    }
  }
  // A strand hanging from (x0, z0): a ribbon facing out from the middle, narrowing and
  // waving a little as it goes down.
  const strand = (x0, y0, z0, length, width, color, alpha, glow, wave, steps = 10) => {
    const out = Math.hypot(x0, z0) > 1e-3 ? [x0 / Math.hypot(x0, z0), z0 / Math.hypot(x0, z0)] : [1, 0];
    const across = [-out[1], out[0]];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const sway = wave * Math.sin(t * 7 + x0 * 13) * t;
      const w = width * (1 - 0.75 * t);
      const x = x0 + out[0] * sway,
        z = z0 + out[1] * sway;
      for (const side of [-1, 1]) vertex(x + across[0] * side * w, y0 - length * t, z + across[1] * side * w, out[0], 0, out[1], color, alpha * (1 - 0.6 * t), glow * (1 - 0.5 * t));
      if (s < steps) {
        const k = positions.length / 3 - 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  };
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + 0.1;
    strand(Math.cos(a) * 0.37, 0.1, Math.sin(a) * 0.37, 0.75 + 0.3 * ((k * 0.618) % 1), 0.014, [0.7, 0.72, 0.74], 0.5, 0.9, 0.05);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    strand(Math.cos(a) * 0.05, 0.12, Math.sin(a) * 0.05, 0.62, 0.06, [0.62, 0.42, 0.4], 0.42, 0.4, 0.07, 14);
  }
  const bell = new THREE.BufferGeometry();
  bell.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  bell.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  bell.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  bell.setAttribute("alpha", new THREE.Float32BufferAttribute(alphas, 1));
  bell.setAttribute("glow", new THREE.Float32BufferAttribute(glows, 1));
  bell.setIndex(indices);
  // The mine: an iron ball with a lifting eye, its horns all round, a rusted seam, and the
  // three straps up into the bell (inside the margin, so a beat does not pull it off them).
  const b = new SolidBatch();
  const iron = [0.07, 0.075, 0.07];
  put(b, PART.sphere, [0, -0.28, 0], [0.13, 0.13, 0.13], iron);
  put(b, PART.sphere, [0, -0.28, 0], [0.136, 0.018, 0.136], [0.2, 0.09, 0.04]);
  put(b, PART.cylinder, [0, -0.16, 0], [0.025, 0.04, 0.025], iron);
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 10; k++) {
    // (Six round the upper half, three round the lower, one at the bottom.)
    const lat = k < 6 ? 0.45 : k < 9 ? -0.5 : -Math.PI / 2;
    const lon = (k < 6 ? k / 6 : (k - 6) / 3 + 0.17) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, -0.28, 0).addScaledVector(dir, 0.11), new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(0.022, 0.08, 0.022));
    b.add(PART.cone, m, new THREE.Color(0.2, 0.2, 0.19));
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const from = new THREE.Vector3(Math.cos(a) * 0.06, -0.19, Math.sin(a) * 0.06);
    const to = new THREE.Vector3(Math.cos(a) * 0.17, 0.15, Math.sin(a) * 0.17);
    const along = to.clone().sub(from);
    const m = new THREE.Matrix4().compose(from, new THREE.Quaternion().setFromUnitVectors(up, along.clone().normalize()), new THREE.Vector3(0.005, along.length(), 0.005));
    b.add(PART.cylinder, m, new THREE.Color(0.3, 0.27, 0.2));
  }
  return { bell, mine: b.geometry() };
}

// A bomb's stand-in, nose first along +x, a unit long: an olive-drab body with a rounded
// nose, a tapered tail and its four fins.
function bombGeometry() {
  const b = new SolidBatch();
  const drab = [0.16, 0.17, 0.1];
  put(b, PART.cylinder, [-0.3, 0, 0], [0.13, 0.55, 0.13], drab, new THREE.Euler(0, 0, -Math.PI / 2));
  put(b, PART.sphere, [0.25, 0, 0], [0.22, 0.13, 0.13], drab);
  put(b, PART.cone, [-0.3, 0, 0], [0.13, 0.25, 0.13], drab, new THREE.Euler(0, 0, Math.PI / 2));
  put(b, PART.sphere, [0.05, 0, 0], [0.02, 0.135, 0.135], [0.5, 0.42, 0.08]);
  // (Two thin plates crossed: four fins.)
  for (let k = 0; k < 2; k++) put(b, PART.sphere, [-0.45, 0, 0], [0.1, 0.012, 0.18], [0.12, 0.13, 0.08], new THREE.Euler(k * (Math.PI / 2), 0, 0));
  return b.geometry();
}
// What pulls a bomb down through the air (as the weapons' shells, u/s²), and in the water,
// where against the water's drag it sinks at a few units a second.
const GRAVITY = 98;
const SINKING = 12;

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);
const ACROSS = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;
// How long a dead enemy stays before it goes (the look fades it out on the same beat).
export const CORPSE_SECONDS = 40;
// How far (u) the salmon may get from an ambusher, or every salmon from a jellyfish, before
// it gives up its place and is gone.
const LEFT_BEHIND = 120;
// How far (u) a bird that has given up flies off before it is gone.
const GONE = 90;

export function createEnemies(scene, { random }) {
  const crowds = {};
  // The birds: one instanced mesh a kind (what the look will replace), and how long the
  // model is at scale 1 and how far its beak reaches ahead of its origin.
  const birds = {};
  const birdMaterial = creatureMaterial();
  for (const [kind, spec] of Object.entries(KINDS)) {
    if (spec.render !== "bird") continue;
    const geometry = BIRD_MODELS[spec.model]();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const mesh = new THREE.InstancedMesh(geometry, birdMaterial, spec.capacity);
    mesh.name = `Combat ${kind}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    // (On the ordinary layer, as the base game's kingfisher: over the water it is seen from
    // below only through the window in the surface, and that draws layer 0 alone.)
    mesh.visible = false;
    scene.add(mesh);
    birds[kind] = { mesh, length: box.max.x - box.min.x, beak: box.max.x, middle: 0.5 * (box.max.x + box.min.x) };
    // (A second model for the plunge, drawn instead of the first while it dives.)
    if (PLUNGE_MODELS[spec.model]) {
      const plunging = PLUNGE_MODELS[spec.model]();
      plunging.computeBoundingBox();
      const edge = plunging.boundingBox;
      const plunge = new THREE.InstancedMesh(plunging, birdMaterial, spec.capacity);
      plunge.name = `Combat ${kind} plunge`;
      plunge.count = 0;
      plunge.frustumCulled = false;
      plunge.visible = false;
      scene.add(plunge);
      birds[kind].plunge = { mesh: plunge, length: edge.max.x - edge.min.x, beak: edge.max.x, middle: 0.5 * (edge.max.x + edge.min.x) };
    }
    if (spec.wades) {
      const head = new THREE.InstancedMesh(heronHeadGeometry(), birdMaterial, spec.capacity);
      head.name = `Combat ${kind} head`;
      head.count = 0;
      head.frustumCulled = false;
      head.visible = false;
      scene.add(head);
      birds[kind].head = head;
    }
  }
  // The jellyfish: the beating bell with what hangs from it, glassy and drawn after what is
  // behind it, and the mine under it, one instanced mesh each (until the look gives them
  // models of their own), under the water with the fish on layer 1. The bell glows faintly,
  // a cold blue-green, stronger at night (night()): that is how they show in the dark sea.
  const jellies = {};
  const glow = uniform(0.03);
  let jellyParts = null;
  for (const [kind, spec] of Object.entries(KINDS)) {
    if (spec.render !== "jelly") continue;
    jellyParts ??= jellyGeometry();
    const bellMaterial = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.3, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    bellMaterial.opacityNode = attribute("alpha", "float");
    bellMaterial.emissiveNode = vec3(0.12, 0.55, 0.62).mul(attribute("glow", "float")).mul(glow);
    const bell = new THREE.InstancedMesh(jellyParts.bell, waterLit(bellMaterial), spec.capacity);
    bell.renderOrder = 1;
    const mine = new THREE.InstancedMesh(jellyParts.mine, waterLit(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 })), spec.capacity);
    for (const [mesh, part] of [
      [bell, "bell"],
      [mine, "mine"],
    ]) {
      mesh.name = `Combat ${kind} ${part}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.layers.set(1);
      scene.add(mesh);
    }
    jellies[kind] = { bell, mine };
  }
  // The bombs as they fall and sink: one mesh in the air, where the window in the surface
  // must show them, and one under the water (layer 1, as the fish), so that neither the
  // mirror nor the window draws a sunken one again.
  const bombShape = bombGeometry();
  const bombMaterial = waterLit(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
  const bombMeshes = [0, 1].map((layer) => {
    const mesh = new THREE.InstancedMesh(bombShape, bombMaterial, 16);
    mesh.name = layer ? "Combat bombs under water" : "Combat bombs";
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.layers.set(layer);
    scene.add(mesh);
    return mesh;
  });
  // (The meshes of their own, shown only while they have something to draw.)
  const ownMeshes = [...bombMeshes];
  for (const kind in birds) ownMeshes.push(...[birds[kind].mesh, birds[kind].head, birds[kind].plunge?.mesh].filter(Boolean));
  for (const kind in jellies) ownMeshes.push(jellies[kind].bell, jellies[kind].mine);
  for (const [kind, spec] of Object.entries(KINDS)) {
    // (The birds and the jellyfish have no fish body.)
    if (!spec.body) continue;
    // With the distance detail (anatomy.js): enemies out of view are not drawn, and far ones
    // are drawn with the light body.
    crowds[kind] = createFishMesh(scene, spec.body, spec.coat, spec.capacity, { name: `Combat ${kind}`, castShadow: false, detail: 0.55, lod: true });
    // On layer 1 with the effects: the main view sees them, the mirror and the Snell's
    // window (which only show what is above the water) do not draw them again.
    const far = crowds[kind].far;
    for (const mesh of [crowds[kind].body, crowds[kind].membranes, far?.mesh ?? far]) mesh?.layers?.set(1);
  }
  const list = [];
  // The bombs let go by the birds that bomb, falling or sinking (fall()).
  const bombs = [];
  // The kinds whose strike missed in this step (for the whiff the game plays).
  const whiffs = [];
  let nextId = 1;
  // The game's clock at the last update (for when an enemy was last hit).
  let clockNow = 0;

  // Scratch.
  const to = new THREE.Vector3();
  const want = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const mouth = new THREE.Vector3();
  const flow = { vx: 0, vy: 0, vz: 0 };
  const axisY = new THREE.Vector3();
  const axisZ = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const pitchAxis = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const spot = {};
  const where = { s: null, u: 0 };
  const range = (a, b) => a + (b - a) * random();

  function count(kind) {
    let n = 0;
    for (const e of list) if (e.kind === kind && !e.neutral) n++;
    return n;
  }

  // A new enemy at river place (s, u), height y (null: mid-water, or on the bed for kinds
  // that keep to it). Returns it, or null when the kind's crowd is full.
  // Where a wading bird can stand at river place s: in the shallows toward one bank (the
  // side of u first), 1.5 to 4.5 units deep, as the base game's heron does; null if nowhere.
  function shallows(s, u) {
    const c = section(s);
    const first = u >= c.thalweg ? 1 : -1;
    for (const side of [first, -first])
      for (let a = 0.6; a < 1.05; a += 0.05) {
        const v = c.thalweg + side * a * c.half;
        const depth = level(s) - bed(s, v);
        if (depth > 1.5 && depth < 4.5) return v;
      }
    return null;
  }

  function spawn(kind, s, u, y = null, { owner = 0, heading = null } = {}) {
    const spec = KINDS[kind];
    if (!spec || count(kind) >= spec.capacity) return null;
    if (spec.wades) {
      const v = shallows(s, u);
      if (v === null) return null;
      u = v;
    }
    place(s, u, spot);
    const size = range(spec.size[0], spec.size[1]);
    const floor = bed(s, u);
    const top = level(s);
    if (top - floor < size * 0.5) return null;
    // (A bird comes in over the water, whatever height it is asked for.)
    const height = spec.flies ? top + spec.height * range(1, 1.3) : y ?? (spec.bottom ? floor + size * 0.12 : floor + (top - floor) * range(0.3, 0.7));
    const e = {
      id: nextId++,
      kind,
      spec,
      owner,
      size,
      hp: spec.hp * api.hpScale,
      maxHp: spec.hp * api.hpScale,
      position: new THREE.Vector3(spot.x, height, spot.z),
      velocity: new THREE.Vector3(),
      heading: heading ? heading.clone().normalize() : new THREE.Vector3(Math.cos(random() * TAU), 0, Math.sin(random() * TAU)),
      speed: 0,
      river: { s, u },
      mode: spec.behaviour === "ambush" ? "lurk" : spec.flies ? "circle" : spec.behaviour === "drifter" ? "drift" : "approach",
      t: 0,
      target: null,
      phase: random() * TAU,
      finPhase: random() * TAU,
      gape: 0,
      strikeDir: new THREE.Vector3(),
      orbit: random() < 0.5 ? 1 : -1,
      nextDart: range(1.2, 2.8),
      // (A diver's pause over the water between two dives.)
      rest: range(1, 2.5),
      stagger: 0,
      dead: false,
      rolled: 0,
      corpse: 0,
      lastHitBy: -1,
    };
    if (spec.wades) {
      // Where it stands, which way it faces, where its head is (and its gun), and its legs in
      // the water as its body for a hit: upright from the bed.
      e.stand = new THREE.Vector3(spot.x, floor, spot.z);
      e.facing = new THREE.Vector3(e.heading.x, 0, e.heading.z).normalize();
      e.muzzle = new THREE.Vector3(spot.x, top + spec.head, spot.z);
      e.aimDir = new THREE.Vector3(0, -1, 0);
      e.heading.set(0, 1, 0);
      e.position.set(spot.x, floor + 0.5 * size, spot.z);
      e.mode = "stand";
    }
    // (A jellyfish hangs bell up; its body, for a hit, is the line down from bell to mine.)
    if (spec.behaviour === "drifter") e.heading.set(0, 1, 0);
    list.push(e);
    return e;
  }

  // A fish of the base game's shoals (life.js), peaceful, stood in for here so that shots
  // can find it (neutrals.js): the record shares its position and heading (the shoal moves
  // it and draws it); it is not moved, drawn or counted here. Struck, it becomes an enemy of
  // `kind` of its own (convert).
  function adopt(kind, member, group) {
    const spec = KINDS[kind];
    if (!spec) return null;
    const mean = 0.5 * (spec.size[0] + spec.size[1]);
    const e = {
      id: nextId++,
      kind,
      spec,
      owner: 0,
      size: member.size,
      hp: spec.hp * api.hpScale * (member.size / mean),
      maxHp: spec.hp * api.hpScale * (member.size / mean),
      position: member.position,
      velocity: member.velocity ?? new THREE.Vector3(),
      heading: member.heading,
      speed: 0,
      river: { s: null, u: 0 },
      mode: "neutral",
      t: 0,
      target: null,
      phase: member.phase ?? 0,
      finPhase: member.finPhase ?? 0,
      gape: 0,
      strikeDir: new THREE.Vector3(),
      orbit: random() < 0.5 ? 1 : -1,
      nextDart: range(1.2, 2.8),
      rest: 0,
      stagger: 0,
      dead: false,
      rolled: 0,
      corpse: 0,
      lastHitBy: -1,
      neutral: member,
      group,
    };
    locate(e.position.x, e.position.z, null, e.river);
    list.push(e);
    return e;
  }
  // The stand-in becomes an enemy of its own: its own position from now on (the shoal's
  // record goes back to the shoal), drawn by its kind's crowd; `passive`, it only flees.
  function convert(e, { passive }) {
    e.position = e.position.clone();
    e.heading = e.heading.clone();
    e.velocity = e.velocity.clone();
    e.speed = e.velocity.length();
    e.neutral = null;
    e.group = null;
    e.passive = passive;
    e.mode = passive ? "flee" : "approach";
    e.t = 0;
    locate(e.position.x, e.position.z, e.river.s, e.river);
  }
  // Gone from the list without a trace (a stand-in whose shoal fish is gone).
  function forget(e) {
    const i = list.indexOf(e);
    if (i >= 0) list.splice(i, 1);
  }

  // The nearest player an enemy can go for (not dead, not taken, not in the air).
  function pick(e, players) {
    let best = null,
      bestD = Infinity;
    for (const p of players) {
      if (!p.fish || p.down) continue;
      const d = p.fish.position.distanceToSquared(e.position);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // How much river place s is a kind's own water, by its regions (kinds.js), as the
  // director weighs it when it sends one.
  const weights = {};
  function waters(spec, s) {
    regionWeights(s, weights);
    let w = 0;
    for (const region in spec.regions) w += spec.regions[region] * (weights[region] ?? 0);
    return w;
  }

  // Turn toward `dir` at up to `rate` radians a second, climbing or diving at most `steepest`
  // radians (a larva swimming up at its prey may go steeper than a fish).
  function steer(e, dir, rate, dt, steepest = e.climbing ? 1.1 : 0.6) {
    tmp.copy(dir);
    if (tmp.lengthSq() < 1e-8) return;
    tmp.normalize();
    const flat = Math.hypot(tmp.x, tmp.z);
    const pitch = clamp(Math.atan2(tmp.y, flat), -steepest, steepest);
    if (flat > 1e-6) {
      const k = Math.cos(pitch) / flat;
      tmp.set(tmp.x * k, Math.sin(pitch), tmp.z * k);
    } else tmp.set(Math.cos(pitch), Math.sin(pitch), 0);
    const cos = clamp(e.heading.dot(tmp), -1, 1);
    const angle = Math.acos(cos);
    if (angle < 1e-4) return void e.heading.copy(tmp);
    const step = rate * dt;
    if (cos < -0.95) e.heading.applyAxisAngle(UP, step);
    else e.heading.lerp(tmp, Math.min(1, step / angle));
    e.heading.normalize();
  }

  // Where to aim a strike at a fish that keeps swimming: ahead of it by the time it takes.
  function lead(e, fish, speed, out) {
    const d = fish.position.distanceTo(e.position);
    const t = Math.min(1.2, d / Math.max(1, speed));
    return out.copy(fish.position).addScaledVector(fish.velocity, t).sub(e.position);
  }

  function snout(e, out) {
    // (A bird standing in the water shoots from its head, high over the surface.)
    if (e.muzzle) return out.copy(e.muzzle);
    return out.copy(e.heading).multiplyScalar((0.35 / MODEL_LENGTH) * e.size).add(e.position);
  }

  // How many of the enemies after one player are drawing up or striking just now: a pack
  // takes turns.
  function striking(p) {
    let n = 0;
    for (const e of list) if (!e.dead && e.target === p && (e.mode === "coil" || e.mode === "strike")) n++;
    return n;
  }

  function beginStrike(e, fish) {
    e.mode = "strike";
    e.t = 0;
    lead(e, fish, e.spec.strike, e.strikeDir);
    // Long enough to get there, and a little past.
    e.strikeTime = Math.min(1.1, e.strikeDir.length() / e.spec.strike + 0.2);
    e.strikeDir.normalize();
  }

  // A diving bird (the kingfisher): it flies over the water, keeping above the salmon a few
  // lengths up; when it has it below and not too deep, it stops and hovers there, beak down
  // (the tell), and then plunges beak first along a line to where the salmon will be, the
  // water braking it once it is in; a hit or not, it climbs out and back up, and after a
  // moment over the water goes again. It moves itself: no current carries it in the air.
  const flight = new THREE.Vector3();
  function dive(e, dt, time, players, hooks) {
    const spec = e.spec;
    const p = pick(e, players);
    e.target = p;
    e.t += dt;
    locate(e.position.x, e.position.z, e.river.s, e.river);
    const top = level(e.river.s);
    const high = top + spec.height;
    const fish = p?.fish;
    const L = fish?.length ?? 1;
    const reachable = !!fish && !fish.safe && !fish.captive && !fish.airborne && top - fish.position.y < spec.depth + 0.5 * L;
    let speed = 0;
    switch (e.mode) {
      case "circle": {
        // Over the water: ahead of the salmon and a little to one side, then round it.
        if (!fish) {
          flight.set(e.heading.x, 0, e.heading.z);
          speed = spec.cruise * 0.5;
          break;
        }
        want.copy(fish.position).addScaledVector(fish.velocity, 0.6);
        want.x += e.orbit * 1.2 * Math.cos(time * 0.7 + e.phase);
        want.z += e.orbit * 1.2 * Math.sin(time * 0.7 + e.phase);
        want.y = high;
        flight.subVectors(want, e.position);
        const flat = Math.hypot(flight.x, flight.z);
        speed = flat > 3 ? spec.chase : spec.cruise * Math.min(1, flat / 3 + 0.2);
        if (reachable && flat < 2 && e.t > e.rest && striking(p) < 3) {
          e.mode = "coil";
          e.t = 0;
        }
        break;
      }
      case "coil": {
        // Hovering above where the salmon will be, beak down: the tell.
        if (!reachable) {
          e.mode = "circle";
          e.t = 0;
          break;
        }
        want.copy(fish.position).addScaledVector(fish.velocity, 0.4);
        want.y = top + spec.height * 0.8;
        flight.subVectors(want, e.position);
        speed = Math.min(spec.cruise, flight.length() * 3);
        // (Its beak follows the salmon: the heading is also the line of its body for a hit.)
        tmp.subVectors(fish.position, e.position).normalize();
        e.heading.lerp(tmp, Math.min(1, dt * 8)).normalize();
        if (e.t > spec.coil) {
          e.mode = "strike";
          e.t = 0;
          lead(e, fish, spec.strike, e.strikeDir);
          e.strikeTime = Math.min(1.2, e.strikeDir.length() / spec.strike + 0.3);
          e.strikeDir.normalize();
        }
        e.position.addScaledVector(flight.normalize(), speed * dt);
        return;
      }
      case "strike": {
        // The plunge: fast through the air, braked by the water once it is in (over some
        // tenths of a second, as a kingfisher's dive carries it a body length or two down),
        // ending at its depth.
        const wet = e.position.y < top;
        if (wet && !e.splashed) {
          e.splashed = true;
          e.inAt = e.t;
          hooks.splash?.(e);
        }
        speed = spec.strike * (wet ? Math.max(0.3, 1 - (e.t - e.inAt) * 1.6) : 1);
        e.heading.copy(e.strikeDir);
        e.position.addScaledVector(e.strikeDir, speed * dt);
        tmp.copy(e.heading).multiplyScalar(e.beak ?? 0.5 * e.size).add(e.position);
        const reach = 0.12 + 0.3 * L + 0.05 * e.size;
        if (reachable && tmp.distanceTo(fish.position) < reach) {
          hooks.hurt(p, e);
          e.mode = "recover";
          e.t = 0;
        } else if (e.t > e.strikeTime || e.position.y < top - spec.depth) {
          if (fish) whiffs.push(e.kind);
          e.mode = "recover";
          e.t = 0;
        }
        return;
      }
      case "recover": {
        // Out of the water and back up, away a little.
        flight.set(-e.strikeDir.x, 0, -e.strikeDir.z);
        if (flight.lengthSq() < 1e-6) flight.set(e.orbit, 0, 0);
        flight.normalize().multiplyScalar(0.5);
        flight.y = 1;
        speed = spec.cruise * (e.position.y < top ? 0.6 : 1);
        if (e.position.y > top + spec.height * 0.8) {
          e.mode = "circle";
          e.t = 0;
          e.rest = range(1.5, 3.5);
          e.splashed = false;
        }
        break;
      }
      default:
        e.mode = "circle";
    }
    // In the air: along the way it wants, easing to its height.
    if (flight.lengthSq() > 1e-8) {
      flight.normalize();
      e.heading.lerp(flight, Math.min(1, dt * spec.turn)).normalize();
    }
    e.position.addScaledVector(e.heading, speed * dt);
    if (e.mode === "circle") e.position.y += (high - e.position.y) * (1 - Math.exp(-dt * 2));
  }

  // A wading bird (the heron): it stands in the shallows and does not move, turning slowly
  // to face the salmon; its head is high over the water, and from there it aims its harpoon
  // gun down into the river (the tell), fires once and reloads. It gives up and goes when
  // the salmon is far away along the river.
  function wade(e, dt, time, players, hooks) {
    const spec = e.spec;
    const gun = spec.weapon;
    const p = pick(e, players);
    e.target = p;
    e.t += dt;
    e.reload = Math.max(0, (e.reload ?? 0) - dt);
    const top = level(e.river.s);
    // (Its legs stay where they stand, whatever a shot or a blast did to them.)
    e.position.set(e.stand.x, e.stand.y + 0.5 * e.size, e.stand.z);
    if (!p || Math.abs(p.fish.river.s - e.river.s) > 150) {
      e.leave = true;
      return;
    }
    const fish = p.fish;
    tmp.set(fish.position.x - e.stand.x, 0, fish.position.z - e.stand.z);
    const flat = tmp.length();
    if (flat > 1e-4) {
      tmp.divideScalar(flat);
      e.facing.lerp(tmp, Math.min(1, dt * spec.turn)).normalize();
    }
    e.muzzle.set(e.stand.x + e.facing.x * 2, top + spec.head, e.stand.z + e.facing.z * 2);
    const untouchable = fish.safe || fish.captive || fish.airborne;
    // Where to aim: ahead of the salmon by the harpoon's time to it.
    const aim = () => {
      const d = fish.position.distanceTo(e.muzzle);
      return want.copy(fish.position).addScaledVector(fish.velocity, Math.min(1.5, d / gun.speed)).sub(e.muzzle).normalize();
    };
    switch (e.mode) {
      case "stand":
        e.aimDir.lerp(tmp.set(e.facing.x * 0.3, -1, e.facing.z * 0.3).normalize(), Math.min(1, dt * 3)).normalize();
        if (!untouchable && flat < gun.range[1] && flat > gun.range[0] && e.reload <= 0 && striking(p) < 3) {
          e.mode = "aim";
          e.t = 0;
        }
        break;
      case "aim":
        e.aimDir.lerp(aim(), Math.min(1, dt * 6)).normalize();
        if (untouchable || flat > gun.range[1] * 1.3) {
          e.mode = "stand";
          e.reload = 1;
        } else if (e.t > gun.tell) {
          e.mode = "fire";
          e.t = gun.interval;
          e.shots = gun.burst;
        }
        break;
      case "fire":
        e.aimDir.copy(aim());
        if (e.t >= gun.interval && e.shots > 0) {
          e.t = 0;
          e.shots--;
          e.firedAt = time;
          hooks.shoot?.(e, e.aimDir, gun);
        }
        if (e.shots <= 0 && e.t >= gun.interval) {
          e.reload = gun.reload;
          e.mode = "stand";
          e.t = 0;
        }
        break;
      default:
        // (Stunned, or anything else: back to standing.)
        e.mode = "stand";
    }
  }

  // The closest two segments a0-a1 and b0-b1 come to each other.
  const gapU = new THREE.Vector3(),
    gapV = new THREE.Vector3(),
    gapW = new THREE.Vector3();
  function gap(a0, a1, b0, b1) {
    gapU.subVectors(a1, a0);
    gapV.subVectors(b1, b0);
    gapW.subVectors(a0, b0);
    const a = gapU.dot(gapU),
      b = gapU.dot(gapV),
      c = gapV.dot(gapV),
      d = gapU.dot(gapW),
      f = gapV.dot(gapW);
    const den = a * c - b * b;
    let s = den > 1e-9 ? clamp((b * f - c * d) / den, 0, 1) : 0;
    let t = c > 1e-9 ? (b * s + f) / c : 0;
    if (t < 0) {
      t = 0;
      s = a > 1e-9 ? clamp(-d / a, 0, 1) : 0;
    } else if (t > 1) {
      t = 1;
      s = a > 1e-9 ? clamp((b - d) / a, 0, 1) : 0;
    }
    return gapW.addScaledVector(gapU, s).addScaledVector(gapV, -t).length();
  }

  // A drifting jellyfish. It goes with the water -- the current along the estuary, hardly
  // any in the open sea -- each beat of its bell lifting it a little and the water letting
  // it sink back between; within its sight of the salmon it steers itself toward it, very
  // slowly, and so drifts up or down toward its depth as well. It has no strike: its mine
  // goes off when the salmon's body touches the bell or the mine (hooks.touch), and combat
  // does the rest. (Stunned, or held back after the salmon died, it only drifts.)
  const bellTop = new THREE.Vector3(),
    mineFoot = new THREE.Vector3(),
    fishTail = new THREE.Vector3(),
    fishHead = new THREE.Vector3();
  function drifting(e, dt, time, players, hooks) {
    const spec = e.spec;
    const p = pick(e, players);
    e.target = p;
    e.t += dt;
    if (e.mode !== "drift" && e.t >= 0) {
      e.mode = "drift";
      e.t = 0;
    }
    e.phase = (e.phase + dt * TAU * spec.beat) % TAU;
    const beat = Math.pow(Math.max(0, Math.sin(e.phase)), 3);
    const fish = p?.fish;
    // (Left far behind -- it cannot follow -- it drifts out of the story.)
    if (fish && fish.position.distanceToSquared(e.position) > LEFT_BEHIND * LEFT_BEHIND) {
      e.leave = true;
      return;
    }
    const untouchable = !fish || fish.safe || fish.captive || fish.airborne;
    want.set(0, 0, 0);
    if (!untouchable && e.mode === "drift") {
      to.subVectors(fish.position, e.position);
      const d = to.length();
      if (d < spec.sight && d > 1e-3) want.copy(to).multiplyScalar(spec.cruise / d);
    }
    current(e.river.s, e.river.u, e.position.y, flow, time, true);
    e.velocity.set(flow.vx + want.x, spec.lift * beat - spec.sink + want.y, flow.vz + want.z);
    e.position.addScaledVector(e.velocity, dt);
    locate(e.position.x, e.position.z, e.river.s, e.river);
    let floor = bed(e.river.s, e.river.u);
    const top = level(e.river.s);
    if (top - floor < e.size * 1.2) {
      // Too shallow: it stays where it was, and the water goes on past it.
      e.position.x -= e.velocity.x * dt;
      e.position.z -= e.velocity.z * dt;
      locate(e.position.x, e.position.z, e.river.s, e.river);
      floor = bed(e.river.s, e.river.u);
    }
    e.position.y = clamp(e.position.y, floor + e.size * 0.55, Math.max(floor + e.size * 0.55, top - e.size * 0.45));
    // Leaning a little the way the water takes it, bell first.
    e.heading.set(e.velocity.x * 0.15, 1, e.velocity.z * 0.15).normalize();
    e.speed = Math.hypot(e.velocity.x, e.velocity.z);
    // A touch: a salmon's body, tail to head, against the line down through the bell and
    // the mine, as near as the bell is wide. (Any salmon's, not only the one it drifts
    // toward: in co-op another may brush past it while a nearer one is out of reach.)
    bellTop.copy(e.position).addScaledVector(e.heading, 0.4 * e.size);
    mineFoot.copy(e.position).addScaledVector(e.heading, -0.4 * e.size);
    for (const q of players) {
      const f = q.fish;
      if (!f || q.down || f.safe || f.captive || f.airborne) continue;
      const L = f.length;
      fishTail.copy(f.position).addScaledVector(f.heading, -0.5 * L);
      fishHead.copy(f.position).addScaledVector(f.heading, 0.44 * L);
      if (gap(fishTail, fishHead, bellTop, mineFoot) < spec.weapon.trigger + 0.08 * L + 0.16 * e.size) {
        hooks.touch?.(e, q);
        return;
      }
    }
  }

  // A bird that bombs from high up (the gannet). It circles over the water well above what
  // the salmon's weapons reach, the circle drawn round where the salmon is going. Loaded,
  // with the salmon in the water below, its circle tightens and it tips over into a steep
  // bank (the tell); then it plunges along a line to just over where the salmon will be,
  // lets its bombs go there, pulls out low -- for a moment in reach of the salmon's weapons
  // -- and climbs away at a slant, and comes round again once it has loaded anew. It banks
  // into its turns (e.bank, for pose). No current carries it in the air. It is a bird of the
  // sea: once the salmon has gone on up the river, out of its waters, it gives up, flies off
  // and is gone when it is far from every salmon (as the heron goes).
  function bomber(e, dt, time, players, hooks) {
    const spec = e.spec;
    const gun = spec.weapon;
    const p = pick(e, players);
    e.target = p;
    e.t += dt;
    e.reload = Math.max(0, (e.reload ?? 0) - dt);
    locate(e.position.x, e.position.z, e.river.s, e.river);
    const top = level(e.river.s);
    const high = top + spec.height;
    const fish = p?.fish;
    const reachable = !!fish && !fish.safe && !fish.captive && !fish.airborne && fish.position.y < top && top - fish.position.y < gun.depth;
    let speed = spec.cruise,
      rate = spec.turn,
      bank = 0;
    // Its bombs, from under one wing and the other by turns, one each `interval` from the
    // first (all at once with none), wherever it is by then.
    while (e.dropping > 0 && time >= e.dropAt) {
      release(e, gun, top, e.dropping % 2 ? 1 : -1);
      e.dropping--;
      e.dropAt += gun.interval;
    }
    switch (e.mode) {
      case "circle": {
        // The middle of its circle: over where the salmon is going; with none, a point to
        // one side of it (it flies on, turning gently).
        if (fish) want.copy(fish.position).addScaledVector(fish.velocity, 1.2);
        else want.copy(e.position).addScaledVector(tmp.set(-e.heading.z * e.orbit, 0, e.heading.x * e.orbit), spec.radius * 3);
        tmp.set(e.position.x - want.x, 0, e.position.z - want.z);
        const out = tmp.length();
        if (out > 1e-3) tmp.divideScalar(out);
        else tmp.set(1, 0, 0);
        // Round it the way it turns, drawn in or let out to the radius.
        flight.set(-tmp.z * e.orbit, 0, tmp.x * e.orbit).addScaledVector(tmp, clamp((spec.radius - out) / spec.radius, -1, 1));
        flight.normalize();
        flight.y = clamp((high - e.position.y) * 0.2, -0.5, 0.5);
        speed = out > spec.radius * 2 ? spec.chase : spec.cruise;
        bank = e.orbit * 0.4;
        // Out of its waters, it gives up. (Only from its circle, so that a dive once begun is
        // carried through; and only where there is much less of its water than the director
        // needs to send one, so that it does not come and go at the edge of the sea.)
        if (fish && waters(spec, fish.river.s) < 0.1) {
          e.mode = "leave";
          e.t = 0;
        } else if (reachable && e.reload <= 0 && e.t > 1 && out < spec.radius * 1.5) {
          e.mode = "coil";
          e.t = 0;
        }
        break;
      }
      case "coil": {
        // The tell: it breaks off its circle and turns in, slowing, over where it will let
        // its bombs go, its bank steepening until it tips over; once it has shown it long
        // enough and is steeply enough over that point, it plunges. (Missed, round again.)
        if (!reachable) {
          e.mode = "circle";
          e.t = 0;
          break;
        }
        dropPoint(e, fish, top, gun, want);
        flight.subVectors(want, e.position).setY(0);
        const flat = flight.length();
        flight.normalize();
        flight.y = clamp((high - 2 - e.position.y) * 0.2, -0.5, 0.5);
        speed = spec.cruise * 0.8;
        rate = spec.turn * 2.5;
        bank = e.orbit * (0.45 + 0.95 * Math.min(1, e.t / spec.coil));
        if (e.t >= spec.coil && flat < 0.6 * (e.position.y - want.y)) {
          e.strikeDir.subVectors(want, e.position).normalize();
          e.mode = "strike";
          e.t = 0;
          e.dropping = 0;
        } else if (e.t > spec.coil * 4) {
          e.mode = "circle";
          e.t = 0;
        }
        break;
      }
      case "strike": {
        // The plunge: fast down its line, bending a little toward where it must let go as the
        // salmon moves; over the water it lets its bombs go and pulls out.
        if (fish) {
          tmp.subVectors(dropPoint(e, fish, top, gun, want), e.position).normalize();
          if (tmp.y < -0.6) e.strikeDir.lerp(tmp, Math.min(1, dt * 3)).normalize();
        }
        e.heading.copy(e.strikeDir);
        e.position.addScaledVector(e.strikeDir, spec.strike * dt);
        e.speed = spec.strike;
        if (e.position.y <= top + gun.release || e.t > 3) {
          e.dropping = gun.bombs;
          e.dropAt = time;
          e.releasedAt = time;
          e.reload = gun.reload;
          e.mode = "recover";
          e.t = 0;
        }
        e.bank = 0;
        return;
      }
      case "leave": {
        // Off and away from the salmon, climbing, until it is out of the story.
        if (fish) flight.set(e.position.x - fish.position.x, 0, e.position.z - fish.position.z);
        else flight.set(e.heading.x, 0, e.heading.z);
        if (flight.lengthSq() < 1e-6) flight.set(e.orbit, 0, 0);
        flight.normalize();
        flight.y = clamp((high + 8 - e.position.y) * 0.2, -0.5, 0.5);
        speed = spec.chase;
        if (!fish || e.position.distanceToSquared(fish.position) > GONE * GONE) e.leave = true;
        break;
      }
      default: {
        // Pulling out of the dive: flattening out low over the water, slowing, then climbing
        // away at a slant back up to its circle. (Anything else -- stunned, held back -- it
        // climbs away as well.)
        e.mode = "recover";
        const pulling = time - (e.releasedAt ?? -9) < 0.9;
        flight.set(e.heading.x, 0, e.heading.z);
        if (flight.lengthSq() < 1e-6) flight.set(e.orbit, 0, 0);
        flight.normalize();
        flight.y = pulling ? clamp((top + 1.8 - e.position.y) * 0.4, -1.5, 0.3) : 0.8;
        speed = pulling ? Math.max(spec.cruise, e.speed - 22 * dt) : spec.chase;
        rate = 4;
        if (!pulling && e.position.y > high - 1.5) {
          e.mode = "circle";
          e.t = 0;
        }
      }
    }
    // In the air: along the way it wants, easing its bank; never down into the water.
    if (flight.lengthSq() > 1e-8) {
      flight.normalize();
      e.heading.lerp(flight, Math.min(1, dt * rate)).normalize();
    }
    e.speed = speed;
    e.position.addScaledVector(e.heading, speed * dt);
    e.position.y = Math.max(e.position.y, top + 1.2);
    e.bank = (e.bank ?? 0) + (bank - (e.bank ?? 0)) * Math.min(1, dt * 3);
  }

  // Where a bomber lets its bombs go on a dive from where it is: `release` over the water,
  // short of where the salmon will be by the time the bombs are down to it by as far as they
  // carry on along the dive -- through the air, and in the water, braked, until their fuse,
  // which is set for the salmon's depth. (Worked out twice: how far they carry depends on how
  // steep the dive is, and that on where it goes.)
  const aimFlat = new THREE.Vector3();
  function dropPoint(e, fish, top, gun, out) {
    const drop = Math.max(0.5, e.position.y - (top + gun.release));
    const depth = Math.max(0.5, top - fish.position.y);
    out.copy(fish.position);
    for (let k = 0; k < 2; k++) {
      aimFlat.subVectors(out, e.position).setY(0);
      const flat = aimFlat.length();
      const slope = Math.hypot(drop, flat);
      const down = (e.spec.strike * drop) / slope,
        ahead = (e.spec.strike * flat) / slope;
      // (Falling the last bit through the air, faster and faster.)
      const air = (Math.sqrt(down * down + 2 * GRAVITY * gun.release) - down) / GRAVITY;
      const fuse = fuseFor(-(down + GRAVITY * air), depth, gun);
      const carry = ahead * (air + (1 - Math.exp(-gun.drag * fuse)) / gun.drag);
      out.copy(fish.position).addScaledVector(fish.velocity, slope / e.spec.strike + air + fuse);
      if (flat > 1e-3) out.addScaledVector(aimFlat, -carry / flat);
    }
    out.y = top + gun.release;
    return out;
  }

  // A bomb let go from under a bird's wing (`side` +1 right, -1 left), going on as the bird
  // went, drifting a little apart from the other; its fuse is set for the depth the salmon
  // is at (fuseFor).
  function release(e, gun, top, side) {
    if (bombs.length >= 16) return;
    const b = { position: e.position.clone(), velocity: e.heading.clone().multiplyScalar(e.speed), source: e, gun, wet: false, fuse: gun.fuse[1], depth: 0, age: 0, s: e.river.s };
    tmp.set(-e.heading.z, 0, e.heading.x);
    if (tmp.lengthSq() < 1e-6) tmp.set(0, 0, 1);
    tmp.normalize();
    b.position.addScaledVector(tmp, side * 0.08 * e.size);
    b.position.y -= 0.35;
    b.velocity.addScaledVector(tmp, side * (0.6 + 0.8 * random()));
    const fish = e.target?.fish;
    b.depth = fish ? Math.max(0.5, top - fish.position.y) : 4;
    bombs.push(b);
  }
  // How long after it goes in, at `vy` (u/s, down negative), a bomb takes to sink `depth`,
  // braked as fall() brakes it -- within the gun's fuse.
  function fuseFor(vy, depth, gun) {
    const step = 1 / 60;
    let y = 0,
      v = vy,
      t = 0;
    while (y > -depth && t < gun.fuse[1]) {
      v = v * Math.exp(-gun.drag * step) - SINKING * step;
      y += v * step;
      t += step;
    }
    return clamp(t, gun.fuse[0], gun.fuse[1]);
  }
  // The bombs: through the air they fall (GRAVITY, as the weapons' shells do), into the
  // water with a splash (hooks.water), where the water brakes them and they sink; each goes
  // off on its fuse, on the bed, or at once near the salmon (hooks.blast: combat's explode).
  // One that never comes to the water goes quietly.
  function fall(dt, players, hooks) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.age += dt;
      locate(b.position.x, b.position.z, b.s, where);
      b.s = where.s;
      const top = level(where.s);
      if (!b.wet) {
        b.velocity.y -= GRAVITY * dt;
        b.position.addScaledVector(b.velocity, dt);
        if (b.position.y < top) {
          b.wet = true;
          // (It may be a little way in already: this step took it there.)
          b.fuse = fuseFor(b.velocity.y, b.depth - (top - b.position.y), b.gun);
          hooks.water?.(b.position.x, top, b.position.z, 1.5);
        } else if (b.age > 6) bombs.splice(i, 1);
        continue;
      }
      b.velocity.multiplyScalar(Math.exp(-b.gun.drag * dt));
      b.velocity.y -= SINKING * dt;
      b.position.addScaledVector(b.velocity, dt);
      b.fuse -= dt;
      let off = b.fuse <= 0 || b.position.y < bed(where.s, where.u);
      for (const p of players) {
        const f = p.fish;
        if (off || !f || p.down || f.safe || f.captive) continue;
        fishTail.copy(f.position).addScaledVector(f.heading, -0.5 * f.length);
        fishHead.copy(f.position).addScaledVector(f.heading, 0.44 * f.length);
        off = gap(fishTail, fishHead, b.position, b.position) < b.gun.trigger + 0.1 * f.length;
      }
      if (!off) continue;
      bombs.splice(i, 1);
      hooks.blast?.(b.position, b.gun, b.source);
    }
  }

  // One step of an enemy's plan. `hooks.hurt(player, enemy)` is called when a strike lands,
  // `hooks.shoot(enemy, direction, weapon)` for each shot of a gun.
  function think(e, dt, time, players, hooks) {
    const hurt = hooks.hurt;
    const spec = e.spec;
    const p = pick(e, players);
    e.target = p;
    let speed = 0,
      rate = spec.turn;
    if (!p) {
      // Nobody to go for: drift and hold (one that had come up off the bed, the cod, sinks
      // back onto it rather than hanging where it last rose to).
      e.mode = spec.behaviour === "ambush" ? "lurk" : "approach";
      e.rising = false;
      speed = spec.cruise * 0.3;
      return speed;
    }
    const fish = p.fish;
    const L = fish.length;
    to.subVectors(fish.position, e.position);
    const dist = to.length();
    // An ambusher waits where it lies: once the salmon has gone far away it gives up its
    // place and goes, as the heron does, instead of holding a place in the director's count
    // for good (and keeping the next pike away).
    if (spec.behaviour === "ambush" && !spec.boss && dist > LEFT_BEHIND) {
      e.leave = true;
      return 0;
    }
    const untouchable = fish.safe || fish.captive || fish.airborne;
    const sight = spec.sight * (1 + 0.06 * L) * (1 + 0.04 * e.size);
    const sees = !untouchable && dist < sight * 2.2;
    const strikeAt = spec.range + 0.4 * L + 0.3 * e.size;
    e.t += dt;
    // A gun: once it is loaded and the salmon is in its range, it stops to aim (the tell),
    // then fires. A fish big enough to swallow the salmon still goes for that when it is
    // close enough.
    // Shot at but the weaker: away from the salmon at full speed a while, then keeping its
    // distance, wandering; it never attacks (neutrals.js).
    if (e.passive) {
      if (e.mode === "flee") {
        want.copy(to).multiplyScalar(-1);
        want.y *= 0.3;
        steer(e, want, rate * 1.5, dt);
        if (e.t > 6) {
          e.mode = "wander";
          e.t = 0;
        }
        return spec.chase * 1.1;
      }
      e.mode = "wander";
      want.set(Math.cos(e.phase * 0.05 + e.id), 0, Math.sin(e.phase * 0.05 + e.id));
      if (dist < 4 + 2 * L) want.addScaledVector(to, -1 / Math.max(dist, 1e-3));
      steer(e, want, rate * 0.4, dt);
      return spec.cruise * 0.5;
    }
    const gun = spec.weapon?.kind === "ranged" ? spec.weapon : null;
    // A bird under water (the goosander) or an otter holds its breath `air` seconds, then goes
    // up for a few breaths at the surface -- but not in the middle of a burst or a blow.
    if (spec.air) {
      e.air = (e.air ?? spec.air) - dt;
      if (e.air <= 0 && e.mode !== "aim" && e.mode !== "fire" && e.mode !== "coil" && e.mode !== "strike" && e.mode !== "breathe") {
        e.mode = "breathe";
        e.t = 0;
      }
    }
    if (gun && e.mode !== "breathe") {
      e.reload = Math.max(0, (e.reload ?? 0) - dt);
      const swallowing = spec.swallows && e.size >= 2.2 * L && dist < strikeAt * 1.2;
      const ready = e.mode === "lurk" || e.mode === "approach" || e.mode === "hover";
      if (ready && sees && !swallowing && e.reload <= 0 && dist >= gun.range[0] && dist <= gun.range[1] && striking(p) < 3) {
        e.mode = "aim";
        e.t = 0;
      }
    }
    switch (e.mode) {
      case "aim": {
        steer(e, lead(e, fish, gun.speed, want), rate * 2, dt);
        speed = spec.cruise * 0.1;
        if (untouchable || dist > gun.range[1] * 1.3) {
          e.mode = spec.behaviour === "ambush" ? "lurk" : "approach";
          e.reload = 0.5;
          break;
        }
        if (e.t > gun.tell) {
          e.mode = "fire";
          e.t = gun.interval;
          e.shots = gun.burst;
        }
        break;
      }
      case "fire": {
        steer(e, lead(e, fish, gun.speed, want), rate * 1.2, dt);
        speed = spec.cruise * 0.1;
        if (e.t >= gun.interval && e.shots > 0) {
          e.t = 0;
          e.shots--;
          e.firedAt = time;
          hooks.shoot?.(e, lead(e, fish, gun.speed, want).normalize(), gun);
        }
        if (e.shots <= 0 && e.t >= gun.interval) {
          // (The few of a pack are not in step: each reloads a little quicker or slower, so
          // that their rounds come one after another rather than as one volley.)
          e.reload = gun.reload * (spec.behaviour === "pack" && !spec.school ? range(0.7, 1.3) : 1);
          e.mode = spec.behaviour === "ambush" ? "lurk" : "hover";
          e.t = 0;
        }
        break;
      }
      case "hover": {
        // A gunner between bursts: round the salmon at a middle distance, closing in only if
        // it is too far.
        const radius = (gun.range[0] + gun.range[1]) * 0.45;
        want.set(-to.z * e.orbit, 0, to.x * e.orbit).normalize();
        want.addScaledVector(to, (dist - radius) / Math.max(dist, 1e-3));
        steer(e, want, rate, dt);
        speed = spec.cruise * 1.2;
        if (dist > gun.range[1] * 1.5) {
          e.mode = "approach";
          e.t = 0;
        } else if (spec.swallows && e.size >= 2.2 * L && dist < strikeAt && striking(p) < 2 && !untouchable) {
          e.mode = "coil";
          e.t = 0;
        }
        break;
      }
      case "breathe": {
        // Up to the surface, a few breaths there, and down again: up steeply and briskly, its
        // breath being out; up there it lies along the surface, its nose a little raised out
        // of the water, paddling slowly.
        locate(e.position.x, e.position.z, e.river.s, e.river);
        const up = e.position.y > level(e.river.s) - e.size * 0.2;
        if (up) want.set(e.heading.x, 0, e.heading.z).normalize().setY(0.15);
        else want.set(to.x, 0, to.z).normalize().multiplyScalar(0.4).setY(1);
        steer(e, want, rate, dt, 1.2);
        speed = up ? spec.cruise * 0.3 : spec.chase * 0.6;
        // (Up there it comes the last bit of the way to lie in the surface: update() holds it
        // no higher than that.)
        if (up) e.position.y += e.size * 0.3 * dt;
        if (!up) e.t = 0;
        else if (e.t > 3) {
          e.air = spec.air;
          e.mode = "approach";
          e.t = 0;
        }
        break;
      }
      case "lurk": {
        // On the bed, still; turning slowly toward whatever comes near, creeping a little.
        if (sees && dist < sight * 2) steer(e, to, spec.turn * 0.4, dt);
        // One that rises -- the cod, on a sea bed far below the salmon -- comes up off the bed
        // at a salmon it sees above it that is out of its reach, no faster than it chases (a
        // salmon swimming on leaves it behind); once it has it in reach it lies in wait again,
        // sinking back onto the bed (update). Its gun's reach will do for one it cannot
        // swallow; one it can, it comes on at until it can strike (firing on the way).
        if (spec.rises) {
          const swallows = spec.swallows && e.size >= 2.2 * L;
          e.rising = sees && to.y > 0 && dist < sight * 1.6 && dist > strikeAt * 1.35 && (!gun || swallows || dist > gun.range[1] * 0.9);
          if (e.rising) {
            steer(e, to, spec.turn, dt, 1.2);
            speed = spec.chase;
            break;
          }
        }
        if (sees && dist < strikeAt * 1.35 && striking(p) < 2) {
          e.mode = "coil";
          e.t = 0;
        } else if (sees && dist < sight * 1.6) speed = spec.cruise * 0.35;
        break;
      }
      case "approach": {
        if (!sees) {
          speed = spec.cruise * 0.5;
          steer(e, to, rate * 0.3, dt);
          break;
        }
        if (spec.behaviour === "pack" && dist < strikeAt + 2.5 + 1.5 * L) {
          e.mode = "orbit";
          e.t = 0;
          break;
        }
        steer(e, lead(e, fish, spec.chase, want), rate, dt);
        speed = dist > strikeAt * 3 ? spec.chase : spec.chase * 0.6;
        // A gunner stops closing in at its range and circles there.
        if (gun && dist < gun.range[1] * 0.85 && !(spec.swallows && e.size >= 2.2 * L)) {
          e.mode = "hover";
          e.t = 0;
          break;
        }
        // (An ambusher woken by a shot strikes too, once it is there.)
        if (spec.behaviour !== "pack" && dist < strikeAt && striking(p) < 2) {
          e.mode = "coil";
          e.t = 0;
        }
        break;
      }
      case "orbit": {
        // Round the salmon at a distance, then a dart in, one or two at a time.
        const radius = strikeAt + 0.8 + 0.8 * L;
        want.set(-to.z * e.orbit, 0, to.x * e.orbit).normalize();
        want.addScaledVector(to, (dist - radius) / Math.max(dist, 1e-3));
        steer(e, want, rate, dt);
        speed = spec.cruise * 1.4;
        if (dist > radius * 3) {
          e.mode = "approach";
          e.t = 0;
        } else if (e.t > e.nextDart && striking(p) < (spec.school ? 3 : 2) && !untouchable) {
          e.mode = "coil";
          e.t = 0;
          e.nextDart = range(1.2, 3.2);
        }
        break;
      }
      case "coil": {
        // The tell: it stops and draws itself up. Then it goes. (One that rises off the bed
        // strikes up at the salmon over it as steeply as it must. Winding up to swing a heavy
        // blade, it backs off a little as it rears: the blow wants room.)
        steer(e, to, rate * 1.5, dt, spec.rises ? 1.4 : undefined);
        speed = spec.weapon?.rear ? -spec.cruise * 0.25 : spec.cruise * 0.15;
        if (untouchable) {
          e.mode = spec.behaviour === "ambush" ? "lurk" : "approach";
          break;
        }
        if (e.t > spec.coil) beginStrike(e, fish);
        break;
      }
      case "strike": {
        // Committed: it can correct its line only a little.
        steer(e, e.strikeDir, rate * 0.3, dt, spec.rises ? 1.4 : undefined);
        speed = spec.strike;
        snout(e, mouth);
        const reach = 0.12 + 0.3 * L + 0.06 * e.size;
        if (!untouchable && mouth.distanceTo(fish.position) < reach) {
          hurt(p, e);
          e.mode = "recover";
          e.t = 0;
        } else if (e.t > (e.strikeTime ?? 0.4)) {
          if (!untouchable) whiffs.push(e.kind);
          e.mode = "recover";
          e.t = 0;
        }
        break;
      }
      case "recover": {
        // Off to one side before the next go (for `rest` seconds, where its kind gives them).
        want.copy(to).multiplyScalar(-1);
        want.x += e.orbit * to.z;
        want.z -= e.orbit * to.x;
        steer(e, want, rate * 0.8, dt);
        speed = spec.cruise * 1.2;
        const rest = spec.rest ?? (spec.behaviour === "pack" ? 0.6 : spec.behaviour === "ambush" ? 0.9 : 1.6);
        if (e.t > rest) {
          e.mode = spec.behaviour === "ambush" ? "lurk" : spec.behaviour === "pack" ? "orbit" : "approach";
          e.t = 0;
        }
        break;
      }
      default:
        e.mode = "approach";
    }
    return speed;
  }

  // Which way the body of one that rears (`e.rear`) lies: its heading, pitched as pose()
  // draws it, kept in `e.along` so that shots and blades find the body where it is seen
  // (projectiles.js, weapons.js) -- at night the eyes on its raised head are what one aims at.
  function lie(e) {
    pitchAxis.crossVectors(e.heading, UP);
    if (pitchAxis.lengthSq() < 1e-6) pitchAxis.set(0, 0, 1);
    (e.along ??= new THREE.Vector3()).copy(e.heading).applyAxisAngle(pitchAxis.normalize(), e.rear);
  }

  // A dead enemy: it turns belly up and rises, slowly at first, to float at the surface,
  // rocking a little and drifting with the current, then it is gone.
  function drift(e, dt, time, ground) {
    e.corpse += dt;
    e.rolled = Math.min(Math.PI, e.rolled + dt * 3);
    // (A head reared for a blow sinks back as it dies.)
    if (e.rear) e.rear *= Math.exp(-dt * 4);
    if (e.along) lie(e);
    e.speed *= Math.exp(-dt * 3);
    current(e.river.s, e.river.u, e.position.y, flow, time, true);
    e.position.x += (flow.vx * 0.8 + e.heading.x * e.speed) * dt;
    e.position.z += (flow.vz * 0.8 + e.heading.z * e.speed) * dt;
    locate(e.position.x, e.position.z, e.river.s, e.river);
    const floor = bed(e.river.s, e.river.u) + e.size * 0.08;
    const top = level(e.river.s) - e.size * 0.07;
    if (e.position.y > top + 0.02) {
      // Shot out of the air: it falls to the water.
      e.position.y = Math.max(top, e.position.y - 6 * dt);
    } else if (e.spec.crawls) {
      // A larva does not float: it sinks back onto the stones and lies there.
      const under = (ground ? ground.height(e.position.x, e.position.z, floor - e.size * 0.08) : floor - e.size * 0.08) + e.size * 0.06;
      e.position.y = Math.max(under, e.position.y - 0.3 * dt);
    } else {
      const rise = (0.12 + 0.12 * e.size) * Math.min(1, e.corpse / 1.5);
      e.position.y = clamp(e.position.y + rise * dt, floor, Math.max(floor, top));
    }
    e.gape += (0.35 - e.gape) * (1 - Math.exp(-dt * 2));
  }

  function update(dt, time, players, hooks) {
    whiffs.length = 0;
    clockNow = time;
    for (const crowd of Object.values(crowds)) crowd.begin();
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      // (A stand-in for a shoal fish: the shoal moves it.)
      if (e.neutral) continue;
      if (e.dead) {
        drift(e, dt, time, hooks.ground);
        // (A burst body goes once the splatter has faded it out: at once, unless it keeps
        // e.shown above 0 for a moment.)
        if (e.corpse > CORPSE_SECONDS || (e.eaten && !e.burst) || (e.burst && !(e.shown > 0))) {
          list.splice(i, 1);
          continue;
        }
      } else if (e.spec.flies) {
        (e.spec.behaviour === "bomber" ? bomber : dive)(e, dt, time, players, hooks);
        if (e.stagger > 0) e.stagger -= dt;
        if (e.leave) {
          list.splice(i, 1);
          continue;
        }
      } else if (e.spec.behaviour === "drifter") {
        drifting(e, dt, time, players, hooks);
        if (e.stagger > 0) e.stagger -= dt;
        if (e.leave) {
          list.splice(i, 1);
          continue;
        }
      } else if (e.spec.wades) {
        wade(e, dt, time, players, hooks);
        if (e.stagger > 0) e.stagger -= dt;
        if (e.leave) {
          list.splice(i, 1);
          continue;
        }
      } else {
        let speed = think(e, dt, time, players, hooks);
        if (e.leave) {
          list.splice(i, 1);
          continue;
        }
        // A boss keeps to its place: past its leash it turns for home.
        if (e.home && e.spec.leash && e.position.distanceTo(e.home) > e.spec.leash) {
          steer(e, tmp.subVectors(e.home, e.position), e.spec.turn * 1.5, dt);
          if (e.mode === "hover" || e.mode === "approach") speed = e.spec.cruise;
        }
        if (e.stagger > 0) {
          e.stagger -= dt;
          speed *= 0.25;
        }
        // Through the water: the current carries hunter and hunted alike.
        e.speed += (speed - e.speed) * (1 - Math.exp(-dt * (speed > e.speed ? (e.mode === "strike" ? 14 : 3) : 2.5)));
        current(e.river.s, e.river.u, e.position.y, flow, time, true);
        e.velocity.copy(e.heading).multiplyScalar(e.speed);
        // (A crawler holds on to the gravel: the current hardly moves it.)
        const carried = e.spec.crawls ? 0.15 : 1;
        e.velocity.x += flow.vx * carried;
        e.velocity.z += flow.vz * carried;
        e.position.addScaledVector(e.velocity, dt);
        locate(e.position.x, e.position.z, e.river.s, e.river);
        const floor = bed(e.river.s, e.river.u);
        const top = level(e.river.s);
        if (top - floor < e.size * 0.3) {
          // Too shallow: back the way it came.
          e.position.addScaledVector(e.velocity, -dt);
          locate(e.position.x, e.position.z, e.river.s, e.river);
          e.heading.multiplyScalar(-1);
        }
        // A crawler walks on whatever lies there: the bed, the stones, the gravel -- until its
        // prey is close above it: then it swims up at it (the larvae do, in jerks).
        const low = (e.spec.crawls && hooks.ground ? hooks.ground.height(e.position.x, e.position.z, floor) + e.size * 0.08 : floor + e.size * 0.12);
        // (Breathing, it lies higher: its back out of the water, its nose over it.)
        const high = Math.max(low, top - e.size * (e.mode === "breathe" ? 0.06 : 0.1));
        let climbing = false;
        if (e.spec.crawls && e.target) {
          const fp = e.target.fish.position;
          climbing = Math.hypot(fp.x - e.position.x, fp.z - e.position.z) < 2.5 + 3 * e.size && fp.y > low;
        }
        // (One that rises -- the cod -- is free of the bed while it comes up, and once it lies
        // in wait again goes back down onto it at its cruising pace, not all at once.)
        const lying = (e.spec.crawls && !climbing) || (e.spec.bottom && e.mode === "lurk" && !e.spec.rises);
        const sinking = e.spec.rises && e.mode === "lurk" && !e.rising;
        e.position.y = lying ? low : clamp(sinking ? e.position.y - e.spec.cruise * dt : e.position.y, low, high);
        // For the look: whether a crawler walks or swims up, and how the ground under its head
        // tilts it (radians, head up positive), so head and jaws follow a slope.
        if (e.spec.crawls) {
          e.climbing = climbing;
          e.grounded = !climbing;
          if (!climbing && hooks.ground) {
            const reach = 0.4 * e.size;
            const ahead = hooks.ground.height(e.position.x + e.heading.x * reach, e.position.z + e.heading.z * reach, floor) + e.size * 0.08;
            e.tilt = Math.atan2(ahead - low, reach);
          } else e.tilt = Math.asin(clamp(e.heading.y, -1, 1));
        }
        const beat = 0.6 + (e.speed / e.size) * 1.4;
        e.phase = (e.phase + dt * TAU * beat) % TAU;
        const wantGape = e.mode === "strike" ? 1 : e.mode === "coil" || e.mode === "aim" ? 0.35 : 0.08;
        e.gape += (wantGape - e.gape) * (1 - Math.exp(-dt * 12));
        // A heavy blade is swung from high up: as it winds up, its bearer rears its head
        // further and further (so the wind-up can be seen coming, and how far along it is),
        // then brings it down hard with the blow -- for a moment past level, whether the blow
        // landed at once or not (`e.blow`, seconds left of it) -- and lets it come back after.
        // `e.rear` pitches the body in pose(), and whatever is strapped to it with it.
        const lift = e.spec.weapon?.rear;
        if (lift) {
          e.blow = e.mode === "strike" ? 0.3 : Math.max(0, (e.blow ?? 0) - dt);
          const wantRear = e.mode === "coil" ? lift * Math.min(1, e.t / e.spec.coil) : e.blow > 0 ? -0.5 * lift : 0;
          e.rear = (e.rear ?? 0) + (wantRear - (e.rear ?? 0)) * (1 - Math.exp(-dt * (e.blow > 0 ? 16 : 8)));
          lie(e);
        }
      }
      // (A dead fish's fins hang still.)
      if (!e.dead) e.finPhase = (e.finPhase + dt * TAU * 1.4) % TAU;
    }
    fall(dt, players, hooks);
    separate(dt);
    draw();
  }

  // Enemies of a kind keep a little apart instead of swimming through one another.
  function separate(dt) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.neutral) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.neutral || b.kind !== a.kind) continue;
        tmp.subVectors(a.position, b.position);
        const d = tmp.length();
        const min = (a.size + b.size) * 0.3;
        if (d > 1e-4 && d < min) {
          tmp.multiplyScalar(((min - d) / d) * 0.5 * Math.min(1, dt * 8));
          a.position.add(tmp);
          b.position.sub(tmp);
        }
      }
    }
  }

  // Where an enemy's body is and how it lies, as one matrix (`out`), for the crowds and for
  // whatever is strapped to it or drawn in its place (models.js, the larvae): along its
  // heading, rolled belly up when it is stunned or dead (a corpse rocking a little), scaled
  // to its size, shrinking away at the end of a corpse's time, and by `e.shown` (0..1, the
  // splatter's) while a burst body fades behind its cloud.
  function pose(e, out) {
    axisZ.crossVectors(e.heading, UP);
    if (axisZ.lengthSq() < 1e-6) axisZ.set(0, 0, 1);
    axisZ.normalize();
    axisY.crossVectors(axisZ, e.heading).normalize();
    basis.makeBasis(e.heading, axisY, axisZ);
    quaternion.setFromRotationMatrix(basis);
    // (Reared for a blow: the nose up about the body's own across, `e.rear` radians.)
    if (e.rear) quaternion.multiply(roll.setFromAxisAngle(ACROSS, e.rear));
    // (A bird banking into its turn, right wing down for a positive bank.)
    if (e.bank && !e.dead) quaternion.multiply(roll.setFromAxisAngle(FORWARD, e.bank));
    if (e.rolled > 0) quaternion.multiply(roll.setFromAxisAngle(FORWARD, e.rolled + (e.dead ? 0.12 * Math.sin(e.corpse * 1.7 + e.id) : 0)));
    const fade = e.dead ? clamp((CORPSE_SECONDS - e.corpse) / 1.5, 0, 1) : 1;
    const k = (e.size / MODEL_LENGTH) * fade * (e.shown ?? 1);
    return out.compose(e.position, quaternion, scale.set(k, k, k));
  }

  // Kinds with models of their own (`render`) are drawn by those, once they are in; the
  // stand-in body shows them meanwhile.
  const drawnElsewhere = new Set();
  function draw() {
    const slots = {};
    for (const kind in birds) {
      birds[kind].mesh.count = 0;
      if (birds[kind].head) birds[kind].head.count = 0;
      if (birds[kind].plunge) birds[kind].plunge.mesh.count = 0;
    }
    for (const kind in jellies) jellies[kind].bell.count = jellies[kind].mine.count = 0;
    for (const e of list) {
      if (e.neutral || drawnElsewhere.has(e.kind)) continue;
      const jelly = jellies[e.kind];
      if (jelly) {
        // Bell up along its heading; the bell and what hangs from it squeezed in with each
        // beat, the mine as it is. (Shrinking away at the end of a corpse's time, and by
        // e.shown while a burst one fades behind its cloud.)
        const beat = Math.pow(Math.max(0, Math.sin(e.phase)), 3);
        const k = e.size * (e.dead ? clamp((CORPSE_SECONDS - e.corpse) / 1.5, 0, 1) : 1) * (e.shown ?? 1);
        if (k <= 0) continue;
        quaternion.setFromUnitVectors(UP, e.heading);
        matrix.compose(e.position, quaternion, scale.set(k * (1 - 0.16 * beat), k * (1 + 0.08 * beat), k * (1 - 0.16 * beat)));
        jelly.bell.setMatrixAt(jelly.bell.count++, matrix);
        matrix.compose(e.position, quaternion, scale.set(k, k, k));
        jelly.mine.setMatrixAt(jelly.mine.count++, matrix);
        continue;
      }
      const bird = birds[e.kind];
      if (bird && e.spec.wades) {
        heronPose(e, bird);
        continue;
      }
      if (bird) {
        // (Its model is laid along +x from its own origin: moved so the middle of the body
        // is where the enemy is, scaled to its size. In the plunge, the plunging model.)
        const model = bird.plunge && e.mode === "strike" && !e.dead ? bird.plunge : bird;
        pose(e, matrix);
        const s = MODEL_LENGTH / model.length;
        matrix.multiply(basis.makeScale(s, s, s).setPosition(-model.middle * s, 0, 0));
        model.mesh.setMatrixAt(model.mesh.count++, matrix);
        // (Where its beak is, ahead of its middle, for its strike.)
        e.beak = ((model.beak - model.middle) * e.size) / model.length;
        continue;
      }
      const crowd = crowds[e.kind];
      const slot = (slots[e.kind] = (slots[e.kind] ?? -1) + 1);
      crowd.body.setMatrixAt(slot, pose(e, matrix));
      // (The marks the splatter has left on it ride in the matrix's unused bottom row.)
      api.marks?.(e, crowd.body.instanceMatrix.array, slot * 16);
      const coiled = e.mode === "coil" || e.mode === "aim";
      const amplitude = e.dead ? 0 : coiled ? 0.95 : 0.3 + Math.min(0.5, (e.speed / e.size) * 0.4);
      // (A dead body hangs as limp as the splatter says: e.limp bends its spine.)
      crowd.swim.setXYZW(slot, e.phase, amplitude, e.dead ? (e.limp ?? 0) : 0, e.mode === "lurk" ? 0.5 : 0.1);
      crowd.fin.setX(slot, e.finPhase);
      crowd.mouth.setX(slot, e.gape);
    }
    for (const crowd of Object.values(crowds)) crowd.finish();
    // The bombs, nose first along their way, 14 cm long.
    bombMeshes[0].count = bombMeshes[1].count = 0;
    for (const b of bombs) {
      const mesh = bombMeshes[b.wet ? 1 : 0];
      tmp.copy(b.velocity);
      if (tmp.lengthSq() < 1e-6) tmp.set(0, -1, 0);
      quaternion.setFromUnitVectors(FORWARD, tmp.normalize());
      mesh.setMatrixAt(mesh.count++, matrix.compose(b.position, quaternion, scale.set(1.4, 1.4, 1.4)));
    }
    for (const mesh of ownMeshes) {
      mesh.visible = mesh.count > 0;
      if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // The heron as the base game draws its own: the legs standing on the bed with the body
  // high over the water, the neck and head where its gun is, the bill along its aim. Shot,
  // it falls over into the water and floats there on its side, legs out, and goes with the
  // current.
  const DOWN = new THREE.Vector3(0, -1, 0);
  const tip = new THREE.Matrix4();
  function heronPose(e, bird) {
    const yaw = Math.atan2(-e.facing.z, e.facing.x);
    const fade = e.dead ? clamp((CORPSE_SECONDS - e.corpse) / 1.5, 0, 1) : 1;
    if (fade <= 0) return;
    if (!e.dead) {
      quaternion.setFromAxisAngle(UP, yaw);
      matrix.compose(e.stand, quaternion, scale.set(1, 1, 1));
      bird.mesh.setMatrixAt(bird.mesh.count++, matrix);
      quaternion.setFromUnitVectors(DOWN, e.aimDir);
      matrix.compose(e.muzzle, quaternion, scale.set(1, 1, 1));
      bird.head.setMatrixAt(bird.head.count++, matrix);
      return;
    }
    // (The body -- 34 units up the legs -- lies at the surface, the legs pointing away.)
    quaternion.setFromAxisAngle(UP, yaw);
    matrix.compose(e.position, quaternion, scale.set(fade, fade, fade));
    matrix.multiply(tip.makeRotationZ(-Math.PI / 2)).multiply(basis.makeTranslation(0, -34, 0));
    bird.mesh.setMatrixAt(bird.mesh.count++, matrix);
  }

  // A hit for `damage` from direction `dir` (a unit vector, the way the shot flew). Returns
  // true when it sank the enemy.
  function hit(e, damage, dir, by = 0) {
    if (e.dead) return false;
    // (A peaceful fish struck: it flees or turns, neutrals.js decides; a fleeing one runs
    // again.)
    if (e.neutral) api.onNeutral?.(e, by);
    else if (e.passive) {
      e.mode = "flee";
      e.t = 0;
    }
    e.hp -= damage;
    e.lastHitBy = by;
    e.hitAt = clockNow;
    // (A hit makes it flinch, but never cuts short a longer stun. A heavy beast -- `steady`,
    // 0 to 1 -- is hardly pushed back, and under a stream of hits it flinches only now and
    // then and pushes on through in between, where a fish would be held off for good.)
    const steady = e.spec.steady ?? 0;
    if (!steady || clockNow - (e.flinchAt ?? -Infinity) > 0.6 * steady) {
      e.flinchAt = clockNow;
      e.stagger = Math.max(e.stagger ?? 0, 0.12);
    }
    if (dir) e.position.addScaledVector(dir, Math.min(0.3, 0.04 * e.size) * (1 - steady));
    // Woken: an ambusher hit on the bed goes for whoever shot it.
    if (e.mode === "lurk") {
      e.mode = "approach";
      e.t = 0;
    }
    if (e.hp > 0) return false;
    e.dead = true;
    e.mode = "dead";
    e.corpse = 0;
    // Dead, it drifts: no more swimming of its own, only what the shot gave it.
    e.speed = Math.min(e.speed, 0.5);
    return true;
  }

  function reset() {
    list.length = 0;
    bombs.length = 0;
    draw();
  }

  const api = {
    list,
    crowds,
    whiffs,
    // Hit points of new enemies are scaled by this (the difficulty).
    hpScale: 1,
    spawn,
    update,
    hit,
    pose,
    adopt,
    convert,
    forget,
    count,
    count,
    reset,
    snout,
    // The bombs falling and sinking ({ position, velocity, wet, source, gun, ... }).
    bombs,
    // How dark it is (0 day, 1 night): the jellyfish glow the more.
    night(k) {
      glow.value = 0.03 + 0.1 * clamp(k, 0, 1);
    },
    // A kind now drawn by its own models: its stand-in body is no longer drawn.
    drawnBy(kind) {
      drawnElsewhere.add(kind);
      // (Its slots are simply never written, so the crowd draws none of it.)
    },
  };
  return api;
}
