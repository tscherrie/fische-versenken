// The enemies' shots: bullets and pellets from the guns strapped to them. They are kept
// apart from the players' own shots (projectiles.js): they hit players, not enemies, fly a
// little slower so a salmon that sees them coming can get out of the way, and each carries
// the enemy that fired it, for the cause of death.
//
// Water stops a bullet: it loses its speed fast, does harm only over a short distance and
// less the slower it gets, and once it is spent it only sinks. It comes to rest on the bed,
// or where it is when its life is up, lies there a while (REST) and then goes.

import * as THREE from "three";
import { bed, level, locate } from "../course.js";

// Below this share of its first speed a bullet is spent: harmless, sinking.
const SPENT = 0.25;
const SINK = 0.45;
// A round at rest lies there this long, then goes (the look fades it out over this time).
export const REST = 8;

// The fields a round carries, at their values for a new one (fire() puts what the gun gives
// in their place).
const NO_TINT = [7, 3.2, 0.7];
function blank(p) {
  p.source = null;
  p.weapon = null;
  p.cause = null;
  p.damage = 0;
  // How fast the water takes its speed (per second).
  p.drag = 1.5;
  p.radius = 0.03;
  p.life = 12;
  p.size = 0.05;
  p.tint = NO_TINT;
  p.stretch = 3.5;
  p.age = 0;
  p.speed0 = 0;
  p.spent = false;
  // Seconds since it was spent; whether it is at rest, and its spentAge when it came to rest.
  p.spentAge = 0;
  p.rested = false;
  p.restAt = 0;
  // The bed under it, worked out once when it is spent.
  p.floor = 0;
  // What it does to the player it strikes (set as it strikes).
  p.hitDamage = 0;
  // How hard it throws the fish it strikes along its line (x the fish's cruising speed; a
  // heavy round's, the pike's): combat's hurt() does it, less the slower the round has got.
  p.shove = 0;
  // Fired from above the water (the heron's harpoon): until it is in, the water neither
  // brakes it nor ends it at the surface.
  p.air = false;
  return p;
}

export function createHostile({ capacity = 160 } = {}) {
  const live = [];
  // The records, made once; `free` holds those not in the water.
  const free = [];
  for (let i = 0; i < capacity; i++) free.push(blank({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), last: new THREE.Vector3(), river: { s: null, u: 0 }, born: 0 }));
  let born = 0;
  // The rounds that struck a player (and whom) or the bed this step, handed on once the step
  // is done; a strike on the bed has no player.
  const struck = [];
  const struckPlayer = [];
  let struckCount = 0;
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

  // (Taken out of the list at `i`, its place filled from the end.)
  function take(i) {
    const p = live[i];
    live[i] = live[live.length - 1];
    live.pop();
    return p;
  }
  // Full: the oldest round at rest goes first, then the oldest spent one, and only then the
  // oldest still flying.
  function evict() {
    let rested = -1,
      spent = -1,
      flying = -1;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      if (p.rested) {
        if (rested < 0 || p.born < live[rested].born) rested = i;
      } else if (p.spent) {
        if (spent < 0 || p.born < live[spent].born) spent = i;
      } else if (flying < 0 || p.born < live[flying].born) flying = i;
    }
    return take(rested >= 0 ? rested : spent >= 0 ? spent : flying);
  }
  // (Still from now on, and REST counted from its spentAge now.)
  function rest(p) {
    p.velocity.set(0, 0, 0);
    p.rested = true;
    p.restAt = p.spentAge;
  }

  // A new round, from `o`: the enemy that fired it (`source`), the gun (`weapon`, an id),
  // `position` and `velocity`, `s` along the river, and the gun's `cause`, `damage`, `drag`,
  // `shove`, `radius`, `life`, `size`, `tint` and `stretch` (a field left out keeps its
  // default).
  // Nothing of `o` is kept, the round being a record from the pool, so a gun can hand in the
  // same object for every pellet. This is the only way in, so that whoever wraps `fire` (the
  // look's bench counts the rounds there) sees every round.
  function fire(o) {
    const p = blank(free.pop() ?? evict());
    p.source = o.source ?? null;
    p.weapon = o.weapon ?? null;
    p.cause = o.cause ?? null;
    p.damage = o.damage ?? p.damage;
    p.drag = o.drag ?? p.drag;
    p.shove = o.shove ?? p.shove;
    p.radius = o.radius ?? p.radius;
    p.life = o.life ?? p.life;
    p.size = o.size ?? p.size;
    p.tint = o.tint ?? p.tint;
    p.stretch = o.stretch ?? p.stretch;
    p.position.copy(o.position);
    p.last.copy(o.position);
    p.velocity.copy(o.velocity);
    p.speed0 = p.velocity.length();
    p.air = !!o.air;
    p.river.s = o.s ?? null;
    p.river.u = 0;
    p.born = ++born;
    live.push(p);
    return p;
  }

  // Move every round one step; `onPlayer(shot, player)` when one hits a player's body,
  // `onGround(shot)` when a flying one strikes the bed, both once every round has moved. The
  // round goes back to the pool right after its callback: keep nothing of it.
  function update(dt, players, { onPlayer, onGround }) {
    // (How much of a spent round's speed goes over to sinking in this step: the same for all.)
    const settle = 1 - Math.exp(-dt * 2);
    // (Backwards, so a round moved into a freed place has had its step already.)
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.rested) {
        p.spentAge += dt;
        if (p.spentAge > REST + p.restAt) free.push(take(i));
        continue;
      }
      // Its life is up: it rests where it is.
      if (p.age >= p.life) {
        rest(p);
        continue;
      }
      p.last.copy(p.position);
      if (p.air) {
        locate(p.position.x, p.position.z, p.river.s, p.river);
        if (p.position.y < level(p.river.s)) p.air = false;
      }
      if (p.spent) p.spentAge += dt;
      else if (!p.air) {
        p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
        if (p.velocity.length() < SPENT * p.speed0) {
          p.spent = true;
          // Where it will come down: worked out once, not asked of the river every step (it
          // barely drifts from here on).
          locate(p.position.x, p.position.z, p.river.s, p.river);
          p.floor = bed(p.river.s, p.river.u);
        }
      }
      // A spent round has no speed left for the water to take: it only sinks, what it had
      // going sideways dying away as it goes over to sinking.
      if (p.spent) {
        p.velocity.x -= p.velocity.x * settle;
        p.velocity.z -= p.velocity.z * settle;
        p.velocity.y += (-SINK - p.velocity.y) * settle;
      }
      p.position.addScaledVector(p.velocity, dt);
      if (p.spent) {
        if (p.position.y < p.floor) {
          p.position.y = p.floor;
          rest(p);
        }
        continue;
      }
      let hit = null,
        best = 2;
      for (let j = 0; j < players.length; j++) {
        const player = players[j];
        const f = player.fish;
        if (!f || player.down || f.captive || f.safe) continue;
        const L = f.length,
          h = f.heading,
          c = f.position;
        const r = 0.1 * L + p.radius;
        if (Math.abs(c.x - p.position.x) > L + 2 * r + Math.abs(p.velocity.x * dt) || Math.abs(c.z - p.position.z) > L + 2 * r + Math.abs(p.velocity.z * dt)) continue;
        const d2 = distance2(p.last, p.position, c.x - h.x * 0.5 * L, c.y - h.y * 0.5 * L, c.z - h.z * 0.5 * L, c.x + h.x * 0.44 * L, c.y + h.y * 0.44 * L, c.z + h.z * 0.44 * L);
        if (d2 < r * r && along < best) {
          best = along;
          hit = player;
        }
      }
      if (hit) {
        p.position.lerpVectors(p.last, p.position, best);
        // The slower it has become, the less it does.
        p.hitDamage = p.damage * Math.min(1, Math.max(0.4, p.velocity.length() / p.speed0));
        struck[struckCount] = take(i);
        struckPlayer[struckCount++] = hit;
        continue;
      }
      locate(p.position.x, p.position.z, p.river.s, p.river);
      // A flying round strikes the bed and is gone.
      if (p.position.y < bed(p.river.s, p.river.u)) {
        struck[struckCount] = take(i);
        struckPlayer[struckCount++] = null;
        continue;
      }
      if (!p.air && p.position.y > level(p.river.s) + 0.05) free.push(take(i));
    }
    // The strikes, told once every round has moved and newest round first, as they came when
    // the list still kept the order the rounds were fired in: of several rounds striking a
    // player in one step only the first told harms it (the rest fall in combat's moment of
    // grace), and the bubbles of a strike on the bed draw from the looks' random stream, so
    // swapping rounds about in the list must change neither.
    while (struckCount > 0) {
      let k = 0;
      for (let j = 1; j < struckCount; j++) if (struck[j].born > struck[k].born) k = j;
      const p = struck[k],
        player = struckPlayer[k];
      struckCount--;
      struck[k] = struck[struckCount];
      struckPlayer[k] = struckPlayer[struckCount];
      struck[struckCount] = struckPlayer[struckCount] = null;
      if (player) onPlayer?.(p, player);
      else onGround?.(p);
      free.push(p);
    }
  }

  return {
    live,
    fire,
    update,
    reset() {
      while (live.length) free.push(live.pop());
    },
  };
}
