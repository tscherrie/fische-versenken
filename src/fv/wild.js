// The base game's own hunters give way to Extreme's enemies (enemies.js): the ones in the
// water no longer take up their places, the kingfisher and the heron stay away, and the
// vegan mode is gone (difficulty levels will take its place). Rival young salmon still hold
// their spots but no longer nip: salmon are never enemies here. The heartbeat is left out:
// with enemies about nearly all the time it would never stop (the user found it grating).
// Nothing in the base files changes; their tables and objects are adjusted from here.

import { PREDATORS } from "../predators.js";
import { mode } from "../vegan.js";

export function tameTheWild({ life, sound }) {
  sound?.heartbeat?.(false);
  for (const [kind, spec] of Object.entries(PREDATORS)) {
    // (The goosanders of the drive are only ever placed by it: they stay for now.)
    if (kind === "drive") continue;
    spec.regions = {};
  }
  PREDATORS.king.boss = false;
  mode.vegan = false;
  const style = document.createElement("style");
  style.textContent = "#intro .vegan { display: none !important; }";
  document.head.appendChild(style);

  const rivals = life.rivals;
  const rivalsUpdate = rivals.update;
  rivals.update = function (dt, fish, ctx) {
    const before = fish.energy;
    const events = rivalsUpdate.call(this, dt, fish, ctx);
    if (fish.energy < before) fish.energy = before;
    return Array.isArray(events) ? events.filter((e) => e.type !== "nip") : events;
  };

  return {
    // Each step: the birds kept away.
    step() {
      life.hunters.bird.next = Math.max(life.hunters.bird.next, 1e6);
      life.hunters.heron.rest = Math.max(life.hunters.heron.rest, 1e6);
    },
  };
}
