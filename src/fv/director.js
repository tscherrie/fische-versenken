// Who comes, when, and from where. The director keeps a number of enemies about the salmon
// that grows with its stage of life, sends them in from ahead (the way it is swimming), and
// works in waves: a while of pressure, then a breather, so there are still quiet moments in
// the river. More players in the room bring more enemies (plan, part 4).

import { S, frame, level, bed, regionWeights, section } from "../course.js";
import { KINDS } from "./kinds.js";

// How many enemies at a time, by stage of life (alevin to spawner); the alevin's gravel
// defence comes with its own waves.
const CAP = [0, 4, 5, 6, 8, 8, 8, 9, 9, 10];
const PRESSURE = 26,
  BREATHER = 14;

export function createDirector({ random }) {
  let clock = 0,
    nextSpawn = 4,
    travel = 1;
  // How dark it is (0 by day, 1 at night), for the kinds that hunt by night.
  let night = 0;
  const at = {};
  const weights = {};
  const range = (a, b) => a + (b - a) * random();

  function suits(kind, s) {
    const spec = KINDS[kind];
    if (s < (spec.from ?? 0)) return 0;
    regionWeights(s, weights);
    let w = 0;
    for (const [region, v] of Object.entries(spec.regions)) w += v * (weights[region] ?? 0);
    return w;
  }

  function choose(stage, s, enemies) {
    const options = [];
    if (suits("troutParr", s) > 0.2) options.push(["troutParr", 3]);
    if (suits("bullhead", s) > 0.2) options.push(["bullhead", 2]);
    if (stage >= 2 && suits("trout", s) > 0.2) options.push(["trout", stage >= 3 ? 1.5 : 0.7]);
    if (suits("minnow", s) > 0.2) options.push(["minnow", 1.2]);
    // The river's and the sea's own fish, armed (kinds.js), in their waters.
    if (stage >= 3 && suits("grayling", s) > 0.3) options.push(["grayling", 0.9]);
    if (stage >= 4 && suits("eel", s) > 0.3) options.push(["eel", 0.6]);
    // (The otter comes one at a time, more often the further down the river, and far more
    // often at night: see below.)
    if (stage >= 4 && suits("otter", s) > 0.2 && !enemies.list.some((e) => e.kind === "otter" && !e.dead)) options.push(["otter", 1.6 * suits("otter", s)]);
    if (stage >= 5 && suits("stickleback", s) > 0.3) options.push(["stickleback", 1]);
    if (stage >= 6 && suits("herring", s) > 0.3) options.push(["herring", 1.2]);
    if (stage >= 6 && suits("mackerel", s) > 0.3) options.push(["mackerel", 0.8]);
    // (The kingfisher goes for small fish only, as it does in the base game, and one at a
    // time.)
    if (stage >= 1 && stage <= 4 && suits("kingfisher", s) > 0.2 && !enemies.list.some((e) => e.kind === "kingfisher" && !e.dead)) options.push(["kingfisher", 1]);
    if (stage >= 2 && suits("merganser", s) > 0.2 && !enemies.list.some((e) => e.kind === "merganser" && !e.dead)) options.push(["merganser", 0.8]);
    if (stage >= 2 && stage <= 6 && suits("heron", s) > 0.3 && !enemies.list.some((e) => e.kind === "heron")) options.push(["heron", 0.6]);
    // The kinds that hunt by night (`nocturnal`) come in the dark as often as their weight
    // says, and by day a fifth as often.
    for (const option of options) if (KINDS[option[0]].nocturnal) option[1] *= 0.2 + 0.8 * night;
    if (!options.length) return null;
    let total = 0;
    for (const [, w] of options) total += w;
    let r = random() * total;
    for (const [kind, w] of options) if ((r -= w) <= 0) return kind;
    return options[0][0];
  }

  // Somewhere ahead in the water, deep enough for a fish of `size`.
  function spot(fish, size) {
    for (let tries = 0; tries < 8; tries++) {
      const s = fish.river.s + travel * range(26, 48) + range(-6, 6);
      if (s < S.redd + 8 || s > S.coast + 2000) continue;
      const c = section(Math.min(s, S.coast));
      const u = s < S.coast ? c.thalweg + range(-0.55, 0.55) * c.half : fish.river.u + range(-30, 30);
      if (level(s) - bed(s, u) < size * 0.8) continue;
      return { s, u };
    }
    return null;
  }

  return {
    get travel() {
      return travel;
    },
    // No one new for a while (after a death: a breather for the sibling taking over).
    hold(seconds) {
      nextSpawn = Math.max(nextSpawn, clock + seconds);
    },
    // players: in the room (for the numbers); the local player's fish is the anchor; dark:
    // how dark it is (0 by day, 1 at night).
    update(dt, { fish, stage, enemies, players = 1, count = 1, dark = 0 }) {
      clock += dt;
      night = dark;
      // Which way the fish is going along the river, held a while.
      frame(fish.river.s, at);
      const along = fish.velocity.x * at.tx + fish.velocity.z * at.tz;
      if (Math.abs(along) > 0.4 * Math.max(0.3, fish.length)) travel = Math.sign(along);
      const cycle = clock % (PRESSURE + BREATHER);
      const calm = cycle > PRESSURE;
      const cap = Math.round((CAP[stage] ?? 6) * Math.min(3.1, 1 + 0.7 * (players - 1)) * count);
      // (A shoal counts as a few enemies, not as every fish in it.)
      let alive = 0;
      for (const e of enemies.list) if (!e.dead && !e.neutral && !e.passive) alive += e.spec.school ? 0.3 : 1;
      if (calm || alive >= cap || clock < nextSpawn) return;
      const kind = choose(stage, fish.river.s, enemies);
      if (!kind) {
        nextSpawn = clock + 3;
        return;
      }
      const spec = KINDS[kind];
      // (A bird needs no depth: it comes in over the water.)
      const where = spot(fish, spec.flies ? 0 : spec.size[1]);
      if (!where) {
        nextSpawn = clock + 1;
        return;
      }
      // A shoal comes whole, a pack as three; the others alone.
      const n = spec.school ? Math.round(range(spec.school[0], spec.school[1])) : spec.behaviour === "pack" ? Math.max(1, Math.min(3, Math.floor(cap - alive))) : 1;
      for (let i = 0; i < n; i++) enemies.spawn(kind, where.s + range(-2, 2), where.u + range(-1.5, 1.5));
      nextSpawn = clock + range(3.5, 6.5) / Math.min(2, 1 + 0.25 * (players - 1));
    },
  };
}
