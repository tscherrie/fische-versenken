// Test scenes for how combat looks and what it costs (owned by whoever works on the look):
// scenes listed here join the list in scenes.js, and a scene with `look: true` is run by
// runLook below instead of the generic runner.
//
// The bench (scene "bench", driven by tools/fv-bench.mjs) weighs combat against its budget:
// all of it together may take at most 1.5 ms of the graphics card's frame and 1 ms of script.
// It holds a fight of a fixed size in one place -- enemies, the players' shots and the
// enemies' in flight, the sparks and bubbles of hits and kills -- and tops it up as things
// die, so every frame carries the same load. That is timed against the same place and camera
// with no fight, in turns, several times over. Then it looks for where the time goes: the
// fight scaled up and down, parts of it hidden or swapped for variants, and the river lookups
// the shots and enemies make timed on their own. Everything is changed from here, at run
// time; the combat files stay as they are.
//
// Any other scene run with ?xtiming (fv-test --timing) gets what combat.step and
// combat.frame cost added to its report.

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

const now = () => performance.now();
// A macrotask without the clamping of nested timeouts, so waiting for one costs nothing.
const nextTask = () =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = resolve;
    channel.port2.postMessage(0);
  });

// A method replaced by one that adds up how long it takes. `fn` is what it calls, and can be
// swapped for a variant while the timing stays in place.
function meter(object, key) {
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
  object[key] = function (a, b, c, d) {
    const t = performance.now();
    const result = m.fn.call(this, a, b, c, d);
    m.sum += performance.now() - t;
    m.calls++;
    return result;
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
    m.fn = function (a, b) {
      const t = performance.now();
      const result = fn.call(this, a, b);
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
  try {
    Object.assign(report, await measure(ctx, here, name));
  } catch (error) {
    ctx.errors.push(String(error?.stack ?? error));
  }
  report.errors = ctx.errors;
  await fetch(`/__report/${ctx.set}/${name}`, { method: "POST", body: JSON.stringify(report, null, 1) });
}

// The mix of 40 enemies (scaled for other numbers): each kind at a distance from the fish
// [near, far] where it fights, the gunners within their range so they really shoot.
const MIX = [
  ["troutParr", 15, 2, 5],
  ["bullhead", 9, 1.5, 3.5],
  ["trout", 5, 4, 8],
  ["dragonflyLarva", 7, 1.2, 4],
  ["beetleLarva", 4, 1.2, 4],
];
const MAIN = { enemies: 40, shots: 150, hostile: 60 };

async function measure(ctx, here, name) {
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
  const soakSeconds = option("xsoak", 45);
  const sweep = option("xsweep", 1) > 0;
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
  const place = { s: +spot.s.toFixed(1), u: +spot.u.toFixed(2), depth: +(level(spot.s) - bed(spot.s, spot.u)).toFixed(2), length: +L.toFixed(2) };
  const eye = anchor.clone().addScaledVector(heading, -(3.5 + 2 * L));
  locate(eye.x, eye.z, fish.river.s, spot);
  eye.y = Math.max(bed(spot.s, spot.u) + 0.15, Math.min(level(spot.s) - 0.12, anchor.y + 0.9 + 0.5 * L));
  const target = anchor.clone().addScaledVector(heading, 1.5 + L);
  salmon.view(eye.toArray(), target.toArray());
  look.yaw = Math.atan2(heading.z, heading.x);
  look.pitch = 0;
  function pin() {
    fish.position.copy(anchor);
    fish.velocity.set(0, 0, 0);
    fish.energy = 1;
  }
  // Nothing of the fight may end it: the fish is out of reach of harm (the hits still land
  // and show), and the director sends nobody of its own.
  combat.players[0].safeUntil = Infinity;
  combat.director.hold(1e7);

  // ---- The meters, and the enemies' hooks (to make them fire through the game's own path).
  let hooks = null;
  const enemyUpdate = combat.enemies.update;
  combat.enemies.update = function (a, b, c, d) {
    hooks = d;
    return enemyUpdate.call(this, a, b, c, d);
  };
  const meters = {
    step: meter(combat, "step"),
    frame: meter(combat, "frame"),
    enemies: meter(combat.enemies, "update"),
    projectiles: meter(combat.projectiles, "update"),
    hostile: meter(combat.hostile, "update"),
    aim: meter(combat.aim, "update"),
    director: meter(combat.director, "update"),
    colliders: meter(terrain, "collidersNear"),
    // (signals.js lays Extreme's enemies into the game's threat list, which the game asks
    // for in its own step, outside combat.step.)
    threats: meter(salmon.life.hunters, "threats"),
  };
  let hits = 0,
    kills = 0;
  const enemyHit = combat.enemies.hit;
  combat.enemies.hit = function (e, damage, dir, by) {
    const sunk = enemyHit.call(this, e, damage, dir, by);
    hits++;
    if (sunk) kills++;
    return sunk;
  };
  const glowCloud = scene.getObjectByName("Combat glow");
  const bubbleCloud = scene.getObjectByName("Combat bubbles");
  renderer.info.autoReset = false;

  // ---- The load, kept steady.
  const load = { enemies: 0, shots: 0, hostile: 0 };
  const capacity = {};
  for (const kind of Object.keys(KINDS)) capacity[kind] = KINDS[kind].capacity;
  // More enemies than a kind's crowd can draw may be asked for (the 80 of the sweep): the
  // kind then takes them, and those past its crowd are moved and tested but not drawn.
  function setLoad(l) {
    Object.assign(load, l);
    for (const [kind, base] of MIX) KINDS[kind].capacity = Math.max(capacity[kind], Math.round((base * load.enemies) / 40) + 4);
    combat.fire(load.shots > 0);
    if (!load.enemies) combat.enemies.reset();
    if (!load.shots) combat.projectiles.reset();
    if (!load.hostile) combat.hostile.reset();
  }
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
  // some straight at an enemy.
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
  function fireShot() {
    const w = WEAPONS.piu;
    const k = fired++ % 4;
    const [ahead, aside, up] = SHOOTERS[k];
    muzzle.copy(anchor).addScaledVector(heading, ahead * L).addScaledVector(left, aside * L);
    muzzle.y += up * L;
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
    const speed = w.speed(L);
    velocity.normalize().multiplyScalar(speed);
    shot.owner = k;
    shot.damage = w.damage * damageScale(L);
    shot.radius = w.radius(L);
    shot.life = w.reach(L) / speed;
    shot.size = w.size(L);
    shot.tint = w.tint;
    shot.stretch = w.stretch;
    shot.s = fish.river.s;
    combat.projectiles.fire(shot);
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
        if (e.corpse > 1.5) e.eaten = true;
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
    if (hooks && load.hostile) {
      let flying = 0;
      for (const p of combat.hostile.live) if (!p.spent) flying++;
      for (let tries = 0; flying < load.hostile && tries < 60; tries++) {
        const e = list[Math.floor(random() * list.length)];
        const gun = e?.spec.weapon;
        if (!e || e.dead || gun?.kind !== "ranged") continue;
        combat.enemies.snout(e, snout);
        aimAt.subVectors(fish.position, snout).normalize();
        hooks.shoot(e, aimAt, gun);
        flying += gun.pellets;
      }
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

  const COUNTS = ["enemies", "corpses", "shots", "flying", "spent", "rested", "glow", "bubbles"];
  const SERIES = ["world", "frame", "layout", "draw", "total", "combatStep", "combatFrame", "combat", "calls", "triangles", "glTimer", "heap", ...COUNTS];
  // What a frame leaves on the heap for the collector (Chrome's performance.memory, exact with
  // --enable-precise-memory-info): frames in which it collected are left out.
  const heap = () => performance.memory?.usedJSHeapSize ?? 0;
  const series = {};
  for (const key of SERIES) series[key] = new Float64Array(Math.max(frames, 1));
  const pending = [];
  // Frames timed one by one, each begun with the card idle, so the script's time is not
  // held up by the card: the world's step, combat's frame, the draw.
  async function timedFrames(n) {
    for (const m of Object.values(meters)) m.reset();
    hits = kills = 0;
    let glCount = 0,
      heapCount = 0;
    for (let i = 0; i < n; i++) {
      keep();
      await sync();
      const s0 = meters.step.sum,
        f0 = meters.frame.sum;
      const h0 = heap();
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
        pending.push(query);
      }
      const t3 = now();
      const grown = heap() - h0;
      series.heap[heapCount] = grown / 1024;
      if (grown >= 0) heapCount++;
      series.world[i] = t1 - t0;
      series.frame[i] = t2 - t1;
      series.layout[i] = t2l - t2;
      series.draw[i] = t3 - t2l;
      series.total[i] = t3 - t0;
      series.combatStep[i] = meters.step.sum - s0;
      series.combatFrame[i] = meters.frame.sum - f0;
      series.combat[i] = series.combatStep[i] + series.combatFrame[i];
      series.calls[i] = renderer.info.render.drawCalls ?? renderer.info.render.calls;
      series.triangles[i] = renderer.info.render.triangles;
      let flying = 0,
        spent = 0,
        rested = 0,
        live = 0,
        dead = 0;
      for (const p of combat.hostile.live) p.rested ? rested++ : p.spent ? spent++ : flying++;
      for (const e of combat.enemies.list) e.dead ? dead++ : live++;
      series.enemies[i] = live;
      series.corpses[i] = dead;
      series.shots[i] = combat.projectiles.live.length;
      series.flying[i] = flying;
      series.spent[i] = spent;
      series.rested[i] = rested;
      series.glow[i] = glowCloud?.count ?? 0;
      series.bubbles[i] = bubbleCloud?.count ?? 0;
      while (timer && pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = pending.shift();
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) series.glTimer[glCount++] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
      }
    }
    const out = {};
    for (const key of ["world", "frame", "layout", "draw", "total", "combatStep", "combatFrame", "combat"]) out[key] = stats(series[key], n);
    out.calls = median(series.calls.subarray(0, n));
    out.triangles = median(series.triangles.subarray(0, n));
    if (glCount) out.glTimer = stats(series.glTimer, glCount);
    if (heapCount && performance.memory) out.heapKB = stats(series.heap, heapCount);
    out.parts = {};
    for (const key of ["enemies", "projectiles", "hostile", "aim", "director", "colliders", "threats"]) out.parts[key] = +(meters[key].sum / n).toFixed(4);
    out.counts = {};
    for (const key of COUNTS) {
      const s = stats(series[key], n);
      out.counts[key] = { mean: +s.mean.toFixed(1), min: s.min, max: s.max };
    }
    out.events = { hitsPerSecond: +(hits / (n * dt)).toFixed(1), killsPerSecond: +(kills / (n * dt)).toFixed(1) };
    return out;
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
  // Combat's meshes, by part: each kind's crowd (body and fins), the glow, the bubbles.
  const parts = new Map();
  scene.traverse((o) => {
    if (!o.name?.startsWith("Combat")) return;
    const key = o.name.replace(/ fins$/, "");
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push(o);
  });
  const everything = [...parts.values()].flat();
  // What drawing `objects` costs the card: the scene as it stands drawn back to back with
  // them shown and hidden in turn, in short batches (shown, hidden, hidden, shown, then the
  // other way round), so whatever else the card is doing meanwhile -- other pages, other
  // programs -- weighs on both alike; the median of the paired differences. (Timing a
  // whole fight against a whole calm the same way is left to drift over seconds.)
  async function pairedCost(objects, batches = 16, n = 8) {
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
      diffs.push(a - b);
      scripts.push(c);
      await nextTask();
    }
    show(true);
    const sorted = [...diffs].sort((x, y) => x - y);
    const q = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(3);
    // (script: what handing the meshes to the card costs the processor, a share of the draw.)
    return { cost: q(0.5), low: q(0.25), high: q(0.75), shown: +median(on).toFixed(3), hidden: +median(off).toFixed(3), script: +median(scripts).toFixed(3) };
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
  async function condition(l, { settleFor = 2, n = frames, meshBatches = 16 } = {}) {
    combatOn(true);
    setLoad(l);
    if (!l.enemies && !l.shots && !l.hostile) {
      await drain(5);
      combatOn(!!l.empty);
    }
    await settle(settleFor);
    const result = await timedFrames(n);
    result.b2b = await backToBack();
    result.full = await fullFrames();
    if (l.enemies || l.shots || l.hostile) result.meshes = await pairedCost(everything, meshBatches);
    return result;
  }

  const config = {
    renderer: webgpu ? "webgpu" : "webgl2",
    quality,
    light: !extreme.game.settings?.detail || !!extreme.game.touchMode,
    dt: +dt.toFixed(4),
    repeats,
    frames,
    gpu: gpuName(renderer),
    canvas: [renderer.domElement.width, renderer.domElement.height],
    post: [post.main.width, post.main.height],
    timerResolution: timerResolution(),
    glTimer: !!timer,
    three: THREE.REVISION,
    agent: navigator.userAgent,
  };
  const OFF = { enemies: 0, shots: 0, hostile: 0 };

  // Warm-up: every pipeline of the fight built, the caches filled.
  setLoad(MAIN);
  await settle(3);
  await backToBack(20, 1);

  // ?xhold: the bench stops here and hands its parts to the console (window.bench), to try
  // things out by hand; it reports nothing.
  if (here.has("xhold")) {
    window.bench = { setLoad, settle, drain, keep, frame, timedFrames, backToBack, fullFrames, pairedCost, condition, combatOn, meters, load, sync, parts, everything, MAIN, OFF };
    await new Promise(() => {});
  }

  const runs = [];
  for (let r = 0; r < repeats; r++) {
    const ref = await condition(OFF, { settleFor: 1 });
    const stress = await condition(MAIN);
    runs.push({ ref, stress });
  }

  // Where the card's time goes: the fight as it stands, each part of it shown and hidden in
  // turn (the fight's step does not run meanwhile, so what is hidden stays hidden).
  setLoad(MAIN);
  await settle(1.5);
  const groups = {};
  for (const [key, objects] of parts) if (objects.some((o) => o.visible)) groups[key] = await pairedCost(objects, 12);

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
    out.collidersNear = +(perCall(() => terrain.collidersNear(fish.position.x, fish.position.z, WEAPONS.piu.reach(L) + 4, stones), 1, 50) / 1000).toFixed(4);
    out.stones = stones.length;
    out.sink = Number.isFinite(sink);
    return out;
  }

  // What one enemy round and one players' shot cost a step, on lists of their own (the
  // game's are left alone), many at a time for a clock this coarse: a round flying at the
  // fish, spent and sinking, lying on the bed; a shot flying along the river, with and
  // without the bed and surface lookup.
  const rounds = labCosts();
  function labCosts() {
    const N = 600,
      passes = 8;
    const out = { n: N };
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
          toward.subVectors(anchor, position).normalize().multiplyScalar(14);
          lab.fire({ source: null, weapon: "smg", position: position.clone(), velocity: toward.clone(), damage: 0, drag: 1.4, radius: 0.04, life: 12, size: 0.07, tint: [1, 1, 1], stretch: 1, s: fish.river.s });
          const p = lab.live[i];
          if (state !== "flying") {
            p.spent = true;
            p.velocity.multiplyScalar(0.2);
          }
          if (state === "rested") p.rested = true;
        }
        const t0 = now();
        lab.update(dt, combat.players, {});
        total += now() - t0;
      }
      out[state] = +((total / (passes * N)) * 1000).toFixed(3);
    }
    const shots = createProjectiles({ capacity: N });
    const stones = [];
    terrain.collidersNear(fish.position.x, fish.position.z, WEAPONS.piu.reach(L) + 4, stones);
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
        const t0 = now();
        update(dt, { enemies: combat.enemies.list, stones });
        total += now() - t0;
      }
      out[key] = +((total / (passes * N)) * 1000).toFixed(3);
    }
    out.stones = stones.length;
    return out;
  }

  // What the players' shots cost, and what parts of it would save: projectiles.js's update
  // swapped for a copy of it -- as it is (to check the copy costs the same), without the bed
  // and surface lookup, with the stones sorted into cells so a shot tests only those of its
  // own -- and the game's own update with no stones at all (no collidersNear, no stone test).
  const toggles = {};
  const original = meters.projectiles.fn;
  const collidersNear = meters.colliders.fn;
  const noStones = (x, z, reach, out = []) => {
    out.length = 0;
    return out;
  };
  for (const [key, fn, near] of [
    ["original", original, collidersNear],
    ["copy", projectileUpdate(THREE, combat.projectiles.live, course), collidersNear],
    ["noLookup", projectileUpdate(THREE, combat.projectiles.live, course, { lookup: false }), collidersNear],
    ["stoneCells", projectileUpdate(THREE, combat.projectiles.live, course, { cells: true }), collidersNear],
    ["stoneCellsKept", projectileUpdate(THREE, combat.projectiles.live, course, { cells: "kept" }), collidersNear],
    ["noStones", original, noStones],
  ]) {
    meters.projectiles.fn = fn;
    meters.colliders.fn = near;
    setLoad(MAIN);
    await settle(1);
    const t = await timedFrames(frames);
    toggles[key] = { projectiles: t.parts.projectiles, colliders: t.parts.colliders, combatStep: t.combatStep.trimmed, shots: t.counts.shots.mean };
  }
  meters.projectiles.fn = original;
  meters.colliders.fn = collidersNear;

  // The fight scaled: more and fewer enemies, players' shots and enemies' shots.
  const scaled = [];
  if (sweep)
    for (const l of [
      { enemies: 10, shots: 150, hostile: 60 },
      { enemies: 20, shots: 150, hostile: 60 },
      { enemies: 40, shots: 150, hostile: 60 },
      { enemies: 80, shots: 150, hostile: 60 },
      { enemies: 40, shots: 50, hostile: 60 },
      { enemies: 40, shots: 300, hostile: 60 },
      { enemies: 40, shots: 150, hostile: 0 },
      { enemies: 40, shots: 150, hostile: 120 },
      { enemies: 40, shots: 0, hostile: 0 },
      { enemies: 0, shots: 0, hostile: 0, empty: true },
    ]) {
      shotsCapped = false;
      const t = await condition(l, { settleFor: 1.5, meshBatches: 10 });
      scaled.push({ load: l, capped: shotsCapped, combatStep: t.combatStep.trimmed, combatFrame: t.combatFrame.trimmed, layout: t.layout.trimmed, total: t.total.trimmed, draw: t.draw.trimmed, heapKB: t.heapKB?.trimmed, parts: t.parts, counts: t.counts, events: t.events, gpu: t.meshes?.cost ?? null, calls: t.calls, triangles: t.triangles });
    }
  combatOn(true);

  // The enemies' spent bullets over a longer fight: they stay in the list while they sink.
  const soak = [];
  if (soakSeconds > 0) {
    setLoad(MAIN);
    await settle(1);
    let second = 0,
      stepped = 0;
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
          oldest = 0;
        for (const p of combat.hostile.live) {
          if (p.rested) rested++;
          else if (p.spent) spent++;
          else flying++;
          if (p.spent) oldest = Math.max(oldest, p.age);
        }
        let corpses = 0;
        for (const e of combat.enemies.list) if (e.dead) corpses++;
        soak.push({ t: second, flying, spent, rested, oldest: +oldest.toFixed(2), hostile: +(meters.hostile.sum / stepped).toFixed(4), combatStep: +(meters.step.sum / stepped).toFixed(4), enemies: combat.enemies.list.length, corpses, shots: combat.projectiles.live.length, glow: glowCloud?.count ?? 0, bubbles: bubbleCloud?.count ?? 0, heapMB: +(heap() / 1048576).toFixed(1) });
        meters.hostile.reset();
        meters.step.reset();
        stepped = 0;
      }
    }
  }

  // Pictures: the fight, and the same place without it.
  setLoad(MAIN);
  await settle(1.5);
  await salmon.capture(`${set}/${name}-kampf`, 1280, 720);
  setLoad(OFF);
  await drain(5);
  await settle(0.5);
  await salmon.capture(`${set}/${name}-ohne`, 1280, 720);

  for (const [kind] of MIX) KINDS[kind].capacity = capacity[kind];
  for (const m of Object.values(meters)) m.restore();
  combat.enemies.update = enemyUpdate;
  combat.enemies.hit = enemyHit;
  renderer.info.autoReset = true;
  return { config, place, load: { ...MAIN, aimShare, hpScale, capped: shotsCapped }, runs, groups, lookups, rounds, toggles, scaled, soak };
}

// projectiles.js's update, copied so it can be timed with and without the lookup of the bed
// and the surface under each shot (without it, a shot flies on until it hits an enemy or a
// stone or its time is up), and with the stones sorted into cells.
function projectileUpdate(THREE, live, { bed, level, locate }, { lookup = true, cells = false } = {}) {
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
  return function update(dt, { enemies, stones, onEnemy, onGround, onStone }) {
    if (cells && (cells !== "kept" || stones.length !== sortedLength || stones[0] !== sortedFirst)) {
      sort(stones);
      sortedLength = stones.length;
      sortedFirst = stones[0];
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        live.splice(i, 1);
        continue;
      }
      from.copy(p.position);
      p.position.addScaledVector(p.velocity, dt);
      let best = null,
        bestS = 2;
      for (const e of enemies) {
        if (e.dead) continue;
        const reach = e.size * 0.6 + p.radius;
        const dx = e.position.x - from.x,
          dz = e.position.z - from.z;
        if (Math.abs(dx) > reach + Math.abs(p.velocity.x * dt) + e.size || Math.abs(dz) > reach + Math.abs(p.velocity.z * dt) + e.size) continue;
        tail.copy(e.position).addScaledVector(e.heading, -0.5 * e.size);
        head.copy(e.position).addScaledVector(e.heading, 0.44 * e.size);
        const r = e.size * 0.09 + p.radius;
        if (segmentDistance2(from, p.position, tail, head) < r * r && along < bestS) {
          best = e;
          bestS = along;
        }
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
