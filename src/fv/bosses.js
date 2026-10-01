// Bosses: big fights at fixed places, once per life of the brood (in co-op: once per room,
// plan part 5). The first is the old king of the trout in the Königsgumpe: he waits in the
// deep pool, and when a young salmon comes into it he opens up with the minigun on his back;
// hurt, he calls his young trout and goes for the salmon himself. Sunk, he leaves the katana
// he guarded (the capsule comes with the weapon pickups; until then it is handed over).
//
// In a room (plan, part 5: "Bosse gibt es einmal pro Raum") only a page that sends the
// enemies raises him, under the id kept for him, so two pages raising him at once raise one
// king (owners.js settles who runs him); the others see him as he comes near, the bar
// included, and when he is sunk every page gets the katana. What was beaten is kept only in
// memory there: a brood swum alone must not keep him from a room.

import { KING_POOL, section } from "../course.js";

const KEY = "extreme-bosses";

export function createBosses({ enemies, hud, random }) {
  let beaten = {};
  try {
    beaten = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {}
  let room = false;
  const save = () => {
    if (room) return;
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
    // Each step. `onBeaten(boss, enemy)` when one is sunk; `spawns`: whether this page may
    // raise one (in a room, the page that sends the enemies); `room`: in a room.
    update(dt, { fish, onBeaten, spawns = true, room: inRoom = false }) {
      if (inRoom && !room) {
        room = true;
        beaten = {};
      }
      // (His record gone from the list -- another page's king that swam out of sight here --
      // he is no longer this page's to show.)
      if (king && king.gone) {
        king = null;
        hud.boss(null);
      }
      // Another page's king, near enough to be shown here: this page's to show too, hurt as
      // his owner says (and calling his young only once, wherever he is run).
      if (!king && room && !beaten.king)
        for (const e of enemies.list)
          if (e.kind === "king" && !e.dead && !e.gone) {
            king = e;
            called = e.hp < 0.5 * e.maxHp;
            break;
          }
      // The king comes up when a salmon smaller than a smolt nears his pool.
      if (!king && spawns && !beaten.king && fish.stage < 5 && Math.abs(fish.river.s - KING_POOL.s) < 90) {
        const c = section(KING_POOL.s);
        king = enemies.spawn("king", KING_POOL.s, c.thalweg, null, room ? { id: 1 } : undefined);
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
      // (Where another page runs him, that page decides.)
      if (Math.abs(fish.river.s - KING_POOL.s) > 220) {
        if (!king.remote) {
          if (room) enemies.remove(king);
          else enemies.list.splice(enemies.list.indexOf(king), 1);
        }
        king = null;
        hud.boss(null);
        return;
      }
      const near = king.position.distanceTo(fish.position) < 45;
      hud.boss(near ? "Der alte König" : null, king.hp / king.maxHp);
      // Hurt, he calls his young (where he is run).
      if (king.remote) {
        if (king.hp < king.maxHp * 0.5) called = true;
      } else if (!called && king.hp < king.maxHp * 0.5) {
        called = true;
        for (let i = 0; i < 4; i++) enemies.spawn("troutParr", king.river.s + (random() - 0.5) * 8, king.river.u + (random() - 0.5) * 6);
      }
    },
  };
}
