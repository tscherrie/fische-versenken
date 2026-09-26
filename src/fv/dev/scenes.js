// Test scenes for Extreme's combat, run like the photo points (src/dev/shots.js): each loads
// the game afresh at a stage and a place, settles the river, puts enemies in front of the
// fish, fires, and takes pictures and numbers into shots/<set>/. Run with
//
//   node tools/fv-test.mjs <set> [--only piu,pack] [--port 8150]
//
// The game moves only in fixed steps here (salmon.run), so a scene comes out the same way
// every time.

import { LOOK_SCENES, runLook } from "./scenes-look.js";

export const SCENES = [
  // A parr in the brook, a young trout pack and a bullhead ahead: fire into them.
  { name: "piu", stage: "parr", at: 2500, season: "summer", hour: 15, spawn: [["troutParr", 7, -0.8], ["troutParr", 7.5, 0], ["troutParr", 7, 0.8], ["bullhead", 5, 0.4]] },
  // A fry at the nursery pool with a trout stalking it: does it strike, does the fry sink it?
  { name: "forelle", stage: "fingerling", at: 400, season: "summer", hour: 13, spawn: [["trout", 9, 0]] },
  // Nobody fires: the pack goes for the fish (the bites, the strength bar).
  { name: "angriff", stage: "yearling", at: 1500, season: "summer", hour: 14, fire: false, spawn: [["troutParr", 5, -1], ["troutParr", 5.5, 0], ["troutParr", 5, 1]] },
  // Nobody fires back: a brown trout with its submachine gun and a bullhead with its
  // shotgun open up on a parr (the tells, the bursts, the hits).
  { name: "beschuss", stage: "parr", at: 2500, season: "summer", hour: 15, fire: false, spawn: [["trout", 11, 0], ["bullhead", 4, 0.8]] },
  // A minute down the brook as a fry with the director sending enemies, a simple pilot
  // shooting at whatever comes: kills, bites, deaths.
  { name: "lauf", stage: "fry", at: 200, season: "summer", hour: 13, pilot: 60 },
  { name: "lauf-parr", stage: "parr", at: 1800, season: "summer", hour: 14, pilot: 60 },
  // Close looks at the weapons strapped on: [aside, above, ahead] in fish lengths from the
  // fish (aside to its left), looking at it. Which weapons: ?xback=<id>&xbelly=<id>.
  { name: "nah-brut", stage: "fry", at: 240, season: "summer", hour: 13, closeup: [0.9, 0.35, 0.25] },
  { name: "nah-parr", stage: "parr", at: 2500, season: "summer", hour: 15, closeup: [0.9, 0.35, 0.25] },
  { name: "nah-parr-oben", stage: "parr", at: 2500, season: "summer", hour: 15, closeup: [0.35, 0.9, -0.2] },
  { name: "nah-smolt", stage: "smolt", at: 11790, season: "spring", hour: 12, closeup: [0.9, 0.3, 0.2] },
  { name: "nah-smolt-unten", stage: "smolt", at: 11790, season: "spring", hour: 12, closeup: [0.8, -0.35, 0.3] },
  { name: "nah-lachs", stage: "sea", at: 17500, season: "summer", hour: 12, closeup: [0.9, 0.3, 0.2] },
  // Kills close to the eye: what a hit and a sinking leave in the water.
  { name: "splatter", stage: "parr", at: 2500, season: "summer", hour: 15, splatter: true, spawn: [["troutParr", 3.5, -0.4], ["troutParr", 4, 0.3], ["bullhead", 3, 0.1], ["trout", 7, 0]] },
];

SCENES.push(...LOOK_SCENES);

export function sceneURL(set, scene, extra = "") {
  for (const [k, v] of new URLSearchParams(location.search)) if (k.startsWith("x")) extra += `&${k}=${v}`;
  const q = new URLSearchParams({ capture: "1", seed: "7", day: "still", rain: "0", quality: "detail", fvtest: set, scene: scene.name, stage: scene.stage, at: String(scene.at), season: scene.season, hour: String(scene.hour) });
  q.set("new", "");
  return `${location.pathname}?${q.toString().replace("new=", "new")}${extra}`;
}

const nextTask = () => new Promise((r) => setTimeout(r, 0));

export async function runScenes(salmon, extreme, query) {
  try {
    await runScene(salmon, extreme, query);
  } catch (error) {
    const set = query.get("fvtest") || "fv";
    await fetch(`/__report/${set}/${query.get("scene")}`, { method: "POST", body: JSON.stringify({ scene: query.get("scene"), record: [], errors: [String(error?.stack ?? error)] }, null, 1) });
  }
}

async function runScene(salmon, extreme, query) {
  const set = query.get("fvtest") || "fv";
  const only = query.get("only")?.split(",");
  const list = only ? SCENES.filter((s) => only.includes(s.name)) : SCENES;
  const extra = only ? `&only=${only.join(",")}` : "";
  const index = list.findIndex((s) => s.name === query.get("scene"));
  if (index < 0) {
    location.href = sceneURL(set, list[0], extra);
    return;
  }
  const scene = list[index];
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.message)));
  const consoleError = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
    consoleError(...args);
  };
  const { course, fish, look, THREE } = salmon;
  const combat = extreme.combat;
  salmon.pause(true);
  await salmon.settle(40);
  await salmon.run(1);
  await salmon.settle(20);
  extreme.testing = true;
  // The enemies, placed [kind, ahead, across] from the fish, facing it.
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const spot = {};
  for (const [kind, ahead, across] of scene.spawn ?? []) {
    // (In units of a tenth of a metre, scaled up for a big fish.)
    const scale = Math.max(1, fish.length);
    const p = fish.position.clone().addScaledVector(heading, ahead * scale).addScaledVector(left, across * scale);
    course.locate(p.x, p.z, fish.river.s, spot);
    combat.enemies.spawn(kind, spot.s, spot.u, fish.position.y, { heading: heading.clone().multiplyScalar(-1) });
  }
  // Face them, and keep facing them.
  const aimAt = () => {
    const live = combat.enemies.list.filter((e) => !e.dead);
    if (!live.length) return;
    const near = live.reduce((a, e) => (e.position.distanceTo(fish.position) < a.position.distanceTo(fish.position) ? e : a));
    const d = near.position.clone().sub(fish.position);
    look.yaw = Math.atan2(d.z, d.x);
    look.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(d.y, Math.hypot(d.x, d.z))));
  };
  if (scene.look)
    return runLook({ salmon, extreme, set, scene, errors, next: async () => {
      await nextTask();
      if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
    } });
  if (scene.pilot) return pilot(salmon, extreme, set, scene, list, index, extra, errors);
  if (scene.closeup) return closeup(salmon, extreme, set, scene, list, index, extra, errors, query);
  if (scene.splatter) return splatter(salmon, extreme, set, scene, list, index, extra, errors);
  aimAt();
  await salmon.run(0.4, aimAt);
  const record = [];
  const note = (label) =>
    record.push({
      label,
      energy: +fish.energy.toFixed(3),
      stage: fish.stage,
      progress: +fish.progress.toFixed(3),
      kills: combat.players[0].kills,
      heat: +(combat.players[0].arsenal.heat.piu ?? 0).toFixed(2),
      shots: combat.projectiles.live.length,
      incoming: combat.hostile.live.length,
      threats: salmon.life.hunters.threats(fish, []).map((t) => `${t.kind}:${t.level}`),
      enemies: combat.enemies.list.map((e) => ({ kind: e.kind, mode: e.mode, hp: +e.hp.toFixed(1), dead: e.dead, d: +e.position.distanceTo(fish.position).toFixed(2) })),
    });
  note("start");
  combat.fire(scene.fire !== false);
  await salmon.run(0.5, aimAt);
  note("0.5 s");
  const picture = async (name) => {
    extreme.frame(1 / 60);
    await salmon.capture(`${set}/${name}`, 1280, 720);
  };
  await picture(`${scene.name}-1`);
  await salmon.run(1.5, aimAt);
  note("2 s");
  await picture(`${scene.name}-2`);
  await salmon.run(3, aimAt);
  note("5 s");
  await picture(`${scene.name}-3`);
  combat.fire(false);
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// The pilot: swims on down the river, turns toward the nearest living enemy in reach and
// holds the trigger while it has one; otherwise it follows the river.
async function pilot(salmon, extreme, set, scene, list, index, extra, errors) {
  const { course, fish, look, held } = salmon;
  const combat = extreme.combat;
  let deaths = 0,
    wasDead = false,
    bites = 0,
    lastEnergy = fish.energy,
    minEnergy = 1;
  const samples = [];
  const steer = (t) => {
    held.add("KeyW");
    const reach = 12 + 10 * fish.length;
    const live = combat.enemies.list.filter((e) => !e.dead && e.position.distanceTo(fish.position) < reach);
    const near = live.length ? live.reduce((a, e) => (e.position.distanceTo(fish.position) < a.position.distanceTo(fish.position) ? e : a)) : null;
    if (near) {
      const d = near.position.clone().sub(fish.position);
      look.yaw = Math.atan2(d.z, d.x);
      look.pitch = Math.max(-0.7, Math.min(0.7, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    } else {
      const target = course.place(fish.river.s + 6, fish.river.u * 0.8, {});
      look.yaw = Math.atan2(target.z - fish.position.z, target.x - fish.position.x);
      look.pitch = 0;
    }
    combat.fire(!!near);
    const dead = extreme.game.now.dead > 0;
    if (dead && !wasDead) deaths++;
    wasDead = dead;
    if (fish.energy < lastEnergy - 0.01) bites++;
    lastEnergy = fish.energy;
    minEnergy = Math.min(minEnergy, fish.energy);
  };
  for (let t = 0; t < scene.pilot; t += 10) {
    await salmon.run(10, steer);
    samples.push({ t: t + 10, s: +fish.river.s.toFixed(0), stage: fish.stage, progress: +fish.progress.toFixed(3), energy: +fish.energy.toFixed(3), kills: combat.players[0].kills, alive: combat.enemies.list.filter((e) => !e.dead).length, deaths });
    if (t === 20) {
      extreme.frame(1 / 60);
      await salmon.capture(`${set}/${scene.name}-1`, 1280, 720);
    }
  }
  held.delete("KeyW");
  combat.fire(false);
  extreme.frame(1 / 60);
  await salmon.capture(`${set}/${scene.name}-2`, 1280, 720);
  const record = [{ label: "end", energy: +fish.energy.toFixed(3), kills: combat.players[0].kills, deaths, bites, minEnergy: +minEnergy.toFixed(3) }];
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record, samples, errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// A close look at the weapons on the fish, held still (the fish stops, the camera sits at
// `closeup` from it), with the weapons named in the address.
async function closeup(salmon, extreme, set, scene, list, index, extra, errors, query) {
  const { fish, THREE } = salmon;
  const a = extreme.combat.players[0].arsenal;
  if (query.get("xback") !== null) a.back = query.get("xback") || null;
  if (query.get("xbelly") !== null) a.belly = query.get("xbelly") || null;
  await salmon.run(0.3);
  const L = fish.length;
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const [aside, above, ahead] = scene.closeup;
  const eye = fish.position.clone().addScaledVector(left, aside * L).addScaledVector(heading, ahead * L);
  eye.y += above * L;
  const target = fish.position.clone().addScaledVector(heading, 0.05 * L);
  salmon.view(eye.toArray(), target.toArray(), L * 0.02);
  await salmon.run(0.05);
  extreme.frame(1 / 60);
  await salmon.capture(`${set}/${scene.name}`, 1280, 720);
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record: [{ label: "closeup", back: a.back, belly: a.belly, stage: fish.stage, length: L }], errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}

// Kills close to the eye: the enemies are sunk one by one while the camera watches from the
// side, and pictures are taken of the hit, the kill and what is left after a while.
async function splatter(salmon, extreme, set, scene, list, index, extra, errors) {
  const { fish, THREE, course } = salmon;
  const combat = extreme.combat;
  const L = fish.length;
  const heading = fish.heading.clone().setY(0).normalize();
  const left = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
  const spot = {};
  for (const [kind, ahead, across] of scene.spawn) {
    const p = fish.position.clone().addScaledVector(heading, ahead * Math.max(1, L)).addScaledVector(left, across * Math.max(1, L));
    course.locate(p.x, p.z, fish.river.s, spot);
    const e = combat.enemies.spawn(kind, spot.s, spot.u, fish.position.y + 0.2, { heading: left.clone() });
    if (e) e.mode = "lurk";
  }
  // Watch from the side, between the fish and the enemies.
  const middle = fish.position.clone().addScaledVector(heading, 3.5 * Math.max(1, L));
  const eye = middle.clone().addScaledVector(left, 4 * Math.max(1, L));
  eye.y += 0.6;
  salmon.view(eye.toArray(), middle.toArray());
  await salmon.run(0.1);
  const picture = async (name) => {
    extreme.frame(1 / 60);
    await salmon.capture(`${set}/${name}`, 1280, 720);
  };
  const live = () => combat.enemies.list.filter((e) => !e.dead);
  // Shots straight into each enemy from the fish's side, until it sinks.
  let n = 0;
  for (const e of live()) {
    const dir = e.position.clone().sub(fish.position).normalize();
    for (let i = 0; i < 40 && !e.dead; i++) {
      combat.projectiles.fire({ owner: 0, weapon: "piu", position: e.position.clone().addScaledVector(dir, -1.2), velocity: dir.clone().multiplyScalar(30), damage: 4, radius: 0.05, life: 0.2, size: 0.1, tint: [10, 1.1, 0.6] });
      await salmon.run(1 / 30);
      if (i === 0 && n === 0) await picture(`${scene.name}-treffer`);
    }
    n++;
    await salmon.run(0.15);
    if (n === 1) await picture(`${scene.name}-kill`);
  }
  await salmon.run(1.2);
  await picture(`${scene.name}-danach`);
  await salmon.run(4);
  await picture(`${scene.name}-spaeter`);
  await fetch(`/__report/${set}/${scene.name}`, { method: "POST", body: JSON.stringify({ scene: scene.name, record: [{ label: "end", sunk: combat.enemies.list.filter((e) => e.dead).length }], errors }, null, 1) });
  await nextTask();
  if (index + 1 < list.length) location.href = sceneURL(set, list[index + 1], extra);
}
