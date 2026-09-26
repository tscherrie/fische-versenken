// Test scenes for how combat looks and what it costs (owned by whoever works on the look):
// scenes listed here join the list in scenes.js, and a scene with `look: true` is run by
// runLook below instead of the generic runner.

export const LOOK_SCENES = [];

// Run one look scene. ctx: { salmon, extreme, set, scene, errors, next }; call next() at the
// end to go on to the following scene.
export async function runLook(ctx) {
  if (ctx.scene.models) return (await import("../look/dev/model-scenes.js")).runModelScene(ctx);
  await ctx.next();
}

// ---- The models of look/ (capsule.js, larvae.js): close-ups in their states, and what they
// cost. Run in src/fv/look/dev/model-scenes.js (loaded only in the browser: this file is also
// read by the node tools). Pictures: shots/<set>/<scene>-<picture>.jpg.
LOOK_SCENES.push(
  // The larvae posed in the redd beside an alevin: crawling, jaws open, the mask shot out,
  // dead on their backs.
  { name: "larven-nah", look: true, models: true, stage: "alevin", at: 24, season: "spring", hour: 11 },
  // The gravel defence as it runs, the larvae drawn by their models instead of stand-ins.
  { name: "larven-kiesbett", look: true, models: true, stage: "alevin", at: 24, season: "spring", hour: 11 },
  // Weapon capsules in the brook: idle, taken (the burst), one behind a stone.
  { name: "kapsel-nah", look: true, models: true, stage: "parr", at: 2500, season: "summer", hour: 15 },
  // What 24 of each cost: the frame timed with and without them, and draw() on the processor.
  { name: "modelle-kosten", look: true, models: true, stage: "parr", at: 2500, season: "summer", hour: 15 },
);
