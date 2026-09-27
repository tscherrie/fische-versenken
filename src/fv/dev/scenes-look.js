// Test scenes for how combat looks and what it costs (owned by whoever works on the look):
// scenes listed here join the list in scenes.js, and a scene with `look: true` is run by
// runLook below instead of the generic runner.
//
// The bench (scene "bench", driven by tools/fv-bench.mjs) weighs combat against its budget:
// all of it together may take at most 1.5 ms of the graphics card's frame and 1 ms of script.
// It holds fights of a fixed size in one place and tops them up as things die, so every
// frame carries the same load: a fight of four players as the game can have it today (40
// enemies firing their own guns at their own pace, and as many laser bolts as four players
// firing without pause keep in the water), and a stress case well beyond it (150 players'
// shots and 60 enemy rounds held in flight). Both are timed against the same place and
// camera with no fight, several times over. Then it looks for where the time goes: the
// card's share by showing and hiding combat's meshes in turns, parts of the script swapped
// for variants in turns, the fight scaled up and down, and the river lookups timed on their
// own. Everything is changed from here, at run time; the combat files stay as they are.
//
// Any other scene run with ?xtiming (fv-test --timing) gets what combat.step and
// combat.frame cost added to its report.
//
// (The bench's code comes first and the list of scenes with runLook last: scenes added below
// runLook on other branches then never touch the bench's lines when the branches merge.)

const now = () => performance.now();
// A macrotask without the clamping of nested timeouts, so waiting for one costs nothing.
const nextTask = () =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = resolve;
    channel.port2.postMessage(0);
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Whether combat.step is running right now: a function the base game calls as well (the
// stones near a point) is timed only for combat's own calls.
const inside = { step: false };

// A method replaced by one that adds up how long it takes. `fn` is what it calls, and can be
// swapped for a variant while the timing stays in place. `marksStep`: this is combat.step, and
// calls made during it count as combat's. `onlyInStep`: calls from outside combat.step (the
// base game's own) go to the original, untimed and never to a variant.
function meter(object, key, { marksStep = false, onlyInStep = false } = {}) {
  const m = {
    fn: object[key],
    sum: 0,
    calls: 0,
    reset() {
      m.sum = 0;
      m.calls = 0;
    },
  };
  const original = m.fn;
  m.restore = () => (object[key] = original);
  // (apply with `arguments` passes on however many there are, without an array per call.)
  object[key] = function () {
    if (onlyInStep && !inside.step) return original.apply(this, arguments);
    const t = performance.now();
    if (marksStep) inside.step = true;
    try {
      return m.fn.apply(this, arguments);
    } finally {
      if (marksStep) inside.step = false;
      m.sum += performance.now() - t;
      m.calls++;
    }
  };
  return m;
}

// `trimmed`: the mean of the middle 80 %. The clock steps by a tenth of a millisecond here,
// too coarse for a median of single frames; a mean sees through the steps, and trimmed, it is
// not thrown by the frames another program on the machine happened to interrupt.
function stats(values, n = values.length) {
  if (!n) return null;
  const sorted = Array.from(values.subarray ? values.subarray(0, n) : values.slice(0, n)).sort((a, b) => a - b);
  let sum = 0,
    middle = 0,
    counted = 0;
  sorted.forEach((v, i) => {
    sum += v;
    if (i >= Math.floor(n * 0.1) && i < Math.ceil(n * 0.9)) {
      middle += v;
      counted++;
    }
  });
  const at = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  const r = (v) => +v.toFixed(4);
  return { n, mean: r(sum / n), trimmed: r(middle / Math.max(1, counted)), median: r(at(0.5)), p90: r(at(0.9)), min: r(sorted[0]), max: r(sorted[n - 1]) };
}
const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
// The median of paired differences with the middle half of them, rounded.
function quartiles(list) {
  const sorted = [...list].sort((a, b) => a - b);
  const q = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(4);
  return { median: q(0.5), low: q(0.25), high: q(0.75), n: sorted.length };
}

// ---- ?xtiming: combat's cost in any scene, added to its report.

if (typeof location !== "undefined") {
  const here = new URLSearchParams(location.search);
  if (here.has("xtiming") && here.get("scene") !== "bench" && window.extreme?.combat) timeReports(window.extreme.combat);
}

function timeReports(combat) {
  const series = { step: [], frame: [] };
  for (const key of ["step", "frame"]) {
    const m = meter(combat, key);
    const fn = m.fn;
    m.fn = function () {
      const t = performance.now();
      const result = fn.apply(this, arguments);
      series[key].push(performance.now() - t);
      return result;
    };
  }
  // The scene's report is caught on its way out and the timing put into it.
  const send = window.fetch;
  window.fetch = function (url, init) {
    if (typeof url === "string" && url.startsWith("/__report/") && typeof init?.body === "string") {
      try {
        const report = JSON.parse(init.body);
        const renderer = window.salmon?.renderer;
        report.timing = { renderer: renderer?.backend?.isWebGPUBackend ? "webgpu" : "webgl2", quality: new URLSearchParams(location.search).get("quality"), step: stats(series.step), frame: stats(series.frame) };
        init = { ...init, body: JSON.stringify(report, null, 1) };
      } catch {}
    }
    return send.call(this, url, init);
  };
}

// ---- The bench.

async function bench(ctx) {
  const here = new URLSearchParams(location.search);
  const name = here.get("xname") || ctx.scene.name;
  const report = { name, set: ctx.set };
  // What the bench changed in the page, undone however it ends. (The page is thrown away
  // after the scene anyway -- the next one loads afresh -- but a bench stopped by an error
  // should not leave a half-patched game behind for whoever looks at it.)
  const undo = [];
  try {
    Object.assign(report, await measure(ctx, here, name, undo));
  } catch (error) {
    ctx.errors.push(String(error?.stack ?? error));
  } finally {
    for (const fn of undo.reverse())
      try {
        fn();
      } catch {}
  }
  report.errors = ctx.errors;
  await fetch(`/__report/${ctx.set}/${name}`, { method: "POST", body: JSON.stringify(report, null, 1) });
}

// The mix of 40 enemies (scaled for other numbers): each kind at a distance from the fish
// [near, far] where it fights, the gunners within their range so they really shoot. (The
// larvae crawl on the bed of the redd in the game; here they stand in for any crawler.)
const MIX = [
  ["troutParr", 15, 2, 5],
  ["bullhead", 9, 1.5, 3.5],
  ["trout", 5, 4, 8],
  ["dragonflyLarva", 7, 1.2, 4],
  ["beetleLarva", 4, 1.2, 4],
];
// The stress case: far more players' shots and enemy rounds than four players meet today.
const STRESS = { enemies: 40, shots: 150, hostile: 60 };
const OFF = { enemies: 0, shots: 0, hostile: 0 };

async function measure(ctx, here, name, undo) {
  const { salmon, extreme, set } = ctx;
  const { THREE, fish, renderer, scene, terrain, post, look } = salmon;
  const combat = extreme.combat;
  const habitat = extreme.game.habitat;
  const [course, { WEAPONS, damageScale }, { KINDS }, { createHostile }, { createProjectiles }, { QUALITY_PRESETS, qualityName }, { randomGenerator }] = await Promise.all([
    import("../../course.js"),
    import("../weapons.js"),
    import("../kinds.js"),
    import("../hostile.js"),
    import("../projectiles.js"),
    import("../../../shared/render-policy.js"),
    import("../../../shared/random.js"),
  ]);
  const { bed, level, locate, current } = course;
  const option = (key, fallback) => (here.has(key) ? Number(here.get(key)) : fallback);
  const repeats = option("xrepeats", 5);
  const frames = option("xframes", 120);
  const soakSeconds = option("xsoak", 30);
  const sweep = option("xsweep", 1) > 0;
  // Short blocks of frames for everything timed in turns (the card, the swapped variants).
  const blocks = option("xblocks", 32);
  // Of the players' shots, the share aimed at an enemy (the rest fly on along the river),
  // and how many times their hit points the enemies have: together they set how many hits
  // and kills there are, which the report counts.
  const aimShare = option("xaim", 0.12);
  const hpScale = option("xhp", 4);
  const quality = qualityName(here.get("quality"));
  // One step per frame, as long as a frame lasts at this quality.
  const dt = 1 / QUALITY_PRESETS[quality].fps;
  const random = randomGenerator(0xbe7c4);

  const webgpu = !!renderer.backend?.isWebGPUBackend;
  const device = webgpu ? renderer.backend.device : null;
  const gl = webgpu ? null : renderer.backend?.gl ?? null;
  const timer = gl?.getExtension("EXT_disjoint_timer_query_webgl2") ?? null;
  const pixel = new Uint8Array(4);
  // Wait until the card has done everything it was given.
  async function sync() {
    if (device) return device.queue.onSubmittedWorkDone();
    gl.finish();
    // (A pixel read back waits for the card for certain; only from the canvas itself, so no
    // state the renderer keeps is touched.)
    if (gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === null) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  }

  // ---- The place and the camera: the fish held where it is, the camera fixed behind it and
  // above, far enough back to see the fight round it, under the surface and off the bed.
  const anchor = fish.position.clone();
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const UP = new THREE.Vector3(0, 1, 0);
  const L = fish.length;
  const spot = {};
  locate(anchor.x, anchor.z, fish.river.s, spot);
  // (Not begun with `s`: a record of five fields that begins with s, as most of the river's
  // falls in course.js do, shares V8's hidden classes with them, and making one here sent
  // level() -- which goes over the falls for every shot, round and fish -- into a loop of code
  // thrown away and built again, which doubled what projectiles.update costs.)
  const place = { length: +L.toFixed(2), depth: +(level(spot.s) - bed(spot.s, spot.u)).toFixed(2), height: +(anchor.y - bed(spot.s, spot.u)).toFixed(2), s: +spot.s.toFixed(1), u: +spot.u.toFixed(2) };
  const floorHere = bed(spot.s, spot.u);
  const eye = anchor.clone().addScaledVector(heading, -(3.5 + 2 * L));
  locate(eye.x, eye.z, fish.river.s, spot);
  eye.y = Math.max(bed(spot.s, spot.u) + 0.15, Math.min(level(spot.s) - 0.12, anchor.y + 0.9 + 0.5 * L));
  const target = anchor.clone().addScaledVector(heading, 1.5 + L);
  salmon.view(eye.toArray(), target.toArray());
  look.yaw = Math.atan2(heading.z, heading.x);
  look.pitch = 0;
  // (Changed by the soak, which holds the fish low over the bed for a while.)
  let holdY = anchor.y;
  function pin() {
    fish.position.set(anchor.x, holdY, anchor.z);
    fish.velocity.set(0, 0, 0);
    fish.energy = 1;
  }
  // Nothing of the fight may end it: the fish is out of reach of harm (the hits still land
  // and show), and the director sends nobody of its own. (The director's hold is not undone:
  // it only runs out.)
  const player = combat.players[0];
  const safeUntil = player.safeUntil;
  player.safeUntil = Infinity;
  undo.push(() => (player.safeUntil = safeUntil));
  combat.director.hold(1e7);
  undo.push(() => combat.fire(false));

  // The fight of four players as the game can have it today: each with the laser, the only
  // weapon there is, firing without pause -- a bolt lives reach/speed seconds, so a player
  // keeps at most that over the interval between bolts in the water -- and the enemies
  // firing their own guns at their own pace (`natural`: no rounds added by the bench).
  const piu = WEAPONS.piu;
  const FOUR = { enemies: 40, shots: 4 * Math.ceil(piu.reach(L) / piu.speed(L) / piu.interval), hostile: 0, natural: true };

  // ---- The meters, and the enemies' hooks (to make them fire through the game's own path;
  // and, to try a proposal, to hand them a ground of the bench's own, below).
  let hooks = null;
  // (Whether enemies.update has run yet in this step: see the crawlers' ground below.)
  let enemiesRan = false;
  const enemyUpdate = combat.enemies.update;
  combat.enemies.update = function (dt, time, players, d) {
    hooks = d;
    try {
      if (groundTry.cells && d?.ground) {
        if (binned !== gathered.version) binGround();
        return enemyUpdate.call(this, dt, time, players, { ...d, ground: cellGround });
      }
      return enemyUpdate.apply(this, arguments);
    } finally {
      enemiesRan = true;
    }
  };
  undo.push(() => (combat.enemies.update = enemyUpdate));
  const meters = {
    step: meter(combat, "step", { marksStep: true }),
    frame: meter(combat, "frame"),
    enemies: meter(combat.enemies, "update"),
    projectiles: meter(combat.projectiles, "update"),
    hostile: meter(combat.hostile, "update"),
    aim: meter(combat.aim, "update"),
    director: meter(combat.director, "update"),
    pickups: meter(combat.pickups, "update"),
    // (The stones near a point and the gravel: the base game asks for them in its own step
    // as well, so only combat's calls are counted -- the shots' stones, and the crawlers'
    // ground since the larvae walk on stones and gravel.)
    colliders: meter(terrain, "collidersNear", { onlyInStep: true }),
    gravel: meter(extreme.game.pebbles, "near", { onlyInStep: true }),
    // (signals.js lays Extreme's enemies into the game's threat list, which the game asks
    // for in its own step, outside combat.step.)
    threats: meter(salmon.life.hunters, "threats"),
  };
  for (const m of Object.values(meters)) undo.push(m.restore);
  const phasedStep = meters.step.fn;
  meters.step.fn = function () {
    enemiesRan = false;
    return phasedStep.apply(this, arguments);
  };

  // ---- The crawlers' ground (ground.js), caught on its way. combat.step gathers the stones
  // and the gravel near the fish for the crawlers before enemies.update runs, and the stones
  // for the shots after it: the stones asked for before enemies.update, followed by the
  // gravel, are the ground's. Two proposals are tried on it: gathering again only once the
  // fish has moved (`kept`; the lists the ground holds stay as they were), and a crawler's
  // height looked up among the stones and gravel of its cell only (`cells`) instead of all
  // that were gathered.
  const groundTry = { kept: false, cells: false };
  const gathered = { stones: null, gravel: null, x: NaN, z: NaN, reach: -1, version: 0 };
  // (The last stones asked for before enemies.update: the ground's, once the gravel follows.)
  const asked = { out: null, x: 0, z: 0, reach: 0, same: false };
  const keptGravel = [];
  const collidersNear = meters.colliders.fn,
    pebblesNear = meters.gravel.fn;
  meters.groundStones = {
    sum: 0,
    calls: 0,
    reset() {
      this.sum = this.calls = 0;
    },
  };
  meters.colliders.fn = function (x, z, reach, out) {
    if (enemiesRan) return collidersNear.apply(this, arguments);
    const t = now();
    const same = groundTry.kept && out === gathered.stones && reach === gathered.reach && Math.abs(x - gathered.x) < 0.5 && Math.abs(z - gathered.z) < 0.5;
    asked.out = out;
    asked.x = x;
    asked.z = z;
    asked.reach = reach;
    asked.same = same;
    const result = same ? out : collidersNear.apply(this, arguments);
    meters.groundStones.sum += now() - t;
    return result;
  };
  meters.gravel.fn = function (position, reach, out) {
    if (!asked.same) {
      gathered.stones = asked.out;
      gathered.gravel = out;
      gathered.x = asked.x;
      gathered.z = asked.z;
      gathered.reach = asked.reach;
      gathered.version++;
      pebblesNear.apply(this, arguments);
      keptGravel.length = 0;
      for (const c of out) keptGravel.push(c);
    } else for (const c of keptGravel) out.push(c);
    return out;
  };
  // The ground's height() over cells of GCELL units, each stone and pebble in every cell its
  // outline reaches, sorted again whenever the ground has gathered anew. The same sums as
  // ground.js's height(), over fewer of them.
  const GCELL = 1;
  const groundCells = new Map();
  const groundFilled = [];
  let binned = -1;
  function binGround() {
    for (const list of groundFilled) list.length = 0;
    groundFilled.length = 0;
    for (const list of [gathered.stones, gathered.gravel])
      for (const c of list ?? []) {
        const reach = (c.rx ?? c.r) + (c.rz ?? c.r);
        for (let ix = Math.floor((c.x - reach) / GCELL); ix <= Math.floor((c.x + reach) / GCELL); ix++)
          for (let iz = Math.floor((c.z - reach) / GCELL); iz <= Math.floor((c.z + reach) / GCELL); iz++) {
            const key = ix * 1e6 + iz;
            let cell = groundCells.get(key);
            if (!cell) groundCells.set(key, (cell = []));
            if (!cell.length) groundFilled.push(cell);
            cell.push(c);
          }
      }
    binned = gathered.version;
  }
  const cellGround = {
    height(x, z, floor) {
      let top = floor;
      const cell = groundCells.get(Math.floor(x / GCELL) * 1e6 + Math.floor(z / GCELL));
      if (cell)
        for (const c of cell) {
          const rx = c.rx ?? c.r,
            rz = c.rz ?? c.r,
            ry = c.ry ?? c.r;
          const ox = x - c.x,
            oz = z - c.z;
          if (Math.abs(ox) > rx + rz || Math.abs(oz) > rx + rz) continue;
          const cs = c.cos ?? 1,
            sn = c.sin ?? 0;
          const ax = (ox * cs - oz * sn) / rx,
            az = (ox * sn + oz * cs) / rz;
          const inside = 1 - ax * ax - az * az;
          if (inside <= 0) continue;
          const y = c.y + ry * Math.sqrt(inside);
          if (y > top) top = y;
        }
      return top;
    },
  };

  let hits = 0,
    kills = 0;
  const enemyHit = combat.enemies.hit;
  combat.enemies.hit = function (e, damage, dir, by) {
    const sunk = enemyHit.apply(this, arguments);
    hits++;
    if (sunk) kills++;
    return sunk;
  };
  undo.push(() => (combat.enemies.hit = enemyHit));
  // Enemy rounds fired: by the bench (to hold their number) or by the enemies themselves.
  let forcing = false,
    roundsForced = 0,
    roundsNatural = 0;
  const hostileFire = combat.hostile.fire;
  combat.hostile.fire = function () {
    if (forcing) roundsForced++;
    else roundsNatural++;
    return hostileFire.apply(this, arguments);
  };
  undo.push(() => (combat.hostile.fire = hostileFire));
  const glowCloud = scene.getObjectByName("Combat glow");
  const bubbleCloud = scene.getObjectByName("Combat bubbles");
  renderer.info.autoReset = false;
  undo.push(() => (renderer.info.autoReset = true));

  // ---- The load, kept steady.
  const load = { ...OFF, natural: false, empty: false };
  // A kind's crowd draws as many as its capacity at the start (the meshes are made then).
  const crowd = {};
  for (const kind of Object.keys(KINDS)) crowd[kind] = KINDS[kind].capacity;
  undo.push(() => {
    for (const kind of Object.keys(crowd)) KINDS[kind].capacity = crowd[kind];
  });
  // Up to 40 enemies the mix fits the crowds, living and dead: none is moved and hit without
  // being drawn. The 80 of the sweep go past them: a kind then takes more than it draws.
  function setLoad(l) {
    Object.assign(load, OFF, { natural: false, empty: false }, l);
    for (const [kind, base] of MIX) KINDS[kind].capacity = Math.max(crowd[kind], Math.round((base * load.enemies) / 40));
    combat.fire(load.shots > 0);
    if (!load.enemies) combat.enemies.reset();
    if (!load.shots) combat.projectiles.reset();
    if (!load.hostile) combat.hostile.reset();
  }
  // A variant: enemy records all of one shape. Every field the combat code gives an enemy
  // only later on (its gun's state, when it was hit, its home) is given right after it is
  // spawned, in one order, with the value its absence stands for, so every record ends up
  // with the same hidden class and loops over them stay monomorphic.
  const LATER = [
    ["strikeTime", 0.4],
    ["reload", 0],
    ["shots", 0],
    ["firedAt", -1e9],
    ["hitAt", -1e9],
    ["eaten", false],
    ["home", null],
  ];
  const spawnAsItIs = combat.enemies.spawn;
  function oneShape(on) {
    combat.enemies.spawn = on
      ? function (kind, s, u, y, o) {
          const e = spawnAsItIs.call(this, kind, s, u, y, o);
          if (e) for (const [key, value] of LATER) if (!(key in e)) e[key] = value;
          return e;
        }
      : spawnAsItIs;
  }
  undo.push(() => oneShape(false));
  const toFish = new THREE.Vector3();
  function spawnNear(kind, near, far) {
    const angle = random() * Math.PI * 2;
    const r = near + (far - near) * random();
    const x = anchor.x + Math.cos(angle) * r,
      z = anchor.z + Math.sin(angle) * r;
    locate(x, z, fish.river.s, spot);
    if (level(spot.s) - bed(spot.s, spot.u) < 0.35) return null;
    toFish.set(anchor.x - x, 0, anchor.z - z).normalize();
    return combat.enemies.spawn(kind, spot.s, spot.u, null, { heading: toFish });
  }
  // The players' shots: four shooters round the fish, most shots along the river ahead,
  // some straight at an enemy. (The local player fires through the game's own path as well,
  // combat.fire; the bench makes up the rest, as the other players' shots would come in.)
  const SHOOTERS = [
    [-0.4, 0.8, 0.1],
    [-0.4, -0.8, 0.1],
    [-1, 0.5, -0.15],
    [-1, -0.5, -0.15],
  ];
  const muzzle = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const shot = { owner: 0, weapon: "piu", position: muzzle, velocity, damage: 0, radius: 0, life: 0, size: 0, tint: null, stretch: 0, s: 0 };
  let fired = 0;
  // The script time of the firing the bench does for the game (projectiles.fire, and the
  // enemies' guns through the game's own enemyShoots): outside combat.step here, inside it or
  // on its way in from the network in the game, so it is counted as combat's.
  let forcedTime = 0;
  function fireShot() {
    const k = fired++ % 4;
    const [ahead, aside, up] = SHOOTERS[k];
    muzzle.copy(anchor).addScaledVector(heading, ahead * L).addScaledVector(left, aside * L);
    muzzle.y = holdY + up * L;
    const list = combat.enemies.list;
    const e = random() < aimShare && list.length ? list[Math.floor(random() * list.length)] : null;
    if (e && !e.dead) velocity.subVectors(e.position, muzzle).normalize();
    else {
      velocity.copy(heading).applyAxisAngle(UP, (random() - 0.5) * 0.7);
      velocity.y += (random() - 0.5) * 0.1;
    }
    velocity.x += (random() - 0.5) * 0.04;
    velocity.y += (random() - 0.5) * 0.04;
    velocity.z += (random() - 0.5) * 0.04;
    const speed = piu.speed(L);
    velocity.normalize().multiplyScalar(speed);
    shot.owner = k;
    shot.damage = piu.damage * damageScale(L);
    shot.radius = piu.radius(L);
    shot.life = piu.reach(L) / speed;
    shot.size = piu.size(L);
    shot.tint = piu.tint;
    shot.stretch = piu.stretch;
    shot.s = fish.river.s;
    const t = now();
    combat.projectiles.fire(shot);
    forcedTime += now() - t;
  }
  const snout = new THREE.Vector3();
  const aimAt = new THREE.Vector3();
  const alive = {};
  let shotsCapped = false;
  // Before each step: the fish held, the dead cleared away soon after their kill was seen
  // (so a kind's crowd has room to be made up again), stragglers taken out, and every part
  // of the fight made up to its number.
  function keep() {
    pin();
    const list = combat.enemies.list;
    for (const [kind] of MIX) alive[kind] = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dead) {
        if (e.corpse > 0.5) e.eaten = true;
      } else if (e.position.distanceToSquared(anchor) > 14 * 14) list.splice(i, 1);
      else if (e.kind in alive) alive[e.kind]++;
    }
    combat.enemies.hpScale = hpScale;
    for (const [kind, base, near, far] of MIX) {
      const n = Math.round((base * load.enemies) / 40);
      for (let tries = 0; alive[kind] < n && tries < 12; tries++) if (spawnNear(kind, near, far)) alive[kind]++;
      // (Fewer asked for than there are: the surplus is taken out.)
      for (let i = list.length - 1; i >= 0 && alive[kind] > n; i--)
        if (list[i].kind === kind && !list[i].dead) {
          list.splice(i, 1);
          alive[kind]--;
        }
    }
    const shots = combat.projectiles.live;
    for (let i = 0; shots.length < load.shots && i < 400; i++) {
      const before = shots.length;
      fireShot();
      // (The pool is full: this quality holds fewer shots than asked for.)
      if (shots.length === before) {
        shotsCapped = true;
        break;
      }
    }
    if (hooks && load.hostile && !load.natural) {
      let flying = 0;
      for (const p of combat.hostile.live) if (!p.spent) flying++;
      forcing = true;
      for (let tries = 0; flying < load.hostile && tries < 60; tries++) {
        const e = list[Math.floor(random() * list.length)];
        const gun = e?.spec.weapon;
        if (!e || e.dead || gun?.kind !== "ranged") continue;
        combat.enemies.snout(e, snout);
        aimAt.subVectors(fish.position, snout).normalize();
        const t = now();
        hooks.shoot(e, aimAt, gun);
        forcedTime += now() - t;
        flying += gun.pellets;
      }
      forcing = false;
    }
  }

  // ---- Frames.
  let keepTime = 0;
  function frame(drawDt = dt) {
    const k = now();
    keep();
    keepTime += now() - k;
    salmon.step(dt);
    extreme.frame(dt);
    salmon.draw(drawDt);
  }
  async function settle(seconds) {
    for (let i = 0; i * dt < seconds; i++) {
      frame();
      if (i % 20 === 19) await nextTask();
    }
    await sync();
  }
  // Steps without pictures: the sparks and bubbles of a fight die away.
  async function drain(seconds) {
    for (let i = 0; i * dt < seconds; i++) {
      keep();
      salmon.step(dt);
      if (i % 60 === 59) await nextTask();
    }
    extreme.frame(dt);
  }

  const COUNTS = ["enemies", "corpses", "undrawn", "shots", "flying", "spent", "rested", "glow", "bubbles"];
  const SERIES = ["world", "frame", "layout", "draw", "total", "combatStep", "combatFrame", "combat", "forced", "calls", "triangles", "glTimer", ...COUNTS];
  const series = {};
  for (const key of SERIES) series[key] = new Float64Array(Math.max(frames, 1));
  const queries = [];
  const kinds = {};
  const PARTS = ["step", "frame", "enemies", "projectiles", "hostile", "aim", "director", "pickups", "colliders", "gravel", "groundStones", "threats"];
  // Frames timed one by one, each begun with the card idle, so the script's time is not
  // held up by the card: the world's step, combat's frame, the draw.
  async function timedFrames(n) {
    for (const m of Object.values(meters)) m.reset();
    hits = kills = roundsForced = roundsNatural = 0;
    forcedTime = 0;
    const firedBefore = fired;
    queries.length = 0;
    // (Reading the flag clears it: it then tells whether anything upset the card's clock
    // during these frames.)
    if (timer) gl.getParameter(timer.GPU_DISJOINT_EXT);
    for (let i = 0; i < n; i++) {
      const f0 = forcedTime;
      keep();
      series.forced[i] = forcedTime - f0;
      await sync();
      const s0 = meters.step.sum,
        fr0 = meters.frame.sum;
      const t0 = now();
      salmon.step(dt);
      const t1 = now();
      extreme.frame(dt);
      const t2 = now();
      // The page's style and layout brought up to date now rather than whenever the browser
      // gets to it, so what the HUD's changes cost is counted with the frame.
      void habitat.offsetWidth;
      const t2l = now();
      renderer.info.reset();
      let query = null;
      if (timer) {
        query = gl.createQuery();
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      }
      salmon.draw(dt);
      if (query) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        queries.push(query);
      }
      const t3 = now();
      series.world[i] = t1 - t0;
      series.frame[i] = t2 - t1;
      series.layout[i] = t2l - t2;
      series.draw[i] = t3 - t2l;
      series.total[i] = t3 - t0;
      series.combatStep[i] = meters.step.sum - s0;
      series.combatFrame[i] = meters.frame.sum - fr0;
      series.combat[i] = series.combatStep[i] + series.combatFrame[i];
      series.calls[i] = renderer.info.render.drawCalls ?? renderer.info.render.calls;
      series.triangles[i] = renderer.info.render.triangles;
      let flying = 0,
        spent = 0,
        rested = 0,
        live = 0,
        dead = 0,
        undrawn = 0;
      for (const p of combat.hostile.live) p.rested ? rested++ : p.spent ? spent++ : flying++;
      for (const kind in kinds) kinds[kind] = 0;
      for (const e of combat.enemies.list) {
        e.dead ? dead++ : live++;
        // (Past its crowd's capacity an enemy is not drawn.)
        if ((kinds[e.kind] = (kinds[e.kind] ?? 0) + 1) > crowd[e.kind]) undrawn++;
      }
      series.enemies[i] = live;
      series.corpses[i] = dead;
      series.undrawn[i] = undrawn;
      series.shots[i] = combat.projectiles.live.length;
      series.flying[i] = flying;
      series.spent[i] = spent;
      series.rested[i] = rested;
      series.glow[i] = glowCloud?.count ?? 0;
      series.bubbles[i] = bubbleCloud?.count ?? 0;
    }
    // The card's own clock for each of these frames: the results come back only once the
    // page has returned to the browser.
    let glCount = 0,
      disjoint = false;
    if (queries.length) {
      for (let tries = 0; tries < 500 && !gl.getQueryParameter(queries.at(-1), gl.QUERY_RESULT_AVAILABLE); tries++) await nextTask();
      disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
      for (const q of queries) {
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) series.glTimer[glCount++] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
      }
    }
    const out = {};
    for (const key of ["world", "frame", "layout", "draw", "total", "combatStep", "combatFrame", "combat", "forced"]) out[key] = stats(series[key], n);
    out.calls = median(series.calls.subarray(0, n));
    out.triangles = median(series.triangles.subarray(0, n));
    if (glCount && !disjoint) out.glTimer = stats(series.glTimer, glCount);
    if (disjoint) out.glDisjoint = true;
    // (Plain means, all of them, so the rest of combat.step -- step minus its parts -- is a
    // difference of like with like.)
    out.parts = {};
    for (const key of PARTS) out.parts[key] = +(meters[key].sum / n).toFixed(4);
    out.parts.forced = +(forcedTime / n).toFixed(4);
    out.counts = {};
    for (const key of COUNTS) {
      const s = stats(series[key], n);
      out.counts[key] = { mean: +s.mean.toFixed(1), min: s.min, max: s.max };
    }
    // (firedPerSecond: the players' shots the bench fired to keep their number up; rounds:
    // the enemy rounds fired, by the bench and by the enemies themselves.)
    const perSecond = (v) => +(v / (n * dt)).toFixed(1);
    out.events = { hitsPerSecond: perSecond(hits), killsPerSecond: perSecond(kills), firedPerSecond: perSecond(fired - firedBefore), roundsForcedPerSecond: perSecond(roundsForced), roundsNaturalPerSecond: perSecond(roundsNatural) };
    return out;
  }
  // A few frames as timedFrames runs them, for measuring in turns: combat.step and its
  // parts, and the page's style and layout. combat.step and the layout go without the slowest
  // frame of the few: a collection, or another program getting the processor, lands in one
  // frame and would outweigh what is measured.
  const lean = (list) => (list.reduce((a, b) => a + b, 0) - Math.max(...list)) / (list.length - 1);
  async function segment(n) {
    const before = {};
    for (const key of PARTS) before[key] = meters[key].sum;
    const steps = [],
      layouts = [];
    for (let i = 0; i < n; i++) {
      keep();
      await sync();
      const s0 = meters.step.sum;
      salmon.step(dt);
      extreme.frame(dt);
      const t = now();
      void habitat.offsetWidth;
      layouts.push(now() - t);
      steps.push(meters.step.sum - s0);
      salmon.draw(dt);
    }
    const out = { step: lean(steps), layout: lean(layouts) };
    for (const key of PARTS) if (key !== "step") out[key] = (meters[key].sum - before[key]) / n;
    return out;
  }
  // Something switched on and off in short blocks of frames -- off, on, on, off, then the
  // other way round -- so whatever else the machine is doing meanwhile weighs on both alike:
  // the median of the paired differences (on minus off) of `metric`, with the middle half,
  // and what combat.step, its parts and the layout took on and off (means, to see where a
  // change lands).
  async function inTurns(set, metric, n = 6) {
    const diffs = [];
    const sums = { on: {}, off: {} };
    for (let k = 0; k < blocks; k++) {
      let a = 0,
        b = 0;
      for (const on of k % 2 ? [true, false, false, true] : [false, true, true, false]) {
        set(on);
        const x = await segment(n);
        const v = metric(x);
        if (on) b += v / 2;
        else a += v / 2;
        const into = sums[on ? "on" : "off"];
        for (const key in x) into[key] = (into[key] ?? 0) + x[key] / (2 * blocks);
      }
      diffs.push(b - a);
      await nextTask();
    }
    set(false);
    const round = (o) => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, +v.toFixed(4)]));
    return { ...quartiles(diffs), on: round(sums.on), off: round(sums.off) };
  }
  // Frames drawn back to back and then waited for (the scene as it stands, drawn again):
  // what a frame costs the card, as long as the card and not the script is what holds it
  // up. `submit` is the script's share; near `gpu`, the script was the bottleneck instead.
  async function backToBack(n = 40, runs = 3) {
    const walls = [],
      submits = [];
    for (let k = 0; k < runs; k++) {
      await sync();
      const t0 = now();
      for (let i = 0; i < n; i++) salmon.draw(0);
      const t1 = now();
      await sync();
      walls.push((now() - t0) / n);
      submits.push((t1 - t0) / n);
      await nextTask();
    }
    return { gpu: +median(walls).toFixed(3), submit: +median(submits).toFixed(3), runs: walls.map((v) => +v.toFixed(3)) };
  }
  // Whole frames back to back -- the step, combat's frame, the draw -- as the game runs them:
  // what one really costs, script and card together.
  async function fullFrames(n = 40, runs = 3) {
    const walls = [];
    for (let k = 0; k < runs; k++) {
      await sync();
      keepTime = 0;
      const t0 = now();
      for (let i = 0; i < n; i++) frame();
      await sync();
      walls.push((now() - t0 - keepTime) / n);
      await nextTask();
    }
    return +median(walls).toFixed(3);
  }
  // Combat's meshes, by part: each kind's crowd (body, fins, far fish), the glow, the bubbles.
  const parts = new Map();
  scene.traverse((o) => {
    if (!o.name?.startsWith("Combat")) return;
    const key = o.name.replace(/ fins$/, "");
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(o);
  });
  const everything = [...parts.values()].flat();
  // The draw calls and triangles of `objects`, shown against hidden: the scene's own count
  // changes from frame to frame (some passes run only every few frames), so the difference
  // of two single frames, or of a fight and a calm, would not be theirs alone. The fewest of
  // several frames each way are the frames without those passes; combat's meshes are drawn
  // in the main view alone, the same in every frame.
  function counted(objects) {
    const shown = objects.map((o) => o.visible);
    const count = (on) => {
      objects.forEach((o, i) => (o.visible = on && shown[i]));
      const calls = [],
        triangles = [];
      for (let i = 0; i < 8; i++) {
        renderer.info.reset();
        salmon.draw(0);
        calls.push(renderer.info.render.drawCalls ?? renderer.info.render.calls);
        triangles.push(renderer.info.render.triangles);
      }
      return [Math.min(...calls), Math.min(...triangles)];
    };
    const [callsShown, trianglesShown] = count(true);
    const [callsHidden, trianglesHidden] = count(false);
    objects.forEach((o, i) => (o.visible = shown[i]));
    return { calls: callsShown - callsHidden, triangles: trianglesShown - trianglesHidden };
  }
  // What drawing `objects` costs the card: the scene as it stands drawn back to back with
  // them shown and hidden in turn, in short batches (shown, hidden, hidden, shown, then the
  // other way round), so whatever else the card is doing meanwhile -- other pages, other
  // programs -- weighs on both alike; the paired differences, for the report to pool over
  // the repeats. With no objects at all it is an A/A test: what the method finds in noise.
  async function pairedCost(objects, batches = blocks, n = 4) {
    const shown = objects.map((o) => o.visible);
    const show = (on) => objects.forEach((o, i) => (o.visible = on && shown[i]));
    let submit = 0;
    const time = async (on) => {
      show(on);
      await sync();
      const t0 = now();
      for (let i = 0; i < n; i++) salmon.draw(0);
      submit = (now() - t0) / n;
      await sync();
      return (now() - t0) / n;
    };
    const diffs = [],
      scripts = [],
      on = [],
      off = [];
    for (let k = 0; k < batches; k++) {
      let a = 0,
        b = 0,
        c = 0;
      for (const visible of k % 2 ? [false, true, true, false] : [true, false, false, true]) {
        const t = await time(visible);
        if (visible) a += t / 2;
        else b += t / 2;
        c += (visible ? submit : -submit) / 2;
      }
      on.push(a);
      off.push(b);
      diffs.push(+(a - b).toFixed(4));
      scripts.push(c);
      await nextTask();
    }
    show(true);
    await sync();
    const q = quartiles(diffs);
    // (script: what handing the meshes to the card costs the processor, a share of the draw.)
    return { cost: q.median, low: q.low, high: q.high, diffs, shown: +median(on).toFixed(3), hidden: +median(off).toFixed(3), script: +median(scripts).toFixed(3), ...(objects.length ? counted(objects) : {}) };
  }

  // No fight at all for the reference: combat's step and frame are not run (once its sparks
  // and bubbles have died away and its crowds emptied with it running). `empty` keeps it
  // running with nothing to do, for what that alone costs.
  const stepFn = meters.step.fn,
    frameFn = meters.frame.fn;
  const idle = () => {};
  function combatOn(on) {
    meters.step.fn = on ? stepFn : idle;
    meters.frame.fn = on ? frameFn : idle;
  }
  undo.push(() => combatOn(true));
  async function condition(l, { settleFor = 2, n = frames, card = true, backToBackToo = true } = {}) {
    combatOn(true);
    setLoad(l);
    if (!l.enemies && !l.shots && !l.hostile) {
      await drain(5);
      combatOn(!!l.empty);
    }
    await settle(settleFor);
    const result = await timedFrames(n);
    if (backToBackToo) {
      result.b2b = await backToBack();
      result.full = await fullFrames();
    }
    if (card && (l.enemies || l.shots || l.hostile)) result.meshes = await pairedCost(everything);
    return result;
  }

  const config = {
    renderer: webgpu ? "webgpu" : "webgl2",
    quality,
    light: !extreme.game.settings?.detail || !!extreme.game.touchMode,
    dt: +dt.toFixed(4),
    repeats,
    frames,
    blocks,
    gpu: gpuName(renderer),
    canvas: [renderer.domElement.width, renderer.domElement.height],
    post: [post.main.width, post.main.height],
    timerResolution: timerResolution(),
    glTimer: !!timer,
    three: THREE.REVISION,
    agent: navigator.userAgent,
  };

  // Warm-up: every pipeline of the fight built, the caches filled.
  setLoad(STRESS);
  await settle(3);
  await backToBack(20, 1);

  // ?xhold: the bench stops here and hands its parts to the console (window.bench), to try
  // things out by hand; it reports nothing.
  if (here.has("xhold")) {
    window.bench = { setLoad, settle, drain, keep, frame, timedFrames, segment, inTurns, backToBack, fullFrames, pairedCost, counted, condition, combatOn, oneShape, meters, load, sync, parts, everything, STRESS, FOUR, OFF, groundTry, gathered, cellGround, binGround, hooks: () => hooks, projectileUpdate: (options) => projectileUpdate(THREE, combat.projectiles.live, course, options) };
    await new Promise(() => {});
  }

  // Each repeat: no fight, the stress case (with an A/A test of the card's method: the same
  // turns with nothing shown or hidden), and the fight of four players. The four players'
  // enemy rounds start afresh, the bench's rounds of the stress case cleared away.
  const runs = [];
  for (let r = 0; r < repeats; r++) {
    const ref = await condition(OFF, { settleFor: 1 });
    const stress = await condition(STRESS);
    stress.aa = await pairedCost([]);
    combat.hostile.reset();
    const four = await condition(FOUR, { settleFor: 4, card: false, backToBackToo: false });
    runs.push({ ref, stress, four });
  }

  // Where the script's allocations go: tools/fv-bench.mjs, listening to the console, runs
  // Chrome's sampling heap profiler over these frames (it also sees what the collector has
  // already taken, which reading the heap's size between calls cannot). Without it -- run by
  // fv-test -- nothing is sampled.
  let heapFrames = null;
  {
    setLoad(STRESS);
    await settle(0.5);
    window.benchHeap = "asked";
    console.debug("bench:heap-start");
    for (let i = 0; i < 40 && window.benchHeap !== "on"; i++) await sleep(100);
    if (window.benchHeap === "on") {
      const n = Math.max(60, frames);
      for (let i = 0; i < n; i++) {
        frame();
        if (i % 20 === 19) await nextTask();
      }
      console.debug(`bench:heap-stop ${n}`);
      for (let i = 0; i < 150 && window.benchHeap !== "off"; i++) await sleep(100);
      heapFrames = n;
    }
    delete window.benchHeap;
  }

  // Combat's draw calls and triangles, by part: the fight as it stands (what one part costs
  // the card alone is below the noise of timing it).
  setLoad(STRESS);
  await settle(1.5);
  const groups = {};
  for (const [key, objects] of parts) if (objects.some((o) => o.visible)) groups[key] = counted(objects);

  // The river lookups, timed on their own on the fight as it stands.
  const lookups = micro();
  function micro() {
    const where = { s: 0, u: 0 };
    const flow = {};
    let sink = 0;
    const time = extreme.game.now.time;
    const perCall = (fn, calls, passes = 30) => {
      const t0 = now();
      for (let pass = 0; pass < passes; pass++) fn();
      return +(((now() - t0) / (calls * passes)) * 1000).toFixed(3);
    };
    const shots = combat.projectiles.live;
    const enemies = combat.enemies.list;
    const hostile = combat.hostile.live;
    const out = { shots: shots.length, enemies: enemies.length, hostile: hostile.length };
    // µs per shot: one step's locate + bed + level, as projectiles.js and hostile.js make.
    out.shotLookup = perCall(() => {
      for (const p of shots) {
        locate(p.position.x, p.position.z, p.river.s, where);
        sink += bed(where.s, where.u) + level(where.s);
      }
    }, shots.length);
    out.locate = perCall(() => {
      for (const p of shots) sink += locate(p.position.x, p.position.z, p.river.s, where).s;
    }, shots.length);
    out.bed = perCall(() => {
      for (const p of shots) sink += bed(p.river.s, p.river.u);
    }, shots.length);
    out.level = perCall(() => {
      for (const p of shots) sink += level(p.river.s);
    }, shots.length);
    // µs per enemy: one step's current + locate + bed + level, as enemies.js makes.
    out.enemyLookup = perCall(() => {
      for (const e of enemies) {
        current(e.river.s, e.river.u, e.position.y, flow, time, true);
        locate(e.position.x, e.position.z, e.river.s, where);
        sink += bed(where.s, where.u) + level(where.s) + flow.vx;
      }
    }, enemies.length);
    out.current = perCall(() => {
      for (const e of enemies) sink += current(e.river.s, e.river.u, e.position.y, flow, time, true).vx;
    }, enemies.length);
    // ms per call: the stones near the fish, as combat.step asks for them every step.
    const stones = [];
    out.collidersNear = +(perCall(() => terrain.collidersNear(fish.position.x, fish.position.z, piu.reach(L) + 4, stones), 1, 50) / 1000).toFixed(4);
    out.stones = stones.length;
    out.sink = Number.isFinite(sink);
    return out;
  }

  // What one enemy round and one players' shot cost a step, on lists of their own (the
  // game's are left alone), many at a time for a clock this coarse: a round flying at the
  // fish, spent and sinking, lying on the bed; a shot flying along the river, with and
  // without the bed and surface lookup. The rounds get to be spent, and to lie on the bed,
  // through hostile.js's own path (a drag this strong takes a round below a quarter of its
  // speed in its first step, where it works out where it will come down), so the lists time
  // the code the game runs.
  const rounds = labCosts();
  function labCosts() {
    const N = 600,
      passes = 8;
    const out = { n: N, states: {} };
    const position = new THREE.Vector3();
    const toward = new THREE.Vector3();
    const TAU = Math.PI * 2;
    const lab = createHostile({ capacity: N });
    for (const state of ["flying", "spent", "rested"]) {
      let total = 0;
      for (let pass = 0; pass < passes; pass++) {
        lab.reset();
        for (let i = 0; i < N; i++) {
          const a = random() * TAU,
            r = 1 + 8 * random();
          position.set(anchor.x + Math.cos(a) * r, anchor.y + (random() - 0.5) * 0.4, anchor.z + Math.sin(a) * r);
          let drag = 1.4;
          if (state === "flying") toward.subVectors(anchor, position).normalize().multiplyScalar(14);
          else {
            drag = 120;
            toward.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(14);
          }
          if (state === "rested") {
            // (At the bed and on its way down: it lies there after the first step, at any
            // length of step.)
            locate(position.x, position.z, fish.river.s, spot);
            position.y = bed(spot.s, spot.u) - 0.005;
            toward.set(0, -14, 0);
          }
          lab.fire({ source: null, weapon: "smg", position: position.clone(), velocity: toward.clone(), damage: 0, drag, radius: 0.04, life: 12, size: 0.07, tint: [1, 1, 1], stretch: 1, s: fish.river.s });
        }
        // (One step first, untimed: the rounds become spent or come down, and a new round's
        // first lookup starts from the fish's place.)
        lab.update(dt, combat.players, {});
        if (!pass) {
          const s = (out.states[state] = { flying: 0, spent: 0, rested: 0 });
          for (const p of lab.live) s[p.rested ? "rested" : p.spent ? "spent" : "flying"]++;
        }
        const t0 = now();
        for (let k = 0; k < 3; k++) lab.update(dt, combat.players, {});
        total += (now() - t0) / 3;
      }
      out[state] = +((total / (passes * N)) * 1000).toFixed(3);
    }
    const shots = createProjectiles({ capacity: N });
    const stones = [];
    terrain.collidersNear(fish.position.x, fish.position.z, piu.reach(L) + 4, stones);
    for (const [key, update] of [
      ["shot", shots.update],
      ["shotNoLookup", projectileUpdate(THREE, shots.live, course, { lookup: false })],
    ]) {
      let total = 0;
      for (let pass = 0; pass < passes; pass++) {
        shots.reset();
        for (let i = 0; i < N; i++) {
          muzzle.copy(anchor).addScaledVector(left, (random() - 0.5) * 2);
          velocity.copy(heading).applyAxisAngle(UP, (random() - 0.5) * 0.7).multiplyScalar(40);
          shots.fire({ owner: 1, weapon: "piu", position: muzzle, velocity, damage: 0, radius: 0.07, life: 5, size: 0.1, s: fish.river.s });
        }
        update(dt, { enemies: combat.enemies.list, stones });
        const t0 = now();
        for (let k = 0; k < 3; k++) update(dt, { enemies: combat.enemies.list, stones });
        total += (now() - t0) / 3;
      }
      out[key] = +((total / (passes * N)) * 1000).toFixed(3);
    }
    out.stones = stones.length;
    return out;
  }

  // The proposals, each timed in turns against what it changes. For the players' shots,
  // projectiles.js's update swapped for a copy of it: as it is (the copy against the original,
  // to check the copy), each shot looking up the bed and surface every other step, the stones
  // sorted into cells only when they change, the enemies sorted into cells each step (a shot
  // then tests only those its step can reach), the enemies' middles and sizes in flat arrays
  // for the first test of every pair, and three of them together -- each against the copy, on
  // the stress case. For the crawlers' ground, gathering it again only once the fish has
  // moved, the heights looked up in cells, and both; and then everything together -- on the
  // fight of four players.
  const swaps = {};
  const original = meters.projectiles.fn;
  const live = combat.projectiles.live;
  const copy = projectileUpdate(THREE, live, course);
  const byStep = (x) => x.step;
  const swapShots = (fn, against = copy) => (on) => (meters.projectiles.fn = on ? fn : against);
  const together = projectileUpdate(THREE, live, course, { every: 2, cells: "kept", enemyArrays: true });
  setLoad(STRESS);
  await settle(1);
  swaps.copy = await inTurns(swapShots(copy, original), byStep);
  swaps.lookupHalf = await inTurns(swapShots(projectileUpdate(THREE, live, course, { every: 2 })), byStep);
  swaps.stoneCells = await inTurns(swapShots(projectileUpdate(THREE, live, course, { cells: "kept" })), byStep);
  swaps.enemyCells = await inTurns(swapShots(projectileUpdate(THREE, live, course, { enemyCells: true })), byStep);
  swaps.enemyArrays = await inTurns(swapShots(projectileUpdate(THREE, live, course, { enemyArrays: true })), byStep);
  swaps.together = await inTurns(swapShots(together), byStep);
  combat.hostile.reset();
  setLoad(FOUR);
  await settle(4);
  swaps.togetherFour = await inTurns(swapShots(together), byStep);
  meters.projectiles.fn = copy;
  swaps.groundKept = await inTurns((on) => (groundTry.kept = on), byStep);
  swaps.groundCells = await inTurns((on) => (groundTry.cells = on), byStep);
  swaps.groundBoth = await inTurns((on) => (groundTry.kept = groundTry.cells = on), byStep);
  swaps.allFour = await inTurns((on) => {
    groundTry.kept = groundTry.cells = on;
    meters.projectiles.fn = on ? together : copy;
  }, byStep);
  meters.projectiles.fn = original;

  // What the page's style and layout cost with the fight on: parts of the HUD taken off the
  // page (display: none) in turns against as it is -- the health bars, all of combat's HUD,
  // and the game's threat arrows, which show combat's enemies too.
  const hud = {};
  setLoad(STRESS);
  await settle(0.5);
  for (const [key, selector] of [
    ["noBars", "#foes"],
    ["noCombatHud", "#xh, #callout, #arsenal, #foes, #bossbar"],
    ["noArrows", "#threats"],
  ]) {
    const hidden = [...document.querySelectorAll(selector)];
    hud[key] = await inTurns(
      (on) => {
        for (const e of hidden) e.style.display = on ? "none" : "";
      },
      (s) => s.layout,
    );
  }

  // Enemy records as they are against all of one shape, each after a fresh set of enemies,
  // twice in turn.
  const shapes = { asItIs: [], oneShape: [] };
  for (let k = 0; k < 2; k++)
    for (const on of [false, true]) {
      oneShape(on);
      combat.enemies.reset();
      setLoad(STRESS);
      await settle(2);
      const t = await timedFrames(frames);
      shapes[on ? "oneShape" : "asItIs"].push({ combatStep: t.combatStep.trimmed, enemies: t.parts.enemies, projectiles: t.parts.projectiles });
    }
  oneShape(false);

  // The fight scaled: more and fewer enemies, players' shots and enemies' shots (one
  // measurement each: for the shape of the growth, not for the last tenth of a millisecond).
  const scaled = [];
  if (sweep)
    for (const l of [
      { enemies: 10, shots: 150, hostile: 60 },
      { enemies: 20, shots: 150, hostile: 60 },
      { enemies: 40, shots: 150, hostile: 60 },
      { enemies: 80, shots: 150, hostile: 60 },
      { enemies: 40, shots: FOUR.shots, hostile: 60 },
      { enemies: 40, shots: 50, hostile: 60 },
      { enemies: 40, shots: 300, hostile: 60 },
      { enemies: 40, shots: 150, hostile: 0 },
      { enemies: 40, shots: 150, hostile: 120 },
      { enemies: 40, shots: 0, hostile: 0 },
      { enemies: 0, shots: 0, hostile: 0, empty: true },
    ]) {
      shotsCapped = false;
      const t = await condition(l, { settleFor: 1.5, card: false, backToBackToo: false });
      scaled.push({ load: l, capped: shotsCapped, combatStep: t.combatStep.trimmed, combatFrame: t.combatFrame.trimmed, layout: t.layout.trimmed, total: t.total.trimmed, draw: t.draw.trimmed, parts: t.parts, counts: t.counts, events: t.events, ...(l.enemies || l.shots ? counted(everything) : {}) });
    }
  combatOn(true);

  // The enemies' rounds over a longer fight of four players, at the pace the enemies fire
  // them themselves, with the fish held low over the bed so the spent rounds come down near
  // it: they sink, lie on the bed and are taken away again (after 8 s there, or at 12 s old),
  // and the list stays bounded. (At the bench's own height, in water this deep, a spent round
  // would not reach the bed before its 12 s are up.)
  const soak = [];
  if (soakSeconds > 0) {
    holdY = floorHere + Math.min(1.2, anchor.y - floorHere);
    combat.hostile.reset();
    setLoad(FOUR);
    await settle(1);
    let second = 0,
      stepped = 0,
      firedNatural = roundsNatural;
    meters.hostile.reset();
    meters.step.reset();
    for (let i = 0; i * dt < soakSeconds; i++) {
      frame();
      stepped++;
      if (i % 20 === 19) await nextTask();
      if ((i + 1) * dt >= second + 1) {
        second++;
        let flying = 0,
          spent = 0,
          rested = 0,
          oldest = 0,
          longest = 0;
        for (const p of combat.hostile.live) {
          if (p.rested) {
            rested++;
            longest = Math.max(longest, p.spentAge - (p.restAt ?? 0));
          } else if (p.spent) spent++;
          else flying++;
          if (p.spent) oldest = Math.max(oldest, p.age);
        }
        let corpses = 0;
        for (const e of combat.enemies.list) if (e.dead) corpses++;
        soak.push({ t: second, flying, spent, rested, oldest: +oldest.toFixed(2), longestRest: +longest.toFixed(2), fired: roundsNatural - firedNatural, hostile: +(meters.hostile.sum / stepped).toFixed(4), combatStep: +(meters.step.sum / stepped).toFixed(4), enemies: combat.enemies.list.length, corpses, shots: combat.projectiles.live.length, heapMB: +((performance.memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(1) });
        firedNatural = roundsNatural;
        meters.hostile.reset();
        meters.step.reset();
        stepped = 0;
      }
    }
    holdY = anchor.y;
  }

  // Pictures: the fight, and the same place without it.
  setLoad(STRESS);
  await settle(1.5);
  await salmon.capture(`${set}/${name}-kampf`, 1280, 720);
  setLoad(OFF);
  await drain(5);
  await settle(0.5);
  await salmon.capture(`${set}/${name}-ohne`, 1280, 720);

  return { config, place, load: { stress: STRESS, four: FOUR, boltLife: +(piu.reach(L) / piu.speed(L)).toFixed(3), boltInterval: piu.interval, aimShare, hpScale, capped: shotsCapped }, crowds: crowd, runs, groups, lookups, rounds, swaps, hud, shapes, heapFrames, scaled, soak };
}

// projectiles.js's update, copied so variants of it can be timed against it: without the
// lookup of the bed and the surface under each shot (a shot then flies on until it hits an
// enemy or a stone or its time is up), with that lookup every `every` steps, with the stones
// sorted into cells, with the enemies sorted into cells, and with the enemies' middles and
// sizes in flat arrays.
function projectileUpdate(THREE, live, { bed, level, locate }, { lookup = true, cells = false, every = 1, enemyCells = false, enemyArrays = false } = {}) {
  const tail = new THREE.Vector3();
  const head = new THREE.Vector3();
  const from = new THREE.Vector3();
  // The stones in cells of CELL units, each stone in every cell its outline reaches, sorted
  // afresh each step: a shot then tests only the stones of the cell its end is in.
  const CELL = 2;
  const grid = new Map();
  const filled = [];
  const cellOf = (x, z) => Math.floor(x / CELL) * 1e6 + Math.floor(z / CELL);
  function sort(stones) {
    for (const list of filled) list.length = 0;
    filled.length = 0;
    for (const c of stones) {
      const reach = (c.rx ?? c.r) + (c.rz ?? c.r);
      for (let ix = Math.floor((c.x - reach) / CELL); ix <= Math.floor((c.x + reach) / CELL); ix++)
        for (let iz = Math.floor((c.z - reach) / CELL); iz <= Math.floor((c.z + reach) / CELL); iz++) {
          const key = ix * 1e6 + iz;
          let list = grid.get(key);
          if (!list) grid.set(key, (list = []));
          if (!list.length) filled.push(list);
          list.push(c);
        }
    }
  }
  const none = [];
  // (cells "kept": sorted again only when the list of stones is another than last time.)
  let sortedLength = -1,
    sortedFirst = null;
  // The living enemies in cells of ECELL units by their middle, over the ground they cover,
  // sorted afresh each step. The test below passes over an enemy whose middle is farther
  // from where the shot starts its step than 1.6 of its size, the shot's radius and the step
  // (in x or in z); with the biggest enemy's size, the cells within that distance hold every
  // enemy the test would look at, each enemy in one cell only.
  const ECELL = 2;
  const bins = [];
  let ex0 = 0,
    ez0 = 0,
    enx = 0,
    enz = 0,
    ereach = 0;
  function binEnemies(enemies) {
    for (let i = 0; i < enx * enz; i++) bins[i].length = 0;
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity,
      big = 0;
    for (const e of enemies) {
      if (e.dead) continue;
      const p = e.position;
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.z < z0) z0 = p.z;
      if (p.z > z1) z1 = p.z;
      if (e.size > big) big = e.size;
    }
    if (x0 > x1) {
      enx = enz = 0;
      return;
    }
    ex0 = x0;
    ez0 = z0;
    enx = Math.floor((x1 - x0) / ECELL) + 1;
    enz = Math.floor((z1 - z0) / ECELL) + 1;
    while (bins.length < enx * enz) bins.push([]);
    for (const e of enemies) if (!e.dead) bins[Math.floor((e.position.x - ex0) / ECELL) * enz + Math.floor((e.position.z - ez0) / ECELL)].push(e);
    ereach = 1.6 * big;
  }
  // The living enemies' middles and sizes in flat arrays, filled once a step: the first test
  // of every shot against every enemy -- whether its step passes near at all -- then reads
  // numbers in a row instead of enemy records, which come in many shapes (fields are added to
  // them as they fight), so that reading them in the loop over every pair is slow. Only the
  // enemies that pass it are looked at as records.
  let ax = new Float64Array(64),
    az = new Float64Array(64),
    asize = new Float64Array(64),
    packed = 0;
  const refs = [];
  function packEnemies(enemies) {
    if (enemies.length > ax.length) {
      ax = new Float64Array(2 * enemies.length);
      az = new Float64Array(2 * enemies.length);
      asize = new Float64Array(2 * enemies.length);
    }
    packed = 0;
    for (const e of enemies) {
      if (e.dead) continue;
      ax[packed] = e.position.x;
      az[packed] = e.position.z;
      asize[packed] = e.size;
      refs[packed++] = e;
    }
  }
  let best = null,
    bestS = 2;
  function test(p, e, dt) {
    if (e.dead) return;
    const reach = e.size * 0.6 + p.radius;
    const dx = e.position.x - from.x,
      dz = e.position.z - from.z;
    if (Math.abs(dx) > reach + Math.abs(p.velocity.x * dt) + e.size || Math.abs(dz) > reach + Math.abs(p.velocity.z * dt) + e.size) return;
    tail.copy(e.position).addScaledVector(e.heading, -0.5 * e.size);
    head.copy(e.position).addScaledVector(e.heading, 0.44 * e.size);
    const r = e.size * 0.09 + p.radius;
    if (segmentDistance2(from, p.position, tail, head) < r * r && along < bestS) {
      best = e;
      bestS = along;
    }
  }
  return function update(dt, { enemies, stones, onEnemy, onGround, onStone }) {
    if (cells && (cells !== "kept" || stones.length !== sortedLength || stones[0] !== sortedFirst)) {
      sort(stones);
      sortedLength = stones.length;
      sortedFirst = stones[0];
    }
    if (enemyCells) binEnemies(enemies);
    if (enemyArrays) packEnemies(enemies);
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        live.splice(i, 1);
        continue;
      }
      from.copy(p.position);
      p.position.addScaledVector(p.velocity, dt);
      best = null;
      bestS = 2;
      if (enemyArrays) {
        const fx = from.x,
          fz = from.z,
          r = p.radius,
          sx = Math.abs(p.velocity.x * dt),
          sz = Math.abs(p.velocity.z * dt);
        for (let j = 0; j < packed; j++) {
          const size = asize[j];
          const reach = 1.6 * size + r;
          if (Math.abs(ax[j] - fx) > reach + sx || Math.abs(az[j] - fz) > reach + sz) continue;
          // (The whole test again, on the record: it may have died to an earlier shot of this step.)
          test(p, refs[j], dt);
        }
      } else if (!enemyCells) for (const e of enemies) test(p, e, dt);
      else if (enx) {
        const mx = ereach + p.radius + Math.abs(p.velocity.x * dt),
          mz = ereach + p.radius + Math.abs(p.velocity.z * dt);
        const ix0 = Math.max(0, Math.floor((from.x - mx - ex0) / ECELL)),
          ix1 = Math.min(enx - 1, Math.floor((from.x + mx - ex0) / ECELL)),
          iz0 = Math.max(0, Math.floor((from.z - mz - ez0) / ECELL)),
          iz1 = Math.min(enz - 1, Math.floor((from.z + mz - ez0) / ECELL));
        for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) for (const e of bins[ix * enz + iz]) test(p, e, dt);
      }
      if (best) {
        p.position.lerpVectors(from, p.position, bestS);
        live.splice(i, 1);
        onEnemy?.(p, best);
        continue;
      }
      let struck = null;
      for (const c of cells ? grid.get(cellOf(p.position.x, p.position.z)) ?? none : stones) {
        const rx = c.rx ?? c.r,
          rz = c.rz ?? c.r,
          ry = c.ry ?? c.r;
        const ox = p.position.x - c.x,
          oy = p.position.y - c.y,
          oz = p.position.z - c.z;
        if (Math.abs(ox) > rx + rz || Math.abs(oz) > rx + rz) continue;
        const cs = c.cos ?? 1,
          sn = c.sin ?? 0;
        const ax = (ox * cs - oz * sn) / rx,
          ay = oy / ry,
          az = (ox * sn + oz * cs) / rz;
        if (ax * ax + ay * ay + az * az < 1) {
          struck = c;
          break;
        }
      }
      if (struck) {
        live.splice(i, 1);
        onStone?.(p, struck);
        continue;
      }
      if (!lookup) continue;
      // (every > 1: each shot looks only every so many of its steps, counted from when it was
      // fired, which staggers them; no field is added, so the shots keep their shape. For the
      // game it would have to find where between two looks the shot crossed the bed or the
      // surface: at Eco's 50 ms step a bolt goes 4 u between two of them.)
      if (every > 1 && Math.round(p.age / dt) % every) continue;
      locate(p.position.x, p.position.z, p.river.s, p.river);
      if (p.position.y < bed(p.river.s, p.river.u)) {
        live.splice(i, 1);
        onGround?.(p);
        continue;
      }
      if (p.position.y > level(p.river.s) + 0.05) live.splice(i, 1);
    }
  };
}

let along = 0;
function segmentDistance2(p0, p1, q0, q1) {
  const ux = p1.x - p0.x,
    uy = p1.y - p0.y,
    uz = p1.z - p0.z;
  const vx = q1.x - q0.x,
    vy = q1.y - q0.y,
    vz = q1.z - q0.z;
  const wx = p0.x - q0.x,
    wy = p0.y - q0.y,
    wz = p0.z - q0.z;
  const a = ux * ux + uy * uy + uz * uz,
    b = ux * vx + uy * vy + uz * vz,
    c = vx * vx + vy * vy + vz * vz,
    d = ux * wx + uy * wy + uz * wz,
    e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  let s = den > 1e-9 ? (b * e - c * d) / den : 0;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  let t = c > 1e-9 ? (b * s + e) / c : 0;
  if (t < 0) {
    t = 0;
    s = a > 1e-9 ? Math.min(1, Math.max(0, -d / a)) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-9 ? Math.min(1, Math.max(0, (b - d) / a)) : 0;
  }
  const dx = wx + ux * s - vx * t,
    dy = wy + uy * s - vy * t,
    dz = wz + uz * s - vz * t;
  along = s;
  return dx * dx + dy * dy + dz * dz;
}

// The smallest step performance.now() takes here (a coarse clock makes single frames noisy;
// the means over many frames still hold).
function timerResolution() {
  let smallest = Infinity,
    last = performance.now();
  for (let i = 0; i < 200000; i++) {
    const t = performance.now();
    if (t > last) {
      smallest = Math.min(smallest, t - last);
      last = t;
    }
  }
  return +smallest.toFixed(4);
}

// Which graphics card drew it (a software renderer would make the timings meaningless).
function gpuName(renderer) {
  const info = renderer.backend?.device?.adapterInfo ?? renderer.backend?.adapter?.info;
  if (info) return [info.vendor, info.architecture, info.description].filter(Boolean).join(" ");
  const gl = renderer.backend?.gl;
  const debug = gl?.getExtension?.("WEBGL_debug_renderer_info");
  return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown";
}

// ---- The scenes.

export const LOOK_SCENES = [
  // (manual: a plain fv-test run leaves it out, for it takes minutes.)
  { name: "bench", stage: "parr", at: 2500, season: "summer", hour: 15, look: true, manual: true },
];

// Run one look scene. ctx: { salmon, extreme, set, scene, errors, next }; call next() at the
// end to go on to the following scene.
export async function runLook(ctx) {
  if (ctx.scene.name === "bench") await bench(ctx);
  await ctx.next();
}
