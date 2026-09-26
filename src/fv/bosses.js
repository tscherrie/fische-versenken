// Bosses: big fights at fixed places, once per life of the brood (in co-op: once per room,
// plan part 5). The first is the old king of the trout in the Königsgumpe: he waits in the
// deep pool, and when a young salmon comes into it he opens up with the minigun on his back;
// hurt, he calls his young trout and goes for the salmon himself. Sunk, he leaves the katana
// he guarded (the capsule comes with the weapon pickups; until then it is handed over).

import { KING_POOL, section } from "../course.js";

const KEY = "extreme-bosses";

export function createBosses({ enemies, hud, random }) {
  let beaten = {};
  try {
    beaten = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {}
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(beaten));
    } catch {}
  };
  let king = null,
    called = false;

  return {
    get king() {
      return king;
    },
    // A new brood starts over: the bosses are back.
    reset() {
      beaten = {};
      save();
    },
    // Each step. `onBeaten(boss, enemy)` when one is sunk.
    update(dt, { fish, onBeaten }) {
      // The king comes up when a salmon smaller than a smolt nears his pool.
      if (!king && !beaten.king && fish.stage < 5 && Math.abs(fish.river.s - KING_POOL.s) < 90) {
        const c = section(KING_POOL.s);
        king = enemies.spawn("king", KING_POOL.s, c.thalweg);
        if (king) {
          king.home = king.position.clone();
          king.mode = "lurk";
          called = false;
        }
      }
      if (!king) return;
      if (king.dead) {
        beaten.king = true;
        save();
        hud.boss(null);
        hud.say("Versenkt!", "Der alte König", 2.2);
        onBeaten?.("king", king);
        king = null;
        return;
      }
      // Gone from the pool (the salmon swam on): he sinks back into the deep, whole again.
      if (Math.abs(fish.river.s - KING_POOL.s) > 220) {
        enemies.list.splice(enemies.list.indexOf(king), 1);
        king = null;
        hud.boss(null);
        return;
      }
      const near = king.position.distanceTo(fish.position) < 45;
      hud.boss(near ? "Der alte König" : null, king.hp / king.maxHp);
      // Hurt, he calls his young.
      if (!called && king.hp < king.maxHp * 0.5) {
        called = true;
        for (let i = 0; i < 4; i++) enemies.spawn("troutParr", king.river.s + (random() - 0.5) * 8, king.river.u + (random() - 0.5) * 6);
      }
    },
  };
}
