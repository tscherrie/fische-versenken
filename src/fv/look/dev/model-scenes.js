// The look scenes of the models in look/ (listed in src/fv/dev/scenes-look.js): the game is
// loaded at the scene's stage and place, the models are made here (as combat would make them),
// posed by hand or fed by the game, and pictured close up from several sides. Warnings the
// page prints (the shader builders print theirs there) go into the report with the errors.

import { attribute, normalView, vec3 } from "three/tsl";
import { createCapsules } from "../capsule.js";
import { REST, createLarvae } from "../larvae.js";
import { createGround } from "../../ground.js";

const nextTask = () => new Promise((r) => setTimeout(r, 0));
const query = new URLSearchParams(location.search);
// As combat would make them: light on the Niedrig quality (and with ?xlight).
const light = query.has("xlight") || query.get("quality") === "eco";

// For looking into the shading (?xdebug=paint: the painted colours unlit; ?xdebug=normal:
// the shading normal as a colour; nobump, noclear: without the relief or the wet coat;
// shadow: the patches under the larvae in red, to see where they lie).
function debugLarvae(larvae, mode) {
  if (!mode) return;
  if (mode === "shadow") {
    const m = larvae.meshes[2].material;
    m.colorNode = vec3(1, 0, 0);
    m.needsUpdate = true;
    return;
  }
  for (const mesh of larvae.meshes) {
    // (The larvae themselves, not their shadows.)
    if (!mesh.userData.state) continue;
    const m = mesh.material;
    if (mode === "noclear" || mode === "nobump") {
      if (mode === "noclear") m.clearcoatNode = null;
      else m.normalNode = mesh.userData.smoothNormal;
      m.needsUpdate = true;
      continue;
    }
    m.colorNode = vec3(0);
    m.clearcoatNode = null;
    m.emissiveNode = mode === "normal" ? normalView.mul(0.5).add(0.5) : attribute("paint", "vec4").rgb;
    m.needsUpdate = true;
  }
}
const trianglesOf = (meshes) => meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count / 3 : m.isSprite ? 0 : m.geometry.attributes.position.count / 3), 0);

export async function runModelScene(ctx) {
  const { set, scene, errors } = ctx;
  const warnings = [];
  const consoleWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" ").slice(0, 500));
    consoleWarn(...args);
  };
  const record = [{ label: "backend", backend: ctx.salmon.renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2", quality: query.get("quality") }];
  try {
    // (?xbaseline: the game at the scene's place without the models, to tell the page's own
    // warnings from theirs.)
    if (query.has("xbaseline")) await ctx.salmon.capture(`${set}/${scene.name}-ohne`, 1280, 720);
    else await SCENES[scene.name](ctx, record);
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

// A picture: models drawn first (the capture itself only redraws what is set). Tests may
// step the world here: posed records do not move, the game's own do.
async function picture(ctx, name, draw) {
  // (The game places the camera in its step: one step, so a view just set takes hold.)
  await ctx.salmon.run(1 / 60);
  draw?.();
  ctx.extreme.frame(1 / 60);
  draw?.();
  await ctx.salmon.capture(`${ctx.set}/${ctx.scene.name}-${name}`, 1280, 720);
}

// A place on the gravel for a larva `size` long near p, as the enemy system keeps one: its
// centre REST.foot of its size above the ground -- the bed, or the tops of the pebbles there
// if they stand higher (the redd's gravel is a layer of stones on the bed) -- or, dead,
// REST.dead above it. With `bedOnly`, above the bed alone (as the branch's older enemy system
// did, before it walked them over the pebbles).
function restOn(salmon) {
  const { fish, course, pebbles } = salmon;
  const spot = {},
    stones = [],
    q = { x: 0, y: 0, z: 0 };
  const topAt = (x, z, size, bedOnly) => {
    course.locate(x, z, fish.river.s, spot);
    let top = course.bed(spot.s, spot.u);
    if (!bedOnly) {
      q.x = x;
      q.z = z;
      stones.length = 0;
      pebbles.near(q, size, stones);
      for (const c of stones) if (Math.hypot(c.x - x, c.z - z) < c.r + size * 0.25) top = Math.max(top, c.y + c.ry * 0.85);
    }
    return top;
  };
  // (The highest of the ground under the middle and a little round it, so that a larva posed
  // on a slope does not have its head in the stones: the scenes are for looking at it.)
  return (p, size, { dead = false, bedOnly = false } = {}) => {
    let top = topAt(p.x, p.z, size, bedOnly);
    if (!bedOnly) for (let k = 0; k < 4; k++) top = Math.max(top, topAt(p.x + Math.cos(k * 1.571) * size * 0.3, p.z + Math.sin(k * 1.571) * size * 0.3, size, bedOnly));
    p.y = top + size * (dead ? REST.dead : REST.foot);
    return p;
  };
}

// The pilot of the live scenes, as fv-test's (src/fv/dev/scenes.js) steers its gravel-bed
// scenes, so their pictures compare: the alevin holds on with S, turns toward the nearest
// living enemy in reach and fires at it; with none, it looks down the river, level. Then the
// models are drawn (`draw`).
function pilot(salmon, combat, draw, fire = true) {
  const { course, fish, look, held } = salmon;
  held.add("KeyS");
  const reach = 12 + 10 * fish.length;
  let near = null;
  for (const e of combat.enemies.list) if (!e.dead && e.position.distanceTo(fish.position) < reach && (!near || e.position.distanceTo(fish.position) < near.position.distanceTo(fish.position))) near = e;
  if (near) {
    const d = near.position.clone().sub(fish.position);
    look.yaw = Math.atan2(d.z, d.x);
    look.pitch = Math.max(-0.7, Math.min(0.7, Math.atan2(d.y, Math.hypot(d.x, d.z))));
  } else {
    const target = course.place(fish.river.s + 6, fish.river.u * 0.8, {});
    look.yaw = Math.atan2(target.z - fish.position.z, target.x - fish.position.x);
    look.pitch = 0;
  }
  combat.fire(!!near && fire);
  draw();
}

// A larva record as the enemy system keeps one (only what larvae.js reads).
function larva(THREE, kind, position, heading, size, more = {}) {
  return { id: more.id ?? 1, kind, spec: { render: "larva" }, position: position.clone(), heading: heading.clone().normalize(), size, phase: 0.8, gape: 0.08, dead: false, rolled: 0, corpse: 0, mode: "approach", t: 0, speed: size * 0.7, ...more };
}

const SCENES = {
  // The larvae one at a time on the gravel ahead of the alevin, the camera close by, then the
  // two together with the alevin for their size.
  async "larven-nah"(ctx, record) {
    const { salmon } = ctx;
    const { fish, THREE, scene } = salmon;
    const larvae = createLarvae(scene, { capacity: 24, light });
    debugLarvae(larvae, query.get("xdebug"));
    record.push({ label: "triangles", perKind: larvae.meshes.map((m) => ({ name: m.name, triangles: m.geometry.index.count / 3 })) });
    const { ahead, left, up } = frameOf(salmon);
    const rest = restOn(salmon);
    const list = [];
    const draw = () => larvae.draw(list);
    // One larva ahead of the fish, facing `facing` (radians from facing the fish, toward its
    // left), resting on the gravel; the camera at [forward, up, side] in the larva's own frame,
    // in its lengths, looking at `aim` lengths ahead of its middle.
    const pose = (kind, size, more, facing = 0.6) => {
      const at = rest(fish.position.clone().addScaledVector(ahead, 0.75), size);
      const heading = ahead.clone().multiplyScalar(-1).applyAxisAngle(up, facing);
      list.length = 0;
      list.push(larva(THREE, kind, at, heading, size, more));
      return list[0];
    };
    const look = (e, [f, u, s], aim = 0.08) => {
      const side = up.clone().cross(e.heading).normalize().multiplyScalar(-1);
      const eye = e.position.clone().addScaledVector(e.heading, f * e.size).addScaledVector(up, u * e.size).addScaledVector(side, s * e.size);
      const target = e.position.clone().addScaledVector(e.heading, aim * e.size);
      salmon.view(eye.toArray(), target.toArray(), 0.004);
    };
    await salmon.run(0.2);

    // The diving beetle larva: crawling (two steps of the gait), from above, the mandibles
    // cocked open, dead on its back.
    let e = pose("beetleLarva", 0.55, { phase: 0.9 });
    look(e, [0.35, 0.42, 0.72]);
    await picture(ctx, "kaefer-kriecht", draw);
    e.phase = 0.9 + Math.PI;
    await picture(ctx, "kaefer-kriecht-2", draw);
    look(e, [-0.05, 1.05, 0.2], 0);
    await picture(ctx, "kaefer-oben", draw);
    e = pose("beetleLarva", 0.55, { mode: "coil", t: 0.3, gape: 0.35, phase: 2.2 });
    look(e, [0.85, 0.45, 0.42], 0.3);
    await picture(ctx, "kaefer-zangen-offen", draw);
    // The lunge, mandibles wide, and the snap as it bites.
    e = pose("beetleLarva", 0.55, { mode: "strike", t: 0.2, gape: 1, phase: 0.4 });
    look(e, [0.95, 0.35, 0.55], 0.35);
    await picture(ctx, "kaefer-biss", draw);
    e = pose("beetleLarva", 0.55, { mode: "recover", t: 0.06, gape: 1, phase: 0.4 });
    await picture(ctx, "kaefer-zugebissen", draw);
    e = pose("beetleLarva", 0.55, { dead: true, rolled: Math.PI, corpse: 3, mode: "dead", gape: 0.35 });
    rest(e.position, 0.55, { dead: true });
    look(e, [0.3, 0.75, 0.62], 0);
    await picture(ctx, "kaefer-tot", draw);

    // The dragonfly larva: crawling, drawn up (coil), the mask shooting out and out, dead.
    e = pose("dragonflyLarva", 0.42, { phase: 2.6 });
    look(e, [0.4, 0.45, 0.8]);
    await picture(ctx, "libelle-kriecht", draw);
    look(e, [0.95, 0.35, 0.3], 0.25);
    await picture(ctx, "libelle-vorn", draw);
    // The head close: the eyes' facets, the mask folded under the face.
    look(e, [0.78, 0.22, 0.26], 0.32);
    await picture(ctx, "libelle-kopf", draw);
    e = pose("dragonflyLarva", 0.42, { mode: "coil", t: 0.3, gape: 0.35 });
    look(e, [0.7, 0.4, 0.75], 0.2);
    await picture(ctx, "libelle-gespannt", draw);
    e = pose("dragonflyLarva", 0.42, { mode: "strike", t: 0.035, gape: 1, phase: 1.1 });
    look(e, [0.45, 0.42, 1.05], 0.35);
    await picture(ctx, "libelle-maske-halb", draw);
    e = pose("dragonflyLarva", 0.42, { mode: "strike", t: 0.1, gape: 1, phase: 1.1 });
    await picture(ctx, "libelle-maske", draw);
    e = pose("dragonflyLarva", 0.42, { mode: "strike", t: 0.16, gape: 1, phase: 1.1 });
    look(e, [1.15, 0.5, 0.45], 0.45);
    await picture(ctx, "libelle-maske-vorn", draw);
    // Turning away after the strike: the hooks shut on what they caught, the mask coming in.
    e = pose("dragonflyLarva", 0.42, { mode: "recover", t: 0.07, gape: 1, phase: 1.1 });
    look(e, [1.15, 0.5, 0.45], 0.45);
    await picture(ctx, "libelle-zugepackt", draw);
    e = pose("dragonflyLarva", 0.42, { dead: true, rolled: Math.PI, corpse: 3, mode: "dead" });
    rest(e.position, 0.42, { dead: true });
    look(e, [0.3, 0.75, 0.62], 0);
    await picture(ctx, "libelle-tot", draw);

    // Both beside the alevin, from behind it and above.
    list.length = 0;
    const a = rest(fish.position.clone().addScaledVector(ahead, 0.5).addScaledVector(left, 0.3), 0.55);
    const b = rest(fish.position.clone().addScaledVector(ahead, 0.45).addScaledVector(left, -0.32), 0.42);
    list.push(larva(THREE, "beetleLarva", a, ahead.clone().negate().applyAxisAngle(up, -0.6), 0.55, { id: 2, phase: 1.5, mode: "coil", t: 0.3 }));
    list.push(larva(THREE, "dragonflyLarva", b, ahead.clone().negate().applyAxisAngle(up, 0.5), 0.42, { id: 3, phase: 0.3 }));
    // (An alevin of the stage's middle length posed on the gravel between them, for the size:
    // the player's own fish is elsewhere, up on a stone.)
    const middle = a.clone().add(b).multiplyScalar(0.5);
    const brood = rest(middle.clone().addScaledVector(ahead, -0.2), 0.26);
    brood.y += 0.01;
    const remove = salmon.showcase("alevin", "alevin", 0.26, brood.toArray(), Math.atan2(left.z, left.x));
    const eye = middle.clone().addScaledVector(ahead, -0.75).addScaledVector(left, 0.1).addScaledVector(up, 0.32);
    salmon.view(eye.toArray(), middle.toArray(), 0.004);
    await picture(ctx, "mit-brut", draw);
    remove();
    record.push({ label: "fish", stage: fish.stage, length: +fish.length.toFixed(3) });
  },

  // The gravel defence running: the waves come, the larvae are drawn by their models (the
  // enemy system's stand-in bodies off), the pilot fires; pictures along the way.
  async "larven-kiesbett"(ctx, record) {
    const { salmon, extreme } = ctx;
    const { fish, scene, look, held } = salmon;
    const combat = extreme.combat;
    const larvae = createLarvae(scene, { capacity: 24, light });
    for (const kind of ["dragonflyLarva", "beetleLarva"]) combat.enemies.drawnBy?.(kind);
    extreme.testing = true;
    const steer = () => pilot(salmon, combat, () => larvae.draw(combat.enemies.list));
    const draw = () => larvae.draw(combat.enemies.list);
    const counts = () => {
      const c = {};
      for (const e of combat.enemies.list) c[`${e.kind}${e.dead ? " dead" : ""}`] = (c[`${e.kind}${e.dead ? " dead" : ""}`] ?? 0) + 1;
      return c;
    };
    for (const [t, name] of [
      [9, "1"],
      [33, "2"],
      [62, "3"],
    ]) {
      await salmon.run(t - (record.at(-1)?.t ?? 0), steer);
      record.push({ t, counts: counts(), kills: combat.players[0].kills, energy: +fish.energy.toFixed(3) });
      await picture(ctx, name, draw);
      // And the nearest larva close up, the camera beside it.
      const near = combat.enemies.list.filter((e) => e.kind.endsWith("Larva")).sort((a, b) => a.position.distanceTo(fish.position) - b.position.distanceTo(fish.position))[0];
      if (near) {
        const side = new salmon.THREE.Vector3(0, 1, 0).cross(near.heading).normalize();
        const eye = near.position.clone().addScaledVector(near.heading, 0.6 * near.size).addScaledVector(side, 0.9 * near.size).add(new salmon.THREE.Vector3(0, 0.45 * near.size, 0));
        salmon.view(eye.toArray(), near.position.toArray(), 0.004);
        await picture(ctx, `${name}-nah`, draw);
        salmon.view(null);
      }
    }
    held.delete("KeyS");
    combat.fire(false);
  },

  async "kapsel-nah"(ctx, record) {
    await capsuleScene(ctx, record);
  },

  async "modelle-kosten"(ctx, record) {
    await costScene(ctx, record);
  },
};

async function capsuleScene(ctx, record) {
  const { salmon } = ctx;
  const { fish, THREE, course, scene } = salmon;
  const capsules = createCapsules(scene, { capacity: 24, light });
  record.push({ label: "triangles", perCapsule: trianglesOf(Object.values(capsules.meshes)) });
  // A stand-in for the weapon model at the docking point (models.js will put the real one
  // there): a unit long along x, a receiver and a barrel in dark gunmetal.
  const stand = new THREE.Group();
  const metal = new THREE.MeshStandardNodeMaterial({ color: 0x2a2d30, metalness: 0.8, roughness: 0.35 });
  stand.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.1).translate(-0.12, 0, 0), metal));
  stand.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 12).rotateZ(Math.PI / 2).translate(0.25, 0.03, 0), metal));
  stand.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.07).translate(-0.05, -0.12, 0), metal));
  stand.matrixAutoUpdate = false;
  scene.add(stand);
  const docked = new THREE.Matrix4();
  const { ahead, left, up } = frameOf(salmon);
  const L = fish.length;
  const spot = {};
  const ground = (p) => {
    course.locate(p.x, p.z, fish.river.s, spot);
    return course.bed(spot.s, spot.u);
  };
  await salmon.run(0.2);
  const at = fish.position.clone().addScaledVector(ahead, 2.2 * L);
  at.y = Math.max(at.y, ground(at) + 0.9 * L);
  const items = [{ x: at.x, y: at.y, z: at.z, place: "back", weapon: "piu", state: "idle", age: 5, stage: fish.stage }];
  let time = 12.3;
  const draw = () => {
    capsules.draw(items, time);
    const shown = capsules.anchor(0, docked);
    stand.visible = shown > 0;
    if (shown > 0) stand.matrix.copy(docked).multiply(new THREE.Matrix4().makeScale(shown, shown, shown));
    stand.matrixWorldNeedsUpdate = true;
  };
  const view = (eye, target = at) => salmon.view(eye.toArray(), target.toArray(), 0.01);
  view(at.clone().addScaledVector(ahead, -1.6 * L).addScaledVector(left, 0.6 * L).addScaledVector(up, 0.25 * L));
  await picture(ctx, "ruhe", draw);
  {
    const b = capsules.meshes.bubbles;
    record.push({ label: "bubbles", count: b.count, visible: b.visible, layers: b.layers.mask, column: Array.from(b.cloud.attributes.column.array.slice(0, 8)), bubble: Array.from(b.cloud.attributes.bubble.array.slice(0, 8)), inScene: !!b.parent });
  }
  view(at.clone().addScaledVector(ahead, -0.9 * L).addScaledVector(left, -0.8 * L).addScaledVector(up, -0.3 * L));
  time = 13.1;
  await picture(ctx, "ruhe-unten", draw);
  // Wider, with the column of bubbles up to the surface.
  view(at.clone().addScaledVector(ahead, -3.5 * L).addScaledVector(up, 0.4 * L), at.clone().addScaledVector(up, 1.2 * L));
  await picture(ctx, "saeule", draw);
  // Taken: the burst, a moment later, and gone.
  view(at.clone().addScaledVector(ahead, -1.8 * L).addScaledVector(left, 0.5 * L).addScaledVector(up, 0.2 * L));
  // (Drawn once more idle first, so the capsule knows the moment it is taken.)
  draw();
  items[0].state = "taken";
  const takenAt = time;
  for (const age of [0.03, 0.06, 0.18, 0.4, 1.2]) {
    items[0].age = age;
    items[0].takenAge = age;
    time = takenAt + age;
    await picture(ctx, `genommen-${age}`, draw);
  }
  // The belly place, and a capsule of each life stage in a row.
  items.length = 0;
  for (let i = 0; i < 6; i++) {
    const p = at.clone().addScaledVector(left, (i - 2.5) * 1.1 * L);
    items.push({ x: p.x, y: p.y, z: p.z, place: i % 2 ? "belly" : "back", weapon: "piu", state: "idle", age: 3 + i, stage: [0, 1, 4, 5, 8, 9][i], size: 0.8 * L });
  }
  view(at.clone().addScaledVector(ahead, -4.2 * L).addScaledVector(up, 0.5 * L));
  await picture(ctx, "stufen", draw);
  // Behind a stone: the one in front of the fish nearest the line of sight.
  const stones = salmon.world?.stones ?? [];
  salmon.terrain.collidersNear(fish.position.x, fish.position.z, 12, stones);
  // (A stone that stands up: taller than the capsule, so it can hide one.)
  const candidates = stones.filter((c) => c.ry > 0.9 * L && c.r < 4 * L).sort((a, b) => Math.hypot(a.x - fish.position.x, a.z - fish.position.z) - Math.hypot(b.x - fish.position.x, b.z - fish.position.z));
  const stone = candidates[0];
  if (stone) {
    const c = new THREE.Vector3(stone.x, stone.y, stone.z);
    const toStone = c.clone().sub(fish.position).setY(0).normalize();
    const behind = c.clone().addScaledVector(toStone, stone.r + 0.8 * L);
    behind.y = Math.max(ground(behind) + 0.55 * L, stone.y - stone.ry * 0.2);
    items.length = 0;
    items.push({ x: behind.x, y: behind.y, z: behind.z, place: "back", weapon: "piu", state: "idle", age: 4, stage: fish.stage });
    const eye = c.clone().addScaledVector(toStone, -(stone.r + 2.8 * L));
    eye.y = behind.y + 0.1 * L;
    salmon.view(eye.toArray(), behind.toArray(), 0.01);
    await picture(ctx, "hinter-stein", draw);
    record.push({ label: "stone", r: +stone.r.toFixed(2), ry: +stone.ry.toFixed(2) });
    // Wider: the column shows where the capsule is.
    salmon.view(c.clone().addScaledVector(toStone, -(stone.r + 5 * L)).setY(behind.y + 0.9 * L).toArray(), behind.clone().setY(behind.y + 0.8 * L).toArray(), 0.01);
    await picture(ctx, "hinter-stein-weit", draw);
  } else record.push({ label: "no stone near" });
  record.push({ label: "anchor", shows: capsules.anchor(0, docked), matrix: docked.elements.map((v) => +v.toFixed(3)) });
}

// What the models cost: 24 larvae of each kind and 24 capsules in view, the frame timed with
// and without them, back to back and waited for, several times over.
async function costScene(ctx, record) {
  const { salmon } = ctx;
  const { fish, THREE, course, scene, renderer } = salmon;
  const larvae = createLarvae(scene, { capacity: 24, light });
  const capsules = createCapsules(scene, { capacity: 24, light });
  const { ahead, left, up } = frameOf(salmon);
  const spot = {};
  const ground = (p) => {
    course.locate(p.x, p.z, fish.river.s, spot);
    return course.bed(spot.s, spot.u);
  };
  await salmon.run(0.2);
  const rest = restOn(salmon);
  const list = [];
  const items = [];
  // The larvae in rows on the gravel ahead of the alevin, the capsules (the alevin's own size)
  // hanging over the gravel among them.
  for (let i = 0; i < 48; i++) {
    const row = Math.floor(i / 8),
      col = i % 8;
    const kind = i % 2 ? "beetleLarva" : "dragonflyLarva";
    const size = kind === "beetleLarva" ? 0.52 : 0.4;
    const p = rest(fish.position.clone().addScaledVector(ahead, 0.7 + row * 0.42).addScaledVector(left, (col - 3.5) * 0.36), size);
    list.push(larva(THREE, kind, p, ahead.clone().negate().applyAxisAngle(up, (col - 3.5) * 0.2), size, { id: i + 1, phase: i * 0.7, mode: i % 5 === 0 ? "strike" : "approach", t: 0.1, gape: i % 5 === 0 ? 1 : 0.08 }));
  }
  for (let i = 0; i < 24; i++) {
    const p = fish.position.clone().addScaledVector(ahead, 1 + Math.floor(i / 6) * 0.6).addScaledVector(left, ((i % 6) - 2.5) * 0.5);
    p.y = ground(p) + 0.45;
    items.push({ x: p.x, y: p.y, z: p.z, place: i % 2 ? "belly" : "back", weapon: "piu", state: "idle", age: 4 + i, stage: fish.stage });
  }
  // Seen from above and behind the grid, as the game's camera sees the redd round an alevin.
  const middle = list[27].position.clone();
  const eye = middle.clone().addScaledVector(ahead, -1.9).addScaledVector(up, 1.25);
  salmon.view(eye.toArray(), middle.toArray(), 0.01);
  const groups = { larvae: larvae.meshes, capsules: Object.values(capsules.meshes) };
  const show = (which) => {
    for (const [name, meshes] of Object.entries(groups)) for (const m of meshes) m.visible = which.includes(name);
  };
  larvae.draw(list);
  capsules.draw(items, 7.5);
  await picture(ctx, "alle", () => {
    larvae.draw(list);
    capsules.draw(items, 7.5);
  });
  // Frames back to back and waited for (the card's whole frame; per-pass timestamps overlap
  // on Apple's GPUs), the configurations taken in turn, round after round, so a slow spell of
  // the machine falls on all of them alike.
  const sync = async () => {
    const device = renderer.backend?.device;
    if (device) return device.queue.onSubmittedWorkDone();
    const gl = renderer.backend?.gl ?? renderer.getContext?.();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  };
  const frame = async (n = 40) => {
    await sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) salmon.draw(0);
    await sync();
    return (performance.now() - t0) / n;
  };
  renderer.setSize(1280, 720, false);
  for (let i = 0; i < 20; i++) salmon.draw(0);
  // And the models alone: only layer 1 (theirs, with the effects and enemies, none of which
  // are about here) drawn straight to the screen, so the rest of the frame's time -- and its
  // noise, when other work shares the card -- stays out of it. (An upper bound: in the game
  // the gravel hides some of their pixels before they are shaded.)
  const { camera } = salmon;
  const alone = async (n = 60) => {
    const mask = camera.layers.mask;
    camera.layers.set(1);
    renderer.setRenderTarget(null);
    await sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) renderer.render(scene, camera);
    await sync();
    camera.layers.mask = mask;
    return (performance.now() - t0) / n;
  };
  const configurations = { none: [], larvae: ["larvae"], capsules: ["capsules"], both: ["larvae", "capsules"] };
  const times = Object.fromEntries(Object.keys(configurations).map((k) => [k, []]));
  const only = Object.fromEntries(Object.keys(configurations).map((k) => [k, []]));
  for (let round = 0; round < 15; round++) {
    for (const [name, which] of Object.entries(configurations)) {
      show(which);
      times[name].push(await frame());
      only[name].push(await alone());
    }
    await nextTask();
  }
  show(["larvae", "capsules"]);
  const stats = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return { median: +s[Math.floor(s.length / 2)].toFixed(3), min: +s[0].toFixed(3), max: +s.at(-1).toFixed(3) };
  };
  // What each adds, round by round against the round's own frame without them.
  const added = (name, t = times) => stats(t[name].map((v, i) => v - t.none[i]));
  // The processor's side: draw() of both, with everything posed.
  const cpu = (fn, n = 2000) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn(i);
    return +(((performance.now() - t0) / n) * 1000).toFixed(2);
  };
  const larvaMicros = cpu((i) => {
    for (const e of list) e.phase = i * 0.01;
    larvae.draw(list);
  });
  const capsuleMicros = cpu((i) => capsules.draw(items, 7.5 + i * 0.016));
  record.push({
    label: "cost",
    backend: renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2",
    light,
    larvae: list.length,
    capsules: items.length,
    triangles: { larvaOfEachKind: larvae.triangles, capsule: trianglesOf(Object.values(capsules.meshes)) },
    frame: Object.fromEntries(Object.keys(times).map((k) => [k, stats(times[k])])),
    added: { larvae: added("larvae"), capsules: added("capsules"), both: added("both") },
    alone: Object.fromEntries(Object.keys(only).map((k) => [k, stats(only[k])])),
    addedAlone: { larvae: added("larvae", only), capsules: added("capsules", only), both: added("both", only) },
    drawMicroseconds: { larvae: larvaMicros, capsules: capsuleMicros },
  });
}

// ---- Views of the models as the player meets them, and in profile, for judging their shapes
// and states side by side (the same cameras as the review of the first models used).

// Frames drawn one at a time as the game draws them (one draw a frame, no settling), for
// grain and shimmer in motion.
async function frames(ctx, name, n, perFrame) {
  const { salmon } = ctx;
  const { renderer, post, camera } = salmon;
  const canvas = renderer.domElement;
  const bounds = canvas.getBoundingClientRect();
  renderer.setSize(1280, 720, false);
  post.setSize(1280, 720, 1280 / bounds.width, 1280, 720);
  camera.aspect = 1280 / 720;
  camera.updateProjectionMatrix();
  for (let i = 0; i < n; i++) {
    await salmon.run(1 / 30);
    perFrame(i);
    ctx.extreme.frame(1 / 30);
    perFrame(i);
    salmon.draw(1 / 30);
    const image = canvas.toDataURL("image/jpeg", 0.92);
    await fetch(`/__capture/${ctx.set}/${ctx.scene.name}-${name}-${String(i).padStart(2, "0")}`, { method: "POST", body: image });
  }
}

// The game's own camera for a fish at `at` looking along yaw and pitch (placeCamera in
// main.js, without its lag).
function gameEye(salmon, at, yaw, pitch, L) {
  const { THREE } = salmon;
  const distance = L * 1.9 + 0.1;
  const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
  const eye = at.clone().addScaledVector(dir, -distance * 0.92);
  eye.y += distance * 0.36;
  const aim = at.clone().addScaledVector(dir, L * 1.2 + 0.05);
  aim.y += L * 0.3;
  return { eye, aim };
}

// Where a point lands in the 1280 by 720 picture (and its depth there).
function project(salmon, p) {
  const v = p.clone().project(salmon.camera);
  return [Math.round((v.x * 0.5 + 0.5) * 1280), Math.round((-v.y * 0.5 + 0.5) * 720), +v.z.toFixed(4)];
}

Object.assign(SCENES, {
  // Silhouettes: the two side by side, straight from above and from the side; each alone from
  // above; the dragonfly larva's face head on.
  async "larven-profil"(ctx, record) {
    const { salmon } = ctx;
    const { fish, scene, THREE, course } = salmon;
    const larvae = createLarvae(scene, { capacity: 24, light });
    debugLarvae(larvae, query.get("xdebug"));
    const { ahead, left } = frameOf(salmon);
    const rest = restOn(salmon);
    await salmon.run(0.2);
    const list = [];
    const draw = () => larvae.draw(list);
    const middle = fish.position.clone().addScaledVector(ahead, 0.8);
    const a = rest(middle.clone().addScaledVector(left, 0.2), 0.52);
    const b = rest(middle.clone().addScaledVector(left, -0.2), 0.42);
    // Both facing across the picture, so from the side they are in profile.
    list.push(larva(THREE, "beetleLarva", a, left, 0.52, { id: 2, phase: 0.9 }));
    list.push(larva(THREE, "dragonflyLarva", b, left, 0.42, { id: 3, phase: 0.9 }));
    const spot = {};
    course.locate(middle.x, middle.z, fish.river.s, spot);
    const surface = course.level(spot.s);
    const c = a.clone().add(b).multiplyScalar(0.5);
    salmon.view([c.x + 0.001, Math.min(c.y + 1.1, surface - 0.06), c.z], c.toArray(), 0.01);
    await picture(ctx, "oben", draw);
    const side = c.clone().addScaledVector(ahead, -1.25);
    side.y = c.y + 0.05;
    salmon.view(side.toArray(), c.toArray(), 0.01);
    await picture(ctx, "seite", draw);
    for (const [e, name] of [
      [list[0], "kaefer-oben"],
      [list[1], "libelle-oben"],
    ]) {
      const t = e.position;
      salmon.view([t.x + 0.001, Math.min(t.y + e.size * 1.35, surface - 0.06), t.z], t.toArray(), 0.01);
      await picture(ctx, name, draw);
    }
    const d = list[1];
    const face = d.position.clone().addScaledVector(d.heading, d.size * 1.1);
    face.y += d.size * 0.12;
    salmon.view(face.toArray(), d.position.clone().addScaledVector(d.heading, d.size * 0.3).toArray(), 0.005);
    await picture(ctx, "libelle-gesicht", draw);
  },

  // The mask through an attack, in profile and as the player sees it coming.
  async "larven-maske"(ctx) {
    const { salmon } = ctx;
    const { fish, scene, THREE } = salmon;
    const larvae = createLarvae(scene, { capacity: 24, light });
    const { ahead, left } = frameOf(salmon);
    const rest = restOn(salmon);
    await salmon.run(0.2);
    const at = rest(fish.position.clone().addScaledVector(ahead, 0.7), 0.42);
    const e = larva(THREE, "dragonflyLarva", at, left, 0.42, { phase: 1.1 });
    const list = [e];
    const draw = () => larvae.draw(list);
    const steps = [
      ["a-kriecht", "approach", 0],
      ["b-coil", "coil", 0.3],
      ["c-strike-0.02", "strike", 0.02],
      ["d-strike-0.04", "strike", 0.04],
      ["e-strike-0.08", "strike", 0.08],
      ["f-strike-0.2", "strike", 0.2],
      ["g-recover-0.08", "recover", 0.08],
      ["h-recover-0.25", "recover", 0.25],
    ];
    const profile = () => {
      const eye = e.position.clone().addScaledVector(ahead, -e.size * 1.6).addScaledVector(e.heading, e.size * 0.35);
      eye.y = e.position.y + e.size * 0.05;
      salmon.view(eye.toArray(), e.position.clone().addScaledVector(e.heading, e.size * 0.35).toArray(), 0.005);
    };
    const game = () => {
      const eye = e.position.clone().addScaledVector(e.heading, e.size * 2.6);
      eye.y = e.position.y + e.size * 1.1;
      salmon.view(eye.toArray(), e.position.clone().addScaledVector(e.heading, e.size * 0.4).toArray(), 0.005);
    };
    for (const [name, mode, t] of steps) {
      e.mode = mode;
      e.t = t;
      e.gape = mode === "strike" ? 1 : mode === "coil" ? 0.35 : 0.08;
      profile();
      await picture(ctx, `seite-${name}`, draw);
      game();
      await picture(ctx, `vorn-${name}`, draw);
    }
    // Held back (t below 0 in recover, as when the player has gone down): the mask stays in.
    e.mode = "recover";
    e.t = -3;
    e.gape = 0.08;
    game();
    await picture(ctx, "vorn-i-zurueckgehalten", draw);
  },

  // Dead: half and wholly on its back, as the player's camera sees it and from low aside, laid
  // where the enemy system lays a corpse.
  async "larven-tot"(ctx) {
    const { salmon } = ctx;
    const { fish, scene, THREE } = salmon;
    const larvae = createLarvae(scene, { capacity: 24, light });
    const { ahead, left, up } = frameOf(salmon);
    const rest = restOn(salmon);
    await salmon.run(0.2);
    const list = [];
    const draw = () => larvae.draw(list);
    for (const [kind, size] of [
      ["beetleLarva", 0.52],
      ["dragonflyLarva", 0.42],
    ]) {
      for (const [rolled, tag] of [
        [Math.PI * 0.5, "halb"],
        [Math.PI, "ganz"],
      ]) {
        const at = rest(fish.position.clone().addScaledVector(ahead, 0.8), size, { dead: true });
        list.length = 0;
        list.push(larva(THREE, kind, at, left.clone().applyAxisAngle(up, 0.5), size, { dead: true, rolled, corpse: 3, mode: "dead", gape: 0.35 }));
        const { eye } = gameEye(salmon, fish.position, Math.atan2(ahead.z, ahead.x), -0.25, 0.26);
        salmon.view(eye.toArray(), at.toArray(), 0.01);
        await picture(ctx, `${kind}-${tag}-spiel`, draw);
        const low = at.clone().addScaledVector(ahead, -size * 1.3).addScaledVector(left, size * 0.3);
        low.y = at.y + size * 0.25;
        salmon.view(low.toArray(), at.toArray(), 0.005);
        await picture(ctx, `${kind}-${tag}-seite`, draw);
      }
    }
  },

  // On the slopes of the redd's stones, and swimming up: each larva placed and tilted as the
  // enemy system does it (fv/ground.js: the ground under its middle and under its head), seen
  // from the side beside the same pose left level; then drawn up and striking on the slope; then
  // swimming up to the alevin, the beetle larva rowing and the dragonfly larva with its legs laid
  // back, their shadows left on the ground below.
  async "larven-hang"(ctx, record) {
    const { salmon } = ctx;
    const { fish, scene, THREE, course, terrain, pebbles } = salmon;
    const larvae = createLarvae(scene, { capacity: 24, light });
    const { ahead, left, up } = frameOf(salmon);
    await salmon.run(0.2);
    const ground = createGround({ terrain, pebbles });
    ground.refresh(fish.position, 6);
    const spot = {};
    const heightAt = (x, z) => {
      course.locate(x, z, fish.river.s, spot);
      return ground.height(x, z, course.bed(spot.s, spot.u));
    };
    const list = [];
    // (Each pose a new id: the models then take its tilt and its walking or swimming at once,
    // not eased from the pose before.)
    let id = 10;
    const draw = () => larvae.draw(list);
    // A larva walking at (x, z) along (hx, hz), where enemies.js would put it and tilt it.
    const walker = (kind, size, x, z, hx, hz, more = {}) => {
      const reach = 0.4 * size;
      const low = heightAt(x, z) + 0.08 * size;
      const head = heightAt(x + hx * reach, z + hz * reach) + 0.08 * size;
      const e = larva(THREE, kind, new THREE.Vector3(x, low, z), new THREE.Vector3(hx, 0, hz), size, { id: id++, grounded: true, climbing: false, tilt: Math.atan2(head - low, reach), phase: 0.9, ...more });
      return e;
    };
    // The steepest even slope near the fish for a larva `size` long, facing up it (sign 1) or
    // down it (-1): the ground rising about as much from its tail to its middle as from its
    // middle to its head (a stone's flank, not the edge of a pebble), off the alevin's stone.
    const slope = (size, sign) => {
      const reach = 0.4 * size;
      let best = null;
      for (let i = -22; i <= 22; i++)
        for (let j = -22; j <= 22; j++) {
          const x = fish.position.x + i * 0.06,
            z = fish.position.z + j * 0.06;
          if (Math.hypot(x - fish.position.x, z - fish.position.z) < 0.4) continue;
          const mid = heightAt(x, z);
          for (let a = 0; a < 12; a++) {
            const hx = Math.cos((a * Math.PI) / 6),
              hz = Math.sin((a * Math.PI) / 6);
            const front = heightAt(x + hx * reach, z + hz * reach) - mid;
            const back = mid - heightAt(x - hx * reach, z - hz * reach);
            const tilt = Math.atan2(front, reach) * sign;
            if (tilt < 0.15 || tilt > 0.6 || Math.abs(front - back) > 0.3 * Math.abs(front)) continue;
            if (!best || tilt > best.tilt) best = { x, z, hx, hz, tilt };
          }
        }
      return best;
    };
    // From the side, a little above it, on whichever side has more water under the eye (not
    // inside the stone it climbs).
    const side = (e, distance = 1.25, height = 0.2) => {
      const across = up.clone().cross(new THREE.Vector3(e.heading.x, 0, e.heading.z)).normalize();
      const at = e.position.clone().addScaledVector(new THREE.Vector3(e.heading.x, 0, e.heading.z).normalize(), 0.1 * e.size);
      let eye = null,
        room = -Infinity;
      for (const sign of [1, -1]) {
        const p = at.clone().addScaledVector(across, sign * distance * e.size).addScaledVector(up, height * e.size);
        const clear = p.y - heightAt(p.x, p.z);
        if (clear > room) [eye, room] = [p, clear];
      }
      salmon.view(eye.toArray(), at.toArray(), 0.004);
    };
    for (const [kind, size, sign, tag] of [
      ["beetleLarva", 0.55, 1, "kaefer-bergauf"],
      ["dragonflyLarva", 0.42, 1, "libelle-bergauf"],
      ["beetleLarva", 0.55, -1, "kaefer-bergab"],
      ["dragonflyLarva", 0.42, -1, "libelle-bergab"],
    ]) {
      const s = slope(size, sign);
      record.push({ tag, slope: s && { tilt: +(s.tilt * sign).toFixed(3) } });
      if (!s) continue;
      list.length = 0;
      const e = walker(kind, size, s.x, s.z, s.hx, s.hz);
      list.push(e);
      side(e);
      await picture(ctx, tag, draw);
      // The same, level (as the models stood before they were tilted).
      list[0] = { ...e, id: id++, grounded: undefined, climbing: undefined, tilt: 0 };
      await picture(ctx, `${tag}-flach`, draw);
      if (sign > 0) {
        // Drawn up and striking on the way up the slope: the rear comes on top of the tilt.
        list[0] = { ...e, id: id++, mode: "coil", t: 0.3, gape: 0.35 };
        await picture(ctx, `${tag}-coil`, draw);
        list[0] = { ...e, id: id++, mode: "strike", t: 0.1, gape: 1, phase: 1.1 };
        await picture(ctx, `${tag}-strike`, draw);
      }
    }

    // Swimming up: each walks a moment on the gravel ahead of the alevin (so its shadow knows
    // the ground), then swims up toward the fish, heading at it and tilted by that: first a
    // little off the gravel (its shadow still under it), then most of the way up, where the
    // player's camera finds it.
    list.length = 0;
    const climbers = [];
    for (const [kind, size, across] of [
      ["beetleLarva", 0.55, 0.5],
      ["dragonflyLarva", 0.42, -0.5],
    ]) {
      const x = fish.position.x + ahead.x * 1.3 + left.x * across,
        z = fish.position.z + ahead.z * 1.3 + left.z * across;
      const e = walker(kind, size, x, z, -ahead.x, -ahead.z, { phase: 1.7 });
      e.floor = e.position.y;
      list.push(e);
      climbers.push(e);
    }
    for (let i = 0; i < 3; i++) larvae.draw(list, 1 / 30);
    const climb = (share) => {
      for (const e of climbers) {
        e.position.y = e.floor + share * (fish.position.y - e.floor);
        const to = fish.position.clone().sub(e.position).normalize();
        e.heading.copy(to);
        Object.assign(e, { grounded: false, climbing: true, tilt: Math.asin(to.y) });
      }
      // (A second of swimming: the legs have gone over to it.)
      for (let i = 0; i < 30; i++) {
        for (const e of climbers) e.phase += (Math.PI * 2 * 2.5) / 30;
        larvae.draw(list, 1 / 30);
      }
    };
    climb(0.15);
    record.push({
      fishAbove: +(fish.position.y - heightAt(fish.position.x, fish.position.z)).toFixed(3),
      low: climbers.map((e) => ({ kind: e.kind, tilt: +e.tilt.toFixed(3), above: +(e.position.y - e.floor).toFixed(3) })),
    });
    for (const [e, tag] of [
      [climbers[0], "kaefer-schwimmt"],
      [climbers[1], "libelle-schwimmt"],
    ]) {
      side(e, 1.5, 0.05);
      await picture(ctx, tag, draw);
    }
    // From aside and a little below them, their shadows on the gravel they left.
    const c = climbers[0].position.clone().add(climbers[1].position).multiplyScalar(0.5);
    const d = c.clone().sub(fish.position);
    const across = up.clone().cross(new THREE.Vector3(d.x, 0, d.z)).normalize();
    const floor = Math.min(...climbers.map((e) => e.floor));
    const low = c.clone().addScaledVector(across, 1.8);
    low.y = c.y;
    salmon.view(low.toArray(), [c.x, (c.y + floor) / 2, c.z], 0.01);
    await picture(ctx, "schwimmen-seite", draw);
    // Most of the way up, as the player sees them: the game's camera turned toward them as the
    // scenes' pilot turns it.
    climb(0.7);
    record.push({ high: climbers.map((e) => ({ kind: e.kind, tilt: +e.tilt.toFixed(3), above: +(e.position.y - e.floor).toFixed(3) })) });
    const m = climbers[0].position.clone().add(climbers[1].position).multiplyScalar(0.5).sub(fish.position);
    const pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(m.y, Math.hypot(m.x, m.z))));
    const { eye, aim } = gameEye(salmon, fish.position, Math.atan2(m.z, m.x), pitch, fish.length);
    salmon.view(eye.toArray(), aim.toArray(), 0.01);
    await picture(ctx, "schwimmen-spiel", draw);
    // (Where the fish, the larvae and the ground under them land in that picture.)
    const under = (p) => new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z);
    record.push({ spiel: { fish: project(salmon, fish.position), fishGround: project(salmon, under(fish.position)), larvae: climbers.map((e) => project(salmon, e.position)), larvaeGround: climbers.map((e) => project(salmon, under(e.position))) } });
  },

  // What the player sees: the game's camera behind the alevin, larvae crawling toward it at
  // 1, 2 and 3.5 units, on the pebbles and (bed) on the bed alone; each picture also without
  // the larvae, for the difference they make.
  async "larven-distanz"(ctx, record) {
    const { salmon } = ctx;
    const { fish, scene, THREE } = salmon;
    const larvae = createLarvae(scene, { capacity: 24, light });
    const { ahead, left, up } = frameOf(salmon);
    const rest = restOn(salmon);
    await salmon.run(0.2);
    const list = [];
    const draw = () => larvae.draw(list);
    const yaw = Math.atan2(ahead.z, ahead.x);
    const L = fish.length;
    for (const bedOnly of [false, true]) {
      list.length = 0;
      let id = 1;
      for (const [d, across] of [
        [1, -0.25],
        [2, 0.35],
        [3.5, -0.4],
      ]) {
        const pb = rest(fish.position.clone().addScaledVector(ahead, d).addScaledVector(left, across), 0.52, { bedOnly });
        const pd = rest(fish.position.clone().addScaledVector(ahead, d + 0.15).addScaledVector(left, across + 0.45), 0.4, { bedOnly });
        list.push(larva(THREE, "beetleLarva", pb, ahead.clone().negate().applyAxisAngle(up, 0.3), 0.52, { id: id++, phase: d }));
        list.push(larva(THREE, "dragonflyLarva", pd, ahead.clone().negate().applyAxisAngle(up, -0.3), 0.4, { id: id++, phase: d * 2 }));
      }
      for (const pitch of [0, -0.3]) {
        const { eye, aim } = gameEye(salmon, fish.position, yaw, pitch, L);
        salmon.view(eye.toArray(), aim.toArray(), 0.02);
        const tag = `${bedOnly ? "logik" : "kiesel"}-p${pitch}`;
        await picture(ctx, tag, draw);
        record.push({ tag, L, points: list.map((e) => ({ kind: e.kind, d: +e.position.distanceTo(eye).toFixed(2), px: project(salmon, e.position) })) });
        for (const m of larvae.meshes) m.visible = false;
        await picture(ctx, `${tag}-ohne`, draw);
        for (const m of larvae.meshes) m.visible = true;
      }
    }
  },

  // Crawling in motion, one draw a frame, the camera drifting: grain and shimmer.
  async "larven-bewegung"(ctx) {
    const { salmon } = ctx;
    const { fish, scene, THREE } = salmon;
    const larvae = createLarvae(scene, { capacity: 24, light });
    const { ahead, left } = frameOf(salmon);
    const rest = restOn(salmon);
    await salmon.run(0.2);
    const b = larva(THREE, "beetleLarva", rest(fish.position.clone().addScaledVector(ahead, 1.0).addScaledVector(left, 0.18), 0.52), ahead.clone().negate(), 0.52, { id: 1 });
    const d = larva(THREE, "dragonflyLarva", rest(fish.position.clone().addScaledVector(ahead, 1.05).addScaledVector(left, -0.22), 0.4), ahead.clone().negate(), 0.4, { id: 2 });
    const list = [b, d];
    const startB = b.position.clone(),
      startD = d.position.clone();
    const mid = startB.clone().add(startD).multiplyScalar(0.5);
    const yaw = Math.atan2(ahead.z, ahead.x);
    await frames(ctx, "nah", 24, (i) => {
      const t = i / 30;
      b.phase = t * 6.28 * 1.4;
      d.phase = t * 6.28 * 1.6;
      b.position.copy(startB).addScaledVector(b.heading, t * 0.12);
      d.position.copy(startD).addScaledVector(d.heading, t * 0.1);
      const eye = mid.clone().addScaledVector(ahead, -0.75).addScaledVector(left, -0.3 + t * 0.25);
      eye.y = mid.y + 0.3;
      salmon.view(eye.toArray(), mid.toArray(), 0.01);
      larvae.draw(list);
    });
    const { eye, aim } = gameEye(salmon, fish.position, yaw, -0.1, fish.length);
    await frames(ctx, "spiel", 24, (i) => {
      const t = i / 30;
      b.phase = t * 6.28 * 1.4;
      d.phase = t * 6.28 * 1.6;
      salmon.view(eye.clone().addScaledVector(left, t * 0.1).toArray(), aim.toArray(), 0.02);
      larvae.draw(list);
    });
  },

  // The live redd with the game's own camera (the pilot steering), each larva's place in the
  // picture written down, and the picture taken again without them. The pictures come a few
  // seconds after each wave arrives (the pilot soon shoots it away), or, with the scene's
  // `nofire`, as the larvae reach the alevin.
  async "larven-redd"(ctx, record) {
    await reddScene(ctx, record);
  },
  async "larven-redd-wehrlos"(ctx, record) {
    await reddScene(ctx, record);
  },
});

async function reddScene(ctx, record) {
  const { salmon, extreme } = ctx;
  const { fish, scene, look, held } = salmon;
  const combat = extreme.combat;
  const larvae = createLarvae(scene, { capacity: 24, light });
  for (const kind of ["dragonflyLarva", "beetleLarva"]) combat.enemies.drawnBy?.(kind);
  extreme.testing = true;
  const steer = () => pilot(salmon, combat, () => larvae.draw(combat.enemies.list), !ctx.scene.nofire);
  const draw = () => larvae.draw(combat.enemies.list);
  let last = 0;
  for (const [t, name] of (ctx.scene.nofire ? [15, 35, 60] : [8, 31, 58]).map((t, i) => [t, String(i + 1)])) {
    await salmon.run(t - last, steer);
    last = t;
    await picture(ctx, name, draw);
    const cam = salmon.camera.position.clone();
    record.push({
      t,
      fish: fish.position.toArray().map((v) => +v.toFixed(2)),
      fishOverBed: +(fish.position.y - salmon.course.bed(fish.river.s, fish.river.u)).toFixed(2),
      pitch: +look.pitch.toFixed(2),
      larvae: combat.enemies.list
        .filter((e) => e.spec?.render === "larva")
        .map((e) => ({ kind: e.kind, mode: e.mode, dead: e.dead, climbing: e.climbing, tilt: e.tilt === undefined ? undefined : +e.tilt.toFixed(2), size: +e.size.toFixed(2), dFish: +e.position.distanceTo(fish.position).toFixed(2), dCam: +e.position.distanceTo(cam).toFixed(2), dy: +(e.position.y - fish.position.y).toFixed(2), px: project(salmon, e.position) })),
    });
    for (const m of larvae.meshes) m.visible = false;
    await picture(ctx, `${name}-ohne`, draw);
    for (const m of larvae.meshes) m.visible = true;
  }
  held.delete("KeyS");
  combat.fire(false);
}

Object.assign(SCENES, {
  // Capsules as the parr meets them: the game's camera, capsules 3, 6 and 10 lengths ahead
  // (the size pickups.js gives them), in motion, and one taken as the fish swims through it.
  async "kapsel-spiel"(ctx, record) {
    const { salmon } = ctx;
    const { fish, THREE, course, scene } = salmon;
    const capsules = createCapsules(scene, { capacity: 24, light });
    const stand = new THREE.Group();
    const metal = new THREE.MeshStandardNodeMaterial({ color: 0x2a2d30, metalness: 0.8, roughness: 0.35 });
    stand.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.1).translate(-0.12, 0, 0), metal));
    stand.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 12).rotateZ(Math.PI / 2).translate(0.25, 0.03, 0), metal));
    const stands = [];
    const docked = new THREE.Matrix4();
    const { ahead, left, up } = frameOf(salmon);
    const L = fish.length;
    const spot = {};
    const ground = (p) => {
      course.locate(p.x, p.z, fish.river.s, spot);
      return course.bed(spot.s, spot.u);
    };
    await salmon.run(0.2);
    const items = [];
    for (const [d, across, h] of [
      [3, 0.5, 0],
      [6, -0.9, -0.2],
      [10, 0.8, 0.1],
    ]) {
      const p = fish.position.clone().addScaledVector(ahead, d * L).addScaledVector(left, across * L);
      p.y = Math.max(ground(p) + 0.5 * L, fish.position.y + h * L);
      items.push({ x: p.x, y: p.y, z: p.z, place: "back", weapon: "piu", state: "idle", age: 5, stage: fish.stage, size: 0.4 + 0.25 * L });
      const s = stand.clone();
      s.matrixAutoUpdate = false;
      scene.add(s);
      stands.push(s);
    }
    let time = 20;
    const draw = () => {
      capsules.draw(items, time);
      stands.forEach((s, i) => {
        const shown = capsules.anchor(i, docked);
        s.visible = shown > 0;
        if (shown > 0) s.matrix.copy(docked);
        s.matrixWorldNeedsUpdate = true;
      });
    };
    const yaw = Math.atan2(ahead.z, ahead.x);
    record.push({ label: "fish", L, stage: fish.stage });
    for (const pitch of [0, 0.25]) {
      const { eye, aim } = gameEye(salmon, fish.position, yaw, pitch, L);
      salmon.view(eye.toArray(), aim.toArray(), 0.03);
      await picture(ctx, `spiel-p${pitch}`, draw);
      record.push({ pitch, points: items.map((it) => ({ d: +eye.distanceTo(new THREE.Vector3(it.x, it.y, it.z)).toFixed(2), px: project(salmon, new THREE.Vector3(it.x, it.y, it.z)) })) });
    }
    const { eye, aim } = gameEye(salmon, fish.position, yaw, 0.1, L);
    await frames(ctx, "lauf", 20, (i) => {
      time = 20 + i / 30;
      salmon.view(eye.clone().addScaledVector(ahead, i * 0.01 * L).toArray(), aim.toArray(), 0.03);
      draw();
    });
    // Late in a long game (the clock far on): the column must rise as smoothly as at the start.
    await frames(ctx, "spaet", 6, (i) => {
      time = 3000 + i / 30;
      salmon.view(eye.toArray(), aim.toArray(), 0.03);
      draw();
    });
    const c0 = new THREE.Vector3(items[0].x, items[0].y, items[0].z);
    salmon.view(c0.clone().addScaledVector(ahead, -2.2 * L).addScaledVector(left, -0.4 * L).addScaledVector(up, 0.3 * L).toArray(), c0.toArray(), 0.03);
    time = 30;
    draw();
    items[0].state = "taken";
    await frames(ctx, "genommen", 24, (i) => {
      time = 30 + i / 30;
      items[0].age = i / 30;
      items[0].takenAge = i / 30;
      draw();
    });
  },
});
