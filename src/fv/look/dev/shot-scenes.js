// The look scenes of the rounds, the cases and the ordnance (look/ordnance.js), listed in
// src/fv/dev/scenes-look.js: the players' ordnance and the enemies' things posed close up
// in the river, the tracers at the speeds they fade through, the spent rounds on the bed,
// and the cases thrown by the real guns firing in the game's own steps. Pictures:
// shots/<set>/<scene>-<picture>.jpg; the report says what was drawn (instances per mesh).

const nextTask = () => new Promise((r) => setTimeout(r, 0));

export async function runShotScene(ctx) {
  const { set, scene, errors } = ctx;
  const warnings = [];
  const consoleWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" ").slice(0, 500));
    consoleWarn(...args);
  };
  const record = [{ label: "backend", backend: ctx.salmon.renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2" }];
  try {
    await SCENES[scene.name](ctx, record);
  } catch (error) {
    errors.push(String(error?.stack ?? error));
  }
  console.warn = consoleWarn;
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, errors, warnings }, null, 1) });
  await nextTask();
  await ctx.next();
}

// The frame of the fish, laid flat: ahead (the way it faces), left, up.
function frameOf(salmon) {
  const { fish, THREE } = salmon;
  const ahead = fish.heading.clone().setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const left = up.clone().cross(ahead).normalize();
  return { ahead, left, up };
}

// What each of the look's meshes drew in the last frame.
function drawn(ctx) {
  const scene = ctx.salmon.scene;
  const out = {};
  scene.traverse((o) => {
    if (o.isInstancedMesh && o.name?.startsWith("Combat") && o.visible && o.count > 0) out[o.name] = o.count;
  });
  return out;
}

// A picture: one step of the world first (the camera takes its place in it), then `pose`
// lays out what is posed (afresh: the step may have moved or ended it), then the frame.
async function picture(ctx, record, name, pose, after) {
  await ctx.salmon.run(1 / 60, null, 1 / 60);
  pose?.();
  ctx.extreme.frame(1 / 60);
  record.push({ label: name, drawn: drawn(ctx) });
  await ctx.salmon.capture(`${ctx.set}/${ctx.scene.name}-${name}`, 1280, 720);
  // (What was posed goes again, so that the next step does not move it on or bubble from it.)
  after?.();
}

// The river's bed under a point.
function groundOf(salmon) {
  const { course, fish } = salmon;
  const spot = {};
  return (p) => {
    course.locate(p.x, p.z, fish.river.s, spot);
    return course.bed(spot.s, spot.u);
  };
}

const SCENES = {
  // The players' ordnance posed in the water ahead of the smolt: each close from the side and
  // from behind, then all of them together; a harpoon on its line from the gun.
  async "geschosse-nah"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const combat = extreme.combat;
    const projectiles = combat.projectiles;
    const player = combat.players[0];
    player.arsenal.back = "raketen";
    player.arsenal.belly = "harpune";
    player.arsenal.ensure?.("raketen");
    player.arsenal.ensure?.("harpune");
    await salmon.run(0.3, null, 1 / 60);
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    const ground = groundOf(salmon);
    const at = fish.position.clone().addScaledVector(ahead, 2.5 * L);
    at.y = Math.max(at.y, ground(at) + 0.9 * L);
    record.push({ label: "fish", L: +L.toFixed(2), stage: fish.stage });
    const shot = (solid, position, velocity, more = {}) => {
      const p = projectiles.fire({ owner: 0, weapon: { torpedo: "torpedo", rocket: "raketen", mine: "minen", harpoon: "harpune", ball: "kanone" }[solid], position, velocity, solid, scale: L, shooter: L, life: 1e4, ghost: true, fuse: false, damage: 0, size: 0.04 * L, tint: [1, 1, 1], ...more });
      p.age = more.age ?? 0.8;
      return p;
    };
    const view = (eye, target) => salmon.view(eye.toArray(), target.toArray(), 0.005);
    const across = ahead.clone();
    const pose = (list) => () => {
      projectiles.reset();
      for (const [solid, offset, more] of list) shot(solid, at.clone().add(offset), across.clone().multiplyScalar(more?.speed ?? 6), more);
    };
    // One at a time, from the side and from behind and above.
    // (Each with where its middle is behind its point, and how near the camera comes.)
    const singles = [
      ["torpedo", 0.16 * L, 0.42],
      ["rocket", -0.12 * L, 0.3],
      ["mine", 0, 0.14],
      ["harpoon", 0.26 * L, 0.5],
      ["ball", 0, 0.12],
    ];
    const clear = () => projectiles.reset();
    for (const [solid, back, near] of singles) {
      const middle = at.clone().addScaledVector(ahead, -back);
      view(middle.clone().addScaledVector(left, near * L).addScaledVector(up, 0.06 * L), middle);
      await picture(ctx, record, `${solid}-seite`, pose([[solid, new THREE.Vector3()]]), clear);
      view(middle.clone().addScaledVector(ahead, -1.2 * near * L).addScaledVector(left, -0.5 * near * L).addScaledVector(up, 0.4 * near * L), middle);
      await picture(ctx, record, `${solid}-hinten`, pose([[solid, new THREE.Vector3()]]), clear);
    }
    // All of them in a row, at the chase camera's distance.
    const row = singles.map(([solid], i) => [solid, left.clone().multiplyScalar((i - 2) * 0.7 * L)]);
    view(at.clone().addScaledVector(ahead, -3.5 * L).addScaledVector(up, 1 * L), at);
    await picture(ctx, record, "reihe", pose(row), clear);
    // One after the other along their way, from the side at the chase camera's distance, the
    // fish behind them: how big each is beside it.
    const file = singles.map(([solid], i) => [solid, ahead.clone().multiplyScalar((i - 2) * 0.55 * L)]);
    view(at.clone().addScaledVector(left, 3.2 * L).addScaledVector(up, 0.7 * L).addScaledVector(ahead, -1.1 * L), at.clone().addScaledVector(ahead, -0.9 * L));
    await picture(ctx, record, "reihe-seite", pose(file), clear);
    // The harpoon on its line from the gun under the belly, as it flies off.
    const out = at.clone().addScaledVector(ahead, 1.5 * L);
    view(fish.position.clone().addScaledVector(left, 2.2 * L).addScaledVector(up, 0.2 * L).addScaledVector(ahead, 1.8 * L), fish.position.clone().addScaledVector(ahead, 1.8 * L));
    await picture(ctx, record, "harpune-leine", () => {
      projectiles.reset();
      const p = shot("harpoon", out, ahead.clone().multiplyScalar(20));
      p.owner = player.id;
    });
    projectiles.reset();
  },

  // The real launchers fired in the game's steps, pictured from beside the fish: the torpedo
  // leaving its tube and running, a salvo of rockets, a mine dropped, the harpoon, the ball.
  async "geschosse-flug"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, look } = salmon;
    const combat = extreme.combat;
    const player = combat.players[0];
    const a = player.arsenal;
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    const hold = () => {
      look.yaw = Math.atan2(ahead.z, ahead.x);
      look.pitch = -0.02;
    };
    salmon.held.add("KeyS");
    const runs = [
      { name: "torpedo", back: "katana", belly: "torpedo", place: "belly", times: [0.25, 0.7], eye: [2.2, 0.1, 1.2] },
      { name: "raketen", back: "raketen", belly: null, place: "back", hold: 0.5, times: [0.2, 0.55], eye: [2.6, 0.6, 2.2] },
      { name: "minen", back: "katana", belly: "minen", place: "belly", times: [0.5, 1.4], eye: [1.6, -0.1, -0.8] },
      { name: "harpune", back: "katana", belly: "harpune", place: "belly", times: [0.04, 0.1], eye: [2.4, 0.2, 2.2] },
      { name: "kanone", back: "kanone", belly: null, place: "back", hold: 1.3, times: [1.25, 1.32], eye: [2.2, 0.5, 2] },
    ];
    for (const r of runs) {
      combat.projectiles.reset();
      a.back = r.back;
      a.belly = r.belly;
      a.ensure?.(r.back);
      if (r.belly) a.ensure?.(r.belly);
      // (Fired with the game's own camera: the aim follows the camera, and one set aside
      // would send the shots off toward what it looks at.)
      salmon.view(null);
      await salmon.run(0.4, hold, 1 / 60);
      let t = 0;
      for (const time of r.times) {
        // (The test trigger holds both places: the katana on the back only cuts the water.
        // A launcher fires once and then waits its interval.)
        const step = 1 / 60;
        salmon.view(null);
        while (t < time - step) {
          combat.fire(t < (r.hold ?? 0.1));
          hold();
          await salmon.run(step, null, step);
          t += step;
        }
        // The camera beside the fish for the picture (it takes its place in the last step).
        const eye = fish.position.clone().addScaledVector(left, r.eye[0] * L).addScaledVector(up, r.eye[1] * L).addScaledVector(ahead, r.eye[2] * L);
        salmon.view(eye.toArray(), fish.position.clone().addScaledVector(ahead, r.eye[2] * L).toArray(), 0.005);
        combat.fire(t < (r.hold ?? 0.1));
        await salmon.run(step, null, step);
        t += step;
        extreme.frame(1 / 60);
        record.push({ label: `${r.name}-${time}`, live: combat.projectiles.live.map((p) => p.solid ?? p.weapon), drawn: drawn(ctx) });
        await salmon.capture(`${ctx.set}/${ctx.scene.name}-${r.name}-${time}`, 1280, 720);
      }
      combat.fire(false);
    }
    salmon.held.delete("KeyS");
    salmon.view(null);
  },

  // The cases: the minigun's brass in a stream, the shotgun's shells as it breaks open, the
  // anti-materiel rifle's big case; then all of them sunk and lying on the bed.
  async huelsen(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, look, THREE } = salmon;
    const combat = extreme.combat;
    const a = combat.players[0].arsenal;
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    const ground = groundOf(salmon);
    const hold = () => {
      look.yaw = Math.atan2(ahead.z, ahead.x);
      look.pitch = 0;
    };
    // (The fish holds its place, as the player does with S.)
    salmon.held.add("KeyS");
    const fire = async (seconds) => {
      combat.fire(true);
      await salmon.run(seconds, hold, 1 / 60);
      combat.fire(false);
    };
    // The camera off the fish's right side, where the cases go, looking at the gun.
    const side = (aside, above, along, lookUp = 0.05) => {
      const eye = fish.position.clone().addScaledVector(left, -aside * L).addScaledVector(up, above * L).addScaledVector(ahead, along * L);
      salmon.view(eye.toArray(), fish.position.clone().addScaledVector(up, lookUp * L).addScaledVector(left, -0.3 * L).addScaledVector(ahead, 0.05 * L).toArray(), 0.005);
    };
    // The minigun, from its right (the side it throws them to), under way and a moment after.
    a.back = "minigun";
    a.ensure?.("minigun");
    await salmon.run(0.3, hold, 1 / 60);
    await fire(1.2);
    side(1.1, 0.25, 0.1);
    await picture(ctx, record, "minigun");
    side(0.5, 0.05, -0.1);
    await picture(ctx, record, "minigun-nah");
    await salmon.run(0.35, hold, 1 / 60);
    side(1.1, 0.1, 0.1);
    await picture(ctx, record, "minigun-sinken");
    // The shotgun: both barrels, then it breaks open.
    a.back = "flinte";
    a.ensure?.("flinte");
    await salmon.run(0.3, hold, 1 / 60);
    await fire(0.32);
    await salmon.run(0.12, hold, 1 / 60);
    side(0.55, 0.35, -0.1);
    await picture(ctx, record, "flinte");
    await salmon.run(0.2, hold, 1 / 60);
    side(0.9, 0.3, -0.2);
    await picture(ctx, record, "flinte-spaeter");
    // The rifle: a steadied shot, then its big case.
    a.back = "panzerbuechse";
    a.ensure?.("panzerbuechse");
    await salmon.run(0.3, hold, 1 / 60);
    combat.fire(true);
    await salmon.run(0.5, hold, 1 / 60);
    combat.fire(false);
    await salmon.run(0.12, hold, 1 / 60);
    // (Its case goes up and out over the rail: the camera further off, looking higher.)
    side(0.85, 0.45, -0.05, 0.3);
    await picture(ctx, record, "panzer");
    // All of them on the bed below, a few seconds on.
    await salmon.run(5, hold, 1 / 30);
    // (Where most of them lie: the middle of the cases drawn, read off their meshes.)
    extreme.frame(1 / 60);
    const below = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const lying = [];
    for (const name of ["Combat cases rifle", "Combat cases shell", "Combat cases big"]) {
      const mesh = salmon.scene.getObjectByName(name);
      for (let i = 0; i < (mesh?.count ?? 0); i++) {
        mesh.getMatrixAt(i, m);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        if (p.y < ground(p) + 0.1 * L) lying.push(p);
      }
    }
    const count = lying.length;
    for (const p of lying) below.add(p);
    if (count) below.divideScalar(count);
    else below.copy(fish.position).setY(ground(fish.position));
    record.push({ label: "cases", count, below: below.toArray().map((v) => +v.toFixed(2)), bed: +ground(below).toFixed(2) });
    const eye = below.clone().addScaledVector(left, -0.25 * L).addScaledVector(up, 0.45 * L).addScaledVector(ahead, -0.3 * L);
    salmon.view(eye.toArray(), below.toArray(), 0.005);
    await picture(ctx, record, "grund");
    const eye2 = below.clone().addScaledVector(left, -0.12 * L).addScaledVector(up, 0.16 * L).addScaledVector(ahead, -0.12 * L);
    salmon.view(eye2.toArray(), below.toArray(), 0.003);
    await picture(ctx, record, "grund-nah");
    salmon.held.delete("KeyS");
  },

  // The minigun held down for seconds on end: the ring of cases full, the stream still falling
  // to the bed and lying there (the ring's oldest going into the gravel, none taken in sight).
  async "huelsen-dauerfeuer"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, look } = salmon;
    const combat = extreme.combat;
    const a = combat.players[0].arsenal;
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    const ground = groundOf(salmon);
    const hold = () => {
      look.yaw = Math.atan2(ahead.z, ahead.x);
      look.pitch = 0;
      // (The minigun never runs hot here: the stream is what is looked at.)
      if (a.heat) a.heat.minigun = 0;
    };
    salmon.held.add("KeyS");
    a.back = "minigun";
    a.ensure?.("minigun");
    await salmon.run(0.3, hold, 1 / 60);
    for (const seconds of [3, 6]) {
      // (Three seconds more each time.)
      combat.fire(true);
      await salmon.run(3, hold, 1 / 60);
      // (From the right, where the cases go, a little below the fish: the stream from the gun
      // down as far as it goes.)
      const below = fish.position.clone().addScaledVector(up, -1.4 * L);
      salmon.view(below.clone().addScaledVector(left, -2.6 * L).addScaledVector(up, 0.3 * L).toArray(), below.toArray(), 0.01);
      record.push({ label: `${seconds}s`, cases: combat.ordnance.cases, above: +(fish.position.y - ground(fish.position)).toFixed(2) });
      await picture(ctx, record, `strom-${seconds}s`);
      salmon.view(null);
    }
    combat.fire(false);
    salmon.held.delete("KeyS");
  },

  // The enemies' guns throwing their cases, seen close beside the gunner a moment after its
  // shot, fired through the game's own path (the hooks enemies.update is handed, as the bench
  // does): the trout's submachine gun, a perch's pistol, the mackerel's assault rifle, the
  // king's minigun, the cod's pump gun (pumped), the bullhead's shotgun (broken open) and the
  // pike's elephant gun (the bolt drawn).
  async "gegner-huelsen"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE, course, look } = salmon;
    const combat = extreme.combat;
    const { ahead, up } = frameOf(salmon);
    const L = fish.length;
    salmon.held.add("KeyS");
    combat.fire(false);
    let hooks = null;
    const update = combat.enemies.update;
    combat.enemies.update = function (dt, time, players, d) {
      hooks = d;
      return update.apply(this, arguments);
    };
    const spot = {};
    const face = () => {
      look.yaw = Math.atan2(ahead.z, ahead.x);
      look.pitch = 0;
    };
    const snout = new THREE.Vector3();
    try {
      for (const [kind, after] of [
        ["trout", 0.12],
        ["perch", 0.12],
        ["mackerel", 0.12],
        ["king", 0.12],
        ["cod", 0.5],
        ["bullhead", 0.85],
        ["pike", 1.05],
      ]) {
        combat.enemies.reset();
        combat.hostile.reset();
        combat.ordnance.reset();
        const p = fish.position.clone().addScaledVector(ahead, 4 * Math.max(1, L));
        course.locate(p.x, p.z, fish.river.s, spot);
        const e = combat.enemies.spawn(kind, spot.s, spot.u, fish.position.y, { heading: ahead.clone().negate() });
        if (!e) {
          record.push({ label: kind, spawned: false });
          continue;
        }
        await salmon.run(1 / 30, face, 1 / 30);
        const gun = e.spec.weapon;
        combat.enemies.snout(e, snout);
        hooks?.shoot(e, fish.position.clone().sub(snout).normalize(), gun);
        await salmon.run(after, face, 1 / 60);
        const aim = (e.aimDir ?? e.heading).clone().setY(0).normalize();
        const right = aim.clone().cross(up).normalize();
        combat.enemies.snout(e, snout);
        const port = snout.clone().addScaledVector(aim, -0.3 * e.size).addScaledVector(right, 0.12 * e.size).addScaledVector(up, 0.05 * e.size);
        const eye = port.clone().addScaledVector(right, 0.75 * e.size).addScaledVector(up, 0.2 * e.size).addScaledVector(aim, -0.25 * e.size);
        salmon.view(eye.toArray(), port.toArray(), 0.003);
        record.push({ label: kind, gun: gun?.id, hooks: !!hooks, rounds: combat.hostile.live.length, cases: combat.ordnance.cases, size: +e.size.toFixed(2) });
        await picture(ctx, record, kind);
      }
    } finally {
      combat.enemies.update = update;
    }
    salmon.held.delete("KeyS");
    salmon.view(null);
  },

  // The enemies' guns fired at the fish through the game's own path, seen from the side
  // between them: the tracers flying and fading as the water takes their speed, the rounds
  // spent and sinking a moment later, the cases. (The fish is kept safe: the rounds go
  // through it.)
  async "gegner-feuer"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, course, look } = salmon;
    const combat = extreme.combat;
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    salmon.held.add("KeyS");
    combat.fire(false);
    let hooks = null;
    const update = combat.enemies.update;
    combat.enemies.update = function (dt, time, players, d) {
      hooks = d;
      return update.apply(this, arguments);
    };
    const spot = {};
    const face = () => {
      look.yaw = Math.atan2(ahead.z, ahead.x);
      look.pitch = 0;
      fish.safe = true;
    };
    const snout = fish.position.clone();
    try {
      for (const kind of ["trout", "mackerel", "bullhead"]) {
        combat.enemies.reset();
        combat.hostile.reset();
        combat.ordnance.reset();
        const p = fish.position.clone().addScaledVector(ahead, 6 * Math.max(1, L));
        course.locate(p.x, p.z, fish.river.s, spot);
        const e = combat.enemies.spawn(kind, spot.s, spot.u, fish.position.y, { heading: ahead.clone().negate() });
        if (!e) {
          record.push({ label: kind, spawned: false });
          continue;
        }
        await salmon.run(1 / 30, face, 1 / 30);
        const gun = e.spec.weapon;
        const middle = fish.position.clone().lerp(e.position, 0.5);
        for (let i = 0; i < 3; i++) {
          combat.enemies.snout(e, snout);
          hooks?.shoot(e, fish.position.clone().sub(snout).normalize(), gun);
          await salmon.run(0.08, face, 1 / 60);
        }
        const d = fish.position.distanceTo(e.position);
        salmon.view(middle.clone().addScaledVector(left, 0.7 * d).addScaledVector(up, 0.1 * d).toArray(), middle.toArray(), 0.01);
        await picture(ctx, record, `${kind}-flug`);
        await salmon.run(0.6, face, 1 / 60);
        await picture(ctx, record, `${kind}-verbraucht`);
        record.push({ label: kind, gun: gun?.id, rounds: combat.hostile.live.length, cases: combat.ordnance.cases });
      }
    } finally {
      combat.enemies.update = update;
      fish.safe = false;
    }
    salmon.held.delete("KeyS");
    salmon.view(null);
  },

  // Each of the enemies' things close by: flying (from beside and above, so a star shows its
  // face), and lying on the bed; then a spent bullet and a pellet on the bed, very close.
  async "gegner-nah"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const hostile = extreme.combat.hostile;
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    const ground = groundOf(salmon);
    await salmon.run(0.3, null, 1 / 60);
    const fire = (weapon, position, velocity, size, more = {}) => {
      const p = hostile.fire({ source: null, weapon, cause: "test", position, velocity, damage: 0, drag: 1.5, radius: 0.03, life: 1e4, size, tint: [7, 3.2, 0.7], stretch: 3.5 });
      Object.assign(p, more);
      // (Laid on the bed by hand: the bed is where it lies, as hostile.js works it out.)
      if (p.rested && more.floor === undefined) p.floor = p.position.y;
      return p;
    };
    const clear = () => hostile.reset();
    const view = (eye, target) => salmon.view(eye.toArray(), target.toArray(), 0.002);
    const things = [
      ["crossbow", 0.09, 5],
      ["speargun", 0.11, 8],
      ["stars", 0.06, 1.3],
      ["knives", 0.106, 2.7],
      ["nailgun", 0.06, 1.3],
    ];
    const at = fish.position.clone().addScaledVector(ahead, 1.2 * L).addScaledVector(up, 0.2 * L);
    for (const [weapon, size, length] of things) {
      const len = size * length;
      const d = Math.max(0.12, 1.3 * len);
      view(at.clone().addScaledVector(left, 0.8 * d).addScaledVector(up, 0.55 * d).addScaledVector(ahead, 0.2 * d), at);
      await picture(ctx, record, `${weapon}-flug`, () => {
        hostile.reset();
        const p = fire(weapon, at.clone(), ahead.clone().negate().multiplyScalar(10), size);
        p.age = 0.13;
      }, clear);
      const bedAt = at.clone();
      bedAt.y = ground(bedAt);
      view(bedAt.clone().addScaledVector(left, 0.6 * d).addScaledVector(up, 0.75 * d).addScaledVector(ahead, -0.3 * d), bedAt);
      await picture(ctx, record, `${weapon}-grund`, () => {
        hostile.reset();
        const p = fire(weapon, bedAt.clone(), new THREE.Vector3(), size, { spent: true, rested: true, spentAge: 1, restAt: 0.5 });
        p.born = 17;
      }, clear);
    }
    // A spent bullet and a pellet, side by side on the bed.
    const bedAt = at.clone();
    bedAt.y = ground(bedAt);
    view(bedAt.clone().addScaledVector(left, 0.05).addScaledVector(up, 0.06).addScaledVector(ahead, -0.05), bedAt);
    await picture(ctx, record, "kugel-grund-nah", () => {
      hostile.reset();
      fire("smg", bedAt.clone().addScaledVector(left, -0.012), new THREE.Vector3(), 0.08, { spent: true, rested: true, spentAge: 1, restAt: 0.5 }).born = 3;
      fire("sawnoff", bedAt.clone().addScaledVector(left, 0.012), new THREE.Vector3(), 0.08, { spent: true, rested: true, spentAge: 1, restAt: 0.5 }).born = 5;
    }, clear);
  },

  // The enemies' things and rounds posed ahead of a parr: bolts, the heron's spear, stars,
  // knives, nails in flight and lying on the bed; tracers at the speeds they fade through; the
  // spent rounds and pellets; the gannet's bombs in the air and in the water.
  async "gegner-dinge"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const combat = extreme.combat;
    const hostile = combat.hostile;
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    const ground = groundOf(salmon);
    await salmon.run(0.3, null, 1 / 60);
    const at = fish.position.clone().addScaledVector(ahead, 1.6 * L);
    const tints = [7, 3.2, 0.7];
    const fire = (weapon, position, velocity, size, more = {}) => {
      const p = hostile.fire({ source: null, weapon, cause: "test", position, velocity, damage: 0, drag: 1.5, radius: 0.03, life: 1e4, size, tint: tints, stretch: 3.5 });
      Object.assign(p, more);
      // (Laid on the bed by hand: the bed is where it lies, as hostile.js works it out.)
      if (p.rested && more.floor === undefined) p.floor = p.position.y;
      return p;
    };
    const view = (eye, target) => salmon.view(eye.toArray(), target.toArray(), 0.005);
    // The things in flight, in a column across the view, flying to the right.
    const things = [
      ["crossbow", 0.09],
      ["speargun", 0.11],
      ["stars", 0.06],
      ["knives", 0.106],
      ["nailgun", 0.06],
    ];
    const flying = (age) => () => {
      hostile.reset();
      things.forEach(([weapon, size], i) => {
        const p = fire(weapon, at.clone().addScaledVector(up, (0.5 - i * 0.25) * L).addScaledVector(ahead, (i % 2) * 0.25 * L), ahead.clone().negate().multiplyScalar(10), size);
        p.age = age + i * 0.07;
      });
    };
    view(at.clone().addScaledVector(left, 1.3 * L).addScaledVector(up, 0.55 * L), at);
    await picture(ctx, record, "dinge-flug", flying(0.12));
    await picture(ctx, record, "dinge-flug-2", flying(0.19));
    // Lying on the bed.
    const bedAt = at.clone();
    bedAt.y = ground(bedAt);
    const lying = () => {
      hostile.reset();
      things.forEach(([weapon, size], i) => {
        const p = at.clone().addScaledVector(left, (i - 2) * 0.3 * L);
        p.y = ground(p);
        const r = fire(weapon, p, new THREE.Vector3(), size, { spent: true, rested: true, spentAge: 1, restAt: 0.5 });
        r.born = 11 + i * 7;
      });
    };
    view(bedAt.clone().addScaledVector(ahead, -0.8 * L).addScaledVector(up, 0.8 * L), bedAt);
    await picture(ctx, record, "dinge-grund", lying);
    // Struck into the bed: each fired steeply down at it through hostile.js's own step, stuck
    // where it went in, point first, leaning back the way it came.
    hostile.reset();
    combat.ordnance.reset();
    things.forEach(([weapon, size], i) => {
      const target = at.clone().addScaledVector(left, (i - 2) * 0.3 * L);
      target.y = ground(target);
      const from = target.clone().addScaledVector(up, 0.3 * L).addScaledVector(ahead, 0.2 * L);
      fire(weapon, from, target.clone().sub(from).normalize().multiplyScalar(10), size);
    });
    await salmon.run(0.15, null, 1 / 60);
    record.push({ label: "stuck", flying: hostile.live.length });
    view(bedAt.clone().addScaledVector(ahead, -0.5 * L).addScaledVector(left, 0.5 * L).addScaledVector(up, 0.45 * L), bedAt);
    await picture(ctx, record, "dinge-stecken");
    combat.ordnance.reset();
    // Tracers fading: rounds at 100, 80, 60, 45, 32 % of their speed, then spent.
    const ratios = [1, 0.8, 0.6, 0.45, 0.32, 0.2];
    const tracers = (weapon, size) => () => {
      hostile.reset();
      ratios.forEach((k, i) => {
        const p = fire(weapon, at.clone().addScaledVector(up, (1.25 - i * 0.5) * 0.3 * L).addScaledVector(ahead, (i - 2.5) * 0.12 * L), ahead.clone().negate().multiplyScalar(16), size);
        p.velocity.multiplyScalar(k);
        if (k < 0.25) {
          p.spent = true;
          p.spentAge = 0.4;
          p.velocity.set(0, -0.45, 0);
        }
      });
    };
    view(at.clone().addScaledVector(left, 1.4 * L).addScaledVector(up, 0.1 * L), at);
    await picture(ctx, record, "leuchtspur", tracers("smg", 0.07));
    view(at.clone().addScaledVector(left, 0.5 * L).addScaledVector(up, -0.05 * L).addScaledVector(ahead, 0.1 * L), at.clone().addScaledVector(up, -0.1 * L));
    await picture(ctx, record, "leuchtspur-nah", tracers("smg", 0.07));
    // Spent rounds and pellets on the bed.
    const spent = () => {
      hostile.reset();
      for (let i = 0; i < 14; i++) {
        const p = at.clone().addScaledVector(left, ((i % 7) - 3) * 0.12 * L).addScaledVector(ahead, (Math.floor(i / 7) - 0.5) * 0.15 * L);
        p.y = ground(p);
        const r = fire(i < 7 ? "smg" : "sawnoff", p, new THREE.Vector3(), 0.08, { spent: true, rested: true, spentAge: 1, restAt: 0.5 });
        r.born = 100 + i * 13;
      }
    };
    view(bedAt.clone().addScaledVector(ahead, -0.35 * L).addScaledVector(up, 0.4 * L), bedAt);
    await picture(ctx, record, "kugeln-grund", spent);
    hostile.reset();
    // The bombs: one falling through the air, two sinking.
    const bombs = combat.enemies.bombs;
    const surface = salmon.course.level(fish.river.s);
    const bomb = (position, velocity, wet) => ({ position, velocity, wet, source: null, gun: null, age: 1, side: 1 });
    const bombsAt = fish.position.clone().addScaledVector(ahead, 3 * L);
    view(bombsAt.clone().addScaledVector(left, 2.2 * L).addScaledVector(up, 0.2 * L), bombsAt);
    await picture(ctx, record, "bomben", () => {
      bombs.length = 0;
      bombs.push(bomb(bombsAt.clone().addScaledVector(up, 0.5 * L), new THREE.Vector3(0, -3, 0).addScaledVector(ahead, 0.6), true));
      bombs.push(bomb(bombsAt.clone().addScaledVector(left, 0.5 * L), ahead.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, -2, 0)), true));
      bombs.push(bomb(bombsAt.clone().setY(Math.max(bombsAt.y + 0.8 * L, surface + 0.4)), new THREE.Vector3(0, -12, 0).addScaledVector(ahead, 3), false));
    });
    bombs.length = 0;
    // The heron's spear coming down through the air, seen from below through the surface.
    const spearAt = fish.position.clone().addScaledVector(ahead, 2 * L).setY(surface + 0.35 * L);
    view(spearAt.clone().setY(surface - 0.6 * L).addScaledVector(ahead, -0.9 * L).addScaledVector(left, 0.4 * L), spearAt);
    await picture(ctx, record, "speer-luft", () => {
      hostile.reset();
      const p = fire("speargun", spearAt.clone(), ahead.clone().multiplyScalar(4).add(new THREE.Vector3(0, -6, 0)), 0.11, { air: true });
      p.age = 0.05;
    });
    hostile.reset();
  },

  // Seen from above the water, looking down through the surface: the ordnance and the
  // tracers just under it (drawn under the surface, not over it), a bomb falling through the
  // air and one in the water, the heron's spear in the air.
  async "geschosse-oben"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const combat = extreme.combat;
    const { projectiles, hostile } = combat;
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    await salmon.run(0.3, null, 1 / 60);
    const surface = salmon.course.level(fish.river.s);
    const at = fish.position.clone().addScaledVector(ahead, 2.5 * L).setY(surface - 0.35 * L);
    const shot = (solid, position, velocity) => {
      const p = projectiles.fire({ owner: 0, weapon: { torpedo: "torpedo", rocket: "raketen", mine: "minen", harpoon: "harpune", ball: "kanone" }[solid], position, velocity, solid, scale: L, shooter: L, life: 1e4, ghost: true, fuse: false, damage: 0, size: 0.04 * L, tint: [1, 1, 1] });
      p.age = 0.8;
      return p;
    };
    const fire = (weapon, position, velocity, size, more = {}) => {
      const p = hostile.fire({ source: null, weapon, cause: "test", position, velocity, damage: 0, drag: 1.5, radius: 0.03, life: 1e4, size, tint: [7, 3.2, 0.7], stretch: 3.5 });
      Object.assign(p, more);
      // (Laid on the bed by hand: the bed is where it lies, as hostile.js works it out.)
      if (p.rested && more.floor === undefined) p.floor = p.position.y;
      return p;
    };
    const eye = at.clone().addScaledVector(ahead, -1.6 * L).addScaledVector(left, 0.8 * L).setY(surface + 1.3 * L);
    salmon.view(eye.toArray(), at.toArray(), 0.01);
    const kinds = ["torpedo", "rocket", "mine", "harpoon", "ball"];
    await picture(ctx, record, "ordnance", () => {
      projectiles.reset();
      hostile.reset();
      kinds.forEach((solid, i) => shot(solid, at.clone().addScaledVector(left, (i - 2) * 0.4 * L), ahead.clone().multiplyScalar(6)));
      [1, 0.8, 0.6].forEach((k, i) => {
        const p = fire("smg", at.clone().addScaledVector(ahead, 0.6 * L).addScaledVector(left, (i - 1) * 0.4 * L), left.clone().multiplyScalar(-16 * k), 0.07);
        p.age = 0.1;
      });
    });
    projectiles.reset();
    hostile.reset();
    // A bomb in the air over the water, one just in; the heron's spear in the air.
    const bombs = combat.enemies.bombs;
    const bomb = (position, velocity, wet) => ({ position, velocity, wet, source: null, gun: null, age: 1, side: 1 });
    await picture(ctx, record, "luft", () => {
      bombs.length = 0;
      bombs.push(bomb(at.clone().setY(surface + 0.7 * L), new THREE.Vector3(0, -12, 0).addScaledVector(ahead, 3), false));
      bombs.push(bomb(at.clone().addScaledVector(left, 0.6 * L), new THREE.Vector3(0, -2, 0).addScaledVector(ahead, 0.5), true));
      hostile.reset();
      const p = fire("speargun", at.clone().addScaledVector(left, -0.6 * L).setY(surface + 0.4 * L), ahead.clone().multiplyScalar(4).add(new THREE.Vector3(0, -6, 0)), 0.11, { air: true });
      p.age = 0.05;
    });
    bombs.length = 0;
    hostile.reset();
    salmon.view(null);
  },

  // The grenade harpoon stopped in the water (weapons.js stops it at its reach or in a fish
  // too big to go through, its velocity nothing, until its head goes off): it keeps pointing
  // the way it flew, away from the gun, on its line.
  async "harpune-halt"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, THREE } = salmon;
    const combat = extreme.combat;
    const projectiles = combat.projectiles;
    const player = combat.players[0];
    player.arsenal.belly = "harpune";
    player.arsenal.ensure?.("harpune");
    await salmon.run(0.3, null, 1 / 60);
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    // (Off to the fish's left and a little down: a way that is not the world's +x.)
    const way = ahead.clone().addScaledVector(left, 0.6).addScaledVector(up, -0.15).normalize();
    const out = fish.position.clone().addScaledVector(way, 2 * L);
    salmon.view(fish.position.clone().addScaledVector(left, -1.6 * L).addScaledVector(up, 0.9 * L).addScaledVector(ahead, 1.2 * L).toArray(), fish.position.clone().addScaledVector(way, 1.3 * L).toArray(), 0.005);
    let p = null;
    await picture(ctx, record, "flug", () => {
      projectiles.reset();
      p = projectiles.fire({ owner: player.id, weapon: "harpune", position: out.clone(), velocity: way.clone().multiplyScalar(4), solid: "harpoon", scale: L, shooter: L, life: 1e4, ghost: true, fuse: false, damage: 0, size: 0.04 * L, tint: [1, 1, 1] });
      p.age = 0.8;
    });
    // (Stopped as weapons.js stops it: the same record, its velocity taken.)
    await picture(ctx, record, "halt", () => {
      p.velocity.set(0, 0, 0);
      p.stopped = 0.1;
    });
    projectiles.reset();
    salmon.view(null);
  },
};
// The same scenes at night (their own places in the list carry the hour).
SCENES["geschosse-nah-nacht"] = SCENES["geschosse-nah"];
SCENES["gegner-dinge-nacht"] = SCENES["gegner-dinge"];
SCENES["huelsen-nacht"] = SCENES.huelsen;
SCENES["gegner-feuer-nacht"] = SCENES["gegner-feuer"];
