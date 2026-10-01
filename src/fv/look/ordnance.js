// What the guns put into the water, as things: the tracers of the rounds while they are
// fast, the rounds themselves once they are spent (small matte lead and copper bits tumbling
// down and lying on the bed a while), the empty cases the guns throw out to the side, the
// players' ordnance as real bodies (the torpedo with its turning screws and a stream of
// bubbles, the rocket with its fins and its flame, the horned mine hanging on its chain, the
// grenade harpoon on its hemp line, the iron ball with its burning fuse), what the enemies
// throw (bolts, the heron's spear, spinning stars and knives, nails: flying, lying on the bed,
// or stuck in it where they struck it) and the gannet's bombs. The shapes are made in
// ordnance-shapes.js.
//
// Nothing here is made while the game runs: every mesh is made with combat, before the
// shaders are warmed up (each holds one instance too small to see until the first frame, so
// the warm-up builds its pipeline), and afterwards only filled. All of it is ONE lit material
// (the weapons' kit: colour and surface per vertex), one instanced mesh per shape, and a
// mesh with nothing to show is not drawn. The cases come from a fixed pool; the rounds and the
// ordnance are the shot records of projectiles.js and hostile.js, read, never written. The
// glow of a tracer, a rocket's flame and a fuse goes into the combat glow (fx.js) and is
// dimmed by the water like the rest of it; the bodies are normal-blended.
//
// Taking the rounds over: `fx.drawsRounds` is set, so weapons.js no longer draws the players'
// water rounds as glows and combat.js no longer draws the enemies' rounds; projectiles.js is
// told which of its solid shots are drawn here (`drawnBy`), and enemies.js that its bombs are.
// The cases: every shot of a player's gun passes models.recoil (weapons.js), which is wrapped
// here, and combat.js hands the enemies' shots in (shot()), and their things that strike the
// bed (struck()).
//
// Time is the world's: what moves (the cases, the bubbles off a screw or a fuse, a pump's
// case let go a moment after the shot) moves in combat's step (update), which stops in the
// pause; the frame (draw) only places what is there. What is only for the eye draws from a
// random stream of its own, never the game's.

import * as THREE from "three";
import { attribute, float, select, uniform } from "three/tsl";
import { randomGenerator } from "../../../shared/random.js";
import { bed, locate } from "../../course.js";
import { waterLit } from "../../render/water.js";
import { FX_LAYER } from "../fx.js";
import { REST } from "../hostile.js";
import { bodyFrame } from "../model-harness.js";
import { BALL, CASES, HARPOON, ROCKET, TORPEDO, ballShape, bombShape, boltShape, bulletShape, harpoonShape, knifeShape, lineShape, mineShape, nailShape, pelletShape, rocketShape, spearShape, starShape, torpedoScrewShape, torpedoShape } from "./ordnance-shapes.js";

// The fish's model is this long in its own units (the players' ordnance is built in them).
const MODEL = 0.79;
// How much bigger the ordnance in flight is shown than on the launcher, and the least share
// of the picture's height it keeps however far off it is (so a rocket in flight can still be
// followed from the chase camera; the grenade has the same rule in projectiles.js).
const SHOWN = { torpedo: 1.15, rocket: 1.35, mine: 1.1, harpoon: 1.15, ball: 1.3 };
const LEAST = { torpedo: 0.028, rocket: 0.024, mine: 0.012, harpoon: 0.03, ball: 0.012 };
// A round's tracer burns while it keeps this share of its first speed, brightest above FULL.
// It is a streak TRACER as wide as the round's glow was and STREAK times as long, trailing
// behind the round, and a hot point HEAD as wide as the streak at the round's base, where the
// compound burns. (A streak laid over the round's middle, as long ahead as behind, reads as a
// glowing lens from the side, a saucer in the dark; one trailing from a hot base reads as a
// line of fire going somewhere.)
const DIM = 0.3,
  FULL = 0.78,
  TRACER = 0.3,
  STREAK = 1.4,
  HEAD = 0.9;
// How fast hostile.js sinks a spent round (its SINK), for the rounds it holds still where
// their life ran out in mid-water: the eye sees them go on down to the bed.
const SINK = 0.45;
// A spent round or thing still in the water when it goes shrinks away over this long first
// (a body that simply went would pop).
const FADE = 0.5;
// The enemies' things, one unit long in their shapes: how long each is as a share of the
// round's size (hostile.js: size grows with the enemy that fired it), and how fast it turns
// while it is fast (rad/s, slowing with it: a star spins flat, a knife tumbles end over end;
// slow enough that the eye still sees it turn rather than a blur).
const THINGS = {
  crossbow: { shape: "bolt", length: 5, spin: 0 },
  speargun: { shape: "spear", length: 8, spin: 0 },
  stars: { shape: "star", length: 1.3, spin: 30 },
  knives: { shape: "knife", length: 2.7, spin: 18 },
  nailgun: { shape: "nail", length: 1.3, spin: 0 },
};
// Guns that fire shot: their spent rounds are pellets.
const SHOT = new Set(["flinte", "sawnoff", "pumpgun"]);
// A spent bullet, as a share of the round's size (its glow), long; a pellet across.
const BULLET = 0.42,
  PELLET = 0.3;
// The cases of the players' guns: where the port is in the fish's model units (along the
// body; up from the side clamps' axis or the rail's top; out from the axis, outboard), the
// way they are thrown (back, up, out), the case, its length (model units), how fast it
// leaves (fish lengths a second), and how the gun lets them go: `each` shot (after `delay`),
// or all at once when the action breaks open to reload (`break`).
const PORTS = {
  flinte: { anchor: "side", at: [0.128, 0.004, 0], across: [-0.0069, 0.0069], dir: [-0.75, 0.6, 0.2], casing: "shell", length: 0.05, speed: 1.2, action: "break", delay: 0.2 },
  minigun: { anchor: "side", at: [0.14, -0.012, 0.004], dir: [-0.15, -0.55, 0.8], casing: "rifle", length: 0.02, speed: 1.8, action: "each", delay: 0 },
  panzerbuechse: { anchor: "rail", at: [0.16, 0.02, 0.009], dir: [-0.25, 0.45, 1], casing: "big", length: 0.034, speed: 1.4, action: "each", delay: 0.08 },
};
// The enemies' guns that throw out cases (a revolver keeps them in its cylinder; bows, spears
// and nails have none): the case, its length as a share of the enemy's size, and how long
// after the shot (the pump worked, the break opened, the bolt drawn).
const EJECT = {
  smg: { casing: "pistol", length: 0.028, delay: 0 },
  pistol: { casing: "pistol", length: 0.028, delay: 0 },
  rifle: { casing: "rifle", length: 0.04, delay: 0 },
  minigun: { casing: "rifle", length: 0.036, delay: 0 },
  pumpgun: { casing: "shell", length: 0.05, delay: 0.35 },
  sawnoff: { casing: "shell", length: 0.05, delay: 0.7 },
  elephantgun: { casing: "big", length: 0.06, delay: 0.9 },
};
// Cases and spent rounds: how long they lie on the bed before they settle into it and go.
const LIE = 7,
  SETTLE = 1;
// The rings of cases and of things stuck in the bed take their oldest when they are full. So
// that none is taken while it is seen, the one AHEAD places on in the ring (about a second of
// the minigun's stream) starts to go as a new one comes: into the gravel if it lies there,
// shrinking away over GO seconds if it is still in the water.
const AHEAD = 32,
  GO = 0.4;
// Up to this many ejections waiting for their moment.
const PENDING = 64;
// Up to this many of the enemies' things stuck in the bed where they struck it (hostile.js
// lets a flying round go the moment it strikes the bed; a bolt that simply vanished there
// would be the one false note). Steeper than STEEP (the sine below the level) it sticks,
// point first, BURY of its length deep; flatter, it glances off and lies there.
const STUCK = 24,
  STEEP = 0.2,
  BURY = 0.22;

const X = new THREE.Vector3(1, 0, 0),
  Y = new THREE.Vector3(0, 1, 0);
const TINY = new THREE.Matrix4().makeScale(1e-5, 1e-5, 1e-5);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// A number from 0 to 1 fixed for a record (its `born`) and a purpose (k).
const hash = (n, k) => {
  const s = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// ONE material for everything here: the weapons' kit carries colour and surface per vertex;
// what is painted as glowing (the fuse's end) glows by `glow`, which flickers.
function ordnanceMaterial(glow) {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.5 });
  const gear = attribute("aGear", "vec4");
  const surf = attribute("aSurf", "vec4");
  const code = gear.w.add(0.5).floor();
  const zone = code.sub(code.div(16).floor().mul(16));
  material.colorNode = gear.xyz;
  material.roughnessNode = surf.x;
  material.metalnessNode = surf.y;
  material.emissiveNode = gear.xyz.mul(select(zone.sub(7).abs().lessThan(0.5), glow, float(0)));
  return waterLit(material);
}

export function createOrdnance(scene, camera, { fx, models = null, enemies = null, projectiles = null, players = [], light = false } = {}) {
  const look = randomGenerator(0x0bd5);
  const glow = uniform(3);
  const material = ordnanceMaterial(glow);
  const meshes = {};
  function solid(key, name, geometry, capacity, layer = FX_LAYER) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.layers.set(layer);
    // (One instance too small to see until the first frame: the warm-up draws it.)
    mesh.setMatrixAt(0, TINY);
    mesh.count = 1;
    scene.add(mesh);
    meshes[key] = { mesh, n: 0, capacity };
    return mesh;
  }
  const casesPool = light ? 64 : 128;
  const rounds = light ? 240 : 460;
  // (Room for four players firing at once: a salvo of rockets each, full racks of mines.)
  solid("torpedo", "Combat torpedoes", torpedoShape(), 16);
  solid("screw", "Combat torpedo screws", torpedoScrewShape(), 32);
  solid("rocket", "Combat rockets", rocketShape(), 40);
  solid("mine", "Combat mines", mineShape(), 64);
  solid("harpoon", "Combat harpoons", harpoonShape(), 4);
  solid("line", "Combat harpoon lines", lineShape(), 4 * 12);
  solid("ball", "Combat cannon balls", ballShape(), 4);
  // The bombs: in the air on the ordinary layer (the window in the surface must show them
  // from below), under the water with the effects, as the stand-ins in enemies.js were.
  const bomb = bombShape();
  solid("bombAir", "Combat bomb bodies", bomb, 16, 0);
  solid("bombWet", "Combat bomb bodies under water", bomb, 16);
  // (Room for those flying, lying and stuck in the bed: STUCK more.)
  solid("bolt", "Combat bolts", boltShape(), 32);
  const spear = spearShape();
  solid("spear", "Combat spears", spear, 12);
  // (The heron's spear too, while it is still in the air above the water, as the bombs.)
  solid("spearAir", "Combat spears in the air", spear, 4, 0);
  solid("star", "Combat stars", starShape(), 48);
  solid("knife", "Combat knives", knifeShape(), 40);
  solid("nail", "Combat nails", nailShape(), 48);
  solid("bullet", "Combat spent rounds", bulletShape(), rounds);
  solid("pellet", "Combat spent pellets", pelletShape(), rounds);
  for (const [name, make] of Object.entries(CASES)) solid(`case-${name}`, `Combat cases ${name}`, make(), casesPool);

  // The rounds are ours now: the weapons and combat leave them to us, and so are the solid
  // shots with models here (the grenade keeps its own, projectiles.js) and the bombs.
  fx.drawsRounds = true;
  for (const kind in SHOWN) projectiles?.drawnBy?.(kind);
  enemies?.drawnBy?.("bombs");

  // ---- Scratch (nothing is made per frame).
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion(),
    q2 = new THREE.Quaternion(),
    q3 = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const at = new THREE.Vector3();
  const dir = new THREE.Vector3(),
    side = new THREE.Vector3(),
    up = new THREE.Vector3(),
    eye = new THREE.Vector3(),
    axis = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const where = { s: null, u: 0 };
  let tall = 1.2,
    // (The world's time as the steps have added it up.)
    now = 0;

  function put(key, position, quaternion, sx, sy = sx, sz = sx) {
    const m = meshes[key];
    if (m.n >= m.capacity) return false;
    matrix.compose(position, quaternion, size.set(sx, sy, sz));
    m.mesh.setMatrixAt(m.n++, matrix);
    return true;
  }
  // How far the eye is from a point, and the least scale that keeps a shape `length` long
  // at `share` of the picture's height there.
  const least = (p, length, share) => (share * tall * eye.distanceTo(p)) / length;
  // Along a direction (the shape's +x), level: its up as near the world's up as it can be.
  function along(v, out) {
    dir.copy(v);
    if (dir.lengthSq() < 1e-10) dir.set(1, 0, 0);
    dir.normalize();
    side.crossVectors(dir, Y);
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
    side.normalize();
    up.crossVectors(side, dir);
    basis.makeBasis(dir, up, side);
    return out.setFromRotationMatrix(basis);
  }
  // Lying on the bed, turned `yaw` about the vertical, rolled `roll` about its length.
  const lying = (yaw, roll, out) => out.setFromAxisAngle(Y, yaw).multiply(q2.setFromAxisAngle(X, roll));
  // Tumbling about an axis fixed for the record.
  function tumbling(born, angle, out) {
    const a = hash(born, 3) * Math.PI * 2,
      b = hash(born, 4) * 2 - 1;
    axis.set(Math.cos(a) * Math.sqrt(1 - b * b), b, Math.sin(a) * Math.sqrt(1 - b * b));
    return out.setFromAxisAngle(Y, hash(born, 5) * 6.283).multiply(q2.setFromAxisAngle(axis, angle));
  }

  // ---- A round: its tracer while it is fast, its body once it slows. `rest`: seconds it
  // has lain on the bed (-1 while it does not), `left`: seconds before it goes, `drop`: how
  // far below its record it is drawn (it went on sinking), `scale`: how much of it is left as
  // it shrinks away in the water.
  function round(p, pellet, rest, left, tumble, drop = 0, scale = 1) {
    const speed = p.velocity.length();
    const ratio = p.spent ? 0 : speed / Math.max(1e-6, p.speed0);
    const f = clamp01((ratio - DIM) / (FULL - DIM));
    // The body grows in as the tracer goes out (it is small, and fast things smear).
    const shown = clamp01(1 - f / 0.45);
    const L = p.size * (pellet ? PELLET : BULLET) * (0.4 + 0.6 * shown) * scale;
    if (f > 0.004 && rest < 0) {
      // The tracer fades with the speed, and reddens as it cools: its green and blue go first.
      // The streak draws in to the base as the round slows, and is as long as the way it flies
      // looks from the eye: a round coming straight at the eye or going straight off is a
      // point, not a streak laid across the picture.
      const k = f * f;
      const t = p.tint;
      side.subVectors(p.position, eye);
      const far = Math.max(1e-6, side.length());
      const across = Math.sqrt(Math.max(0, 1 - (side.dot(p.velocity) / (speed * far)) ** 2));
      // (Never thinner than two or three pixels: the temporal blend would thin a finer line
      // to a flicker.)
      const wide = Math.max(p.size * TRACER * (0.35 + 0.65 * f), 0.0035 * tall * far);
      const long = p.size * p.stretch * STREAK * f;
      axis.copy(p.velocity).divideScalar(speed);
      // (The base: the back of the body where it shows, the round's point while it does not.
      // The streak's middle a little less than half its length behind it: its soft front end
      // then runs into the hot base instead of stopping short of it.)
      at.copy(p.position).addScaledVector(axis, -0.5 * L * shown);
      point.copy(at).addScaledVector(axis, -0.38 * long);
      fx.add(point.x, point.y, point.z, wide, t[0] * k, t[1] * k * (0.35 + 0.65 * f), t[2] * k * (0.15 + 0.85 * f), Math.max(1, (long * across) / wide), p.velocity.x, p.velocity.y, p.velocity.z);
      // (The hot base: near white while it is fast, the first to redden.)
      const c = t[0] * k * 1.1;
      fx.add(at.x, at.y, at.z, wide * HEAD, c, c * (0.3 + 0.55 * f), c * (0.1 + 0.5 * f), Math.max(1, (0.2 * long * across) / (wide * HEAD)), p.velocity.x, p.velocity.y, p.velocity.z);
    }
    if (shown <= 0 || scale <= 0) return;
    const r = pellet ? L * 0.5 : L * 0.2;
    at.copy(p.position);
    at.y -= drop;
    if (rest >= 0) {
      at.y += r;
      lying(hash(p.born, 1) * 6.283, hash(p.born, 2) * 6.283, q);
      // (Settling into the gravel as it goes.)
      if (left < SETTLE) at.y -= 2.2 * r * (1 - left / SETTLE);
    } else if (p.spent || f < 0.2) tumbling(p.born, tumble, q);
    else along(p.velocity, q);
    put(pellet ? "pellet" : "bullet", at, q, L, L, L);
  }

  // How an enemy's thing `L` long lies on the bed, turned `yaw` (into q): a star and a knife
  // flat, the others rolled a way of their own. Returns how high its middle is above the bed.
  function laid(spec, born, yaw, L) {
    if (spec.shape === "star") {
      q.setFromAxisAngle(Y, yaw);
      return 0.02 * L;
    }
    if (spec.shape === "knife") {
      // (Flat on its side.)
      q.setFromAxisAngle(Y, yaw).multiply(q2.setFromAxisAngle(X, Math.PI / 2));
      return 0.02 * L;
    }
    lying(yaw, hash(born, 2) * 6.283, q);
    return 0.03 * L;
  }

  // ---- An enemy's thing (a bolt, a spear, a star, a knife, a nail); `drop` and `scale` as
  // for a round.
  function thing(p, spec, rest, left, drop = 0, scale = 1) {
    if (scale <= 0) return;
    const L = p.size * spec.length * scale;
    at.copy(p.position);
    at.y -= drop;
    if (rest >= 0) {
      at.y += laid(spec, p.born, hash(p.born, 1) * 6.283, L);
      if (left < SETTLE) at.y -= 0.06 * L * (1 - left / SETTLE);
    } else if (spec.spin) {
      // Spinning as fast as it goes: in water it slows as exp(-drag t), and so does its turn
      // (the angle is its rate times the time it would have taken at its first speed); spent,
      // it turns slowly as it sinks.
      const come = (1 - Math.exp(-p.drag * p.age)) / p.drag;
      const angle = hash(p.born, 6) * 6.283 + spec.spin * come + 2 * p.spentAge;
      if (p.spent) {
        // (Sinking level-ish, fluttering: a flat thing goes down as a leaf does.)
        q.setFromAxisAngle(Y, hash(p.born, 1) * 6.283).multiply(q2.setFromAxisAngle(X, 0.45 * Math.sin(3 * p.spentAge + hash(p.born, 7) * 6)));
      } else along(p.velocity, q);
      if (spec.shape === "star") q.multiply(q2.setFromAxisAngle(Y, angle));
      else q.multiply(q2.setFromAxisAngle(axis.set(0, 0, 1), -angle));
      // A glint as the steel turns its face to the light, now and then: how the eye catches a
      // spinning blade coming through the water before it sees its shape.
      if (!p.spent) {
        const face = Math.abs(Math.sin(angle * (spec.shape === "star" ? 2 : 1)));
        const k = face ** 12 * (0.5 + 0.5 * p.velocity.length() / Math.max(1e-6, p.speed0));
        if (k > 0.02) fx.add(p.position.x, p.position.y, p.position.z, 0.35 * L, 1.1 * k, 1.2 * k, 1.3 * k, 1);
      }
    } else along(p.velocity.lengthSq() > 1e-6 ? p.velocity : dir.set(0, -1, 0), q);
    put(p.air && spec.shape === "spear" ? "spearAir" : spec.shape, at, q, L, L, L);
  }

  // ---- The enemies' things stuck in the bed: a fixed ring of records, the oldest going first.
  // They lie as long as a spent round does (REST) and go into the gravel in the last SETTLE.
  const stuck = [];
  for (let i = 0; i < STUCK; i++) stuck.push({ live: false, spec: null, x: 0, y: 0, z: 0, dir: new THREE.Vector3(), length: 0, flat: false, t: 0, born: 0 });
  let stuckNext = 0;
  // A thing flying has struck the bed (combat.js, as hostile.js lets it go; its river place is
  // where it is now, below the bed): kept where its way crossed the bed.
  function struck(p) {
    const spec = THINGS[p.weapon];
    if (!spec || p.spent || !p.river) return;
    const s = stuck[stuckNext];
    stuckNext = (stuckNext + 1) % STUCK;
    // (The one a third of the ring on, taken soon if things keep striking the bed this fast,
    // starts to settle into the gravel now.)
    const soon = stuck[(stuckNext + STUCK / 3) % STUCK];
    if (soon.live && soon.t > now - (REST - SETTLE)) soon.t = now - (REST - SETTLE);
    const floor = bed(p.river.s, p.river.u);
    const drop = p.last.y - p.position.y;
    const u = drop > 1e-6 ? clamp01((p.last.y - floor) / drop) : 1;
    s.x = p.last.x + (p.position.x - p.last.x) * u;
    s.y = floor;
    s.z = p.last.z + (p.position.z - p.last.z) * u;
    s.dir.copy(p.velocity);
    if (s.dir.lengthSq() < 1e-10) s.dir.set(0, -1, 0);
    s.dir.normalize();
    s.flat = -s.dir.y < STEEP;
    s.length = p.size * spec.length;
    s.spec = spec;
    s.t = now;
    s.born = p.born;
    s.live = true;
  }
  function drawStuck() {
    for (let i = 0; i < STUCK; i++) {
      const s = stuck[i];
      if (!s.live) continue;
      const left = REST - (now - s.t);
      const sink = left < SETTLE ? 1 - Math.max(0, left) / SETTLE : 0;
      at.set(s.x, s.y, s.z);
      if (s.flat) at.y += laid(s.spec, s.born, Math.atan2(-s.dir.z, s.dir.x), s.length) - 0.06 * s.length * sink;
      else {
        // Point first, at the angle it came in; going down along itself as it settles.
        along(s.dir, q);
        at.addScaledVector(s.dir, (BURY + (1 - BURY) * sink - 0.5) * s.length);
      }
      put(s.spec.shape, at, q, s.length, s.length, s.length);
    }
  }

  // ---- The empty cases: a fixed pool of records.
  const cases = [];
  for (let i = 0; i < casesPool; i++)
    cases.push({ live: false, kind: "pistol", key: "case-pistol", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: new THREE.Quaternion(), w: new THREE.Vector3(), length: 0, sink: 0, floor: 0, s: null, age: 0, rest: -1, fade: -1, yaw: 0, born: 0 });
  // (Each kind's mesh by name, made once: a name put together for every case every frame
  // would be a new string each time.)
  const caseKey = {};
  for (const name in CASES) caseKey[name] = `case-${name}`;
  let caseNext = 0,
    caseBorn = 0;
  // A case thrown from `from` along `way` (a unit vector) at `speed`, with what carried the
  // gun (`carry`, a velocity).
  function eject(kind, length, from, way, speed, carry, s) {
    // (The oldest goes when the pool is full: the pool is a ring.)
    const c = cases[caseNext];
    caseNext = (caseNext + 1) % casesPool;
    const soon = cases[(caseNext + AHEAD) % casesPool];
    if (soon.live) {
      if (soon.rest >= 0) soon.rest = Math.max(soon.rest, LIE);
      else if (soon.fade < 0) soon.fade = GO;
    }
    c.live = true;
    c.kind = kind;
    c.key = caseKey[kind];
    c.length = length * (0.92 + 0.16 * look());
    const v = speed * (0.75 + 0.5 * look());
    c.x = from.x;
    c.y = from.y;
    c.z = from.z;
    c.vx = way.x * v + (look() - 0.5) * 0.3 * speed + (carry?.x ?? 0);
    c.vy = way.y * v + (look() - 0.5) * 0.3 * speed + (carry?.y ?? 0);
    c.vz = way.z * v + (look() - 0.5) * 0.3 * speed + (carry?.z ?? 0);
    c.spin.setFromAxisAngle(Y, look() * 6.283).multiply(q2.setFromAxisAngle(X, look() * 6.283));
    // (Thrown spinning end over end, as an extractor flips a case out, a big one slower;
    // slowed by the water.)
    c.w.set(look() - 0.5, look() - 0.5, look() - 0.5).normalize().multiplyScalar((14 + 12 * look()) * Math.min(1, Math.sqrt(0.08 / Math.max(0.01, length))));
    // (Brass in water goes down at some tenths of a metre a second, tumbling -- a few units
    // here -- and a bigger case faster.)
    c.sink = Math.min(5, 1.4 + 20 * length) + 0.4 * look();
    locate(from.x, from.z, s, where);
    c.s = where.s;
    c.floor = bed(where.s, where.u);
    c.age = 0;
    c.rest = -1;
    c.fade = -1;
    c.born = ++caseBorn;
  }
  function moveCases(dt) {
    const drag = Math.exp(-dt * 4.5),
      turn = Math.exp(-dt * 1.6),
      settle = 1 - Math.exp(-dt * 3);
    for (let i = 0; i < casesPool; i++) {
      const c = cases[i];
      if (!c.live) continue;
      c.age += dt;
      if (c.fade >= 0) {
        c.fade -= dt;
        if (c.fade <= 0) {
          c.live = false;
          continue;
        }
      }
      if (c.rest >= 0) {
        c.rest += dt;
        if (c.rest > LIE + SETTLE || c.age > 30) c.live = false;
        continue;
      }
      c.vx *= drag;
      c.vz *= drag;
      c.vy += (-c.sink - c.vy) * settle;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      // A slow flutter stays while it sinks.
      if (c.w.lengthSq() > 9) c.w.multiplyScalar(turn);
      const angle = c.w.length() * dt;
      if (angle > 1e-5) c.spin.premultiply(q2.setFromAxisAngle(axis.copy(c.w).normalize(), angle));
      const r = c.length * 0.13;
      if (c.y < c.floor + r + 0.3) {
        // (Near the bed: where it drifted to, looked up again.)
        if ((c.born + Math.floor(c.age * 20)) % 4 === 0) {
          locate(c.x, c.z, c.s, where);
          c.s = where.s;
          c.floor = bed(where.s, where.u);
        }
        if (c.y < c.floor + r) {
          c.y = c.floor + r;
          c.rest = 0;
          // It lies on its side, turned the way it was when it came down.
          at.set(1, 0, 0).applyQuaternion(c.spin);
          c.yaw = Math.atan2(-at.z, at.x);
        }
      }
      // (A case that never finds the bed -- thrown up out of the water, or sinking where the
      // bed was not looked up again -- goes after a while.)
      if (c.age > 20 && c.fade < 0) c.fade = GO;
    }
  }
  function drawCases() {
    for (let i = 0; i < casesPool; i++) {
      const c = cases[i];
      if (!c.live) continue;
      at.set(c.x, c.y, c.z);
      if (c.rest >= 0) {
        lying(c.yaw, hash(c.born, 2) * 6.283, q);
        if (c.rest > LIE) at.y -= 2.4 * c.length * 0.13 * ((c.rest - LIE) / SETTLE);
      } else q.copy(c.spin);
      const L = c.fade >= 0 ? (c.length * c.fade) / GO : c.length;
      put(c.key, at, q, L, L, L);
    }
  }

  // Ejections waiting for their moment (a pump worked, a break opened): who, and when.
  const pending = [];
  for (let i = 0; i < PENDING; i++) pending.push({ t: -1, player: null, place: null, id: null, e: null, gun: null, count: 0 });
  function later(t, fields) {
    let slot = null;
    for (const x of pending)
      if (x.t < 0) {
        slot = x;
        break;
      }
    if (!slot) return;
    slot.t = t;
    slot.player = fields.player ?? null;
    slot.place = fields.place ?? null;
    slot.id = fields.id ?? null;
    slot.e = fields.e ?? null;
    slot.gun = fields.gun ?? null;
    slot.count = fields.count ?? 1;
  }

  // The frames of the harness per body (where the side clamps and the rail are).
  const frames = { parr: bodyFrame("parr"), salmon: bodyFrame("salmon") };
  const fishM = new THREE.Matrix4();
  const portAt = new THREE.Vector3(),
    portWay = new THREE.Vector3(),
    carry = new THREE.Vector3();
  // A player's gun throws its cases out now: from its port, as the fish is placed this moment.
  function playerEject(player, id, count) {
    const port = PORTS[id];
    const body = player?.salmon?.meshes?.[0];
    const f = player?.fish;
    if (!port || !body?.instanceMatrix || !f) return;
    fishM.fromArray(body.instanceMatrix.array, 0);
    const F = (f.stage ?? 0) <= 4 ? frames.parr : frames.salmon;
    const scale = Math.hypot(fishM.elements[0], fishM.elements[1], fishM.elements[2]);
    const base = port.anchor === "rail" ? F.railTop : F.side.y;
    const z0 = port.anchor === "rail" ? 0 : F.side.z;
    for (let i = 0; i < count; i++) {
      const dz = port.across ? port.across[i % port.across.length] : 0;
      portAt.set(port.at[0], base + port.at[1], z0 + port.at[2] + dz).applyMatrix4(fishM);
      portWay.set(port.dir[0], port.dir[1], port.dir[2] * (dz < 0 ? 0.3 : 1)).transformDirection(fishM);
      if (f.velocity) carry.copy(f.velocity);
      else carry.set(0, 0, 0);
      eject(port.casing, port.length * scale * 1.4, portAt, portWay, port.speed * f.length, carry, f.river?.s ?? null);
    }
  }
  // An enemy's gun throws its case out now: from behind the muzzle, to its right. From a gun
  // model's own muzzle the port is just off the gun's axis; from the snout (no gun drawn, its
  // rounds come from there) it is outside the flank, where the gun strapped on would have it:
  // a case appearing a little inside the body would be thrown out of the fish's skin.
  const muzzleAt = new THREE.Vector3();
  function enemyEject(e, gun) {
    const spec = EJECT[gun.id];
    if (!spec || !e || e.dead) return;
    const drawn = !!models?.enemyMuzzle?.(e, muzzleAt);
    if (!drawn) {
      if (!enemies?.snout) return;
      enemies.snout(e, muzzleAt);
    }
    const aim = e.aimDir ?? e.heading;
    dir.copy(aim).normalize();
    side.crossVectors(dir, Y);
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
    side.normalize();
    portAt
      .copy(muzzleAt)
      .addScaledVector(dir, -0.3 * e.size)
      .addScaledVector(side, (drawn ? 0.03 : 0.12) * e.size)
      .addScaledVector(Y, drawn ? 0 : 0.03 * e.size);
    portWay.copy(side).addScaledVector(Y, 0.5).addScaledVector(dir, -0.25).normalize();
    if (e.velocity) carry.copy(e.velocity);
    else carry.copy(e.heading).multiplyScalar(e.speed ?? 0);
    eject(spec.casing, spec.length * e.size, portAt, portWay, 1 + 0.5 * e.size, carry, e.river?.s ?? null);
  }

  // What a player's break-action has fired since it was last broken open (per player and gun).
  const spentIn = new Map();
  const wasReloading = new Map();
  // Every shot of a player's gun: a case now, or later.
  function fired(player, place) {
    const id = player?.arsenal?.[place];
    const port = PORTS[id];
    if (!port) return;
    if (port.action === "each") {
      if (port.delay > 0) later(now + port.delay, { player, place, id });
      else playerEject(player, id, 1);
      return;
    }
    const key = player.id * 64 + (place === "belly" ? 1 : 0);
    spentIn.set(key, (spentIn.get(key) ?? 0) + 1);
  }
  if (models?.recoil) {
    const recoil = models.recoil;
    models.recoil = function (player, place) {
      const result = recoil.apply(this, arguments);
      fired(player, place);
      return result;
    };
  }
  // The break-actions open to reload: out with what they fired.
  function breaks() {
    for (const player of players) {
      const a = player.arsenal;
      if (!a) continue;
      for (const place of ["back", "belly"]) {
        const id = a[place];
        if (PORTS[id]?.action !== "break") continue;
        const key = player.id * 64 + (place === "belly" ? 1 : 0);
        const reloading = (a.reloading?.[id] ?? 0) > 0;
        if (reloading && !wasReloading.get(key)) {
          const count = spentIn.get(key) ?? 0;
          if (count > 0) later(now + PORTS[id].delay, { player, place, id, count });
          spentIn.set(key, 0);
        }
        wasReloading.set(key, reloading);
      }
    }
  }
  function due() {
    for (let i = 0; i < PENDING; i++) {
      const x = pending[i];
      if (x.t < 0 || x.t > now) continue;
      if (x.player) {
        if (x.player.arsenal?.[x.place] === x.id && !x.player.down) playerEject(x.player, x.id, x.count);
      } else enemyEject(x.e, x.gun);
      x.t = -1;
      x.player = x.e = x.gun = null;
    }
  }

  // ---- The players' ordnance.
  // The way each harpoon last flew, by its record's `born` (a record goes back to the pool and
  // comes out again as another shot): room for more than can be in the water at once.
  const HEADINGS = 8;
  const headings = [];
  for (let i = 0; i < HEADINGS; i++) headings.push({ born: -1, way: new THREE.Vector3(1, 0, 0) });
  const lineFrom = new THREE.Vector3(),
    lineTo = new THREE.Vector3(),
    point = new THREE.Vector3(),
    prev = new THREE.Vector3();
  function ordnance(p) {
    const kind = p.solid;
    if (kind === "grenade" || !SHOWN[kind]) return;
    const own = p.scale / MODEL;
    const length = kind === "torpedo" ? TORPEDO.length : kind === "rocket" ? ROCKET.length : kind === "harpoon" ? HARPOON.length : kind === "ball" ? 2 * BALL.radius : 0.04;
    const k = Math.max(own * SHOWN[kind], least(p.position, length, LEAST[kind]));
    if (kind === "mine") {
      // Hanging on its chain, swaying a little in the water.
      const t = now + hash(p.born, 1) * 20;
      q.setFromAxisAngle(Y, hash(p.born, 2) * 6.283).multiply(q2.setFromAxisAngle(X, 0.07 * Math.sin(t * 1.1))).multiply(q2.setFromAxisAngle(axis.set(0, 0, 1), 0.06 * Math.sin(t * 0.8 + 1)));
      put("mine", p.position, q, k);
      return;
    }
    // Along its flight (one standing still along the world's x: a ball, round, shows no way).
    let way = p.velocity.lengthSq() > 1e-6 ? p.velocity : dir.set(1, 0, 0);
    if (kind === "harpoon") {
      // A harpoon stopped (at its reach, or in a fish too big to go through: weapons.js takes
      // its velocity) keeps pointing the way it flew.
      const h = headings[p.born % HEADINGS];
      if (way === p.velocity) {
        h.born = p.born;
        h.way.copy(way);
      } else if (h.born === p.born) way = h.way;
    }
    along(way, q);
    if (kind === "ball") {
      // The ball rolls on over the gravel: turned about its flight by the spin the shots keep.
      q.multiply(q2.setFromAxisAngle(axis.set(0, 0, 1), -p.spin * 0.6));
      put("ball", p.position, q, k);
      // The fuse's end, burning blue under water; from afar a spark of some pixels still (the
      // ball itself is then a dot, and the burning fuse is what the eye follows).
      at.set(0, BALL.fuse * k, 0).applyQuaternion(q).add(p.position);
      const flick = 0.75 + 0.25 * Math.sin(now * 41 + p.born) * Math.sin(now * 23 + 2 * p.born);
      fx.add(at.x, at.y, at.z, Math.max(0.0045 * k, 0.009 * tall * eye.distanceTo(at)), 0.5 * flick, 1.1 * flick, 3.2 * flick, 1);
      return;
    }
    if (kind === "torpedo") {
      put("torpedo", p.position, q, k);
      // The screws: contra-rotating, fast (they turn with the game's time).
      for (let i = 0; i < 2; i++) {
        at.set(TORPEDO.screws[i] * k, 0, 0).applyQuaternion(q).add(p.position);
        q3.copy(q).multiply(q2.setFromAxisAngle(X, (i ? -1 : 1) * p.age * 48));
        put("screw", at, q3, k);
      }
      return;
    }
    if (kind === "rocket") {
      // (Its fins are canted: it rolls as it flies.)
      q3.copy(q).multiply(q2.setFromAxisAngle(X, hash(p.born, 2) * 6.283 + p.age * 20));
      put("rocket", p.position, q3, k);
      // The motor's flame out of the nozzle: blue-white where it is hottest, deep blue round
      // it (fire under water burns in its own bubble of gas), flickering.
      const v = p.velocity;
      dir.copy(v).normalize();
      const flick = 0.8 + 0.2 * Math.sin(now * 53 + p.born * 1.7) * Math.sin(now * 31 + p.born);
      const r = ROCKET.radius * k;
      at.copy(p.position).addScaledVector(dir, -3.2 * r);
      fx.add(at.x, at.y, at.z, 4.2 * r * flick, 0.25 * flick, 0.55 * flick, 2.6 * flick, 3.4, v.x, v.y, v.z);
      at.copy(p.position).addScaledVector(dir, -1.4 * r);
      fx.add(at.x, at.y, at.z, 2 * r, 1.4 * flick, 2.2 * flick, 4.5 * flick, 2.6, v.x, v.y, v.z);
      return;
    }
    if (kind === "harpoon") {
      put("harpoon", p.position, q, k);
      harpoonLine(p, q, k);
    }
  }
  // The harpoon's hemp line, from the gun under the owner's belly to the eye at the harpoon's
  // tail, sagging a little in the water: a chain of short straight pieces.
  function harpoonLine(p, turn, k) {
    let player = null;
    for (const x of players) if (x.id === p.owner) player = x;
    if (!player || player.down || player.arsenal?.belly !== "harpune" || !models?.muzzle?.(player, "belly", lineFrom)) return;
    lineTo.set(HARPOON.eye[0] * k, HARPOON.eye[1] * k, HARPOON.eye[2] * k).applyQuaternion(turn).add(p.position);
    const span = lineFrom.distanceTo(lineTo);
    if (span < 1e-3) return;
    const sag = 0.05 * span;
    const r = Math.max(0.0022 * p.scale, 0.0011 * tall * eye.distanceTo(lineTo));
    const N = 12;
    prev.copy(lineFrom);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      point.lerpVectors(lineFrom, lineTo, t);
      point.y -= 4 * sag * t * (1 - t);
      dir.subVectors(point, prev);
      const piece = dir.length();
      if (piece > 1e-6) {
        q.setFromUnitVectors(X, dir.divideScalar(piece));
        put("line", prev, q, piece * 1.02, 2 * r, 2 * r);
      }
      prev.copy(point);
    }
  }

  // ---- Each step of the world (combat.step, after the shots have flown): the cases move, the
  // guns let go of the cases due, and the screws and fuses leave their bubbles.
  const trail = new THREE.Vector3();
  function update(dt, projectiles) {
    now += dt;
    breaks();
    due();
    moveCases(dt);
    for (let i = 0; i < STUCK; i++) if (stuck[i].live && now - stuck[i].t > REST) stuck[i].live = false;
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (p.solid === "torpedo") {
        // A stream of fine bubbles off the screws.
        const k = p.scale / MODEL;
        trail.copy(p.velocity);
        if (trail.lengthSq() < 1e-8) continue;
        trail.normalize();
        at.copy(p.position).addScaledVector(trail, (TORPEDO.screws[1] - 0.004) * k * SHOWN.torpedo);
        const r = TORPEDO.radius * k * 0.7;
        for (let n = Math.floor(dt * 80 + look()); n > 0; n--)
          fx.bubble(at.x + (look() - 0.5) * r, at.y + (look() - 0.5) * r, at.z + (look() - 0.5) * r, 0.002 + 0.005 * p.scale * (0.5 + look()), { rise: 0.5, life: 0.6 + 0.6 * look(), random: look });
      } else if (p.solid === "ball" && look() < dt * 10) {
        // (The fuse boils the water round it: a bead now and then from the ball.)
        fx.bubble(p.position.x, p.position.y + BALL.fuse * (p.scale / MODEL) * SHOWN.ball, p.position.z, 0.003 + 0.004 * p.scale, { rise: 0.6, life: 0.8, random: look });
      }
    }
  }

  // ---- Each frame (the picture; also in the pause, when the clock stands and nothing moves):
  // the players' shots (`projectiles`: projectiles.live), the enemies' (`hostile`:
  // hostile.live), and the bombs falling (`bombs`: enemies.bombs).
  function draw(projectiles, hostile, bombs) {
    if (camera) {
      camera.getWorldPosition(eye);
      tall = 2 * Math.tan(((camera.fov ?? 62) * Math.PI) / 360);
    }
    glow.value = 3.2 * (0.8 + 0.2 * Math.sin(now * 37) * Math.sin(now * 19));
    for (const key in meshes) meshes[key].n = 0;
    // (Loops by index: a for-of makes an iterator wherever the code is not optimized fully.)
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (p.solid) {
        ordnance(p);
        continue;
      }
      // (The laser's bolts and the flame's puffs are the weapons' own glows.)
      if (!p.water) continue;
      // (A spent round that has not reached the bed when its life is up goes from the
      // water: it shrinks away first.)
      const left = p.life - p.age;
      round(p, SHOT.has(p.weapon), p.rested ? 1 : -1, left, p.age * (6 + 8 * hash(p.born, 8)), 0, p.rested ? 1 : clamp01(left / FADE));
    }
    for (let i = 0; i < hostile.length; i++) {
      const p = hostile[i];
      let rest = -1,
        left = Infinity,
        drop = 0,
        scale = 1;
      if (p.rested) {
        left = REST + p.restAt - p.spentAge;
        // hostile.js holds a round still where its life ran out, in mid-water too; drawn lying
        // there it would hang flat in the water. The eye sees it go on down at the pace it
        // sank to the bed and lie there, or shrink away before it gets there.
        const above = p.spent ? p.position.y - p.floor : 0;
        const down = SINK * (p.spentAge - p.restAt);
        if (above > 1e-3 && down < above) {
          drop = down;
          scale = clamp01(left / FADE);
        } else {
          drop = Math.max(0, above);
          rest = p.spentAge - p.restAt - drop / SINK;
        }
      }
      const spec = THINGS[p.weapon];
      if (spec) thing(p, spec, rest, left, drop, scale);
      else round(p, SHOT.has(p.weapon), rest, left, p.spentAge * (5 + 8 * hash(p.born, 8)), drop, scale);
    }
    // The bombs, nose first along their way, 14 cm long (as the stand-ins were).
    for (let i = 0; i < (bombs?.length ?? 0); i++) {
      const b = bombs[i];
      along(b.velocity.lengthSq() > 1e-6 ? b.velocity : dir.set(0, -1, 0), q);
      put(b.wet ? "bombWet" : "bombAir", b.position, q, 1.4);
    }
    drawStuck();
    drawCases();
    for (const key in meshes) {
      const m = meshes[key];
      const mesh = m.mesh;
      mesh.count = m.n;
      mesh.visible = m.n > 0;
      if (m.n > 0) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, m.n * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // An enemy's gun has fired (combat.js): its case, now or when the gun lets it go.
  function shot(e, gun) {
    const spec = EJECT[gun?.id];
    if (!spec) return;
    if (spec.delay > 0) later(now + spec.delay, { e, gun });
    else enemyEject(e, gun);
  }

  function reset() {
    for (const c of cases) c.live = false;
    for (const s of stuck) s.live = false;
    for (const x of pending) {
      x.t = -1;
      x.player = x.e = x.gun = null;
    }
    spentIn.clear();
    wasReloading.clear();
  }

  return { update, draw, shot, struck, reset, meshes, material, get cases() { return cases.reduce((n, c) => n + (c.live ? 1 : 0), 0); } };
}
