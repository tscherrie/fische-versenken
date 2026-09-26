// Weapons found along the way (plan, part 3): the only things there are to collect. Capsules
// lie at fixed places along the river, the same for every player (from a stream of their
// own, so the river's layout is untouched), a third of them in the lee of a stone; each one
// is rolled afresh for each player from the weapons of that player's stage. A salmon swims
// into one to take it: the weapon goes onto its place (back or belly), and the one it
// carried there is left behind in a capsule of its own -- for five seconds it can take that
// back, and a teammate can have it. A capsule also sinks down at every stage-up with the new
// stage's weapon, the old king leaves the katana, and a weapon lost with a death waits a
// minute where the fish died. (item.stage is the weapon's stage, for the capsule's colour.)

import * as THREE from "three";
import { randomGenerator } from "../../shared/random.js";
import { S, bed, level, place, section } from "../course.js";
import { STAGES } from "../salmon.js";

// Which stage each weapon comes with, and where it sits.
export const ARSENAL = {
  piu: { stage: 0, place: "back" },
  flinte: { stage: 1, place: "back" },
  granate: { stage: 2, place: "back" },
  katana: { stage: 3, place: "back", boss: true },
  flammen: { stage: 4, place: "back" },
  minigun: { stage: 5, place: "back" },
  torpedo: { stage: 5, place: "belly" },
  raketen: { stage: 6, place: "back" },
  minen: { stage: 6, place: "belly" },
  panzerbuechse: { stage: 7, place: "back" },
  blitz: { stage: 7, place: "belly" },
  strahl: { stage: 8, place: "back" },
  harpune: { stage: 8, place: "belly" },
  kanone: { stage: 8, place: "back", secret: true },
  nodachi: { stage: 9, place: "back" },
  saege: { stage: 9, place: "belly" },
};
const TWO_FROM = 5; // two weapons from the smolt on

const TAKE_LOCK = 3,
  UNDO = 5,
  DROP_LIFE = 120,
  REVENGE_LIFE = 60;

export function createPickups({ weapons, random = Math.random }) {
  // The fixed places: along the river every 280-420 units, at sea wider apart.
  const stream = randomGenerator(0xca95e1);
  const slots = [];
  for (let s = S.redd + 70; s < S.coast + 3200; ) {
    const c = section(Math.min(s, S.coast));
    const u = s < S.coast ? c.thalweg + (stream() - 0.5) * 1.2 * c.half : (stream() - 0.5) * 300;
    slots.push({ id: slots.length, s, u, hidden: stream() < 0.3, spot: null, taken: new Set() });
    s += s < S.coast ? 280 + stream() * 140 : 600 + stream() * 300;
  }
  // Capsules in the water now: from slots (per player), dropped weapons, deliveries.
  const items = [];
  const where = {};
  const tmp = new THREE.Vector3();

  const usable = (id) => !!weapons[id];
  function carried(a) {
    return [a.back, a.belly].filter(Boolean);
  }
  // A weapon for this player from what its stage can carry, not one it has; newer first.
  function roll(player, seed) {
    const stage = player.fish.stage;
    const have = new Set(carried(player.arsenal));
    const choice = Object.entries(ARSENAL).filter(([id, w]) => usable(id) && !w.boss && !w.secret && w.stage <= stage && !have.has(id) && (stage >= TWO_FROM || w.place === "back"));
    if (!choice.length) return null;
    const r = randomGenerator(seed)();
    let total = 0;
    for (const [, w] of choice) total += 1 + w.stage;
    let x = r * total;
    for (const [id, w] of choice) if ((x -= 1 + w.stage) <= 0) return id;
    return choice[0][0];
  }
  // A stone to hide behind: the biggest near the slot, the capsule in its lee (downstream).
  function hide(slot, terrain) {
    const stones = terrain.collidersNear(slot.x, slot.z, 8, []);
    let best = null;
    for (const c of stones) if (c.cos !== undefined && (c.r ?? 0) >= 1 && (!best || c.r > best.r)) best = c;
    if (!best) return;
    const f = {};
    place(slot.s + 0.5, slot.u, f);
    const dx = f.x - slot.x,
      dz = f.z - slot.z,
      d = Math.hypot(dx, dz) || 1;
    slot.x = best.x + (dx / d) * (best.r + 0.8);
    slot.z = best.z + (dz / d) * (best.r + 0.8);
    slot.y = best.y;
  }

  function add(item) {
    items.push({ age: 0, state: "idle", ...item });
  }

  return {
    items,
    slots,
    // A capsule sinking down beside the fish with the weapon `id` (a stage-up, the king).
    deliver(player, id, at = null) {
      if (!usable(id)) return;
      const f = player.fish;
      const p = at ? at.clone() : f.position.clone().addScaledVector(f.heading, 1.5 + 2 * f.length);
      add({ x: p.x, y: p.y + 1.5 + f.length, z: p.z, weapon: id, place: ARSENAL[id]?.place ?? "back", owner: player.id, sinking: true, life: 180, stage: ARSENAL[id]?.stage, size: 0.4 + 0.25 * f.length });
    },
    // A weapon left where a fish died: a minute to come back for it.
    revenge(player, id, at) {
      if (!id || !usable(id)) return;
      add({ x: at.x, y: at.y, z: at.z, weapon: id, place: ARSENAL[id]?.place ?? "back", owner: null, life: REVENGE_LIFE, lock: 0, stage: ARSENAL[id]?.stage, size: 0.4 + 0.25 * player.fish.length });
    },
    // Each step: slots near the player come up with a capsule rolled for it; capsules are
    // taken by swimming into them.
    update(dt, { players, terrain, onTake }) {
      for (const player of players) {
        const f = player.fish;
        if (!f || player.down) continue;
        // Slots within reach show a capsule for this player (once per stage band).
        for (const slot of slots) {
          if (Math.abs(slot.s - f.river.s) > 70) continue;
          const band = `${player.id}:${STAGES[f.stage].phase}`;
          if (slot.taken.has(band) || items.some((i) => i.slot === slot.id && i.owner === player.id)) continue;
          if (slot.x === undefined) {
            place(slot.s, slot.u, where);
            slot.x = where.x;
            slot.z = where.z;
            slot.y = null;
            if (slot.hidden) hide(slot, terrain);
          }
          const id = roll(player, slot.id * 7919 + f.stage * 104729 + player.id * 31);
          if (!id) continue;
          const floor = bed(slot.s, slot.u);
          const y = Math.min(level(slot.s) - 0.4, (slot.y ?? floor) + 0.35 + 0.2 * f.length);
          add({ x: slot.x, y, z: slot.z, weapon: id, place: ARSENAL[id].place, owner: player.id, slot: slot.id, band, life: 1e9, stage: ARSENAL[id].stage, size: 0.4 + 0.25 * f.length, hidden: slot.hidden });
        }
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.age += dt;
        if (item.lock > 0) item.lock -= dt;
        // A delivery sinks down beside the fish, then stays.
        if (item.sinking) {
          item.y -= 0.6 * dt;
          if (item.age > 2.5) item.sinking = false;
        }
        if (item.age > item.life || item.state === "taken") {
          if (item.state === "taken" && (item.takenAge = (item.takenAge ?? 0) + dt) < 0.6) continue;
          items.splice(i, 1);
          continue;
        }
        if (item.state !== "idle") continue;
        for (const player of players) {
          const f = player.fish;
          if (!f || player.down || f.captive || f.lunging) continue;
          if (item.owner !== null && item.owner !== undefined && item.owner !== player.id) continue;
          if (item.lockFor === player.id && item.lock > 0) continue;
          tmp.set(item.x, item.y, item.z);
          if (f.mouth.distanceTo(tmp) > 0.35 * f.length + item.size * 0.6) continue;
          // Taken: onto its place; before the smolt the one weapon it carries is replaced.
          const a = player.arsenal;
          const placeOf = f.stage >= TWO_FROM ? item.place : "back";
          const old = f.stage >= TWO_FROM ? a[placeOf] : a.back ?? a.belly;
          if (f.stage < TWO_FROM) a.belly = null;
          a[placeOf] = item.weapon;
          if (a.ensure) a.ensure(item.weapon);
          else a.heat[item.weapon] ??= 0;
          item.state = "taken";
          if (item.slot !== undefined) slots[item.slot].taken.add(item.band);
          // What it carried waits in a capsule of its own (locked for it a moment, unless it
          // swims back in within the few seconds of the undo).
          if (old && old !== item.weapon) add({ x: f.position.x, y: f.position.y, z: f.position.z, weapon: old, place: ARSENAL[old]?.place ?? "back", owner: null, life: DROP_LIFE, lock: TAKE_LOCK, lockFor: player.id, undo: UNDO, stage: ARSENAL[old]?.stage, size: item.size });
          onTake?.(player, item.weapon, old);
          break;
        }
      }
    },
    reset() {
      items.length = 0;
      for (const slot of slots) slot.taken.clear();
    },
  };
}
