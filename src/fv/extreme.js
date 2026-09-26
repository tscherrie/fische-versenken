// Salmon Survival Extreme: the combat and the co-op laid over Salmon Survival. The game
// hands its parts over once (init), and then calls in each step of the world and each
// frame (see src/mods.js). Everything of Extreme lives under src/fv/.

export const extreme = {
  game: null,
  init(game) {
    this.game = game;
    // Development handle, under the same condition as the game's own window.salmon.
    const query = game.query;
    if (query.get("capture") || query.get("diagnostics") === "1" || query.has("shots")) window.extreme = this;
  },
  step(dt, outcome) {},
  frame(dt) {},
};
