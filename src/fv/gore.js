// Splatter: what a hit and a kill leave in the water. Placeholder: built in the next round.

export function createGore(scene, camera, { random = Math.random, light = false } = {}) {
  return {
    // A shot landed on enemy `e` at `point`, flying along `dir` (unit), from weapon `weapon`.
    hit(e, point, dir, weapon) {},
    // Enemy `e` was sunk by a shot along `dir` from weapon `weapon`.
    kill(e, dir, weapon) {},
    // Each step (world time): what drifts, sinks and fades; `enemies` for the bleeding dead.
    update(dt, enemies) {},
    // Each frame: write what is to be drawn.
    frame() {},
  };
}
