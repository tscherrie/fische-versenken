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

// The guns in a real fight (the scene's `spawn`, nobody firing back): at every shot, how far
// the round's way is off the line of the bore that fired it, and whether it left from the
// muzzle. A gun pointing more than 12 degrees off on the mean is an error in the report.
async function aimCheck(ctx, record) {
  const { salmon, extreme, scene, errors } = ctx;
  const { THREE } = salmon;
  const combat = extreme.combat;
  const foes = window.fvModels?.foes;
  const from = new THREE.Vector3(),
    to = new THREE.Vector3(),
    bore = new THREE.Vector3(),
    way = new THREE.Vector3();
  const shots = [];
  const fire = combat.hostile.fire;
  combat.hostile.fire = function (round) {
    const e = round.source;
    if (e && foes.aimLine(e, from, to)) {
      bore.subVectors(to, from).normalize();
      way.copy(round.velocity).normalize();
      shots.push({ kind: e.kind, off: +((Math.acos(Math.min(1, Math.max(-1, bore.dot(way)))) * 180) / Math.PI).toFixed(1), fromMuzzle: +round.position.distanceTo(to).toFixed(4) });
    }
    return fire.apply(this, arguments);
  };
  combat.fire(false);
  // (Frames drawn as the game draws them: the guns ease toward their aim frame by frame.)
  await salmon.run(scene.seconds ?? 10, () => extreme.frame(1 / 30));
  combat.hostile.fire = fire;
  extreme.frame(1 / 30);
  await salmon.capture(`${ctx.set}/${scene.name}-ende`, 1280, 720);
  const byKind = {};
  for (const s of shots) (byKind[s.kind] ??= []).push(s);
  for (const [kind, list] of Object.entries(byKind)) {
    // (Shotguns spread their pellets: each pellet is off by its spread as well.)
    const mean = list.reduce((a, s) => a + s.off, 0) / list.length;
    const worstMuzzle = Math.max(...list.map((s) => s.fromMuzzle));
    record.push({ label: `ziel-${kind}`, pellets: list.length, meanDeg: +mean.toFixed(1), maxDeg: Math.max(...list.map((s) => s.off)), worstMuzzle });
    if (mean > 12) errors.push(`${kind}: its rounds fly ${mean.toFixed(1)} degrees off its bore on the mean`);
    if (worstMuzzle > 1e-3) errors.push(`${kind}: a round left ${worstMuzzle} from its muzzle`);
  }
  if (!shots.length) errors.push("no enemy fired");
  // What placing the gear costs the script, a frame: with this fight, and with a crowd of the
  // small armed fish (hundreds may come in a long game; the crowds hold 24 of a kind).
  const cost = (n = 300) => {
    const list = combat.enemies.list;
    const t = performance.now();
    for (let i = 0; i < n; i++) foes.update(list);
    return +((performance.now() - t) / n).toFixed(4);
  };
  record.push({ label: "update", enemies: combat.enemies.list.length, ms: cost() });
  const spot = {};
  const { fish } = salmon;
  for (const kind of ["minnow", "stickleback", "herring", "mackerel", "perch", "troutParr"])
    for (let i = 0; i < 24; i++) {
      const p = fish.position.clone().add(new THREE.Vector3((i % 6) - 2.5, 0, Math.floor(i / 6) - 1.5).multiplyScalar(0.8));
      salmon.course.locate(p.x, p.z, fish.river.s, spot);
      combat.enemies.spawn(kind, spot.s, spot.u, fish.position.y);
    }
  extreme.frame(1 / 30);
  record.push({ label: "update-crowd", enemies: combat.enemies.list.length, drawn: foes.counts(), ms: cost() });
}

// The gear in a real fight, checked rather than posed (the scene's `fight`: [kind, how many]):
// every armed kind of it about at once round a salmon that does not fire back, pictured from
// the game's own camera as the fight goes on, from over the water and from the bed, and close
// by as they swim; whether the renderer builds anything once the warm-up is over (a node
// build or a new program now is a stall mid-swim); and which enemies carry their gear in each
// state: a corpse keeps it, a burst or eaten one, a peaceful stand-in, a fleeing fish and one
// faded out do not, and a kind with nobody left hides its mesh.
async function gearCheck(ctx, record) {
  const { salmon, extreme, scene, errors } = ctx;
  const { THREE, fish, renderer, course } = salmon;
  const combat = extreme.combat;
  const enemies = combat.enemies;
  const foes = window.fvModels?.foes;
  const shot = (name) => salmon.capture(`${ctx.set}/${scene.name}-${name}`, 1280, 720);
  // Whatever the renderer builds from here on, by the name of the object it is built for.
  const built = [];
  const nodes = renderer._nodes;
  const createBuilder = nodes._createNodeBuilder;
  nodes._createNodeBuilder = function (renderObject) {
    built.push(renderObject.object?.name || renderObject.object?.type);
    return createBuilder.apply(this, arguments);
  };
  const programs = () => renderer.info.memory.programs;
  combat.fire(false);
  combat.director.hold(1e6);
  // (A first picture with nobody about, so that what the picture's own size builds is not
  // counted.)
  await shot("leer");
  built.length = 0;
  const programs0 = programs();

  const ahead = fish.heading.clone().setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const left = up.clone().cross(ahead).normalize();
  const L = Math.max(1, fish.length);
  const spot = {};
  let i = 0;
  for (const [kind, n] of scene.fight)
    for (let j = 0; j < n; j++, i++) {
      // (Round the salmon and ahead of it, at three heights.)
      const a = (i * 2.4) % (Math.PI * 2);
      const r = (5 + (i % 5) * 1.6) * L;
      const p = fish.position.clone().addScaledVector(ahead, Math.cos(a) * r + 4 * L).addScaledVector(left, Math.sin(a) * r);
      course.locate(p.x, p.z, fish.river.s, spot);
      enemies.spawn(kind, spot.s, spot.u, fish.position.y + ((i % 3) - 1) * 0.35 * L, { heading: ahead.clone().negate() });
    }
  record.push({ label: "kampf", enemies: enemies.list.map((e) => e.kind).join(" ") });
  // (The salmon is kept alive: this is about the enemies.)
  const alive = () => (fish.energy = 1);
  const run = (seconds) => salmon.run(seconds, () => (alive(), extreme.frame(1 / 30)));
  // As the game's camera sees it, the fight going on.
  salmon.view(null);
  for (let k = 1; k <= 4; k++) {
    await run(0.5);
    extreme.frame(1 / 60);
    await shot(`spiel-${k}`);
    record.push({ label: `spiel-${k}`, drawn: foes.counts(), modes: enemies.list.map((e) => e.mode).join(" ") });
  }
  const top = course.level(fish.river.s);
  const floor = course.bed(fish.river.s, fish.river.u);
  const middle = new THREE.Vector3();
  const live = enemies.list.filter((e) => !e.dead && !e.neutral && !e.spec.flies && !e.spec.wades);
  for (const e of live) middle.add(e.position);
  middle.divideScalar(Math.max(1, live.length));
  // From over the water, looking down into it; from the bed, looking up at the fish against
  // the surface.
  // (A view takes its place at the next step; the models are then placed for it, as the game's
  // frame does after its step: a capture only draws.)
  const view = async (eye, target, near) => {
    salmon.view(eye, target, near);
    await run(1 / 30);
    extreme.frame(1 / 60);
  };
  await view([middle.x - ahead.x * 4 * L, top + 3 * L, middle.z - ahead.z * 4 * L], middle.toArray(), 0.05);
  await shot("von-oben");
  await view([middle.x - ahead.x * 3 * L + left.x * 2 * L, floor + 0.3 * L, middle.z - ahead.z * 3 * L + left.z * 2 * L], [middle.x, Math.min(top - 0.2, middle.y + 1.5 * L), middle.z], 0.05);
  await shot("vom-grund");
  // Close by, as they swim and aim (no pose held): one of each kind named in `close`.
  for (const kind of scene.close ?? []) {
    const e = enemies.list.find((x) => x.kind === kind && !x.dead && !x.neutral);
    if (!e) continue;
    const side = e.heading.clone().cross(up).normalize();
    const eye = e.position.clone().addScaledVector(side, 0.9 * e.size).addScaledVector(e.heading, 0.3 * e.size).addScaledVector(up, 0.25 * e.size);
    eye.y = Math.min(eye.y, top - 0.2);
    await view(eye.toArray(), e.position.toArray(), Math.max(0.004, e.size * 0.01));
    await shot(`nah-${kind}`);
    record.push({ label: `nah-${kind}`, mode: e.mode });
    // And a moment later, from the same place, the fish and its gun moved on.
    await run(0.1);
    extreme.frame(1 / 60);
    await shot(`nah-${kind}-danach`);
  }
  salmon.view(null);
  if (programs() !== programs0 || built.length) errors.push(`built after the warm-up: ${programs() - programs0} programs, node builds for ${[...new Set(built)].join(", ")}`);
  record.push({ label: "gebaut", programs: programs() - programs0, builds: [...new Set(built)] });

  // What placing the gear costs the script in this fight, each call of update as the frame
  // makes it with the fight going on and the game's camera. (The page's clock is coarse, a
  // tenth of a millisecond: the mean of many calls, not the median, says how long one takes.)
  await view(null);
  const update = foes.update;
  let spent = 0,
    calls = 0;
  foes.update = function () {
    const t = performance.now();
    const out = update.apply(this, arguments);
    spent += performance.now() - t;
    calls++;
    return out;
  };
  await run(3);
  foes.update = update;
  extreme.frame(1 / 60);
  record.push({ label: "kosten", enemies: enemies.list.filter((e) => !e.neutral).length, drawn: foes.counts(), placing: +(spent / Math.max(1, calls)).toFixed(4), calls });

  // The states. Each is tried on an enemy whose gear is drawn now: the count of its kind must
  // go down by one (or stay, for a corpse) and come back when the state is taken away again.
  // (Seen from well back, so that most are in view; the camera then stays where it is.)
  await view([middle.x - ahead.x * 14 * L, middle.y + 2 * L, middle.z - ahead.z * 14 * L], middle.toArray(), 0.05);
  const draw = () => foes.update(enemies.list);
  const drawn = (kind) => foes.counts()[kind] ?? 0;
  draw();
  const states = [
    ["neutral", true, -1],
    ["passive", true, -1],
    ["eaten", true, -1],
    ["burst", true, -1],
    ["shown", 0, -1],
    ["dead", true, 0],
  ];
  const tried = {};
  for (const e of enemies.list) {
    if (e.dead || e.neutral || tried[e.kind] || !foes.gear[e.kind]) continue;
    const before = drawn(e.kind);
    if (!before) continue;
    // (Only one whose own gear is among those drawn: it goes when the enemy fades out.)
    const shown = e.shown;
    e.shown = 0;
    draw();
    const own = drawn(e.kind) < before;
    e.shown = shown;
    draw();
    if (!own) continue;
    tried[e.kind] = {};
    for (const [field, value, change] of states) {
      const old = e[field];
      e[field] = value;
      draw();
      const now = drawn(e.kind);
      e[field] = old;
      draw();
      const back = drawn(e.kind);
      // (The heron's gun goes with its head, which a dead heron no longer shows.)
      const want = field === "dead" && foes.gear[e.kind].frame === "head" ? -1 : change;
      tried[e.kind][field] = now - before;
      if (now - before !== want || back !== before) errors.push(`${e.kind} ${field}: ${before} drawn, ${now} with it, ${back} after (wanted ${want})`);
    }
  }
  record.push({ label: "zustaende", tried });
  // Everyone gone: every kind's mesh hidden.
  const list = enemies.list.splice(0);
  draw();
  const shown = foes.meshes.filter((m) => m.visible).map((m) => m.name);
  if (shown.length) errors.push(`gear still shown with nobody about: ${shown.join(", ")}`);
  enemies.list.push(...list);
  draw();
  nodes._createNodeBuilder = createBuilder;
}

async function look(ctx, record) {
  if (ctx.scene.aimCheck) return aimCheck(ctx, record);
  if (ctx.scene.fight) return gearCheck(ctx, record);
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
    // (The heron's gun is looked at where it is lashed under the bill, from a few metres off:
    // the bird itself is taller than any view of it would hold.)
    const size = e.spec.wades ? 5 : e.size;
    const g = foes.gear[e.kind];
    const centre = foes.where(e, g.pivot, new THREE.Vector3()) ?? e.position.clone();
    if (e.spec.wades) foes.where(e, [1.4, -0.4, 0], centre);
    else if (g.muzzles) centre.lerp(foes.where(e, g.muzzles[0], new THREE.Vector3()) ?? centre, 0.35);
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
