// Salmon Survival Extreme: the combat and the co-op laid over Salmon Survival. The game
// hands its parts over once (init), and then calls in each step of the world and each
// frame (see src/mods.js). Everything of Extreme lives under src/fv/.

import { finishCard, layOutCard } from "./card.js";
import { createCombat } from "./combat.js";
import { createCoop } from "./coop.js";
import { createOwners } from "./owners.js";

// Extreme's parts go onto the title card as this module is read -- the page is there by
// then, and the game has not yet put the card up -- so that it goes up with them (card.js).
layOutCard();

export const extreme = {
  game: null,
  combat: null,
  coop: null,
  // In a room: who runs which enemy, the shots and hits between the pages (owners.js).
  owners: null,
  // Tests drive the game without its title card: set true to let combat run anyway.
  testing: false,
  init(game) {
    this.game = game;
    this.combat = createCombat(game);
    // Co-op: the lobby on the title card, and with ?room the others in the river, and their
    // enemies and shots.
    this.coop = createCoop(game);
    if (this.coop.active) this.owners = createOwners(game, this.combat, this.coop);
    // In a co-op room, the graphics steps' tooltips, now that the game has built its picker.
    finishCard();
    // Development handle, under the same condition as the game's own window.salmon.
    const query = game.query;
    if (query.get("capture") || query.get("diagnostics") === "1" || query.has("shots")) window.extreme = this;
    // Co-op test handles (src/fv/dev/coop.js), with ?fvcoop (in a room, or alone for the same
    // fight solo).
    if (query.has("fvcoop")) {
      const wait = () => (window.salmon ? import("./dev/coop.js").then((m) => m.installCoopDev(window.salmon, this)) : setTimeout(wait, 100));
      setTimeout(wait, 0);
    }
    // Test scenes (src/fv/dev/scenes.js), once the game's own development handle is there.
    if (query.has("fvtest")) {
      const wait = () => (window.salmon ? import("./dev/scenes.js").then((m) => m.runScenes(window.salmon, this, query)) : setTimeout(wait, 100));
      setTimeout(wait, 0);
    }
  },
  // Combat runs once the swim has begun: not behind the title card (where the game still
  // takes one step to settle), and not while the world stands still -- which in a room it
  // never does once all have hatched (plan, part 5: "Die Welt läuft für die anderen
  // weiter"), the pause card and all.
  get running() {
    return this.testing || !this.game.now.paused || this.keepRunning();
  },
  // (Asked by the game each frame, whether it may step behind its pause card. Solo the pause
  // is a pause.)
  keepRunning() {
    return !!(this.coop?.active && this.coop.hatched);
  },
  step(dt, outcome) {
    // (Paused in a room: the fish stands where it stopped, its strength held, before the
    // enemies get to it.)
    this.owners?.pin();
    if (this.running) this.combat.step(dt, outcome);
    this.coop.step(dt, this.combat.players[0]);
    this.owners?.hold();
  },
  frame(dt) {
    // (The mates first: their weapons are drawn on them where they are this frame.)
    this.coop.frame(dt);
    this.combat.frame(dt);
  },
  takesButton(button) {
    return button === 0 && this.combat?.takesPrimary();
  },
};
