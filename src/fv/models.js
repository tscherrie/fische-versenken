// The weapons as things on the fish: real guns and blades, strapped to the body with a
// harness, each on its place (the back, left, right or middle, or the belly). Placeholder:
// built in the next round.

export function createWeaponModels(scene, { mirror } = {}) {
  return {
    // Each frame, after the fish have moved: every player's weapons on their bodies.
    update(players) {},
    // Where the barrel of the weapon in `place` ends, in the world (null: no model).
    muzzle(player, place, out) {
      return null;
    },
    // A shot fired: the weapon kicks.
    recoil(player, place) {},
  };
}
