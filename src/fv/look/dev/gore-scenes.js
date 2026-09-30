// The look scenes of the marks the fighting leaves (listed in src/fv/dev/scenes-look.js):
// wounds on enemies that are still swimming, as they take one hit after another; the
// salmon's own; the char of the flamethrower and the arc's scorch lines, on the living and on
// the dead floating up; the blasts' marks on the bed as they fade; blood in the water by day
// and by night. The enemies are held where they are put (and kept from attacking) so the
// pictures show them close up and broadside; the hits go through the weapons' own code
// (firing.onEnemy, firing.blast), so the marks are those the game leaves.

const nextTask = () => new Promise((r) => setTimeout(r, 0));

export async function runGoreScene(ctx) {
  const { set, scene, errors } = ctx;
  const warnings = [];
  const consoleWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" ").slice(0, 500));
    consoleWarn(...args);
  };
  const record = [{ label: "backend", backend: ctx.salmon.renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2" }];
  try {
    await SCENES[scene.run ?? scene.name](ctx, record);
  } catch (error) {
    errors.push(String(error?.stack ?? error));
  }
  console.warn = consoleWarn;
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, errors, warnings }, null, 1) });
  await nextTask();
  await ctx.next();
}

// The fish's frame laid flat: ahead, left.
function frameOf(salmon) {
  const { fish, THREE } = salmon;
  const ahead = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(ahead).normalize();
  return { ahead, left };
}

// Enemies put [kind, ahead, across, up] from the fish (in its lengths, at least a unit),
// facing `face` (a vector), and held there: each step they are put back, turned as they
// were, and kept from attacking. Returns the list and a function that holds them (for
// salmon.run) -- `free` lets them go.
function place(ctx, spots, face) {
  const { salmon, extreme } = ctx;
  const { fish, course, THREE } = salmon;
  const combat = extreme.combat;
  combat.director.hold(1e6);
  const { ahead, left } = frameOf(salmon);
  const k = Math.max(1, fish.length);
  const spot = {};
  const list = [];
  for (const [kind, a, b, up = 0] of spots) {
    const p = fish.position.clone().addScaledVector(ahead, a * k).addScaledVector(left, b * k);
    course.locate(p.x, p.z, fish.river.s, spot);
    const e = combat.enemies.spawn(kind, spot.s, spot.u, fish.position.y + up * k, { heading: face.clone() });
    if (!e) continue;
    e.pin = e.position.clone();
    e.pinHeading = face.clone().normalize();
    list.push(e);
  }
  const state = { free: false };
  const hold = () => {
    for (const e of list) {
      if (state.free || e.dead) continue;
      e.position.copy(e.pin);
      e.heading.copy(e.pinHeading);
      e.velocity?.set(0, 0, 0);
      e.speed = 0;
      e.mode = "recover";
      e.t = -10;
      e.target = null;
    }
  };
  return { list, hold, state };
}

// A shot of `weapon` into `e` from the side `from` (a unit vector: where the shooter is),
// striking a little way along its body (`along`, in its lengths) and up or down (`up`), for
// `damage` hit points -- through the weapons' own hit (firing.onEnemy), as a round of that
// gun would.
function shoot(ctx, e, weapon, from, { along = 0, up = 0, damage = 1, pellets = 0 } = {}) {
  const { salmon, extreme } = ctx;
  const { fish, THREE } = salmon;
  const firing = extreme.combat.firing;
  const point = e.position.clone().addScaledVector(e.heading, along * e.size);
  point.y += up * e.size;
  const velocity = from.clone().multiplyScalar(-30);
  const shot = { owner: 0, weapon, position: point, velocity, damage, shooter: fish.length, age: 0, life: 1, river: { ...e.river } };
  if (pellets) {
    const volley = 1e6 + Math.floor(Math.random() * 1e6);
    for (let i = 0; i < pellets; i++) firing.onEnemy({ ...shot, damage: damage / pellets, position: point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1 * e.size, (Math.random() - 0.5) * 0.08 * e.size, 0)), volley }, e);
    firing.flush();
    return;
  }
  firing.onEnemy(shot, e);
}

async function picture(ctx, name, hold, eye, target) {
  const { salmon, extreme, set, scene } = ctx;
  if (eye) salmon.view(eye.toArray(), target.toArray(), 0.02);
  await salmon.run(1 / 30, hold);
  extreme.frame(1 / 60);
  await salmon.capture(`${set}/${scene.name}-${name}`, 1280, 720);
}

// What a fish's marks are now (for the report).
// (Each hole: where along the body (0..255), which way round it (0..63), what made it.)
const marksOf = (e) => ({ kind: e.kind, hp: +e.hp.toFixed(1), dead: e.dead, slot: e.marks?.slot ?? null, holes: e.marks ? e.marks.holes.slice(0, e.marks.n).map((c) => `${c >> 9}/${(c >> 3) & 63}/${c & 7}`) : [], char: +(e.marks?.char ?? 0).toFixed(2), singe: +(e.marks?.singe ?? 0).toFixed(2) });

const SCENES = {
  // Enemies side by side, broadside to the camera, taking hit after hit: healthy, hurt, badly
  // hurt; close up; from the far side (the exit wounds); and let go, swimming with their
  // wounds and bleeding.
  async wunden(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const { ahead, left } = frameOf(salmon);
    const k = Math.max(1, fish.length);
    // They face across the view (to the left of the fish), so the camera beside the fish
    // sees them from the side.
    const { list, hold, state } = place(
      ctx,
      [
        ["trout", 2.6, -0.2, 0.05],
        ["perch", 2.4, 0.9, -0.25],
        ["troutParr", 1.9, 0.35, 0.3],
        ["bullhead", 2.2, 1.6, -0.1],
      ],
      left,
    );
    await salmon.run(0.3, hold);
    const mid = fish.position.clone().addScaledVector(ahead, 2.3 * k).addScaledVector(left, 0.7 * k);
    const eye = mid.clone().addScaledVector(ahead, -1.9 * k).addScaledVector(left, 0.3 * k);
    eye.y += 0.15 * k;
    await picture(ctx, "heil", hold, eye, mid);
    // The shooter stands where the camera is: the near flank takes the entry wounds.
    const from = eye.clone().sub(mid).normalize();
    const [trout, perch, parr, bullhead] = list;
    const hits = [
      [trout, "piu", { along: 0.05, up: 0.02 }],
      [trout, "minigun", { along: -0.12, up: -0.01 }],
      [perch, "flinte", { along: 0.02, pellets: 5 }],
      [parr, "panzerbuechse", { along: -0.05 }],
      [bullhead, "minigun", { along: 0.1 }],
    ];
    const fraction = (e, f) => e.maxHp * f;
    for (const [e, w, o] of hits) if (e) shoot(ctx, e, w, from, { ...o, damage: fraction(e, 0.2) });
    await salmon.run(0.5, hold);
    record.push({ label: "getroffen", enemies: list.map(marksOf) });
    await picture(ctx, "getroffen", hold);
    const more = [
      [trout, "minigun", { along: 0.18, up: 0.03 }],
      [trout, "piu", { along: -0.25, up: 0.0 }],
      [trout, "flinte", { along: -0.02, pellets: 6 }],
      [perch, "minigun", { along: -0.2, up: 0.02 }],
      [perch, "piu", { along: 0.15 }],
      [parr, "minigun", { along: 0.15 }],
      [bullhead, "flinte", { along: -0.1, pellets: 5 }],
    ];
    for (const [e, w, o] of more) if (e) shoot(ctx, e, w, from, { ...o, damage: fraction(e, 0.12) });
    await salmon.run(1.2, hold);
    record.push({ label: "schwer", enemies: list.map(marksOf) });
    await picture(ctx, "schwer", hold);
    // Close up on the trout and the perch.
    // (Close up: straight from the side the shots came from.)
    const beside = (e, d) => {
      const side = new THREE.Vector3(0, 1, 0).cross(e.heading).normalize();
      if (side.dot(from) < 0) side.negate();
      return e.position.clone().addScaledVector(side, d * e.size).add(new THREE.Vector3(0, 0.06 * e.size, 0));
    };
    if (trout && !trout.dead) await picture(ctx, "nah-forelle", hold, beside(trout, 0.5), trout.position.clone());
    if (perch && !perch.dead) await picture(ctx, "nah-barsch", hold, beside(perch, 0.55), perch.position.clone());
    // The far side: where the heavy round came out (the parr turned round to show it).
    if (parr && !parr.dead) {
      parr.pinHeading.negate();
      await salmon.run(0.1, hold);
      await picture(ctx, "austritt", hold, beside(parr, 0.6), parr.position.clone());
    }
    // Let go: they swim off with their wounds, bleeding.
    state.free = true;
    salmon.view(null);
    for (const e of list) {
      e.mode = "flee";
      e.t = 0;
    }
    await salmon.run(1.5);
    const near = list.filter((e) => !e.dead).sort((a, b) => a.position.distanceTo(fish.position) - b.position.distanceTo(fish.position))[0];
    if (near) {
      const at = near.position.clone();
      const side = new THREE.Vector3(0, 1, 0).cross(near.heading).normalize();
      await picture(ctx, "schwimmt", null, at.clone().addScaledVector(side, 1.1 * near.size).addScaledVector(near.heading, -0.6 * near.size).add(new THREE.Vector3(0, 0.25 * near.size, 0)), at);
    }
    salmon.view(null);
  },

  // The salmon's own: healthy (as it always was), then hit a few times and down to half its
  // strength, then badly hurt; from the side and from above.
  async "lachs-wunden"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const gore = extreme.combat.gore;
    extreme.combat.director.hold(1e6);
    const L = fish.length;
    const { ahead, left } = frameOf(salmon);
    const still = () => {
      fish.velocity?.set?.(0, 0, 0);
    };
    await salmon.run(0.3, still);
    const view = (name, aside, above, along) => {
      const eye = fish.position.clone().addScaledVector(left, aside * L).addScaledVector(ahead, along * L);
      eye.y += above * L;
      return picture(ctx, name, still, eye, fish.position.clone().addScaledVector(ahead, 0.05 * L));
    };
    await view("gesund", 0.9, 0.3, 0.2);
    const body = { kind: "salmon", position: fish.position, heading: fish.heading, size: fish.length, dead: false, spec: {} };
    const hitFrom = (side, along, up, weapon, info = null) => {
      const dir = left.clone().multiplyScalar(-side).add(new THREE.Vector3(0, -0.2 * up, 0)).normalize();
      const point = fish.position.clone().addScaledVector(fish.heading, along * L).addScaledVector(left, side * 0.06 * L);
      point.y += up * 0.05 * L;
      gore.hit(body, point, dir, weapon, info);
    };
    hitFrom(1, 0.1, 0.3, "smg");
    hitFrom(1, -0.15, -0.2, "smg");
    hitFrom(1, 0.02, 0.6, "pistol");
    fish.energy = 0.55;
    await salmon.run(0.6, () => {
      still();
      fish.energy = 0.55;
    });
    record.push({ label: "verletzt", holes: gore.wounds.salmon.n, energy: fish.energy });
    await view("verletzt", 0.9, 0.3, 0.2);
    hitFrom(1, -0.05, 0.1, "shotgun", { mode: "pellets", pellets: 6 });
    hitFrom(-1, 0.12, 0.2, "smg");
    fish.energy = 0.2;
    await salmon.run(1.2, () => {
      still();
      fish.energy = 0.2;
    });
    record.push({ label: "schwer", holes: gore.wounds.salmon.n, energy: fish.energy });
    await view("schwer", 0.9, 0.3, 0.2);
    await view("schwer-oben", 0.35, 0.9, -0.2);
    await view("schwer-hinten", 0.5, 0.35, -1.2);
    // Back to full strength: the wounds close.
    fish.energy = 1;
    await salmon.run(0.2, () => {
      still();
      fish.energy = 1;
    });
    record.push({ label: "geheilt", holes: gore.wounds.salmon.n });
    await view("geheilt", 0.9, 0.3, 0.2);
    salmon.view(null);
  },

  // The flamethrower: living fish licked by the flame again and again, charring; one burnt
  // to death floats up blackened.
  async brand(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const { ahead, left } = frameOf(salmon);
    const k = Math.max(1, fish.length);
    const { list, hold } = place(
      ctx,
      [
        ["trout", 2.4, 0.1, 0],
        ["troutParr", 2.1, 0.9, -0.2],
        ["perch", 2.6, 1.6, 0.1],
      ],
      left,
    );
    await salmon.run(0.2, hold);
    const mid = fish.position.clone().addScaledVector(ahead, 2.35 * k).addScaledVector(left, 0.8 * k);
    const eye = mid.clone().addScaledVector(ahead, -1.8 * k).addScaledVector(left, 0.2 * k);
    eye.y += 0.2 * k;
    const from = eye.clone().sub(mid).normalize();
    const [trout, parr, perch] = list;
    // Licks of flame, a little each, over two seconds (the jet's hits come every 0.15 s).
    for (let i = 0; i < 14; i++) {
      for (const e of [trout, parr]) if (e && !e.dead) shoot(ctx, e, "flammen", from, { damage: e.maxHp * 0.02 });
      if (perch && !perch.dead && i < 5) shoot(ctx, perch, "flammen", from, { damage: perch.maxHp * 0.02 });
      await salmon.run(0.15, hold);
    }
    record.push({ label: "verkohlt", enemies: list.map(marksOf) });
    await picture(ctx, "lebend", hold, eye, mid);
    if (trout) await picture(ctx, "nah", hold, trout.position.clone().addScaledVector(from, 0.8 * trout.size).add(new THREE.Vector3(0, 0.12 * trout.size, 0)), trout.position.clone());
    // Burnt to death: it rolls over and floats up, charred.
    if (parr) shoot(ctx, parr, "flammen", from, { damage: parr.hp + 1 });
    await salmon.run(2.5, hold);
    record.push({ label: "tot", enemies: list.map(marksOf) });
    if (parr) await picture(ctx, "tot", hold, parr.position.clone().addScaledVector(from, 1.2 * parr.size).add(new THREE.Vector3(0, -0.1 * parr.size, 0)), parr.position.clone());
    await salmon.run(3, hold);
    if (parr) await picture(ctx, "tot-oben", hold, parr.position.clone().addScaledVector(from, 1.4 * parr.size).add(new THREE.Vector3(0, -0.25 * parr.size, 0)), parr.position.clone());
    salmon.view(null);
  },

  // The arc thrower: its discharges leave scorch lines; one killed by it.
  async blitz(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const { ahead, left } = frameOf(salmon);
    const k = Math.max(1, fish.length);
    const { list, hold } = place(
      ctx,
      [
        ["trout", 2.4, 0.2, 0],
        ["grayling", 2.6, 1.2, -0.2],
        ["troutParr", 2.0, 0.8, 0.25],
      ],
      left,
    );
    await salmon.run(0.2, hold);
    const mid = fish.position.clone().addScaledVector(ahead, 2.35 * k).addScaledVector(left, 0.75 * k);
    const eye = mid.clone().addScaledVector(ahead, -1.8 * k).addScaledVector(left, 0.2 * k);
    eye.y += 0.2 * k;
    const from = eye.clone().sub(mid).normalize();
    for (let i = 0; i < 5; i++) {
      for (const e of list) if (!e.dead) shoot(ctx, e, "blitz", from, { damage: e.maxHp * 0.06 });
      await salmon.run(0.12, hold);
    }
    record.push({ label: "versengt", enemies: list.map(marksOf) });
    await picture(ctx, "versengt", hold, eye, mid);
    const [trout] = list;
    if (trout) await picture(ctx, "nah", hold, trout.position.clone().addScaledVector(from, 0.8 * trout.size).add(new THREE.Vector3(0, 0.12 * trout.size, 0)), trout.position.clone());
    salmon.view(null);
  },

  // Charges going off on the bed ahead: three grenades on the gravel and among the stones, a
  // rocket's worth close by, one well above the bed (no mark), and the cannon's ball ploughing
  // in; then the marks as they grey and fade over a minute.
  async krater(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, course, THREE } = salmon;
    const combat = extreme.combat;
    combat.director.hold(1e6);
    const { ahead, left } = frameOf(salmon);
    const L = fish.length;
    const k = Math.max(1, L);
    const firing = combat.firing;
    const { WEAPONS } = await import("../../weapons.js");
    const spot = {};
    const onBed = (a, b, over = 0.05) => {
      const p = fish.position.clone().addScaledVector(ahead, a * k).addScaledVector(left, b * k);
      course.locate(p.x, p.z, fish.river.s, spot);
      p.y = course.bed(spot.s, spot.u) + over * k;
      return p;
    };
    // (The fish is held where it is: the gravel is laid round it, and a blast would push it.)
    const home = fish.position.clone();
    const still = () => {
      fish.position.copy(home);
      fish.velocity?.set?.(0, 0, 0);
    };
    await salmon.run(0.2, still);
    const spots = [onBed(2.4, -0.7), onBed(3.8, 1.0), onBed(4.6, -0.5, 0.3), onBed(3.0, 2.2, 3)];
    const first = spots[0];
    // From above the first, a little toward the fish; and low, from the fish's side.
    // (Under the surface, whatever the depth.)
    course.locate(first.x, first.z, fish.river.s, spot);
    const room = course.level(spot.s) - first.y - 0.3;
    const above = first.clone().addScaledVector(ahead, -0.5 * k).add(new THREE.Vector3(0, Math.min(2.4 * k, room), 0));
    const low = first.clone().addScaledVector(ahead, -1.4 * k).addScaledVector(left, 0.3 * k).add(new THREE.Vector3(0, 0.45 * k, 0));
    const wide = fish.position.clone().addScaledVector(ahead, 0.4 * k).add(new THREE.Vector3(0, 1.4 * k, 0));
    const middle = onBed(3.3, 0.4, 0);
    await picture(ctx, "vorher", still, above, first);
    // (What each blast costs the script, with its mark and without: the last is high over
    // the bed and leaves none.)
    const took = [];
    const timed = (at, weapon) => {
      const t = performance.now();
      firing.blast(0, at, WEAPONS[weapon], weapon, L);
      took.push(+(performance.now() - t).toFixed(3));
    };
    timed(spots[0], "granate");
    timed(spots[1], "granate");
    timed(spots[2], "raketen");
    timed(spots[3], "granate");
    record.push({ label: "blast ms", took });
    // (And the marks alone, laid again and again, and what finding the stones and the gravel
    // under one takes.)
    {
      const scorch = combat.gore.scorch;
      const random = Math.random;
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) scorch.blast(onBed(2 + (i % 5) * 0.7, -1 + Math.floor(i / 5) * 0.6), WEAPONS.granate.blast(L), onBed(2 + (i % 5) * 0.7, -1 + Math.floor(i / 5) * 0.6, 0).y, fish.river.s, random);
      const t1 = performance.now();
      const list = [];
      for (let i = 0; i < 20; i++) extreme.game.terrain.collidersNear(first.x, first.z, 1.5, list);
      const t2 = performance.now();
      for (let i = 0; i < 20; i++) {
        list.length = 0;
        extreme.game.pebbles?.near?.(first, 1.3, list);
      }
      const t3 = performance.now();
      record.push({ label: "mark ms", lay: +((t1 - t0) / 20).toFixed(3), stones: +((t2 - t1) / 20).toFixed(3), gravel: +((t3 - t2) / 20).toFixed(3), gravelCount: list.length });
    }
    // The cannon's ball strikes the bed going across the view.
    const ball = { owner: 0, weapon: "kanone", position: onBed(2.0, 1.3, 0), velocity: left.clone().multiplyScalar(-20).add(new THREE.Vector3(0, -4, 0)), radius: WEAPONS.kanone.radius(L), size: WEAPONS.kanone.size(L), shooter: L, river: { s: fish.river.s, u: fish.river.u } };
    firing.onBounce(ball, "bed");
    await salmon.run(0.4, still);
    record.push({ label: "marks", live: combat.gore.scorch.live() });
    // (?xscorch: the marks' grids drawn plain red over everything, to see where they lie.)
    // (?xscorch=wire: the marks' grids drawn plain red over everything, to see where they lie;
    // =red: their whole area tinted red where it is drawn, to see what hides them.)
    const debug = new URLSearchParams(location.search).get("xscorch");
    if (debug === "wire") combat.gore.scorch.mesh.material = new THREE.MeshBasicNodeMaterial({ color: 0xff0000, wireframe: true, depthTest: false });
    if (debug === "red") {
      combat.gore.scorch.mesh.material.colorNode = (await import("three/tsl")).vec3(1, 0.15, 0.15);
      combat.gore.scorch.mesh.material.needsUpdate = true;
    }
    await picture(ctx, "0s", still, above, first);
    await salmon.run(3, still);
    await picture(ctx, "3s", still, above, first);
    await picture(ctx, "3s-flach", still, low, first);
    await picture(ctx, "3s-weit", still, wide, middle);
    // As the player sees it: the game's own camera behind the fish.
    salmon.view(null);
    await picture(ctx, "3s-spiel", still);
    await salmon.run(12, still);
    await picture(ctx, "15s", still, above, first);
    await salmon.run(25, still);
    await picture(ctx, "40s", still, above, first);
    await salmon.run(22, still);
    record.push({ label: "62s", live: combat.gore.scorch.live() });
    await picture(ctx, "62s", still, above, first);
    salmon.view(null);
  },

  // Blood in the water: fish sunk close to the eye, by day or at night (the scene's hour).
  async blut(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const { ahead, left } = frameOf(salmon);
    const k = Math.max(1, fish.length);
    const { list, hold } = place(
      ctx,
      [
        ["trout", 2.8, 0.2, 0],
        ["troutParr", 2.2, 1.0, -0.2],
        ["perch", 3.0, 1.4, 0.2],
        ["troutParr", 2.5, -0.5, 0.1],
      ],
      left,
    );
    await salmon.run(0.2, hold);
    const mid = fish.position.clone().addScaledVector(ahead, 2.6 * k).addScaledVector(left, 0.5 * k);
    const eye = mid.clone().addScaledVector(ahead, -2.2 * k).addScaledVector(left, 0.3 * k);
    eye.y += 0.15 * k;
    const from = eye.clone().sub(mid).normalize();
    const [trout, parr, perch, parr2] = list;
    // Hurt ones bleeding, and kills: a whole one sinking, two burst.
    if (trout) shoot(ctx, trout, "minigun", from, { damage: trout.maxHp * 0.7, along: 0.1 });
    if (parr) shoot(ctx, parr, "piu", from, { damage: parr.hp + 1 });
    if (perch) shoot(ctx, perch, "flinte", from, { damage: perch.hp + 1, pellets: 8 });
    if (parr2) shoot(ctx, parr2, "panzerbuechse", from, { damage: parr2.hp + 1 });
    await salmon.run(0.8, hold);
    await picture(ctx, "1s", hold, eye, mid);
    await salmon.run(3, hold);
    await picture(ctx, "4s", hold, eye, mid);
    await salmon.run(5, hold);
    record.push({ label: "9s", enemies: list.map(marksOf) });
    await picture(ctx, "9s", hold, eye, mid);
    salmon.view(null);
  },
};
