// The enemy system: everything that attacks the salmon. Each enemy is a plain record with an
// id and an owner (the player whose game runs it: always the local one alone, one of the
// players in co-op), hit points, and a small plan of attack (kinds.js). They are drawn with
// the base game's own fish bodies, one instanced crowd per kind, created before the first
// frame so their materials are compiled with everything else.
//
// A beaten enemy rolls onto its back and drifts up, belly first, as dead fish do -- limp,
// not swimming; it drifts on the surface with the current a while and then goes. A small one can be eaten there.

import * as THREE from "three";
import { MODEL_LENGTH, createFishMesh } from "../anatomy.js";
import { bed, clamp, current, level, locate, place } from "../course.js";
import { KINDS } from "./kinds.js";

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);
const TAU = Math.PI * 2;
const CORPSE_SECONDS = 40;

export function createEnemies(scene, { random }) {
  const crowds = {};
  for (const [kind, spec] of Object.entries(KINDS)) {
    crowds[kind] = createFishMesh(scene, spec.body, spec.coat, spec.capacity, { name: `Combat ${kind}`, castShadow: false, detail: 0.55 });
  }
  const list = [];
  // The kinds whose strike missed in this step (for the whiff the game plays).
  const whiffs = [];
  let nextId = 1;

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
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const spot = {};
  const range = (a, b) => a + (b - a) * random();

  function count(kind) {
    let n = 0;
    for (const e of list) if (e.kind === kind) n++;
    return n;
  }

  // A new enemy at river place (s, u), height y (null: mid-water, or on the bed for kinds
  // that keep to it). Returns it, or null when the kind's crowd is full.
  function spawn(kind, s, u, y = null, { owner = 0, heading = null } = {}) {
    const spec = KINDS[kind];
    if (!spec || count(kind) >= spec.capacity) return null;
    place(s, u, spot);
    const size = range(spec.size[0], spec.size[1]);
    const floor = bed(s, u);
    const top = level(s);
    if (top - floor < size * 0.5) return null;
    const height = y ?? (spec.bottom ? floor + size * 0.12 : floor + (top - floor) * range(0.3, 0.7));
    const e = {
      id: nextId++,
      kind,
      spec,
      owner,
      size,
      hp: spec.hp,
      maxHp: spec.hp,
      position: new THREE.Vector3(spot.x, height, spot.z),
      velocity: new THREE.Vector3(),
      heading: heading ? heading.clone().normalize() : new THREE.Vector3(Math.cos(random() * TAU), 0, Math.sin(random() * TAU)),
      speed: 0,
      river: { s, u },
      mode: spec.behaviour === "ambush" ? "lurk" : "approach",
      t: 0,
      target: null,
      phase: random() * TAU,
      finPhase: random() * TAU,
      gape: 0,
      strikeDir: new THREE.Vector3(),
      orbit: random() < 0.5 ? 1 : -1,
      nextDart: range(1.2, 2.8),
      stagger: 0,
      dead: false,
      rolled: 0,
      corpse: 0,
      lastHitBy: -1,
    };
    list.push(e);
    return e;
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

  function steer(e, dir, rate, dt) {
    tmp.copy(dir);
    if (tmp.lengthSq() < 1e-8) return;
    tmp.normalize();
    tmp.y = clamp(tmp.y, -0.6, 0.6);
    tmp.normalize();
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

  // One step of an enemy's plan. `hurt(player, enemy)` is called when a strike lands.
  function think(e, dt, time, players, hurt) {
    const spec = e.spec;
    const p = pick(e, players);
    e.target = p;
    let speed = 0,
      rate = spec.turn;
    if (!p) {
      // Nobody to go for: drift and hold.
      e.mode = spec.behaviour === "ambush" ? "lurk" : "approach";
      speed = spec.cruise * 0.3;
      return speed;
    }
    const fish = p.fish;
    const L = fish.length;
    to.subVectors(fish.position, e.position);
    const dist = to.length();
    const untouchable = fish.safe || fish.captive || fish.airborne;
    const sight = spec.sight * (1 + 0.06 * L) * (1 + 0.04 * e.size);
    const sees = !untouchable && dist < sight * 2.2;
    const strikeAt = spec.range + 0.4 * L + 0.3 * e.size;
    e.t += dt;
    switch (e.mode) {
      case "lurk": {
        // On the bed, still; turning slowly toward whatever comes near, creeping a little.
        if (sees && dist < sight * 2) steer(e, to, spec.turn * 0.4, dt);
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
        if (spec.behaviour === "stalker" && dist < strikeAt && striking(p) < 2) {
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
        } else if (e.t > e.nextDart && striking(p) < 2 && !untouchable) {
          e.mode = "coil";
          e.t = 0;
          e.nextDart = range(1.2, 3.2);
        }
        break;
      }
      case "coil": {
        // The tell: it stops and draws itself up. Then it goes.
        steer(e, to, rate * 1.5, dt);
        speed = spec.cruise * 0.15;
        if (untouchable) {
          e.mode = spec.behaviour === "ambush" ? "lurk" : "approach";
          break;
        }
        if (e.t > spec.coil) beginStrike(e, fish);
        break;
      }
      case "strike": {
        // Committed: it can correct its line only a little.
        steer(e, e.strikeDir, rate * 0.3, dt);
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
        // Off to one side before the next go.
        want.copy(to).multiplyScalar(-1);
        want.x += e.orbit * to.z;
        want.z -= e.orbit * to.x;
        steer(e, want, rate * 0.8, dt);
        speed = spec.cruise * 1.2;
        const rest = spec.behaviour === "pack" ? 0.6 : spec.behaviour === "ambush" ? 0.9 : 1.6;
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

  // A dead enemy: it turns belly up and rises, slowly at first, to float at the surface,
  // rocking a little and drifting with the current, then it is gone.
  function drift(e, dt, time) {
    e.corpse += dt;
    e.rolled = Math.min(Math.PI, e.rolled + dt * 3);
    e.speed *= Math.exp(-dt * 3);
    current(e.river.s, e.river.u, e.position.y, flow, time, true);
    e.position.x += (flow.vx * 0.8 + e.heading.x * e.speed) * dt;
    e.position.z += (flow.vz * 0.8 + e.heading.z * e.speed) * dt;
    locate(e.position.x, e.position.z, e.river.s, e.river);
    const floor = bed(e.river.s, e.river.u) + e.size * 0.08;
    const top = level(e.river.s) - e.size * 0.07;
    const rise = (0.12 + 0.12 * e.size) * Math.min(1, e.corpse / 1.5);
    e.position.y = clamp(e.position.y + rise * dt, floor, Math.max(floor, top));
    e.gape += (0.35 - e.gape) * (1 - Math.exp(-dt * 2));
  }

  function update(dt, time, players, hurt) {
    whiffs.length = 0;
    for (const crowd of Object.values(crowds)) crowd.begin();
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dead) {
        drift(e, dt, time);
        if (e.corpse > CORPSE_SECONDS || e.eaten) {
          list.splice(i, 1);
          continue;
        }
      } else {
        let speed = think(e, dt, time, players, hurt);
        if (e.stagger > 0) {
          e.stagger -= dt;
          speed *= 0.25;
        }
        // Through the water: the current carries hunter and hunted alike.
        e.speed += (speed - e.speed) * (1 - Math.exp(-dt * (speed > e.speed ? (e.mode === "strike" ? 14 : 3) : 2.5)));
        current(e.river.s, e.river.u, e.position.y, flow, time, true);
        e.velocity.copy(e.heading).multiplyScalar(e.speed);
        e.velocity.x += flow.vx;
        e.velocity.z += flow.vz;
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
        const low = floor + e.size * 0.12;
        const high = Math.max(low, top - e.size * 0.1);
        e.position.y = e.spec.bottom && e.mode === "lurk" ? low : clamp(e.position.y, low, high);
        const beat = 0.6 + (e.speed / e.size) * 1.4;
        e.phase = (e.phase + dt * TAU * beat) % TAU;
        const wantGape = e.mode === "strike" ? 1 : e.mode === "coil" ? 0.35 : 0.08;
        e.gape += (wantGape - e.gape) * (1 - Math.exp(-dt * 12));
      }
      // (A dead fish's fins hang still.)
      if (!e.dead) e.finPhase = (e.finPhase + dt * TAU * 1.4) % TAU;
    }
    separate(dt);
    draw();
  }

  // Enemies of a kind keep a little apart instead of swimming through one another.
  function separate(dt) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.kind !== a.kind) continue;
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

  function draw() {
    const slots = {};
    for (const e of list) {
      const crowd = crowds[e.kind];
      const slot = (slots[e.kind] = (slots[e.kind] ?? -1) + 1);
      axisZ.crossVectors(e.heading, UP);
      if (axisZ.lengthSq() < 1e-6) axisZ.set(0, 0, 1);
      axisZ.normalize();
      axisY.crossVectors(axisZ, e.heading).normalize();
      basis.makeBasis(e.heading, axisY, axisZ);
      quaternion.setFromRotationMatrix(basis);
      if (e.rolled > 0) quaternion.multiply(roll.setFromAxisAngle(FORWARD, e.rolled + (e.dead ? 0.12 * Math.sin(e.corpse * 1.7 + e.id) : 0)));
      const fade = e.dead ? clamp((CORPSE_SECONDS - e.corpse) / 1.5, 0, 1) : 1;
      const k = (e.size / MODEL_LENGTH) * fade;
      matrix.compose(e.position, quaternion, scale.set(k, k, k));
      crowd.body.setMatrixAt(slot, matrix);
      const coiled = e.mode === "coil";
      const amplitude = e.dead ? 0 : coiled ? 0.95 : 0.3 + Math.min(0.5, (e.speed / e.size) * 0.4);
      crowd.swim.setXYZW(slot, e.phase, amplitude, 0, e.mode === "lurk" ? 0.5 : 0.1);
      crowd.fin.setX(slot, e.finPhase);
      crowd.mouth.setX(slot, e.gape);
    }
    for (const crowd of Object.values(crowds)) crowd.finish();
  }

  // A hit for `damage` from direction `dir` (a unit vector, the way the shot flew). Returns
  // true when it sank the enemy.
  function hit(e, damage, dir, by = 0) {
    if (e.dead) return false;
    e.hp -= damage;
    e.lastHitBy = by;
    e.stagger = 0.12;
    if (dir) e.position.addScaledVector(dir, Math.min(0.3, 0.04 * e.size));
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
    draw();
  }

  return { list, crowds, whiffs, spawn, update, hit, count, reset, snout };
}
