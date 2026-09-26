// Splatter: what a hit and a kill leave in the water. The joke of Extreme is the contrast
// between the calm river and weapons that are meant seriously, so this is meant seriously
// too, and it grows with the weapon: the little laser leaves a puff, a fizz of steam and a
// sinking fish trailing a thin red thread and smoke from a burnt pinhole; heavier weapons
// tear the exit side open; the heaviest (or any weapon against a fish much smaller than the
// one firing it) burst the fish: a billowing cloud, flecks, silver scales, and chunks of
// flesh flung out on arcs, falling as they would in air (the game's rule: weapons work under
// water as in air), bouncing once off the gravel and lying there. Blood drifts with the
// current (the same water that carries the motes), darkens from crimson to rust as it
// thins, and fades over some seconds.
//
// Three draws: the clouds (one sprite cloud, sorted back to front each frame so they blend
// right), the small hard bits (flecks, scales, steam beads, embers: a cut-out sprite cloud
// that writes depth, so it needs no sorting) and the chunks (one instanced mesh). The pools
// have a fixed size (half on light settings) and are filled in place; nothing is allocated
// per frame. Everything sits on layer 1 (fx.js), which the mirror and the window cameras
// leave out.
//
// What it leaves on the enemy record: `burst` (the fish came apart: nothing is left to
// sink, the chunks are its remains), `wound` (0..1, how badly the fish that sinks whole is
// torn; its bleeding follows it), `burnt` (the wound was burnt), and where the last shot went
// in (`woundAlong`, `woundUp`, in body lengths). A burst fish is also marked `eaten`, which is
// how enemies.js drops a body at its next step.
//
// Splatter draws from a random stream of its own, not the combat's: how much blood flies must
// never change what the enemies or the director do next.

import * as THREE from "three";
import { randomGenerator } from "../../shared/random.js";
import { COATS } from "../anatomy.js";
import { PointCloud, skyUniforms } from "../materials.js";
import { river, waterTime } from "../render/water.js";
import { bed, clamp, current, level, locate } from "../course.js";
import { FX_LAYER } from "./fx.js";
import { BLOOD, CLOUD, EMBER, FLECK, GOO, ICHOR, SCALE, SILT, SMOKE, STEAM, createCloudMaterial, createGibGeometry, createGibMaterial, createSpeckMaterial, spriteBasis } from "./gore-shapes.js";
import { WEAPONS } from "./weapons.js";

const TAU = Math.PI * 2;
// Chunks fall as they would in air (the weapons' rule), in scene units per second squared.
const GRAVITY = 98;
// How long a corpse keeps bleeding, and how fast its bleeding eases off (seconds).
const BLEED_SECONDS = 10;
const BLEED_EASE = 3.5;
// How long a burnt wound smokes (seconds).
const SMOKE_SECONDS = 3.5;
// A sunk fish drifts at this part of the current (enemies.js), and so does what bursts out
// of it at first: the cloud stays round the corpse while it blooms, then the water takes it
// at its own pace over CATCH_UP seconds and it streams away.
const CORPSE_CARRY = 0.6;
const CATCH_UP = 2.5;
// Opacity classes for the clouds' overdraw budget (see frame()).
const BUDGET_EDGES = [0.01, 0.02, 0.035, 0.05, 0.08, 0.12, 0.18, 0.26, 0.36, 0.5, 1.01];
// (The classes that may be dropped: up to 5 %.)
const FAINT = 4;
// What a whole corpse is worth eaten (combat.js: salmon.eat(35 * size)); a burst fish's
// chunks share most of it.
const CORPSE_FOOD = 35;

// How hard each weapon tears (the roster's splatter column). `power` 1 is a solid rifle hit;
// a fish bursts when it is no longer than 0.9 * power of the firing fish's length, so the
// little laser bursts only fry-sized things and a torpedo nearly everything. `burn`: the
// wound is burnt (steam, an ember, cauterised rims, smoke instead of a gush). A weapon may
// say so itself in WEAPONS (`gore: power` or `gore: { power, burn }`); otherwise this table,
// and failing that the damage of one shot.
const STYLES = {
  piu: { power: 0.5, burn: true },
  flinte: { power: 1.6, burn: false },
  granate: { power: 2.2, burn: false },
  minigun: { power: 1.2, burn: false },
  raketen: { power: 2.4, burn: false },
  torpedo: { power: 3, burn: false },
  minen: { power: 2.8, burn: false },
  panzerbuechse: { power: 2.6, burn: false },
  strahl: { power: 1.5, burn: true },
  harpune: { power: 2.5, burn: false },
  kanone: { power: 3, burn: false },
};
const found = { power: 1, burn: false };
function styleOf(weapon) {
  const w = WEAPONS[weapon];
  const own = w?.gore;
  if (typeof own === "number") {
    found.power = own;
    found.burn = false;
    return found;
  }
  if (own && typeof own === "object") {
    found.power = own.power ?? 1;
    found.burn = !!own.burn;
    return found;
  }
  if (STYLES[weapon]) return STYLES[weapon];
  found.power = clamp(Math.sqrt((w?.damage ?? 3.6) / 3.6), 0.7, 2.5);
  found.burn = false;
  return found;
}
// How much each hit may throw: a weapon that fires fast (a Gatling) throws less per hit, so
// a long burst stays a steady spray instead of flooding the pool.
function spray(weapon) {
  const w = WEAPONS[weapon];
  return clamp((w?.interval ?? 0.11) / 0.11, 0.35, 1);
}
// What an enemy bleeds: fish blood, unless its kind says otherwise (`blood` in kinds.js).
function stuffOf(e) {
  const b = e.spec?.blood;
  return b === "larva" ? ICHOR : b === "jelly" ? GOO : BLOOD;
}
const scaly = (e) => {
  const b = e.spec?.blood;
  return !b || b === "fish";
};
// The length of the fish the enemy is after (the one that sank it, as a rule).
const hunterLength = (e) => e.target?.fish?.length ?? e.size;

// (combat.js hands in its `random` as well; it is left unused on purpose, see above.)
export function createGore(scene, camera, { light = false } = {}) {
  const random = randomGenerator(0x0b1005);
  const PUFFS = light ? 448 : 896;
  const GIBS = light ? 64 : 128;
  // On light settings a kill throws a little less, so the smaller pools last.
  const plenty = light ? 0.65 : 1;

  // ---- Two sprite clouds: blood clouds (blended, sorted) and small hard bits (cut out).
  function spriteGeometry() {
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "shade", "turn", "tone"]) geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    return geometry;
  }
  const cloudGeometry = spriteGeometry();
  const cloud = new PointCloud(cloudGeometry, createCloudMaterial(cloudGeometry));
  cloud.name = "Combat blood";
  // After the bed, fish and bubbles, before the glowing shots and sparks (4), which should
  // shine through the blood.
  cloud.renderOrder = 3;
  cloud.layers.set(FX_LAYER);
  cloud.castShadow = false;
  scene.add(cloud);
  // (For tests: what the last frame drew, and how many screens of cloud it would have
  // covered before the overdraw budget.)
  const stats = { covered: 0, cutoff: 0, smaller: 1, clouds: 0, bits: 0 };
  cloud.userData.stats = stats;
  const speckGeometry = spriteGeometry();
  const specks = new PointCloud(speckGeometry, createSpeckMaterial(speckGeometry));
  specks.name = "Combat specks";
  specks.layers.set(FX_LAYER);
  specks.castShadow = false;
  scene.add(specks);
  const out = [
    { geometry: cloudGeometry, attributes: Object.values(cloudGeometry.attributes), p: cloudGeometry.attributes.position.array, s: cloudGeometry.attributes.shade.array, t: cloudGeometry.attributes.turn.array, l: cloudGeometry.attributes.tone.array },
    { geometry: speckGeometry, attributes: Object.values(speckGeometry.attributes), p: speckGeometry.attributes.position.array, s: speckGeometry.attributes.shade.array, t: speckGeometry.attributes.turn.array, l: speckGeometry.attributes.tone.array },
  ];

  // The sprites' state, one slot each (structure of arrays: no objects to collect).
  const px = new Float32Array(PUFFS),
    py = new Float32Array(PUFFS),
    pz = new Float32Array(PUFFS),
    vx = new Float32Array(PUFFS),
    vy = new Float32Array(PUFFS),
    vz = new Float32Array(PUFFS),
    age = new Float32Array(PUFFS),
    life = new Float32Array(PUFFS),
    size0 = new Float32Array(PUFFS),
    size1 = new Float32Array(PUFFS),
    grow = new Float32Array(PUFFS),
    pop = new Float32Array(PUFFS),
    size = new Float32Array(PUFFS),
    alpha = new Float32Array(PUFFS),
    thin = new Float32Array(PUFFS),
    seed = new Float32Array(PUFFS),
    drag = new Float32Array(PUFFS),
    sink = new Float32Array(PUFFS),
    spin = new Float32Array(PUFFS),
    spinRate = new Float32Array(PUFFS),
    bulk = new Float32Array(PUFFS),
    flowX = new Float32Array(PUFFS),
    flowZ = new Float32Array(PUFFS),
    floor = new Float32Array(PUFFS),
    top = new Float32Array(PUFFS),
    riverS = new Float32Array(PUFFS),
    carry = new Float32Array(PUFFS),
    depth = new Float32Array(PUFFS);
  const kind = new Uint8Array(PUFFS),
    stuff = new Uint8Array(PUFFS),
    spills = new Uint8Array(PUFFS),
    gone = new Uint8Array(PUFFS);
  // Free slots, and the live ones in drawing order (far to near, kept sorted frame to frame,
  // so the sort has little to do).
  const free = new Int32Array(PUFFS);
  let freeCount = PUFFS;
  for (let i = 0; i < PUFFS; i++) free[i] = PUFFS - 1 - i;
  const order = new Int32Array(PUFFS);
  // (For the full sort when the camera turns: depth and slot packed into one number.)
  const keys = new Float64Array(PUFFS);
  let live = 0;
  // What each cloud looks like this frame (worked out before any is written, for the
  // overdraw budget: how many screens' worth of clouds may be shaded, and the opacity
  // classes the faintest are dropped by).
  const shownOpacity = new Float32Array(PUFFS),
    shownWidth = new Float32Array(PUFFS),
    shownStretch = new Float32Array(PUFFS);
  const overdraw = light ? 3.5 : 6;
  const budgetBins = new Float32Array(BUDGET_EDGES.length);
  let easedCutoff = 0,
    easedSmaller = 1;

  // ---- Chunks of flesh.
  const coatAttribute = new THREE.InstancedBufferAttribute(new Float32Array(GIBS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const gibAttribute = new THREE.InstancedBufferAttribute(new Float32Array(GIBS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const coatArray = coatAttribute.array,
    gibArray = gibAttribute.array;
  const gibs = new THREE.InstancedMesh(createGibGeometry(random), createGibMaterial(coatAttribute, gibAttribute), GIBS);
  gibs.name = "Combat gibs";
  gibs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gibs.count = 0;
  gibs.frustumCulled = false;
  gibs.castShadow = false;
  gibs.receiveShadow = true;
  gibs.layers.set(FX_LAYER);
  scene.add(gibs);
  const gx = new Float32Array(GIBS),
    gy = new Float32Array(GIBS),
    gz = new Float32Array(GIBS),
    gvx = new Float32Array(GIBS),
    gvy = new Float32Array(GIBS),
    gvz = new Float32Array(GIBS),
    gq = new Float32Array(GIBS * 4),
    gAxis = new Float32Array(GIBS * 3),
    gSpin = new Float32Array(GIBS),
    gScale = new Float32Array(GIBS * 3),
    gRadius = new Float32Array(GIBS),
    gOwner = new Float32Array(GIBS),
    gAge = new Float32Array(GIBS),
    gLife = new Float32Array(GIBS),
    gTrail = new Float32Array(GIBS),
    gFlowX = new Float32Array(GIBS),
    gFlowZ = new Float32Array(GIBS),
    gFloor = new Float32Array(GIBS),
    gTop = new Float32Array(GIBS),
    gS = new Float32Array(GIBS),
    gFood = new Float32Array(GIBS);
  const gRest = new Uint8Array(GIBS),
    gBounced = new Uint8Array(GIBS),
    gStuff = new Uint8Array(GIBS);
  let gibCount = 0;

  // Hits of one step, counted up per enemy and weapon (a shotgun's nine pellets make one
  // wound's worth of splatter, not nine), emitted at the start of the next update.
  const PENDING = 24;
  const pendingEnemy = new Array(PENDING).fill(null),
    pendingWeapon = new Array(PENDING).fill(null);
  const pendingCount = new Float32Array(PENDING),
    pendingPoint = new Float32Array(PENDING * 3),
    pendingDir = new Float32Array(PENDING * 3);
  let pending = 0;

  // Scratch.
  const where = { s: 0, u: 0 };
  const flow = { vx: 0, vy: 0, vz: 0 };
  const site = { s: 0, fx: 0, fz: 0, floor: 0, top: 0 };
  const eye = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const dir = { x: 0, y: 0, z: 0 };
  const wound = { x: 0, y: 0, z: 0 };
  const hide = [0, 0, 0];
  let clock = 0,
    tick = 0;

  // A random direction (unit), into `dir`.
  function sphere() {
    const u = random() * 2 - 1,
      a = random() * TAU,
      w = Math.sqrt(1 - u * u);
    dir.x = w * Math.cos(a);
    dir.y = u;
    dir.z = w * Math.sin(a);
    return dir;
  }

  // The water where a burst happens: its current, bed and surface, looked up once for the
  // whole burst (each sprite looks again now and then as it drifts). The current is taken
  // at the game's time, like the corpses' (at sea it turns with the tide).
  function survey(x, y, z, hint) {
    locate(x, z, hint, where);
    site.s = where.s;
    current(where.s, where.u, y, flow, waterTime.value, true);
    site.fx = flow.vx;
    site.fz = flow.vz;
    site.floor = bed(where.s, where.u);
    site.top = level(where.s);
  }

  // Where on the body a wound is now: the point the last shot went in, carried along as the
  // fish turns, and over to the other side as a dead one rolls onto its back.
  function woundOf(e) {
    const k = e.size;
    const along = (e.woundAlong ?? 0) * k;
    const up = (e.woundUp ?? 0) * k * Math.cos(e.rolled ?? 0);
    wound.x = e.position.x + (e.heading?.x ?? 1) * along;
    wound.y = e.position.y + (e.heading?.y ?? 0) * along + up;
    wound.z = e.position.z + (e.heading?.z ?? 0) * along;
    return wound;
  }

  // A free sprite slot, or -1. An important sprite (a kill's cloud) takes the slot of the
  // one nearest its end when all are in use; a trail's puff just does without.
  function claim(important) {
    if (freeCount > 0) {
      const i = free[--freeCount];
      order[live++] = i;
      return i;
    }
    if (!important) return -1;
    let best = -1,
      most = -1;
    for (let j = 0; j < live; j++) {
      const i = order[j];
      const f = age[i] / life[i];
      if (f > most) {
        most = f;
        best = i;
      }
    }
    return best;
  }

  // How the next sprite behaves, set by the caller just before it asks for one (a shared
  // record instead of an options object, so spawning allocates nothing) and put back to
  // these defaults after each. `delay` holds a sprite back a moment (a kill's cloud blooms
  // in a cascade); `important` lets it take a busy slot; `bulk` is the size of the fish a
  // fleck came from (the blot it spreads into is sized by it); `stuff` what it is made of;
  // `ref` the length of the fish watching (a big old cloud thins out, so what hides behind
  // it can still be seen; 0: no limit).
  const next = { important: false, delay: 0, rate: 1.6, pop: 0.3, drag: 2.4, sink: -0.05, spills: 0, bulk: 1, carry: 1, stuff: BLOOD, ref: 0 };
  // A new sprite at (x, y, z), flung at (ux, uy, uz) through the water: the water's own
  // motion where it starts (`site`, times `carry`) comes on top, since what bleeds swims in
  // the current too.
  function sprite(k, x, y, z, ux, uy, uz, s0, s1, lifetime, opacity) {
    const i = claim(next.important);
    if (i >= 0) {
      // A cloud no bigger than the water is deep (twice over), or it would sit in the gravel.
      if (k === CLOUD) {
        const room = Math.max(0.05, 1.8 * (site.top - site.floor));
        s1 = Math.min(s1, room);
        s0 = Math.min(s0, s1);
      }
      kind[i] = k;
      stuff[i] = next.stuff;
      px[i] = x;
      py[i] = y;
      pz[i] = z;
      vx[i] = ux + site.fx * next.carry;
      vy[i] = uy;
      vz[i] = uz + site.fz * next.carry;
      carry[i] = next.carry;
      age[i] = -next.delay;
      life[i] = lifetime;
      size0[i] = s0;
      size1[i] = s1;
      size[i] = s0;
      grow[i] = next.rate;
      pop[i] = next.pop;
      alpha[i] = opacity;
      thin[i] = next.ref > 0 ? Math.min(1, 0.5 / Math.sqrt(Math.max(1e-4, s1 / next.ref))) : 1;
      seed[i] = random();
      drag[i] = next.drag;
      sink[i] = next.sink;
      spin[i] = random() * TAU;
      // (A cloud turns slowly as it rolls; a scale sets its own, faster flutter.)
      spinRate[i] = (random() - 0.5) * 0.5;
      spills[i] = next.spills;
      bulk[i] = next.bulk;
      gone[i] = 0;
      flowX[i] = site.fx;
      flowZ[i] = site.fz;
      floor[i] = site.floor;
      top[i] = site.top;
      riverS[i] = site.s;
    }
    next.important = false;
    next.delay = 0;
    next.rate = 1.6;
    next.pop = 0.3;
    next.drag = 2.4;
    next.sink = -0.05;
    next.spills = 0;
    next.bulk = 1;
    next.carry = 1;
    next.stuff = BLOOD;
    next.ref = 0;
    return i;
  }

  // Spilt blood (or smoke, silt...): a cloud puff.
  function puff(x, y, z, ux, uy, uz, s0, s1, lifetime, opacity) {
    return sprite(CLOUD, x, y, z, ux, uy, uz, s0, s1, lifetime, opacity);
  }

  // A drop flung out of a wound; it flies, slows, and (if `spill`) spreads into a small puff
  // where it stops.
  function fleck(x, y, z, ux, uy, uz, width, lifetime, owner, spill = 1) {
    next.drag = 4.5;
    next.sink = -0.1;
    next.spills = spill;
    next.bulk = owner;
    return sprite(FLECK, x, y, z, ux, uy, uz, width, width, lifetime, 0.95);
  }

  // A loose scale: it flutters down, turning over and over, and glints as it turns.
  function looseScale(x, y, z, ux, uy, uz, width, lifetime, fall) {
    next.drag = 3.2;
    next.sink = -fall;
    const i = sprite(SCALE, x, y, z, ux, uy, uz, width, width, lifetime, 1);
    if (i >= 0) spinRate[i] = (3 + 5 * random()) * (random() < 0.5 ? -1 : 1);
    return i;
  }

  // Steam where a laser boiled the water: small beads that race up and are gone.
  function steam(x, y, z, count, k) {
    for (let i = 0; i < count; i++) {
      sphere();
      next.drag = 3;
      next.sink = (0.8 + 0.8 * random()) * Math.sqrt(k);
      const w = (0.018 + 0.018 * random()) * Math.sqrt(k);
      sprite(STEAM, x + dir.x * 0.04 * k, y + dir.y * 0.04 * k, z + dir.z * 0.04 * k, dir.x * 0.4 * k, dir.y * 0.4 * k + 0.2 * k, dir.z * 0.4 * k, w, w, 0.5 + 0.7 * random(), 1);
    }
  }

  // An ember glowing in a burnt wound, going along with the fish for its few frames.
  function ember(x, y, z, e, width, lifetime) {
    next.drag = 0;
    next.carry = 0;
    return sprite(EMBER, x, y, z, e.velocity?.x ?? 0, e.velocity?.y ?? 0, e.velocity?.z ?? 0, width, width, lifetime, 1);
  }

  // The skin colour of a chunk out of `e`: its coat, between flank and back (mostly back:
  // the skin side of a chunk lies up, and the fish is darker there).
  function coatOf(e) {
    const c = typeof e.spec?.coat === "string" ? COATS[e.spec.coat] : e.spec?.coat;
    const flank = c?.flank ?? [0.24, 0.2, 0.12],
      back = c?.back ?? [0.05, 0.05, 0.03];
    const t = 0.3 + 0.6 * random();
    for (let j = 0; j < 3; j++) hide[j] = flank[j] + (back[j] - flank[j]) * t;
    return hide;
  }

  // A chunk of flesh, `radius` (units), flung off at (ux, uy, uz): it flies on an arc as it
  // would in air, bounces once off the bed and lies there. `food`: what it is worth eaten.
  function gib(x, y, z, ux, uy, uz, radius, e, burn, food) {
    let i = gibCount;
    if (gibCount < GIBS) gibCount++;
    else {
      // All in use: the oldest goes.
      let most = -1;
      for (let j = 0; j < GIBS; j++)
        if (gAge[j] / gLife[j] > most) {
          most = gAge[j] / gLife[j];
          i = j;
        }
    }
    gx[i] = x;
    gy[i] = y;
    gz[i] = z;
    gvx[i] = ux;
    gvy[i] = uy;
    gvz[i] = uz;
    sphere();
    quaternion.setFromAxisAngle(axis.set(dir.x, dir.y, dir.z), random() * TAU);
    quaternion.toArray(gq, i * 4);
    sphere();
    gAxis[i * 3] = dir.x;
    gAxis[i * 3 + 1] = dir.y;
    gAxis[i * 3 + 2] = dir.z;
    gSpin[i] = (6 + 10 * random()) * (random() < 0.5 ? -1 : 1);
    // Stretched and squashed a little at random (three lumps make many chunks).
    gScale[i * 3] = radius * (0.9 + 0.4 * random());
    gScale[i * 3 + 1] = radius * (0.75 + 0.3 * random());
    gScale[i * 3 + 2] = radius * (0.8 + 0.3 * random());
    gRadius[i] = radius * 0.7;
    gOwner[i] = e.size;
    gAge[i] = 0;
    gLife[i] = 15 + 5 * random();
    // Most chunks trail blood as they fly (the others just tumble).
    gTrail[i] = random() < 0.7 ? random() * 0.03 : Infinity;
    gFlowX[i] = site.fx;
    gFlowZ[i] = site.fz;
    gFloor[i] = site.floor;
    gTop[i] = site.top;
    gS[i] = site.s;
    gRest[i] = 0;
    gBounced[i] = 0;
    gFood[i] = food;
    gStuff[i] = stuffOf(e);
    const skin = coatOf(e);
    coatArray[i * 4] = skin[0];
    coatArray[i * 4 + 1] = skin[1];
    coatArray[i * 4 + 2] = skin[2];
    // Some bits paler, some soaked darker.
    coatArray[i * 4 + 3] = 0.8 + 0.4 * random();
    gibArray[i * 4] = burn;
    gibArray[i * 4 + 1] = Math.floor(random() * 3);
    gibArray[i * 4 + 2] = 0;
    gibArray[i * 4 + 3] = 0;
  }

  // Chunk sizes follow a steep law: most are small bits, one or two are big.
  const chunkRadius = (k, big) => (0.02 + 0.065 * Math.pow(big ? 0.75 + 0.25 * random() : random(), 3)) * k;
  // Flung out of the body at (6 + 8 r) * sqrt(k) units a second, so the arcs span a body
  // length or two (more for a heavy weapon) at every size, mostly the way the shot went
  // and upward.
  function fling(k, dx, dy, dz, power, out) {
    sphere();
    const speed = (6 + 8 * random()) * Math.sqrt(k) * Math.sqrt(0.6 + 0.4 * power);
    let ux = dir.x + dx * 0.7,
      uy = Math.abs(dir.y) * 0.8 + dy * 0.7 + 0.45,
      uz = dir.z + dz * 0.7;
    const l = Math.hypot(ux, uy, uz) || 1;
    out.x = (ux / l) * speed;
    out.y = (uy / l) * speed;
    out.z = (uz / l) * speed;
    return out;
  }
  const flung = { x: 0, y: 0, z: 0 };

  // ---- A shot landed on `e` at `point`, flying along `dirHit` (unit).
  function hit(e, point, dirHit, weapon) {
    if (!e || !point) return;
    // Where it went in, for the wound a dead fish bleeds from.
    const k = e.size;
    const hx = e.heading?.x ?? 1,
      hy = e.heading?.y ?? 0,
      hz = e.heading?.z ?? 0;
    const rx = point.x - e.position.x,
      ry = point.y - e.position.y,
      rz = point.z - e.position.z;
    e.woundAlong = clamp((rx * hx + ry * hy + rz * hz) / k, -0.38, 0.38);
    e.woundUp = clamp(ry / k, -0.08, 0.08);
    const dx = dirHit?.x ?? 0,
      dy = dirHit?.y ?? 0,
      dz = dirHit?.z ?? 0;
    for (let j = 0; j < pending; j++)
      if (pendingEnemy[j] === e && pendingWeapon[j] === weapon) {
        pendingCount[j]++;
        pendingPoint[j * 3] += point.x;
        pendingPoint[j * 3 + 1] += point.y;
        pendingPoint[j * 3 + 2] += point.z;
        pendingDir[j * 3] += dx;
        pendingDir[j * 3 + 1] += dy;
        pendingDir[j * 3 + 2] += dz;
        return;
      }
    if (pending < PENDING) {
      const j = pending++;
      pendingEnemy[j] = e;
      pendingWeapon[j] = weapon;
      pendingCount[j] = 1;
      pendingPoint[j * 3] = point.x;
      pendingPoint[j * 3 + 1] = point.y;
      pendingPoint[j * 3 + 2] = point.z;
      pendingDir[j * 3] = dx;
      pendingDir[j * 3 + 1] = dy;
      pendingDir[j * 3 + 2] = dz;
      return;
    }
    splash(e, point.x, point.y, point.z, dx, dy, dz, weapon, 1);
  }

  // The splatter of `count` hits at (x, y, z) along (dx, dy, dz).
  function splash(e, x, y, z, dx, dy, dz, weapon, count) {
    const k = e.size;
    const kc = k > 1 ? Math.pow(k, 0.75) : k;
    const { power, burn } = styleOf(weapon);
    const many = spray(weapon) * plenty * Math.sqrt(count);
    const what = stuffOf(e);
    const tear = Math.sqrt(power);
    survey(x, y, z, e.river?.s ?? null);
    // The puff: blown out of the far side, along the shot. (Small for the laser: it burns
    // more than it tears.)
    const n = Math.max(1, Math.round((1.5 + 2 * power) * many));
    for (let i = 0; i < n; i++) {
      sphere();
      const outward = (0.4 + 1 * random()) * kc * tear;
      next.delay = i * 0.02;
      next.rate = 2;
      next.stuff = what;
      puff(
        x + dx * 0.08 * k + dir.x * 0.05 * k,
        y + dy * 0.08 * k + dir.y * 0.05 * k,
        z + dz * 0.08 * k + dir.z * 0.05 * k,
        dx * outward + dir.x * 0.3 * kc,
        dy * outward + dir.y * 0.3 * kc,
        dz * outward + dir.z * 0.3 * kc,
        (0.12 + 0.08 * random()) * kc * tear,
        (0.4 + 0.3 * random()) * kc * tear,
        1.8 + 1.4 * random(),
        0.55 + 0.25 * random(),
      );
    }
    // Flecks: most spray out along the shot, some back toward the shooter.
    const m = Math.round((2 + 4 * power) * many);
    for (let i = 0; i < m; i++) {
      sphere();
      const back = random() < 0.3 ? -0.6 : 1;
      let ux = dx * back + dir.x * 0.65,
        uy = dy * back + dir.y * 0.65 + 0.15,
        uz = dz * back + dir.z * 0.65;
      const l = Math.hypot(ux, uy, uz) || 1;
      const speed = (1.8 + 3 * random()) * Math.pow(k, 0.8) * tear;
      ux = (ux / l) * speed;
      uy = (uy / l) * speed;
      uz = (uz / l) * speed;
      next.stuff = what;
      fleck(x, y, z, ux, uy, uz, (0.014 + 0.014 * random()) * k, 0.3 + 0.35 * random(), k, random() < 0.5 ? 1 : 0);
    }
    // A scale or two knocked loose, glinting.
    if (scaly(e)) {
      const c = Math.round(random() * (0.8 + 0.8 * power) * many);
      for (let i = 0; i < c; i++) {
        sphere();
        looseScale(x, y, z, dir.x * k + dx * k, dir.y * k + 0.4 * k, dir.z * k + dz * k, (0.02 + 0.015 * random()) * k, 1.2 + 1.3 * random(), (0.1 + 0.1 * random()) * Math.sqrt(k));
      }
    }
    // A burn: the water boils at the wound, and an ember glows in it a moment.
    if (burn) {
      steam(x, y, z, Math.round((3 + 2 * random()) * Math.min(1.5, many)), k);
      ember(x - dx * 0.02 * k, y - dy * 0.02 * k, z - dz * 0.02 * k, e, 0.06 * Math.pow(k, 0.8), 0.3);
    }
  }

  // ---- `e` was sunk by a shot along `dir`.
  function kill(e, dirKill, weapon) {
    if (!e) return;
    const k = e.size;
    const { power, burn } = styleOf(weapon);
    const tear = Math.sqrt(power);
    const dx = dirKill?.x ?? 0,
      dy = dirKill?.y ?? 0,
      dz = dirKill?.z ?? 0;
    const hx = e.heading?.x ?? 1,
      hy = e.heading?.y ?? 0,
      hz = e.heading?.z ?? 0;
    const { x, y, z } = e.position;
    survey(x, y, z, e.river?.s ?? null);
    const L = hunterLength(e);
    const what = stuffOf(e);
    const grand = Math.sqrt(k) * plenty;
    // Clouds grow more slowly than the fish: a big one's burst fills the water round it,
    // not the whole screen.
    const kc = k > 1 ? Math.pow(k, 0.75) : k;
    // Does it come apart, or sink whole with a hole in it?
    const burst = k <= 0.9 * power * L;
    woundOf(e);
    const wx = wound.x,
      wy = wound.y,
      wz = wound.z;

    if (burst) {
      e.burst = true;
      // (enemies.js drops an eaten body at its next step: there is nothing left to sink.)
      e.eaten = true;
      // The cloud: a core of big slow puffs all along the body, and a jet of smaller, faster
      // ones blown out of the far side along the shot, so the burst is lopsided and torn
      // the way the shot went instead of a ball. They bloom one after another over a
      // quarter of a second. Both how many and how big grow with the weapon.
      const n = Math.round(clamp((5 + 7 * power) * grand, 5, 8 + 8 * power));
      const bigger = 0.7 + 0.3 * power;
      for (let i = 0; i < n; i++) {
        const jet = i % 3 === 2;
        const along = (random() - 0.5) * 0.8 * k;
        sphere();
        let ux, uy, uz, s0, s1;
        if (jet) {
          const speed = (1.2 + 1.4 * random()) * kc * tear;
          ux = (dx + dir.x * 0.45) * speed;
          uy = (dy + dir.y * 0.45) * speed;
          uz = (dz + dir.z * 0.45) * speed;
          s0 = (0.2 + 0.15 * random()) * kc;
          s1 = (0.5 + 0.5 * random()) * kc;
        } else {
          const outward = (0.25 + 0.9 * random()) * kc * tear;
          ux = dir.x * outward + dx * 0.35 * kc;
          uy = dir.y * outward * 0.7 + dy * 0.35 * kc + 0.08 * kc;
          uz = dir.z * outward + dz * 0.35 * kc;
          s0 = (0.3 + 0.25 * random()) * kc;
          s1 = (0.8 + 0.8 * random()) * kc;
        }
        next.important = true;
        next.carry = CORPSE_CARRY;
        next.delay = (i / n) * 0.25 * random();
        next.rate = 0.6 + 0.6 * random();
        next.pop = 0.5;
        next.drag = 2;
        next.stuff = what;
        next.ref = L;
        puff(x + hx * along + dir.x * 0.1 * k, y + hy * along + dir.y * 0.1 * k, z + hz * along + dir.z * 0.1 * k, ux, uy, uz, s0, Math.min(9, s1 * bigger), 4.5 + 3.5 * random(), 0.65 + 0.25 * random());
      }
      // A burnt burst smokes a moment.
      if (burn) smokePuffs(x, y, z, k, 3);
      // Flecks everywhere, the most along the shot; each spreads into a little cloud where
      // it stops, so the burst leaves a ring of smaller blots round the big one.
      const m = Math.round(clamp((8 + 8 * power) * grand, 5, 10 + 10 * power));
      for (let i = 0; i < m; i++) {
        sphere();
        let ux = dir.x + dx * 0.6,
          uy = dir.y + dy * 0.6,
          uz = dir.z + dz * 0.6;
        const l = Math.hypot(ux, uy, uz) || 1;
        const speed = (2.2 + 4.5 * random()) * Math.pow(k, 0.8) * tear;
        ux = (ux / l) * speed;
        uy = (uy / l) * speed;
        uz = (uz / l) * speed;
        next.carry = CORPSE_CARRY;
        next.stuff = what;
        fleck(x + hx * (random() - 0.5) * 0.6 * k, y, z + hz * (random() - 0.5) * 0.6 * k, ux, uy, uz, (0.014 + 0.016 * random()) * k, 0.3 + 0.5 * random(), k, random() < 0.45 ? 1 : 0);
      }
      // Scales, knocked loose.
      if (scaly(e)) {
        const c = Math.round(clamp(5 * grand * tear, 2, 5 + 5 * power));
        for (let i = 0; i < c; i++) {
          sphere();
          const speed = (0.6 + 1.8 * random()) * k;
          next.carry = CORPSE_CARRY;
          looseScale(x + hx * (random() - 0.5) * 0.7 * k, y, z + hz * (random() - 0.5) * 0.7 * k, dir.x * speed + dx * 0.5 * k, dir.y * speed + 0.3 * k, dir.z * speed + dz * 0.5 * k, (0.02 + 0.015 * random()) * k, 3.5 + 3.5 * random(), (0.08 + 0.12 * random()) * Math.sqrt(k));
        }
      }
      // Chunks: what is left of it, flung out on arcs. Together they are worth most of the
      // corpse eaten.
      const g = Math.round(clamp((1 + 2 * power) * Math.pow(k, 0.35) * plenty, 1, 2 + 2.5 * power));
      const food = (CORPSE_FOOD * k * 0.8) / g;
      for (let i = 0; i < g; i++) {
        const along = (random() - 0.5) * 0.7 * k;
        fling(k, dx, dy, dz, power, flung);
        gib(x + hx * along, y + hy * along, z + hz * along, flung.x, flung.y, flung.z, chunkRadius(k, i < 2 && g > 3), e, burn ? 1 : 0, food);
      }
      return;
    }

    // It sinks whole. How badly it is torn decides how much comes out now and how hard it
    // bleeds as it goes down.
    e.wound = clamp(0.1 + 0.25 * power, 0.1, 1);
    e.burnt = burn ? 1 : 0;
    // The exit wound: a cloud blown out of the far side (for the laser, only a puff).
    const n = Math.round(clamp((2 + 4 * power * power) * grand, 3, 4 + 8 * power));
    for (let i = 0; i < n; i++) {
      sphere();
      const speed = (0.5 + 1.2 * random()) * kc * tear;
      next.important = true;
      next.carry = CORPSE_CARRY;
      next.delay = (i / n) * 0.15 * random();
      next.rate = 0.8 + 0.6 * random();
      next.pop = 0.5;
      next.drag = 2.2;
      next.stuff = what;
      next.ref = L;
      puff(wx + dx * 0.1 * k, wy + dy * 0.1 * k, wz + dz * 0.1 * k, (dx + dir.x * 0.5) * speed, (dy + dir.y * 0.5) * speed, (dz + dir.z * 0.5) * speed, (0.15 + 0.1 * random()) * kc * tear, (0.45 + 0.4 * random()) * kc * tear, 3 + 2.5 * random(), 0.65 + 0.25 * random());
    }
    const m = Math.round(clamp((2 + 5 * power) * grand, 2, 4 + 8 * power));
    for (let i = 0; i < m; i++) {
      sphere();
      let ux = dx + dir.x * 0.7,
        uy = dy + dir.y * 0.7,
        uz = dz + dir.z * 0.7;
      const l = Math.hypot(ux, uy, uz) || 1;
      const speed = (2 + 4 * random()) * Math.pow(k, 0.8) * tear;
      next.carry = CORPSE_CARRY;
      next.stuff = what;
      fleck(wx, wy, wz, (ux / l) * speed, (uy / l) * speed, (uz / l) * speed, (0.014 + 0.014 * random()) * k, 0.3 + 0.4 * random(), k);
    }
    if (scaly(e)) {
      const c = Math.round(clamp(2 * power * grand, 1, 2 + 3 * power));
      for (let i = 0; i < c; i++) {
        sphere();
        const speed = (0.5 + 1.2 * random()) * k;
        next.carry = CORPSE_CARRY;
        looseScale(wx, wy, wz, dir.x * speed + dx * 0.4 * k, dir.y * speed + 0.3 * k, dir.z * speed + dz * 0.4 * k, (0.02 + 0.015 * random()) * k, 3 + 3 * random(), (0.08 + 0.12 * random()) * Math.sqrt(k));
      }
    }
    if (burn) {
      // A burnt pinhole: steam, an ember in it, and smoke.
      steam(wx, wy, wz, 5, k);
      ember(wx, wy, wz, e, 0.07 * Math.pow(k, 0.8), 0.3);
      smokePuffs(wx, wy, wz, k, 2);
    } else if (power >= 1) {
      // A heavy hit tears a chunk or two out of the side.
      const g = Math.floor(random() * Math.min(3, power + 0.5));
      for (let i = 0; i < g; i++) {
        fling(k, dx, dy, dz, power, flung);
        gib(wx, wy, wz, flung.x, flung.y, flung.z, chunkRadius(k, false), e, 0, CORPSE_FOOD * k * 0.04);
      }
    }
  }

  // Smoke out of a burnt wound: grey puffs that rise slowly (as smoke would, in air).
  function smokePuffs(x, y, z, k, count) {
    const kc = k > 1 ? Math.pow(k, 0.75) : k;
    for (let i = 0; i < count; i++) {
      sphere();
      next.stuff = SMOKE;
      next.sink = (0.12 + 0.12 * random()) * Math.sqrt(k);
      next.drag = 1.6;
      next.rate = 1;
      next.carry = CORPSE_CARRY;
      puff(x + dir.x * 0.05 * k, y + dir.y * 0.05 * k, z + dir.z * 0.05 * k, dir.x * 0.15 * kc, 0.2 * kc, dir.z * 0.15 * kc, (0.1 + 0.06 * random()) * kc, (0.4 + 0.3 * random()) * kc, 2.2 + 1.5 * random(), 0.5 + 0.2 * random());
    }
  }

  // Blood running out of `e` (a corpse, or a wounded fish still swimming): `count` small
  // puffs at its wound, left behind in the water. A light wound leaves a thin thread, a bad
  // one a thick ribbon.
  function bleed(e, count, strength) {
    const k = e.size;
    const kc = k > 1 ? Math.pow(k, 0.75) : k;
    woundOf(e);
    survey(wound.x, wound.y, wound.z, e.river?.s ?? null);
    const what = stuffOf(e);
    for (let i = 0; i < count; i++) {
      sphere();
      next.rate = 1.2;
      next.drag = 1.8;
      next.stuff = what;
      next.ref = hunterLength(e);
      puff(
        wound.x + dir.x * 0.04 * k,
        wound.y + dir.y * 0.04 * k,
        wound.z + dir.z * 0.04 * k,
        dir.x * 0.12 * kc,
        dir.y * 0.06 * kc,
        dir.z * 0.12 * kc,
        (0.07 + 0.05 * random()) * kc * strength,
        (0.28 + 0.22 * random()) * kc * strength,
        3 + 2.5 * random(),
        (0.6 + 0.2 * random()) * Math.min(1, 0.45 + strength),
      );
    }
  }

  // How many puffs a corpse has bled `t` seconds after it was sunk: a flow that starts at
  // `rate` a second and eases off.
  function spilt(rate, offset, t) {
    return Math.floor(rate * BLEED_EASE * (1 - Math.exp(-Math.max(0, t) / BLEED_EASE)) + offset);
  }

  // ---- Each step: what drifts, sinks and fades.
  function update(dt, enemies) {
    // The hits of the step, one splash per enemy and weapon.
    for (let j = 0; j < pending; j++) {
      const c = pendingCount[j];
      let dx = pendingDir[j * 3],
        dy = pendingDir[j * 3 + 1],
        dz = pendingDir[j * 3 + 2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      splash(pendingEnemy[j], pendingPoint[j * 3] / c, pendingPoint[j * 3 + 1] / c, pendingPoint[j * 3 + 2] / c, dx, dy, dz, pendingWeapon[j], c);
      pendingEnemy[j] = null;
      pendingWeapon[j] = null;
    }
    pending = 0;
    if (!(dt > 0)) return;
    clock += dt;
    tick++;
    const time = waterTime.value;
    // The bleeding: counted out from how long the corpse has lain (or from the clock, for
    // the wounded), so it needs no running state and comes out the same each run.
    if (enemies)
      for (const e of enemies) {
        if (e.eaten) continue;
        let count = 0,
          strength = 1;
        const offset = (e.id * 0.618) % 1;
        if (e.dead) {
          if (e.corpse > BLEED_SECONDS) continue;
          const w = e.wound ?? 0.5;
          const rate = (7 + 9 * w) * Math.sqrt(e.size) * plenty;
          count = spilt(rate, offset, e.corpse) - spilt(rate, offset, e.corpse - dt);
          strength = (0.45 + 0.75 * w) * (0.8 + 0.4 * Math.exp(-e.corpse / BLEED_EASE));
          // A burnt wound smokes a while as the fish goes down.
          if (e.burnt && e.corpse < SMOKE_SECONDS) {
            const fumes = 5 * plenty;
            const n = Math.floor(e.corpse * fumes + offset) - Math.floor((e.corpse - dt) * fumes + offset);
            if (n > 0) {
              woundOf(e);
              survey(wound.x, wound.y, wound.z, e.river?.s ?? null);
              smokePuffs(wound.x, wound.y, wound.z, e.size * (1 - 0.5 * (e.corpse / SMOKE_SECONDS)), n);
            }
          }
        } else if (e.maxHp && e.hp < e.maxHp) {
          const hurt = 1 - e.hp / e.maxHp;
          const rate = 4 * hurt * Math.sqrt(e.size) * plenty;
          count = Math.floor(clock * rate + offset) - Math.floor((clock - dt) * rate + offset);
          strength = 0.5 + 0.4 * hurt;
        }
        if (count > 0) bleed(e, Math.min(count, 4), strength);
      }

    // Sprites.
    for (let j = 0; j < live; j++) {
      const i = order[j];
      const a = age[i] + dt;
      age[i] = a;
      if (a < 0) continue;
      if (a >= life[i]) {
        gone[i] = 1;
        // A fleck that stops spreads into a small blot of its own.
        if (kind[i] === FLECK && spills[i]) {
          site.fx = flowX[i];
          site.fz = flowZ[i];
          site.floor = floor[i];
          site.top = top[i];
          site.s = riverS[i];
          const k = bulk[i];
          next.rate = 1.4;
          next.carry = carry[i];
          next.stuff = stuff[i];
          puff(px[i], py[i], pz[i], (vx[i] - flowX[i]) * 0.5, vy[i] * 0.5, (vz[i] - flowZ[i]) * 0.5, size[i] * 1.6, (0.22 + 0.16 * random()) * k, 2.2 + 1.8 * random(), 0.4 + 0.2 * random());
        }
        continue;
      }
      // Toward the water's own motion: flung things slow down fast and then go with the
      // current; blood is a little heavier than water and settles slowly; smoke and steam
      // rise.
      const pull = 1 - Math.exp(-dt * drag[i]);
      const carried = carry[i] + (1 - carry[i]) * Math.min(1, a / CATCH_UP);
      vx[i] += (flowX[i] * carried - vx[i]) * pull;
      vy[i] += (sink[i] - vy[i]) * pull;
      vz[i] += (flowZ[i] * carried - vz[i]) * pull;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;
      spin[i] += spinRate[i] * dt;
      const k = kind[i];
      // A cloud grows in two ways: a quick pop as the blood is thrown out (`pop` of the way
      // in a few tenths of a second), then the slow billowing of the rest, and it keeps
      // spreading a little for as long as it lasts.
      if (k === CLOUD) size[i] = size0[i] + (size1[i] - size0[i]) * (pop[i] * (1 - Math.exp(-a * 7)) + (1 - pop[i]) * (1 - Math.exp(-a * grow[i]))) + a * 0.04 * size1[i];
      // Now and then (a few sprites each step): where the sprite is now, and the current,
      // bed and surface there.
      if ((i + tick) % 16 === 0) {
        locate(px[i], pz[i], riverS[i], where);
        riverS[i] = where.s;
        current(where.s, where.u, py[i], flow, time, true);
        flowX[i] = flow.vx;
        flowZ[i] = flow.vz;
        floor[i] = bed(where.s, where.u);
        top[i] = level(where.s);
      }
      // Clouds rest on the bed and spread there; they stay under the surface (in water too
      // shallow for them, in the middle of it). Steam is gone at the surface.
      const low = floor[i] + (k === CLOUD ? size[i] * 0.22 : 0.02);
      const high = top[i] - (k === CLOUD ? size[i] * 0.25 : 0.02);
      if (low > high) py[i] = (floor[i] + top[i]) * 0.5;
      else if (py[i] < low) {
        py[i] = low;
        if (vy[i] < 0) vy[i] = 0;
        if (k === SCALE) spinRate[i] *= Math.exp(-dt * 3);
      } else if (py[i] > high) {
        if (k === STEAM) gone[i] = 1;
        py[i] = high;
        if (vy[i] > 0) vy[i] = 0;
      }
    }
    // Drop the finished ones, keeping the drawing order.
    let w = 0;
    for (let j = 0; j < live; j++) {
      const i = order[j];
      if (gone[i]) free[freeCount++] = i;
      else order[w++] = i;
    }
    live = w;

    // Chunks.
    for (let i = 0; i < gibCount; i++) {
      gAge[i] += dt;
      if (gAge[i] >= gLife[i]) {
        // The last one takes this place.
        const last = --gibCount;
        if (i !== last) moveGib(last, i);
        i--;
        continue;
      }
      const r = gRadius[i];
      const k = gOwner[i];
      if (!gRest[i]) {
        // In flight, as in air: it falls, and the water does not slow it.
        gvy[i] -= GRAVITY * dt;
        gx[i] += gvx[i] * dt;
        gy[i] += gvy[i] * dt;
        gz[i] += gvz[i] * dt;
        if ((i + tick) % 4 === 0) {
          locate(gx[i], gz[i], gS[i], where);
          gS[i] = where.s;
          current(where.s, where.u, gy[i], flow, time, true);
          gFlowX[i] = flow.vx;
          gFlowZ[i] = flow.vz;
          gFloor[i] = bed(where.s, where.u);
          gTop[i] = level(where.s);
        }
        // (The surface throws it back down.)
        if (gy[i] > gTop[i] - r) {
          gy[i] = gTop[i] - r;
          if (gvy[i] > 0) gvy[i] *= -0.3;
        }
        // Blood streams off it along its arc: streaks that are left behind in the water and
        // roll up into puffs.
        gTrail[i] -= dt;
        if (gTrail[i] <= 0 && gAge[i] < 1.5) {
          gTrail[i] = 0.03 + 0.015 * random();
          site.fx = gFlowX[i];
          site.fz = gFlowZ[i];
          site.floor = gFloor[i];
          site.top = gTop[i];
          site.s = gS[i];
          const fresh = 1 - gAge[i] / 1.5;
          next.rate = 2;
          next.drag = 5;
          next.stuff = gStuff[i];
          puff(gx[i], gy[i], gz[i], gvx[i] * 0.3, gvy[i] * 0.3, gvz[i] * 0.3, r * 1.2, r * 2.5 + (0.04 + 0.04 * random()) * k, 0.9 + 1 * random(), 0.25 + 0.25 * fresh);
        }
        // The bed: it bounces once and then lies there.
        if (gy[i] < gFloor[i] + r) {
          gy[i] = gFloor[i] + r;
          if (!gBounced[i] && gvy[i] < -1) {
            gBounced[i] = 1;
            gvy[i] *= -0.3;
            gvx[i] *= 0.55;
            gvz[i] *= 0.55;
            gSpin[i] *= 0.5;
            // A little silt kicked up where it lands.
            site.fx = gFlowX[i];
            site.fz = gFlowZ[i];
            site.floor = gFloor[i];
            site.top = gTop[i];
            site.s = gS[i];
            next.stuff = SILT;
            next.rate = 2.5;
            next.sink = 0.02;
            puff(gx[i], gy[i], gz[i], 0, 0.1 * k, 0, r * 2, r * 5 + 0.04 * k, 1.2 + random(), 0.3);
          } else {
            gRest[i] = 1;
            gvx[i] = gvy[i] = gvz[i] = 0;
            gSpin[i] = 0;
          }
        }
        if (gSpin[i] !== 0) {
          turn.setFromAxisAngle(axis.set(gAxis[i * 3], gAxis[i * 3 + 1], gAxis[i * 3 + 2]), gSpin[i] * dt);
          quaternion.fromArray(gq, i * 4).premultiply(turn).normalize().toArray(gq, i * 4);
        }
      } else {
        // Lying on the bed: nudged along a little by the current, still seeping blood a
        // while.
        gx[i] += gFlowX[i] * 0.05 * dt;
        gz[i] += gFlowZ[i] * 0.05 * dt;
        gTrail[i] -= dt;
        if (gAge[i] < 4 && gTrail[i] <= 0) {
          gTrail[i] = 0.4 + 0.4 * random();
          site.fx = gFlowX[i];
          site.fz = gFlowZ[i];
          site.floor = gFloor[i];
          site.top = gTop[i];
          site.s = gS[i];
          next.stuff = gStuff[i];
          next.rate = 1;
          puff(gx[i], gy[i] + r, gz[i], 0, 0.02 * k, 0, r * 1.5, r * 3.5, 2 + random(), 0.3);
        }
      }
    }
  }

  function moveGib(from, to) {
    gx[to] = gx[from];
    gy[to] = gy[from];
    gz[to] = gz[from];
    gvx[to] = gvx[from];
    gvy[to] = gvy[from];
    gvz[to] = gvz[from];
    for (let c = 0; c < 4; c++) {
      gq[to * 4 + c] = gq[from * 4 + c];
      coatArray[to * 4 + c] = coatArray[from * 4 + c];
      gibArray[to * 4 + c] = gibArray[from * 4 + c];
    }
    for (let c = 0; c < 3; c++) {
      gAxis[to * 3 + c] = gAxis[from * 3 + c];
      gScale[to * 3 + c] = gScale[from * 3 + c];
    }
    gSpin[to] = gSpin[from];
    gRadius[to] = gRadius[from];
    gOwner[to] = gOwner[from];
    gAge[to] = gAge[from];
    gLife[to] = gLife[from];
    gTrail[to] = gTrail[from];
    gFlowX[to] = gFlowX[from];
    gFlowZ[to] = gFlowZ[from];
    gFloor[to] = gFloor[from];
    gTop[to] = gTop[from];
    gS[to] = gS[from];
    gFood[to] = gFood[from];
    gRest[to] = gRest[from];
    gBounced[to] = gBounced[from];
    gStuff[to] = gStuff[from];
  }

  // ---- The splatter is the food: a mouth at `point` takes the chunks within `radius` of it
  // and gets what they are worth (for salmon.eat).
  function eat(point, radius) {
    let food = 0;
    for (let i = 0; i < gibCount; i++) {
      if (gAge[i] < 0.3) continue;
      const reach = radius + gRadius[i];
      const dx = gx[i] - point.x,
        dy = gy[i] - point.y,
        dz = gz[i] - point.z;
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      food += gFood[i];
      const last = --gibCount;
      if (i !== last) moveGib(last, i);
      i--;
    }
    return food;
  }

  // Only what is written goes up to the graphics card (and nothing while the water is
  // clean: an update without a range would send the whole buffer).
  function upload(target, n) {
    if (n > 0)
      for (const attribute of target.attributes) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, n * 4);
        attribute.needsUpdate = true;
      }
    target.geometry.setDrawRange(0, n);
  }

  // ---- Each frame: sort the clouds far to near and write what is to be drawn.
  function frame() {
    camera.getWorldPosition(eye);
    camera.getWorldDirection(ahead);
    const basis = camera.matrixWorld.elements;
    spriteBasis.rightY.value = basis[1];
    spriteBasis.upY.value = basis[5];
    // (How tall the picture is at one unit from the eye.)
    const tall = 2 * Math.tan(((camera.fov ?? 50) * Math.PI) / 360);
    for (let j = 0; j < live; j++) {
      const i = order[j];
      depth[i] = (px[i] - eye.x) * ahead.x + (py[i] - eye.y) * ahead.y + (pz[i] - eye.z) * ahead.z;
    }
    // Insertion sort: the order barely changes from one frame to the next. When it does
    // (the camera cut or whipped round), it gives up and sorts the lot properly.
    const patience = 8 * live + 64;
    let shifts = 0;
    for (let j = 1; j < live && shifts <= patience; j++) {
      const i = order[j];
      const d = depth[i];
      let h = j - 1;
      while (h >= 0 && depth[order[h]] < d) {
        order[h + 1] = order[h];
        h--;
        if (++shifts > patience) break;
      }
      order[h + 1] = i;
    }
    if (shifts > patience) {
      for (let j = 0; j < live; j++) {
        const i = order[j];
        keys[j] = Math.round(clamp(4096 - depth[i], 0, 8191) * 256) * 1024 + i;
      }
      keys.fill(Infinity, live);
      keys.sort();
      for (let j = 0; j < live; j++) order[j] = keys[j] % 1024;
    }
    // The daylight at each sprite: the sun (or what is left of it), less what the water
    // above has taken out, red first. Only partly, though: deep down, true to the water,
    // blood would be black, and it should still read as blood.
    const day = 0.28 + 0.72 * clamp(skyUniforms.sun.value, 0, 1);
    const absorb = river.absorb.value;
    const slant = Math.max(0.2, river.lightDirection.value.y);
    const view = camera.matrixWorldInverse.elements;
    const clouds = out[0],
      bits = out[1];
    // First the clouds: how strong and how big each is on the screen this frame. Together
    // they may cover only so many screens (each covered pixel is shaded once per cloud
    // over it); when a heavy fight close to the eye throws more, the faintest go first,
    // which the eye hardly misses.
    const aspect = camera.aspect ?? 16 / 9;
    let covered = 0;
    budgetBins.fill(0);
    for (let j = 0; j < live; j++) {
      const i = order[j];
      shownOpacity[i] = 0;
      const a = age[i];
      if (a < 0 || kind[i] !== CLOUD) continue;
      const d = depth[i];
      let width = size[i];
      // So close to the eye (or behind it) that it would only tint the view: a puff the
      // fish swims through would otherwise cost whole screens of shading for nothing.
      if (d < 0.5 * width) continue;
      const t = a / life[i];
      let opacity = alpha[i] * Math.min(1, a / 0.1) * Math.pow(1 - t, 1.4);
      // An old, big cloud thins out, so a hunter behind it still shows.
      opacity *= 1 + (thin[i] - 1) * clamp((a - 0.8) / 1, 0, 1);
      // Thinned out toward the lens.
      const far = Math.hypot(px[i] - eye.x, py[i] - eye.y, pz[i] - eye.z);
      opacity *= THREE.MathUtils.smoothstep(far, 0.5 * width, 1.5 * width);
      // Never more than a screen tall: closer up it shrinks (and thins), which looks the
      // same (the eye is inside it) at a fraction of the cost.
      let screens = width / (d * tall);
      if (screens > 1) {
        const f = 1 / screens;
        width *= f;
        opacity *= Math.sqrt(f);
        screens = 1;
      }
      if (opacity < 0.004) continue;
      // Drawn out along the way it was flung, while it still moves through the water: a
      // burst tears into streaks before it rolls up into a cloud.
      const rx = vx[i] - flowX[i],
        rz = vz[i] - flowZ[i];
      const ex = view[0] * rx + view[4] * vy[i] + view[8] * rz;
      const ey = view[1] * rx + view[5] * vy[i] + view[9] * rz;
      const fling = Math.hypot(ex, ey) / size[i];
      // (The way it points is kept once it has slowed down, so its lumps do not jump.)
      if (fling > 0.25) spin[i] = Math.atan2(ey, ex);
      const sx = 1 + Math.min(1.1, fling * 0.35);
      shownOpacity[i] = opacity;
      shownWidth[i] = width;
      shownStretch[i] = sx;
      const area = (screens * screens * Math.sqrt(sx)) / aspect;
      covered += area;
      let b = 0;
      while (b < BUDGET_EDGES.length - 1 && opacity >= BUDGET_EDGES[b]) b++;
      budgetBins[b] += area;
    }
    // First the all but invisible go (up to 5 % opacity); if that is not enough, every
    // cloud is drawn a little smaller (they overlap, so the cloud keeps its body and loses
    // only some of its fringe). Both ease toward what this frame needs, so nothing pulses.
    let cutoff = 0,
      smaller = 1;
    if (covered > overdraw) {
      let left = covered;
      for (let b = 0; b < FAINT && left > overdraw; b++) {
        left -= budgetBins[b];
        cutoff = BUDGET_EDGES[b];
      }
      if (left > overdraw) smaller = Math.max(0.55, Math.sqrt(overdraw / left));
    }
    easedCutoff += (cutoff - easedCutoff) * (cutoff > easedCutoff ? 0.5 : 0.1);
    easedSmaller += (smaller - easedSmaller) * (smaller < easedSmaller ? 0.5 : 0.1);
    cutoff = easedCutoff < 1e-4 ? 0 : easedCutoff;
    smaller = easedSmaller;

    let nc = 0,
      ns = 0;
    for (let j = 0; j < live; j++) {
      const i = order[j];
      const a = age[i];
      if (a < 0) continue;
      const k = kind[i];
      const t = a / life[i];
      let width = size[i],
        opacity,
        rotation,
        sx,
        sy,
        extra = 0,
        glint = 0;
      if (k === CLOUD) {
        opacity = shownOpacity[i];
        if (opacity <= cutoff || opacity < 0.004) continue;
        // (Just over the line it fades in, so nothing pops as the line moves.)
        if (cutoff > 0) opacity *= Math.min(1, (opacity - cutoff) / cutoff);
        width = shownWidth[i] * smaller;
        rotation = spin[i];
        sx = shownStretch[i];
        sy = 1 / Math.sqrt(sx);
      } else {
        if (depth[i] < 0.02) continue;
        // (Cut-out bits fade by shrinking: a dithered fade would show its grain on them.)
        if (k === FLECK) {
          opacity = alpha[i];
          width *= Math.sqrt(1 - t * t);
          // Drawn out along its flight as seen on the screen.
          const rx = vx[i] - flowX[i],
            rz = vz[i] - flowZ[i];
          const ex = view[0] * rx + view[4] * vy[i] + view[8] * rz;
          const ey = view[1] * rx + view[5] * vy[i] + view[9] * rz;
          rotation = Math.atan2(ey, ex);
          sx = 1 + Math.min(6, Math.hypot(ex, ey) / (size[i] * 12));
          sy = 1;
        } else if (k === SCALE) {
          opacity = alpha[i];
          width *= Math.min(1, (life[i] - a) / 1.2) * Math.min(1, a / 0.05);
          rotation = spin[i] * 0.37 + seed[i] * TAU;
          const face = Math.abs(Math.cos(spin[i]));
          sx = 1;
          sy = Math.max(0.15, face);
          // The glint: a band that sweeps across the scale as it turns, brightest when it
          // faces the eye.
          extra = Math.sin(spin[i]) * 1.6;
          glint = Math.min(2, Math.pow(face, 6) * 2.2);
        } else if (k === STEAM) {
          opacity = alpha[i];
          width *= Math.min(1, (life[i] - a) / 0.2);
          rotation = 0;
          sx = sy = 1;
        } else {
          // (An ember: bright at once, dying off.)
          opacity = 1;
          rotation = 0;
          sx = sy = 1;
          width *= 1 - 0.5 * t;
          glint = 1 - t;
        }
        if (width < 1e-4) continue;
      }
      const target = k === CLOUD ? clouds : bits;
      const o = (k === CLOUD ? nc++ : ns++) * 4;
      const p = target.p,
        s = target.s,
        tt = target.t,
        l = target.l;
      p[o] = px[i];
      p[o + 1] = py[i];
      p[o + 2] = pz[i];
      p[o + 3] = width;
      s[o] = opacity;
      s[o + 1] = seed[i];
      if (k === CLOUD) {
        s[o + 2] = stuff[i];
        s[o + 3] = Math.exp(-a / 2.4);
      } else {
        s[o + 2] = k;
        s[o + 3] = stuff[i];
      }
      tt[o] = rotation;
      tt[o + 1] = sx;
      tt[o + 2] = sy;
      tt[o + 3] = extra;
      const under = Math.max(0, top[i] - py[i]) / slant;
      l[o] = day * (0.45 + 0.55 * Math.exp(-absorb.x * under));
      l[o + 1] = day * (0.45 + 0.55 * Math.exp(-absorb.y * under));
      l[o + 2] = day * (0.45 + 0.55 * Math.exp(-absorb.z * under));
      // (Clouds: the bed's height, to fade out where they run into it. Scales: the glint.
      // Embers: how hot they still are.)
      l[o + 3] = k === CLOUD ? floor[i] : glint * (k === EMBER ? 1 : day);
    }
    upload(clouds, nc);
    upload(bits, ns);
    stats.covered = covered;
    stats.cutoff = cutoff;
    stats.smaller = smaller;
    stats.clouds = nc;
    stats.bits = ns;

    // The chunks, shrinking away at the end of their time, and out of the way when one
    // comes right at the lens (it would be a dark blot over half the picture).
    for (let i = 0; i < gibCount; i++) {
      const r = gRadius[i];
      const close = Math.hypot(gx[i] - eye.x, gy[i] - eye.y, gz[i] - eye.z);
      const shrink = clamp((gLife[i] - gAge[i]) / 1.5, 0, 1) * clamp((close - 3 * r) / (6 * r), 0, 1);
      position.set(gx[i], gy[i], gz[i]);
      quaternion.fromArray(gq, i * 4);
      scale.set(gScale[i * 3] * shrink, gScale[i * 3 + 1] * shrink, gScale[i * 3 + 2] * shrink);
      matrix.compose(position, quaternion, scale);
      gibs.setMatrixAt(i, matrix);
    }
    gibs.count = gibCount;
    if (gibCount > 0) {
      gibs.instanceMatrix.clearUpdateRanges();
      gibs.instanceMatrix.addUpdateRange(0, gibCount * 16);
      gibs.instanceMatrix.needsUpdate = true;
      for (const attribute of [coatAttribute, gibAttribute]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, gibCount * 4);
        attribute.needsUpdate = true;
      }
    }
  }

  return {
    hit,
    kill,
    update,
    frame,
    eat,
    // For tests: how much is in the water.
    get busy() {
      return live + gibCount;
    },
  };
}
