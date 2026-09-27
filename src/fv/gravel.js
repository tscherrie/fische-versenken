// The gravel defence: the alevin's first minutes. In the base game the yolk-sac fry lies in
// the gravel of the redd for three and a half minutes and grows fastest when it keeps still
// -- with nothing to do. Here it lies still and shoots: water-insect larvae, the real enemies
// of salmon eggs and alevins, come crawling through the gravel in a few waves, and the
// alevin holds them off with the laser strapped to its back. Every larva killed brings the
// day it leaves the gravel a little nearer, and the whole stage takes about two minutes.

import { S, bed, level, section } from "../course.js";
import { STAGES } from "../salmon.js";

// The waves: when (seconds into the stage), what, and how many.
const WAVES = [
  { at: 5, kinds: [["dragonflyLarva", 2]] },
  { at: 28, kinds: [["dragonflyLarva", 3]] },
  { at: 55, kinds: [["dragonflyLarva", 2], ["beetleLarva", 1]] },
  { at: 85, kinds: [["dragonflyLarva", 3], ["beetleLarva", 2]] },
];

const TIP = "<b>Larven im Kies!</b> Libellen- und Gelbrandkäferlarven kriechen auf die Brut zu. Halt dich mit S im Kies fest und schieß sie mit der linken Maustaste weg.";

export function createGravel({ random, hud }) {
  STAGES[0].minutes = 2;
  let clock = 0,
    wave = 0,
    stage = -1;
  const range = (a, b) => a + (b - a) * random();

  return {
    get active() {
      return stage === 0;
    },
    // Each step while the fish is an alevin: the next wave when its time comes, from the edge
    // of the gravel all round the redd.
    update(dt, { fish, enemies, players = 1 }) {
      if (fish.stage !== stage) {
        stage = fish.stage;
        clock = 0;
        wave = 0;
      }
      if (stage !== 0) return;
      clock += dt;
      while (wave < WAVES.length && clock >= WAVES[wave].at) {
        if (wave === 0) hud?.tip("fv-gravel", TIP, 12);
        const scale = Math.min(3.1, 1 + 0.7 * (players - 1));
        for (const [kind, n] of WAVES[wave].kinds) {
          for (let i = 0; i < Math.round(n * scale); i++) {
            const c = section(S.redd);
            const angle = random() * Math.PI * 2;
            const reach = range(4, 7);
            const s = fish.river.s + Math.cos(angle) * reach;
            const u = Math.max(c.thalweg - c.half * 0.8, Math.min(c.thalweg + c.half * 0.8, fish.river.u + Math.sin(angle) * reach));
            const floor = bed(s, u);
            if (level(s) - floor < 0.3 || floor > fish.position.y + 0.6 || floor < fish.position.y - 4) continue;
            enemies.spawn(kind, s, u);
          }
        }
        wave++;
      }
    },
  };
}
