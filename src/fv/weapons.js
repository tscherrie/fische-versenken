// The weapons: what each one is, where on the fish it sits, and how it fires. A fish carries
// one weapon until the smolt, then two: one on the back (left mouse button) and one at the
// belly (right). A weapon found replaces the one in its place (plan, part 3).
//
// Numbers grow with the fish: a weapon's damage, speed and reach are worked out from the
// body length when it fires, so an early weapon stays some use later.

import * as THREE from "three";

// place: "back" or "belly"; mount: where on the back (left, right or middle).
// heat: added per shot (1 = too hot, then it has to cool below `unlock`); cool: per second,
// once the weapon has rested a quarter of a second.
export const WEAPONS = {
  piu: {
    title: "Piu-Piu-Laser",
    place: "back",
    mount: "middle",
    interval: 0.11,
    damage: 3.6,
    heat: 0.034,
    cool: 0.6,
    unlock: 0.35,
    spread: 0.012,
    speed: (L) => 24 + 18 * L,
    reach: (L) => 16 + 14 * L,
    size: (L) => 0.05 + 0.06 * L,
    radius: (L) => 0.02 + 0.05 * L,
    tint: [10, 1.1, 0.6],
    glow: [3, 0.35, 0.2],
    stretch: 4,
    sound: "piu",
  },
};

// Damage grows with the body: a fry's pew-pew stings, the same laser on a big fish burns.
export const damageScale = (L) => Math.min(12, Math.max(1, Math.pow(L / 0.35, 0.7)));

// The back's top and the belly's bottom at model x, from a body's profile knots.
function profileAt(plan, x, column) {
  const knots = plan.profile;
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i],
      b = knots[i + 1];
    if (x <= a[0] && x >= b[0]) {
      const t = (a[0] - x) / (a[0] - b[0]);
      return a[column] + (b[column] - a[column]) * t;
    }
  }
  return knots[knots.length - 1][column];
}

export function createArsenal() {
  const matrix = new THREE.Matrix4();
  const local = new THREE.Vector3();
  return {
    back: "piu",
    belly: null,
    heat: { piu: 0 },
    locked: {},
    fired: {},
    cooldown: { back: 0, belly: 0 },
    // Where the weapon in `place` sits on this fish now, in the world: `out`.
    mount(salmon, place, out) {
      const meshes = salmon.meshes;
      const plan = salmon.materials?.plan;
      if (!meshes?.[0] || !plan) return out.copy(salmon.fish.position);
      matrix.fromArray(meshes[0].instanceMatrix.array, 0);
      const id = this[place];
      const where = WEAPONS[id]?.mount ?? "middle";
      if (place === "belly") {
        const x = 0.06;
        local.set(x, profileAt(plan, x, 2) - 0.012, 0);
      } else {
        const x = 0.16;
        local.set(x, profileAt(plan, x, 1) + 0.014, where === "left" ? -0.03 : where === "right" ? 0.03 : 0);
      }
      return out.copy(local).applyMatrix4(matrix);
    },
    // Cool every weapon, and count down the time to the next shot.
    cool(dt) {
      for (const id of Object.keys(this.heat)) {
        const w = WEAPONS[id];
        this.fired[id] = (this.fired[id] ?? 1) + dt;
        if (this.fired[id] > 0.25 || this.locked[id]) this.heat[id] = Math.max(0, this.heat[id] - w.cool * dt);
        if (this.locked[id] && this.heat[id] < w.unlock) this.locked[id] = false;
      }
      this.cooldown.back = Math.max(-0.05, this.cooldown.back - dt);
      this.cooldown.belly = Math.max(-0.05, this.cooldown.belly - dt);
    },
  };
}
