// Everything that flies: laser bolts now, later pellets, saw blades, torpedoes. A shot is a
// small record -- where it is, how fast it goes, what it does when it hits -- kept in one
// list and moved each step. Hits are tested along the whole path of the step (a fast bolt
// moves more than a small fish's length in one step), against the enemies' bodies, the
// stones near the players, the bed, and the surface.
//
// In co-op a shot is one event: it flies the same on every machine, and only the enemy's
// owner decides what it did (plan, part 5). Here it is the local game alone.

import * as THREE from "three";
import { bed, level, locate } from "../course.js";

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

export function createProjectiles({ capacity = 300 } = {}) {
  const live = [];
  const tail = new THREE.Vector3();
  const head = new THREE.Vector3();
  const from = new THREE.Vector3();

  // A new shot. `o`: owner (player id), weapon id, position, velocity (Vector3s, copied),
  // damage, radius, life (seconds), size and tint (for the glow), stretch.
  function fire(o) {
    if (live.length >= capacity) live.shift();
    const shot = {
      owner: o.owner ?? 0,
      weapon: o.weapon,
      position: o.position.clone(),
      velocity: o.velocity.clone(),
      damage: o.damage,
      radius: o.radius ?? 0.03,
      life: o.life ?? 1.5,
      age: 0,
      size: o.size ?? 0.05,
      tint: o.tint ?? [6, 1, 0.5],
      stretch: o.stretch ?? 3,
      river: { s: o.s ?? null, u: 0 },
    };
    live.push(shot);
    return shot;
  }

  // Move every shot one step. `enemies`: the enemy list; `stones`: colliders near the
  // players (terrain.collidersNear); the callbacks get the shot, and the enemy or point hit.
  function update(dt, { enemies, stones, onEnemy, onGround, onStone }) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        live.splice(i, 1);
        continue;
      }
      from.copy(p.position);
      p.position.addScaledVector(p.velocity, dt);
      // The enemies: the nearest body along the path.
      let best = null,
        bestS = 2;
      for (const e of enemies) {
        if (e.dead) continue;
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
        p.position.lerpVectors(from, p.position, bestS);
        live.splice(i, 1);
        onEnemy?.(p, best);
        continue;
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
          break;
        }
      }
      if (struck) {
        live.splice(i, 1);
        onStone?.(p, struck);
        continue;
      }
      // The bed and the surface.
      locate(p.position.x, p.position.z, p.river.s, p.river);
      if (p.position.y < bed(p.river.s, p.river.u)) {
        live.splice(i, 1);
        onGround?.(p);
        continue;
      }
      if (p.position.y > level(p.river.s) + 0.05) {
        live.splice(i, 1);
        continue;
      }
    }
  }

  function reset() {
    live.length = 0;
  }

  return { live, fire, update, reset };
}
