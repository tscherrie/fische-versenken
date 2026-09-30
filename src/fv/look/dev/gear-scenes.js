// The look scenes of the enemies' weapons (look/foe-gear.js, model-foes.js; listed in
// src/fv/dev/scenes-look.js with `gear`): each armed kind is brought in beside the salmon and
// posed by hand -- swimming, aiming at the salmon, at the kick of a shot, striking -- and
// pictured close up from its sides, then a few of them as the game's camera meets them. The
// enemies are real (the enemy system's own records, drawn by its crowds and birds); while a
// picture is taken combat does not step, so a pose holds, and the gear's easing is settled at
// once. Pictures: shots/<set>/<scene>-<kind>-<view>.jpg; the report lists the draws and the
// triangles of each kind's gear, and every warning the page printed.

import { KINDS } from "../../kinds.js";

const nextTask = () => new Promise((r) => setTimeout(r, 0));
const NOOP = { hurt() {}, shoot() {}, ground: null };

export async function runGearScene(ctx) {
  const { set, scene, errors } = ctx;
  const warnings = [];
  const consoleWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" ").slice(0, 500));
    consoleWarn(...args);
  };
  const record = [{ label: "backend", backend: ctx.salmon.renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2" }];
  try {
    await look(ctx, record);
  } catch (error) {
    errors.push(String(error?.stack ?? error));
  }
  console.warn = consoleWarn;
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, errors, warnings }, null, 1) });
  await nextTask();
  await ctx.next();
}

// The poses: what the enemy is doing, and where the camera is in its own frame ([ahead, up,
// right] in its lengths from its middle), looking at `aim` lengths ahead of its middle.
const VIEWS = {
  rechts: { eye: [0.12, 0.22, 0.62] },
  vorn: { eye: [0.62, 0.2, 0.42] },
  oben: { eye: [-0.05, 0.7, 0.18] },
  links: { eye: [0.15, 0.2, -0.62] },
  hinten: { eye: [-0.6, 0.3, 0.35] },
  vornLinks: { eye: [0.62, 0.15, -0.42] },
  unten: { eye: [0.1, -0.4, 0.5] },
  untenVorn: { eye: [0.55, -0.35, 0.35] },
};

async function look(ctx, record) {
  const { salmon, extreme, scene } = ctx;
  const { fish, THREE } = salmon;
  const combat = extreme.combat;
  const enemies = combat.enemies;
  const foes = window.fvModels?.foes;
  if (!foes) throw new Error("no enemy gear (window.fvModels.foes)");
  record.push({ label: "triangles", perKind: foes.triangles() });
  const up = new THREE.Vector3(0, 1, 0);
  const ahead = fish.heading.clone().setY(0).normalize();
  const left = up.clone().cross(ahead).normalize();
  const player = combat.players[0];
  const time = () => extreme.game.now.time;
  // Combat holds still: posed records do not move, the gear's aim is settled at once.
  extreme.testing = false;
  foes.settle = true;
  const spot = {};

  // One of `kind`, `dist` lengths of the salmon ahead of it and `across` to its left.
  const bring = (kind, dist = 3, across = 0.6, y = null) => {
    enemies.reset();
    const L = Math.max(1, fish.length);
    const p = fish.position.clone().addScaledVector(ahead, dist * L).addScaledVector(left, across * L);
    salmon.course.locate(p.x, p.z, fish.river.s, spot);
    const e = enemies.spawn(kind, spot.s, spot.u, y ?? fish.position.y, { heading: ahead.clone().multiplyScalar(-1) });
    if (!e) throw new Error(`could not bring a ${kind}`);
    return e;
  };
  // Hold a pose: the fields set, the enemy system's drawing done (a step of no time), the
  // fields set again (that step's plan may have changed them).
  const hold = (e, { position, ...fields }) => {
    Object.assign(e, fields);
    if (position) e.position.copy(position);
    enemies.update(0, time(), combat.players, NOOP);
    Object.assign(e, fields);
    if (position) e.position.copy(position);
  };
  // The camera round the gear: looking at the middle of its mount and gun (where.js: the
  // gear's pivot, or its muzzle's midpoint with it), from `view.eye` in the enemy's lengths.
  const eyeFor = (e, view) => {
    const heading = e.spec.wades ? e.facing.clone() : e.heading.clone();
    const right = heading.clone().cross(up).normalize();
    const size = e.spec.wades ? 12 : e.size;
    const g = foes.gear[e.kind];
    const centre = foes.where(e, g.pivot, new THREE.Vector3()) ?? e.position.clone();
    if (g.muzzles) centre.lerp(foes.where(e, g.muzzles[0], new THREE.Vector3()) ?? centre, 0.35);
    const eye = centre.clone().addScaledVector(heading, view.eye[0] * size).addScaledVector(up, view.eye[1] * size).addScaledVector(right, view.eye[2] * size);
    // (Under the water with one that swims, over it with a bird in the air.)
    const top = salmon.course.level(e.river.s);
    if (!e.spec.flies && !e.spec.wades) eye.y = Math.min(eye.y, top - 0.25);
    else if (e.position.y > top) eye.y = Math.max(eye.y, top + 0.4);
    return [eye, centre];
  };
  const shoot = async (e, name, view, fields = {}) => {
    hold(e, fields);
    const [eye, target] = eyeFor(e, view);
    salmon.view(eye.toArray(), target.toArray(), Math.max(0.004, e.size * 0.01));
    await salmon.run(1 / 30);
    hold(e, fields);
    // (The capture only draws: the frame's models are placed here, as the game's frame would.)
    extreme.frame(1 / 60);
    await salmon.capture(`${ctx.set}/${scene.name}-${e.kind}-${name}`, 1280, 720);
    record.push({ label: `${e.kind}-${name}`, draws: foes.counts()[e.kind] ?? 0, mode: e.mode });
  };

  for (const kind of scene.gear) {
    const spec = KINDS[kind];
    const e = bring(kind, spec.size[1] > 5 ? 2.2 + spec.size[1] / Math.max(1, fish.length) : 3);
    const top = salmon.course.level(e.river.s);
    if (spec.wades) {
      // (The heron brought out of the trees on its bank into the open river before the
      // salmon, facing it: the look is at its head and gun, not at where it stands.)
      e.stand.copy(fish.position).addScaledVector(ahead, 7 * Math.max(1, fish.length)).addScaledVector(left, 1.5);
      e.stand.y = salmon.course.bed(fish.river.s, fish.river.u);
      e.facing.copy(ahead).multiplyScalar(-1);
    } else if (spec.behaviour === "bomber") {
      // (The gannet high enough over the water to be seen from under its wings.)
      e.position.y = top + 7;
      e.heading.copy(ahead).multiplyScalar(-1);
    } else if (spec.flies) {
      // (The kingfisher in its dive, under the water beside the salmon.)
      e.position.y = fish.position.y;
      e.heading.copy(ahead).multiplyScalar(-1);
    } else if (!spec.wades && e.size > 5) {
      // (A big one in the middle of the water, clear of the bed and the surface.)
      const floor = salmon.course.bed(e.river.s, e.river.u);
      e.position.y = floor + (top - floor) * 0.5;
    }
    const views = spec.wades ? { rechts: VIEWS.vorn, vorn: VIEWS.vornLinks, oben: VIEWS.vorn } : spec.behaviour === "bomber" ? { rechts: VIEWS.unten, vorn: VIEWS.untenVorn, oben: VIEWS.rechts } : VIEWS;
    const still = { position: e.position.clone() };
    const target = player;
    const idle = { mode: spec.wades ? "stand" : spec.flies ? "circle" : "approach", t: 0, ...still };
    await shoot(e, "rechts", views.rechts, idle);
    await shoot(e, "vorn", views.vorn, idle);
    await shoot(e, "oben", views.oben, idle);
    const gear = foes.gear[kind];
    if (gear?.aim || spec.wades) {
      // Aiming at the salmon, off to one side of its heading: the gun turns to it.
      if (!spec.wades) {
        const off = fish.position.clone().sub(e.position).normalize().applyAxisAngle(up, 0.35);
        e.heading.copy(off);
      }
      await shoot(e, "ziel", views.vorn, { mode: "aim", t: 0.05, target, ...still });
      // At the kick of a shot.
      foes.shot(e);
      const st = foes.state(e);
      if (gear.recoil) st.kickAt = time() - gear.recoil.time * 0.18;
      await shoot(e, "schuss", views.rechts, { mode: "fire", t: 0, shots: 1, target, ...still });
      if (gear.pump || gear.blowback) {
        st.kickAt = time() - (gear.pump ? 0.37 : 0.045);
        await shoot(e, "repetieren", views.rechts, { mode: "fire", t: 0, shots: 1, target, ...still });
      }
      if (gear.items) await shoot(e, "leer", views.rechts, { mode: spec.wades ? "stand" : "hover", t: 0, reload: 1, target, ...still });
    }
    if (gear?.melee && gear.melee !== "static") {
      await shoot(e, "ausholen", views.rechts, { mode: "coil", t: (spec.coil ?? 0.5) * 0.9, target, rear: spec.weapon?.rear ? spec.weapon.rear : 0, ...still });
      await shoot(e, "zustoss", views.rechts, { mode: "strike", t: 0.1, target, blow: 0.2, rear: spec.weapon?.rear ? -0.5 * spec.weapon.rear : 0, ...still });
    }
    if (gear?.bombs) {
      await shoot(e, "abwurf", views.rechts, { mode: "recover", t: 0, reload: 2, dropping: 1, releasedAt: -9, ...still });
      await shoot(e, "leer", views.rechts, { mode: "recover", t: 0, reload: 2, dropping: 0, releasedAt: -9, ...still });
    }
    if (scene.left?.includes(kind)) await shoot(e, "links", VIEWS.links, idle);
    // Sunk: belly up, the gun still strapped on.
    if (scene.dead?.includes(kind)) await shoot(e, "tot", VIEWS.rechts, { mode: "dead", dead: true, rolled: Math.PI, corpse: 3, t: 0, ...still });
  }
  // A group of the scene's `crowd` kind round the salmon, from the game's own camera.
  if (scene.crowd) {
    enemies.reset();
    const [kind, n] = scene.crowd;
    const L = Math.max(1, fish.length);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 1.2 - 0.6;
      const p = fish.position.clone().addScaledVector(ahead, (2.5 + (i % 3) * 0.6) * L).addScaledVector(left, Math.sin(a) * 1.8 * L);
      salmon.course.locate(p.x, p.z, fish.river.s, spot);
      const e = enemies.spawn(kind, spot.s, spot.u, fish.position.y + ((i % 2) - 0.5) * 0.3 * L, { heading: ahead.clone().multiplyScalar(-1).applyAxisAngle(up, a * 0.8) });
      if (e) hold(e, { mode: "orbit", t: 0 });
    }
    salmon.view(null);
    await salmon.run(1 / 30);
    for (const e of enemies.list) hold(e, { mode: "orbit", t: 0 });
    extreme.frame(1 / 60);
    await salmon.capture(`${ctx.set}/${scene.name}-schwarm`, 1280, 720);
    record.push({ label: "schwarm", draws: foes.counts() });
  }
  foes.settle = false;
}
