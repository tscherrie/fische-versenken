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
import { bed, clamp, current, level, locate, place, section } from "../course.js";
import { creatureMaterial, heronHeadGeometry, heronLegsGeometry, kingfisherGeometry, merganserGeometry } from "../creatures.js";
import { KINDS } from "./kinds.js";

// The birds' stand-in bodies: the base game's own models (creatures.js), until the look
// gives them models of their own. Each is laid along +x, beak first.
// (The heron's are its legs with the body high above them, standing on the bed, and its
// neck and head apart, which move.)
const BIRD_MODELS = { kingfisher: kingfisherGeometry, merganser: merganserGeometry, heron: heronLegsGeometry };

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);
const ACROSS = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;
// How long a dead enemy stays before it goes (the look fades it out on the same beat).
export const CORPSE_SECONDS = 40;
// How far the salmon may get from an ambusher before it gives up its place (units).
const LEFT_BEHIND = 120;

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
  for (const [kind, spec] of Object.entries(KINDS)) {
    if (spec.render === "bird") continue;
    // With the distance detail (anatomy.js): enemies out of view are not drawn, and far ones
    // are drawn with the light body.
    crowds[kind] = createFishMesh(scene, spec.body, spec.coat, spec.capacity, { name: `Combat ${kind}`, castShadow: false, detail: 0.55, lod: true });
    // On layer 1 with the effects: the main view sees them, the mirror and the Snell's
    // window (which only show what is above the water) do not draw them again.
    const far = crowds[kind].far;
    for (const mesh of [crowds[kind].body, crowds[kind].membranes, far?.mesh ?? far]) mesh?.layers?.set(1);
  }
  const list = [];
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
      mode: spec.behaviour === "ambush" ? "lurk" : spec.behaviour === "diver" ? "circle" : "approach",
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
        dive(e, dt, time, players, hooks);
        if (e.stagger > 0) e.stagger -= dt;
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
    }
    for (const e of list) {
      if (e.neutral || drawnElsewhere.has(e.kind)) continue;
      const bird = birds[e.kind];
      if (bird && e.spec.wades) {
        heronPose(e, bird);
        continue;
      }
      if (bird) {
        // (Its model is laid along +x from its own origin: moved so the middle of the body
        // is where the enemy is, scaled to its size.)
        pose(e, matrix);
        const s = MODEL_LENGTH / bird.length;
        matrix.multiply(basis.makeScale(s, s, s).setPosition(-bird.middle * s, 0, 0));
        bird.mesh.setMatrixAt(bird.mesh.count++, matrix);
        // (Where its beak is, ahead of its middle, for its strike.)
        e.beak = ((bird.beak - bird.middle) * e.size) / bird.length;
        continue;
      }
      const crowd = crowds[e.kind];
      const slot = (slots[e.kind] = (slots[e.kind] ?? -1) + 1);
      crowd.body.setMatrixAt(slot, pose(e, matrix));
      const coiled = e.mode === "coil" || e.mode === "aim";
      const amplitude = e.dead ? 0 : coiled ? 0.95 : 0.3 + Math.min(0.5, (e.speed / e.size) * 0.4);
      // (A dead body hangs as limp as the splatter says: e.limp bends its spine.)
      crowd.swim.setXYZW(slot, e.phase, amplitude, e.dead ? (e.limp ?? 0) : 0, e.mode === "lurk" ? 0.5 : 0.1);
      crowd.fin.setX(slot, e.finPhase);
      crowd.mouth.setX(slot, e.gape);
    }
    for (const crowd of Object.values(crowds)) crowd.finish();
    for (const kind in birds)
      for (const mesh of [birds[kind].mesh, birds[kind].head]) {
        if (!mesh) continue;
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
    // A kind now drawn by its own models: its stand-in body is no longer drawn.
    drawnBy(kind) {
      drawnElsewhere.add(kind);
      // (Its slots are simply never written, so the crowd draws none of it.)
    },
  };
  return api;
}
