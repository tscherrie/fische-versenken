// Test scenes for how combat looks and what it costs (owned by whoever works on the look):
// scenes listed here join the list in scenes.js, and a scene with `look: true` is run by
// runLook below instead of the generic runner.

export const LOOK_SCENES = [];

// Run one look scene. ctx: { salmon, extreme, set, scene, errors, next }; call next() at the
// end to go on to the following scene.
export async function runLook(ctx) {
  await ctx.next();
}
