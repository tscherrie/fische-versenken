// What the game already does for its own hunters, done for Extreme's enemies too: they show
// among the threat arrows round the edge of the screen (with the tick that runs down to the
// moment a coiled one strikes), and a strike that misses is heard as a whiff (outcome.whiffs,
// sound.js). One key per kind stands for all enemies of that kind, so the game's memory of
// whom it has warned about stays small and a pack is announced once, not fish by fish.

import { level as surface } from "../course.js";

const KEYS = {};
const keyOf = (kind) => (KEYS[kind] ??= { kind });

export function createSignals({ life }, enemies) {
  const hunters = life.hunters;
  const baseThreats = hunters.threats;
  hunters.threats = function (fish, out) {
    baseThreats.call(this, fish, out);
    if (fish.captive) return out;
    // The most pressing of Extreme's enemies near this fish, at most three.
    const ours = [];
    for (const e of enemies.list) {
      if (e.dead) continue;
      const d = e.position.distanceTo(fish.position);
      if (d > 45) continue;
      let level = 0;
      if (e.mode === "coil" || e.mode === "strike" || e.mode === "aim" || e.mode === "fire") level = 1;
      else if (e.mode === "orbit" || e.mode === "hover" || ((e.mode === "approach" || e.mode === "circle") && d < 20)) level = 0.8;
      else if ((e.mode === "lurk" && d < 8) || (e.mode === "stand" && d < 20)) level = 0.6;
      else if (e.mode === "approach") level = 0.4;
      if (!level) continue;
      ours.push({ position: e.position, level, coiled: e.mode === "coil" || e.mode === "aim", coil: e.mode === "coil" ? Math.max(0, e.spec.coil - e.t) : e.mode === "aim" ? Math.max(0, e.spec.weapon.tell - e.t) : 0, kind: e.kind, title: e.spec.title, key: keyOf(e.kind), d, above: e.position.y > surface(e.river.s) });
    }
    ours.sort((a, b) => b.level - a.level || a.d - b.d);
    for (const t of ours.slice(0, 3)) out.push(t);
    return out;
  };
  return {
    // This step's misses, for the game to hear.
    whiffs(outcome) {
      for (const kind of enemies.whiffs) (outcome.whiffs ??= []).push({ key: keyOf(kind), kind });
    },
  };
}
