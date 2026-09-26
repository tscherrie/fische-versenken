// Rules Extreme lays over the base game's life (plan, part 2), each a small correction made
// every step, so the base code stays as it is:
// - Fighting costs less: while enemies are close, swimming and dashing take only half of the
//   strength they normally do (in the base game strength is health, stamina and the gate on
//   growth at once, so without this the fish that avoids fights would grow fastest).
// - Dying costs less: the sibling that takes over keeps 90 % of the stage's progress instead
//   of the base game's 70 %, because in Extreme a fish dies far more often.

const NEAR = 20;

export function createRules() {
  let before = null,
    wasDown = false,
    lastEnergy = null,
    fought = -1e9,
    clock = 0;
  return {
    // `player`: the local player; `enemies`: the enemy system. Called at the start of
    // combat's step, after the game has moved the fish.
    step(dt, player, enemies) {
      clock += dt;
      const f = player.fish;
      // A fight is on while an enemy that means it is near, and for a few seconds after.
      for (const e of enemies.list) {
        if (e.dead || e.mode === "lurk" || e.mode === "dead") continue;
        if (e.position.distanceToSquared(f.position) < NEAR * NEAR) {
          fought = clock;
          break;
        }
      }
      if (!player.down && lastEnergy !== null && clock - fought < 6) {
        const spent = lastEnergy - f.energy;
        if (spent > 0 && spent < 0.02) f.energy = Math.min(1, f.energy + spent * 0.5);
      }
      if (player.down && !wasDown) before = { stage: f.stage, progress: f.progress };
      if (!player.down && wasDown && before) {
        if (f.stage === before.stage) f.progress = Math.max(f.progress, before.progress * 0.9);
        before = null;
      }
      wasDown = player.down;
    },
    // After combat's step (its own damage and meals done): the strength to compare with next
    // time, so only what swimming used is given back.
    after(player) {
      lastEnergy = player.fish.energy;
    },
  };
}
