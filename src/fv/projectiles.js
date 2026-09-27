// Everything that flies: laser bolts, pellets, grenades, the flame's puffs. A shot is a small
// record -- where it is, how fast it goes, what it does when it hits -- kept in one list and
// moved each step. Hits are tested along the whole path of the step (a fast bolt moves more
// than a small fish's length in one step), against the enemies' bodies, the stones near the
// players, the bed, and the surface. The records are pooled: nothing is allocated per shot.
//
// Ballistics as in water (the user's rule, which replaced "as in air"): a round marked
// `water` loses its speed to `drag`, does harm only while it still has a quarter of its first
// speed, and then, spent, hangs in the water and sinks to lie on the bed a while. What has
// `gravity` falls with it and may bounce off the bed and the stones. Lasers are not rounds:
// they fly straight.
//
// In co-op a shot is one event: it flies the same on every machine, and only the enemy's
// owner decides what it did (plan, part 5). Here it is the local game alone.
//
// (The weapons' smoke and ribbons are in look/smoke.js, re-exported from here.)

import * as THREE from "three";
import { Fn, attribute, cameraPosition, cos, exp, float, length, mix, positionWorld, select, sin, smoothstep, texture, uv, vec2, vec4 } from "three/tsl";
import { bed, level, locate } from "../course.js";
import { PointCloud, perPoint, skyUniforms } from "../materials.js";
import { river, waterLit, waterTime } from "../render/water.js";
import { extinction, fogNodes } from "../render/fog.js";
import { ditherThreshold } from "../render/dither.js";
import { FX_LAYER } from "./fx.js";
export { createSmoke, createRibbons, POWDER, GAS, SILT, SOOT, GRIT } from "./look/smoke.js";

// Closest distance between segments p0-p1 and q0-q1, squared (a standard clamp-and-project);
// how far along p0-p1 the closest point lies is left in `along`.
let along = 0;
function segmentDistance2(p0, p1, q0, q1) {
  const ux = p1.x - p0.x,
    uy = p1.y - p0.y,
    uz = p1.z - p0.z;
  const vx = q1.x - q0.x,
    vy = q1.y - q0.y,
    vz = q1.z - q0.z;
  const wx = p0.x - q0.x,
    wy = p0.y - q0.y,
    wz = p0.z - q0.z;
  const a = ux * ux + uy * uy + uz * uz,
    b = ux * vx + uy * vy + uz * vz,
    c = vx * vx + vy * vy + vz * vz,
    d = ux * wx + uy * wy + uz * wz,
    e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  let s = den > 1e-9 ? (b * e - c * d) / den : 0;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  let t = c > 1e-9 ? (b * s + e) / c : 0;
  if (t < 0) {
    t = 0;
    s = a > 1e-9 ? Math.min(1, Math.max(0, -d / a)) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-9 ? Math.min(1, Math.max(0, (b - d) / a)) : 0;
  }
  const dx = wx + ux * s - vx * t,
    dy = wy + uy * s - vy * t,
    dz = wz + uz * s - vz * t;
  along = s;
  return dx * dx + dy * dy + dz * dz;
}

// A 40 mm grenade (HE-DP): a stubby olive body with a gold ogive, along +x, 1 long.
function grenadeGeometry() {
  const body = new THREE.CylinderGeometry(0.42, 0.42, 0.62, 10, 1);
  body.rotateZ(-Math.PI / 2);
  body.translate(-0.12, 0, 0);
  const nose = new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.scale(1, 1.1, 1);
  nose.rotateZ(-Math.PI / 2);
  nose.translate(0.19, 0, 0);
  const band = new THREE.CylinderGeometry(0.44, 0.44, 0.1, 10, 1);
  band.rotateZ(-Math.PI / 2);
  band.translate(-0.4, 0, 0);
  const parts = [
    [body, [0.24, 0.26, 0.16]],
    [nose, [0.78, 0.6, 0.18]],
    [band, [0.62, 0.45, 0.2]],
  ];
  const positions = [],
    normals = [],
    colors = [];
  for (const [g, c] of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    positions.push(...n.attributes.position.array);
    normals.push(...n.attributes.normal.array);
    for (let i = 0; i < n.attributes.position.count; i++) colors.push(...c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// The fields a shot record carries, with their values for a new shot (weapons set what they
// need after fire()).
const NO_TINT = [6, 1, 0.5];
function blank(p) {
  p.owner = 0;
  p.weapon = null;
  p.damage = 0;
  p.radius = 0.03;
  p.life = 1.5;
  p.age = 0;
  p.size = 0.05;
  p.tint = NO_TINT;
  p.core = null;
  p.stretch = 3;
  p.gravity = 0;
  p.bounce = 0;
  p.maxBounces = 0;
  p.bounces = 0;
  p.drag = 0;
  p.water = false;
  p.speed0 = 0;
  p.spent = false;
  p.rested = false;
  p.ghost = false;
  p.pierce = 0;
  p.pierceKeep = 0.85;
  p.passed.clear();
  p.sky = 0.05;
  p.solid = null;
  p.scale = 1;
  p.shooter = 1;
  p.volley = 0;
  p.falloff = null;
  p.shove = 0;
  p.grow = 0;
  p.cool = null;
  p.fade = 0;
  p.fuse = false;
  p.spin = Math.random() * Math.PI * 2;
  return p;
}

export function createProjectiles({ capacity = 300, scene = null, camera = null, solidCapacity = 32 } = {}) {
  const live = [];
  // The records, made once; `free` holds those not in flight.
  const free = [];
  for (let i = 0; i < capacity; i++) free.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), last: new THREE.Vector3(), river: { s: null, u: 0 }, passed: new Set(), born: 0 });
  let born = 0;
  const tail = new THREE.Vector3();
  const head = new THREE.Vector3();
  const from = new THREE.Vector3();
  const end = new THREE.Vector3();
  const normal = new THREE.Vector3();

  // Grenades are solid, lit bodies (one instanced draw), not glows.
  let solids = null;
  if (scene) {
    const material = waterLit(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }));
    solids = new THREE.InstancedMesh(grenadeGeometry(), material, solidCapacity);
    solids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    solids.name = "Combat grenades";
    solids.frustumCulled = false;
    solids.castShadow = false;
    solids.receiveShadow = true;
    solids.layers.set(FX_LAYER);
    // One instance, too small to see, until the first frame: the warm-up compiles it.
    solids.setMatrixAt(0, new THREE.Matrix4().makeScale(1e-5, 1e-5, 1e-5));
    solids.count = 1;
    scene.add(solids);
  }
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const dir = new THREE.Vector3();
  const eye = new THREE.Vector3();

  // A new shot from `position` along `velocity` (both copied), for `owner` (a player id) and
  // `weapon` (an id). The record comes back with every field at its default: the weapon sets
  // what it needs (damage, radius, life, size, tint, core, stretch; gravity, bounce and
  // maxBounces, fuse, drag, ghost, pierce, sky, solid, scale; volley, falloff, shove, grow,
  // cool, fade, shooter). When the pool is dry the oldest glow goes first; a grenade is
  // kept if anything else can go.
  function spawn(owner, weapon, position, velocity, s = null) {
    let p = free.pop();
    if (!p) {
      let oldest = -1;
      for (let i = 0; i < live.length; i++) if (!live[i].solid && (oldest < 0 || live[i].born < live[oldest].born)) oldest = i;
      if (oldest < 0) oldest = 0;
      p = live[oldest];
      live[oldest] = live[live.length - 1];
      live.pop();
    }
    blank(p);
    p.owner = owner ?? 0;
    p.weapon = weapon;
    p.position.copy(position);
    p.last.copy(position);
    p.velocity.copy(velocity);
    p.river.s = s;
    p.river.u = 0;
    p.born = ++born;
    live.push(p);
    return p;
  }
  // The same with the fields given in one object (for tests and rare shots).
  function fire(o) {
    const p = spawn(o.owner, o.weapon, o.position, o.velocity, o.s ?? null);
    for (const k in o) if (k !== "position" && k !== "velocity" && k !== "s" && k !== "owner" && k !== "weapon") p[k] = o[k];
    return p;
  }
  // (Taken out of the list at `i`, its place filled from the end, and back to the pool.)
  function drop(i) {
    const p = live[i];
    live[i] = live[live.length - 1];
    live.pop();
    free.push(p);
  }

  // Move every shot one step. `enemies`: the enemy list; `stones`: colliders near the
  // players (terrain.collidersNear); the callbacks get the shot, and the enemy or point hit:
  // onEnemy, onGround, onStone, onBounce(shot, "bed" | "stone"), onExpire (fused shots). The
  // shot is handed back to the pool right after its callback: keep nothing of it.
  function update(dt, { enemies, stones, onEnemy, onGround, onStone, onBounce, onExpire }) {
    // (Backwards, so a shot moved into a freed place has had its step already.)
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (p.fuse) onExpire?.(p);
        drop(i);
        continue;
      }
      if (p.rested) continue;
      from.copy(p.position);
      p.last.copy(p.position);
      if (p.drag) p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
      if (p.water) {
        if (!p.spent && p.velocity.lengthSq() < 0.0625 * p.speed0 * p.speed0) p.spent = true;
        if (p.spent) p.velocity.y += (-0.45 - p.velocity.y) * (1 - Math.exp(-dt * 2));
      }
      p.position.addScaledVector(p.velocity, dt);
      // (Exact for a constant pull, whatever the step: the arc lands where it was aimed.)
      if (p.gravity) {
        p.position.y -= 0.5 * p.gravity * dt * dt;
        p.velocity.y -= p.gravity * dt;
      }
      p.spin += dt * 14;
      // The enemies: the nearest body along the path (not for a spent round).
      if (!p.ghost && !p.spent) {
        let best = null,
          bestS = 2;
        for (const e of enemies) {
          if (e.dead || (p.pierce && p.passed.has(e))) continue;
          const reach = e.size * 0.6 + p.radius;
          const dx = e.position.x - from.x,
            dz = e.position.z - from.z;
          if (Math.abs(dx) > reach + Math.abs(p.velocity.x * dt) + e.size || Math.abs(dz) > reach + Math.abs(p.velocity.z * dt) + e.size) continue;
          tail.copy(e.position).addScaledVector(e.heading, -0.5 * e.size);
          head.copy(e.position).addScaledVector(e.heading, 0.44 * e.size);
          const r = e.size * 0.09 + p.radius;
          if (segmentDistance2(from, p.position, tail, head) < r * r && along < bestS) {
            best = e;
            bestS = along;
          }
        }
        if (best) {
          if (p.pierce > 0) {
            // On through it, a little slower.
            p.pierce--;
            p.passed.add(best);
            end.copy(p.position);
            p.position.lerpVectors(from, end, bestS);
            onEnemy?.(p, best);
            p.position.copy(end);
            p.damage *= p.pierceKeep;
          } else {
            p.position.lerpVectors(from, p.position, bestS);
            onEnemy?.(p, best);
            drop(i);
            continue;
          }
        }
      }
      // Stones: the end of the step inside one (each a turned ellipsoid).
      let struck = null;
      for (const c of stones) {
        const rx = c.rx ?? c.r,
          rz = c.rz ?? c.r,
          ry = c.ry ?? c.r;
        const ox = p.position.x - c.x,
          oy = p.position.y - c.y,
          oz = p.position.z - c.z;
        if (Math.abs(ox) > rx + rz || Math.abs(oz) > rx + rz) continue;
        const cs = c.cos ?? 1,
          sn = c.sin ?? 0;
        const ax = (ox * cs - oz * sn) / rx,
          ay = oy / ry,
          az = (ox * sn + oz * cs) / rz;
        if (ax * ax + ay * ay + az * az < 1) {
          struck = c;
          // The surface's normal there (the ellipsoid's gradient, turned back to the world).
          const gx = ax / rx,
            gy = ay / ry,
            gz = az / rz;
          normal.set(gx * cs + gz * sn, gy, -gx * sn + gz * cs).normalize();
          break;
        }
      }
      if (struck) {
        if (p.ghost) {
          drop(i);
          continue;
        }
        if (p.bounce && p.bounces < p.maxBounces) {
          p.bounces++;
          p.position.copy(from);
          const vn = p.velocity.dot(normal);
          if (vn < 0) p.velocity.addScaledVector(normal, -(1 + p.bounce) * vn);
          p.velocity.multiplyScalar(0.8);
          onBounce?.(p, "stone");
          continue;
        }
        onStone?.(p, struck);
        drop(i);
        continue;
      }
      // The bed and the surface.
      locate(p.position.x, p.position.z, p.river.s, p.river);
      const floor = bed(p.river.s, p.river.u);
      if (p.position.y < floor) {
        // A spent round settles on the bed and lies there until its life is over.
        if (p.spent) {
          p.position.y = floor;
          p.velocity.set(0, 0, 0);
          p.rested = true;
          continue;
        }
        if (p.ghost) {
          // Fire along the bed: it spreads and dies.
          p.position.y = floor + 0.01;
          p.velocity.y = Math.abs(p.velocity.y) * 0.2;
          continue;
        }
        if (p.bounce && p.bounces < p.maxBounces) {
          p.bounces++;
          p.position.y = floor + 0.005;
          p.velocity.y = Math.abs(p.velocity.y) * p.bounce;
          p.velocity.x *= 0.7;
          p.velocity.z *= 0.7;
          onBounce?.(p, "bed");
          continue;
        }
        onGround?.(p);
        drop(i);
        continue;
      }
      if (p.position.y > level(p.river.s) + p.sky) {
        drop(i);
        continue;
      }
    }
  }

  // Each frame: the solid shots' bodies, turned along their flight and tumbling a little.
  function draw() {
    if (!solids) return;
    if (camera) camera.getWorldPosition(eye);
    // (How tall the picture is at one unit from the eye.)
    const tall = 2 * Math.tan(((camera?.fov ?? 62) * Math.PI) / 360);
    let n = 0;
    for (const p of live) {
      if (!p.solid || n >= solidCapacity) continue;
      dir.copy(p.velocity);
      if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
      dir.normalize();
      quaternion.setFromUnitVectors(X, dir);
      quaternion.multiply(spin.setFromAxisAngle(X, p.spin));
      // 40 mm on a launcher sized to the fish (the model's 0.024 long x k), shown half again
      // as big so it reads at the chase camera's distance -- and never smaller than about
      // eight pixels in a 720 p picture, so the arc can be followed at any size.
      const k = Math.max(p.scale * 0.046, camera ? 0.011 * tall * eye.distanceTo(p.position) : 0);
      matrix.compose(p.position, quaternion, scale.set(k, k, k));
      solids.setMatrixAt(n++, matrix);
    }
    solids.count = n;
    if (n) solids.instanceMatrix.needsUpdate = true;
  }

  function reset() {
    while (live.length) drop(live.length - 1);
  }

  return { live, spawn, fire, update, draw, reset };
}

// ---- Smoke: what darkens the water instead of lighting it up.
//
// What a puff is made of (its colour in daylight; the water above takes its share of that
// light, red first, as it does for everything in the river).
