// The peaceful fish of the river and the sea (the base game's shoals, life.js) can be shot
// at too (the user's rule): the weaker flee, the stronger turn on the salmon. Salmon are
// never fair game -- the brothers and sisters in the gravel, the school, the run home.
//
// The shoal fish near the salmon get a stand-in in the enemy list (enemies.adopt): the same
// position and heading, so every weapon finds them, but not moved, drawn or counted by the
// enemy system, and left out of the aim's pull, the threats and the director. The first hit
// decides, with the base game's own measure of two fish against each other (brawl.js odds:
// size, strength left, temper): the weaker leaves its shoal as a fleeing fish of its own,
// the stronger as an enemy with its weapon from the table. Either way its shoal scatters,
// and from then on it is a fish of the enemy system, drawn by its kind's crowd where the
// shoal's fish was.

import { odds } from "../brawl.js";

// Which enemy kind (kinds.js) each shoal becomes (the others are left alone).
const KIND = { minnow: "minnow", troutParr: "troutParr", stickleback: "stickleback", sandeel: "sandeel", herring: "herring", mackerel: "mackerel", grayling: "grayling", eel: "eel" };
// Shoal fish within this reach of the salmon get a stand-in, at most this many (the nearest).
const REACH = 30;
const MOST = 32;

export function createNeutrals({ life, enemies, players, clock }) {
  const kinds = life?.shoals?.kinds;
  // The stand-ins by their shoal fish.
  const standing = new Map();
  const near = [];

  // The first hit on a stand-in: flee or fight.
  enemies.onNeutral = (e, by) => {
    const m = e.neutral;
    const group = e.group;
    const player = players.find((p) => p.id === by) ?? players[0];
    standing.delete(m);
    // (A blast of the enemies' own -- a jellyfish's mine, a gannet's bomb, `by` -1 -- is no
    // salmon's doing: it only scares the fish off, it does not turn it on anyone.)
    const strong = by >= 0 && !!e.spec.weapon && odds(m, player.fish, e.spec.temper ?? group?.spec?.temper ?? 1) >= 1;
    if (group) group.panic = 1;
    if (enemies.count(e.kind) >= e.spec.capacity) {
      // (No place left in its kind's crowd: it stays the shoal's, fleeing or nipping as the
      // base game's brawls have it.)
      m.brawl = strong ? "fight" : "flee";
      m.brawlUntil = clock() + (strong ? 9 : 4);
      m.brawlTitle = e.spec.title;
      e.neutral = null;
      e.passive = !strong;
      return;
    }
    // Out of its shoal (the shoal lets it go), into the enemy system.
    m.alive = false;
    enemies.convert(e, { passive: !strong });
  };

  return {
    // Each step, before the shots fly: stand-ins for the shoal fish near the salmon.
    update(fish) {
      if (!kinds) return;
      // (Gone from the shoal -- eaten, faded, far behind -- or too far: let go.)
      const far2 = (REACH * 1.3) ** 2;
      for (const [m, e] of standing) {
        if (!m.alive || e.dead || !e.neutral || m.position.distanceToSquared(fish.position) > far2) {
          standing.delete(m);
          if (e.neutral) enemies.forget(e);
        }
      }
      if (standing.size >= MOST) return;
      near.length = 0;
      const reach2 = REACH * REACH;
      for (const [name, kind] of Object.entries(kinds)) {
        if (!KIND[name]) continue;
        for (const group of kind.groups) {
          if (!group.active) continue;
          for (const m of group.members) {
            if (!m.alive || standing.has(m)) continue;
            const d2 = m.position.distanceToSquared(fish.position);
            if (d2 < reach2) near.push({ m, group, name, d2 });
          }
        }
      }
      near.sort((a, b) => a.d2 - b.d2);
      for (const n of near) {
        if (standing.size >= MOST) break;
        const e = enemies.adopt(KIND[n.name], n.m, n.group);
        if (e) standing.set(n.m, e);
      }
    },
    get count() {
      return standing.size;
    },
  };
}
