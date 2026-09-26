// The enemies' shots: bullets and pellets from the guns strapped to them. They are kept
// apart from the players' own shots (projectiles.js): they hit players, not enemies, fly a
// little slower so a salmon that sees them coming can get out of the way, and each carries
// the enemy that fired it, for the cause of death.
//
// Water stops a bullet: it loses its speed fast, does harm only over a short distance and
// less the slower it gets, and once it is spent it hangs in the water and sinks to the bed.

import { bed, level, locate } from "../course.js";

// Below this share of its first speed a bullet is spent: harmless, sinking.
const SPENT = 0.25;
const SINK = 0.45;
// A spent round that reached the bed lies there this long, then goes.
const REST = 8;

export function createHostile({ capacity = 160 } = {}) {
  const live = [];
  let along = 0;
  // Closest distance between segments p0-p1 and q0-q1, squared; `along` the fraction on p.
  function distance2(p0, p1, q0x, q0y, q0z, q1x, q1y, q1z) {
    const ux = p1.x - p0.x,
      uy = p1.y - p0.y,
      uz = p1.z - p0.z;
    const vx = q1x - q0x,
      vy = q1y - q0y,
      vz = q1z - q0z;
    const wx = p0.x - q0x,
      wy = p0.y - q0y,
      wz = p0.z - q0z;
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
    along = s;
    const dx = wx + ux * s - vx * t,
      dy = wy + uy * s - vy * t,
      dz = wz + uz * s - vz * t;
    return dx * dx + dy * dy + dz * dz;
  }

  // A shot: `drag` is how fast the water takes its speed (per second).
  function fire(shot) {
    // (Full: the oldest goes, which is most likely a round lying on the bed.)
    if (live.length >= capacity) live.shift();
    shot.age = 0;
    shot.speed0 = shot.velocity.length();
    shot.drag ??= 1.5;
    shot.spent = false;
    // Seconds since it was spent, and whether it lies on the bed.
    shot.spentAge = 0;
    shot.rested = false;
    shot.river = { s: shot.s ?? null, u: 0 };
    shot.last = shot.position.clone();
    live.push(shot);
  }

  // Move every shot one step; `onPlayer(shot, player)` when one hits a player's body.
  function update(dt, players, { onPlayer, onGround }) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        live.splice(i, 1);
        continue;
      }
      if (p.rested) {
        p.spentAge += dt;
        if (p.spentAge > REST + (p.restAt ?? 0)) live.splice(i, 1);
        continue;
      }
      p.last.copy(p.position);
      p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
      if (p.spent) p.spentAge += dt;
      if (!p.spent && p.velocity.length() < SPENT * p.speed0) {
        p.spent = true;
        // Where it will come down: worked out once, not asked of the river every step (it
        // barely drifts from here on).
        locate(p.position.x, p.position.z, p.river.s, p.river);
        p.floor = bed(p.river.s, p.river.u);
      }
      if (p.spent) p.velocity.y += (-SINK - p.velocity.y) * (1 - Math.exp(-dt * 2));
      p.position.addScaledVector(p.velocity, dt);
      let struck = null,
        best = 2;
      for (const player of players) {
        const f = player.fish;
        if (p.spent || !f || player.down || f.captive || f.safe) continue;
        const L = f.length,
          h = f.heading,
          c = f.position;
        const r = 0.1 * L + p.radius;
        if (Math.abs(c.x - p.position.x) > L + 2 * r + Math.abs(p.velocity.x * dt) || Math.abs(c.z - p.position.z) > L + 2 * r + Math.abs(p.velocity.z * dt)) continue;
        const d2 = distance2(p.last, p.position, c.x - h.x * 0.5 * L, c.y - h.y * 0.5 * L, c.z - h.z * 0.5 * L, c.x + h.x * 0.44 * L, c.y + h.y * 0.44 * L, c.z + h.z * 0.44 * L);
        if (d2 < r * r && along < best) {
          best = along;
          struck = player;
        }
      }
      if (struck) {
        p.position.lerpVectors(p.last, p.position, best);
        live.splice(i, 1);
        // The slower it has become, the less it does.
        p.hitDamage = p.damage * Math.min(1, Math.max(0.4, p.velocity.length() / p.speed0));
        onPlayer?.(p, struck);
        continue;
      }
      if (p.spent) {
        if (p.position.y < p.floor) {
          p.position.y = p.floor;
          p.velocity.set(0, 0, 0);
          p.rested = true;
          p.restAt = p.spentAge;
        }
        continue;
      }
      locate(p.position.x, p.position.z, p.river.s, p.river);
      const floor = bed(p.river.s, p.river.u);
      if (p.position.y < floor) {
        // A spent round settles on the bed; a live one strikes it and is gone.
        if (p.spent) {
          p.position.y = floor;
          p.velocity.set(0, 0, 0);
          p.rested = true;
          p.restAt = p.spentAge;
          continue;
        }
        live.splice(i, 1);
        onGround?.(p);
        continue;
      }
      if (p.position.y > level(p.river.s) + 0.05) live.splice(i, 1);
    }
  }

  return {
    live,
    fire,
    update,
    reset() {
      live.length = 0;
    },
  };
}
