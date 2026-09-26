// The look scenes of the models in look/ (listed in src/fv/dev/scenes-look.js): the game is
// loaded at the scene's stage and place, the models are made here (as combat would make them),
// posed by hand or fed by the game, and pictured close up from several sides. Warnings the
// page prints (the shader builders print theirs there) go into the report with the errors.

import { attribute, normalView, vec3 } from "three/tsl";
import { createCapsules } from "../capsule.js";
import { createLarvae } from "../larvae.js";

const nextTask = () => new Promise((r) => setTimeout(r, 0));
const query = new URLSearchParams(location.search);
// As combat would make them: light on the Niedrig quality (and with ?xlight).
const light = query.has("xlight") || query.get("quality") === "eco";

// For looking into the shading (?xdebug=paint: the painted colours unlit; ?xdebug=normal:
// the shading normal as a colour).
function debugLarvae(larvae, mode) {
  if (!mode) return;
  for (const mesh of larvae.meshes) {
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

// A place on the gravel for something `size` long near p: on the bed, or on the tops of the
// pebbles there if they stand higher (the redd's gravel is a layer of stones on the bed).
function restOn(salmon) {
  const { fish, course, pebbles } = salmon;
  const spot = {},
    stones = [];
  return (p, size) => {
    course.locate(p.x, p.z, fish.river.s, spot);
    let top = course.bed(spot.s, spot.u);
    stones.length = 0;
    pebbles.near(p, size, stones);
    for (const c of stones) if (Math.hypot(c.x - p.x, c.z - p.z) < c.r + size * 0.25) top = Math.max(top, c.y + c.ry * 0.85);
    p.y = top + size * 0.12;
    return p;
  };
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
    look(e, [0.3, 0.75, 0.62], 0);
    await picture(ctx, "kaefer-tot", draw);

    // The dragonfly larva: crawling, drawn up (coil), the mask shooting out and out, dead.
    e = pose("dragonflyLarva", 0.42, { phase: 2.6 });
    look(e, [0.4, 0.45, 0.8]);
    await picture(ctx, "libelle-kriecht", draw);
    look(e, [0.95, 0.35, 0.3], 0.25);
    await picture(ctx, "libelle-vorn", draw);
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
    const steer = () => {
      held.add("KeyS");
      const live = combat.enemies.list.filter((e) => !e.dead);
      if (live.length) {
        const near = live.reduce((a, e) => (e.position.distanceTo(fish.position) < a.position.distanceTo(fish.position) ? e : a));
        const d = near.position.clone().sub(fish.position);
        look.yaw = Math.atan2(d.z, d.x);
        look.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(d.y, Math.hypot(d.x, d.z))));
      }
      combat.fire(live.length > 0 && live.some((e) => e.position.distanceTo(fish.position) < 3));
      larvae.draw(combat.enemies.list);
    };
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
  for (const age of [0.06, 0.18, 0.4, 1.2]) {
    items[0].age = age;
    time = takenAt + age;
    await picture(ctx, `genommen-${age}`, draw);
  }
  // The belly place, and a capsule of each life stage in a row.
  items.length = 0;
  for (let i = 0; i < 6; i++) {
    const p = at.clone().addScaledVector(left, (i - 2.5) * 1.1 * L);
    items.push({ x: p.x, y: p.y, z: p.z, place: i % 2 ? "belly" : "back", weapon: "piu", state: "idle", age: 3 + i, stage: [0, 1, 4, 5, 8, 9][i], size: 0.4 * L });
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
