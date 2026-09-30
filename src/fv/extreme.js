// Salmon Survival Extreme: the combat and the co-op laid over Salmon Survival. The game
// hands its parts over once (init), and then calls in each step of the world and each
// frame (see src/mods.js). Everything of Extreme lives under src/fv/.

import { createCombat } from "./combat.js";
import { createCoop } from "./coop.js";

export const extreme = {
  game: null,
  combat: null,
  coop: null,
  // Tests drive the game without its title card: set true to let combat run anyway.
  testing: false,
  init(game) {
    this.game = game;
    this.combat = createCombat(game);
    // Co-op: the lobby on the title card, and with ?room the others in the river.
    this.coop = createCoop(game);
    // Development handle, under the same condition as the game's own window.salmon.
    const query = game.query;
    if (query.get("capture") || query.get("diagnostics") === "1" || query.has("shots")) window.extreme = this;
    // Test scenes (src/fv/dev/scenes.js), once the game's own development handle is there.
    if (query.has("fvtest")) {
      const wait = () => (window.salmon ? import("./dev/scenes.js").then((m) => m.runScenes(window.salmon, this, query)) : setTimeout(wait, 100));
      setTimeout(wait, 0);
    }
  },
  // Combat runs once the swim has begun: not behind the title card (where the game still
  // takes one step to settle), and not while the world stands still.
  get running() {
    return this.testing || !this.game.now.paused;
  },
  step(dt, outcome) {
    if (this.running) this.combat.step(dt, outcome);
    this.coop.step(dt, this.combat.players[0]);
  },
  frame(dt) {
    this.combat.frame(dt);
    this.coop.frame(dt);
  },
  takesButton(button) {
    return button === 0 && this.combat?.takesPrimary();
  },
};
