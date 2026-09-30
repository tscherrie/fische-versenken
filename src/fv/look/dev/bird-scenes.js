// The look scenes of the birds (look/birds.js, listed in src/fv/dev/scenes-look.js): the game is
// loaded at the scene's stage and place, a flock is made here as the enemy system makes its
// own, the birds are posed by hand in each state their plan has -- flying, hovering, plunging,
// swimming, floating, standing, aiming, dead -- and pictured close up from the side, from
// above and from under the water, as the salmon sees them. `vogel-kosten` times what they
// cost. Pictures: shots/<set>/<scene>-<picture>.jpg.

import { KINDS } from "../../kinds.js";
import { createBirds } from "../birds.js";

const nextTask = () => new Promise((r) => setTimeout(r, 0));

export async function runBirdScene(ctx) {
  const { set, scene, errors } = ctx;
  const warnings = [];
  const consoleWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" ").slice(0, 500));
    consoleWarn(...args);
  };
  const record = [{ label: "backend", backend: ctx.salmon.renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2", quality: new URLSearchParams(location.search).get("quality") }];
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

// A place to pose birds: the fish's frame laid flat, the water's surface and bed there.
function stage(salmon) {
  const { fish, THREE, course } = salmon;
  const ahead = fish.heading.clone().setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const left = up.clone().cross(ahead).normalize();
  const spot = {};
  const at = (p) => {
    course.locate(p.x, p.z, fish.river.s, spot);
    return { s: spot.s, u: spot.u, top: course.level(spot.s), floor: course.bed(spot.s, spot.u) };
  };
  return { ahead, left, up, at };
}

// A bird's record as the enemy system keeps one (what birds.js reads).
let ids = 1;
function bird(THREE, kind, position, heading, more = {}) {
  const spec = KINDS[kind];
  return {
    id: ids++,
    kind,
    spec,
    size: 0.5 * (spec.size[0] + spec.size[1]),
    position: position.clone(),
    heading: heading.clone().normalize(),
    velocity: new THREE.Vector3(),
    speed: spec.cruise,
    mode: "circle",
    t: 0.5,
    bank: 0,
    dead: false,
    corpse: 0,
    rolled: 0,
    river: { s: 0, u: 0 },
    ...more,
  };
}

// A picture of posed birds: the game stepped once (so a view just set takes hold), then the
// flock posed for `settle` seconds of their own time (the wings beat on, the eased poses come
// to rest) and drawn.
async function picture(ctx, name, flock, list, settle = 0.6, step = 1 / 60, after = null) {
  await ctx.salmon.run(1 / 60);
  const draw = (dt) => {
    flock.begin(dt);
    for (const e of list) flock.add(e);
    flock.end();
    after?.place(list);
  };
  for (let t = 0; t < settle; t += step) draw(step);
  ctx.extreme.frame(1 / 60);
  draw(0);
  await ctx.salmon.capture(`${ctx.set}/${ctx.scene.name}-${name}`, 1280, 720);
}

// Looking at a point from a place given in the bird's frame ([ahead, up, side] in units).
function looker(salmon, near = 0.02) {
  const { THREE } = salmon;
  return (centre, heading, [f, u, s], target = centre) => {
    const X = heading.clone().setY(0);
    if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
    X.normalize();
    const Z = X.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const eye = centre.clone().addScaledVector(X, f).addScaledVector(Z, s);
    eye.y += u;
    salmon.view(eye.toArray(), target.toArray(), near);
    return eye;
  };
}


// Stand-ins for the weapons the gear strapping makes (models.js), at each bird's mount frames,
// to see where they sit: a gunmetal receiver and barrel along the frame's +x, `length` of the
// bird's size long (the push dagger along the bill, the revolver on the shoulder, the harpoon
// gun along the head, a bomb under each wing root).
const STAND_IN = { kingfisher: 0.3, merganser: 0.32, heron: 0.9, gannet: 0.16 };
function standIns(salmon, flock) {
  const { THREE, scene } = salmon;
  const metal = new THREE.MeshStandardNodeMaterial({ color: 0x2a2d30, metalness: 0.8, roughness: 0.35 });
  const shape = new THREE.Group();
  shape.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.1).translate(0.2, 0.07, 0), metal));
  shape.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 10).rotateZ(Math.PI / 2).translate(0.7, 0.1, 0), metal));
  const pool = [];
  const m = new THREE.Matrix4();
  return {
    place(list) {
      let n = 0;
      for (const e of list)
        for (const name of flock.mountsOf(e.kind)) {
          if (!flock.mount(e, name, m)) continue;
          let g = pool[n];
          if (!g) {
            g = shape.clone();
            g.matrixAutoUpdate = false;
            scene.add(g);
            pool.push(g);
          }
          const k = STAND_IN[e.kind] * e.size;
          g.matrix.copy(m).multiply(new THREE.Matrix4().makeScale(k, k, k));
          g.matrixWorldNeedsUpdate = true;
          g.visible = true;
          n++;
        }
      for (let i = n; i < pool.length; i++) pool[i].visible = false;
    },
  };
}


// A bird as the game runs it: spawned by the enemy system near the salmon, which holds still
// out of harm's way (hit, it takes no damage), nobody else sent; the camera tracks the bird
// from the side (over the water for a bird in the air, under it for a swimmer), a picture the
// first time it is in each state of its plan, and then it is shot dead: falling, afloat.
async function live(ctx, record, kind, { ahead = 6, across = 0, distance, under = false, seconds = 16, height = null } = {}) {
  const { salmon, extreme } = ctx;
  const { fish, THREE, course } = salmon;
  const combat = extreme.combat;
  combat.director.hold(1e6);
  const player = combat.players[0];
  player.safeUntil = Infinity;
  const { ahead: forward, left } = stage(salmon);
  await salmon.run(0.3);
  const p = fish.position.clone().addScaledVector(forward, ahead).addScaledVector(left, across);
  const spot = {};
  course.locate(p.x, p.z, fish.river.s, spot);
  // (For its first frame, a camera toward it, so that it is drawn.)
  const track0 = (bird) => salmon.view(bird.position.clone().add(new THREE.Vector3(0, 2, 0)).addScaledVector(left, distance).toArray(), bird.position.toArray(), 0.02);
  // (Whether its first appearance builds any pipeline: the warm-up should have built them
  // all, so none may be made now.)
  const pipelines = () => salmon.renderer._pipelines?.caches?.size ?? -1;
  salmon.draw(0);
  const before = pipelines();
  const e = combat.enemies.spawn(kind, spot.s, spot.u, height, { heading: forward.clone().multiplyScalar(-1) });
  if (!e) throw new Error(`no ${kind} could be placed here`);
  track0(e);
  await salmon.run(1 / 30);
  extreme.frame(1 / 60);
  salmon.draw(0);
  record.push({ label: "pipelines", before, afterFirstFrame: pipelines(), visible: combat.enemies.birds.meshes.filter((m) => m.visible).map((m) => m.name) });
  const eye = new THREE.Vector3();
  const track = () => {
    const X = e.spec.wades ? e.facing.clone() : e.heading.clone().setY(0);
    if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
    X.normalize();
    const Z = X.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const at = e.spec.wades ? e.stand.clone().setY(e.stand.y + 12) : e.position.clone();
    // (A wader is watched from out on the river it faces: behind it is the bank.)
    if (e.spec.wades) eye.copy(at).addScaledVector(X, distance).addScaledVector(Z, distance * 0.35);
    else eye.copy(at).addScaledVector(Z, distance).addScaledVector(X, distance * 0.3);
    course.locate(eye.x, eye.z, fish.river.s, spot);
    const top = course.level(spot.s),
      floor = course.bed(spot.s, spot.u);
    eye.y = under ? Math.min(top - 0.4, Math.max(floor + 0.5, at.y + distance * 0.1)) : Math.max(top + 0.6, at.y + distance * 0.15);
    salmon.view(eye.toArray(), at.toArray(), 0.02);
  };
  const seen = new Set();
  const notes = [];
  const snap = async (name) => {
    track();
    await salmon.run(1 / 60);
    extreme.frame(1 / 60);
    await salmon.capture(`${ctx.set}/${ctx.scene.name}-${name}`, 1280, 720);
  };
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    track();
    await salmon.run(dt);
    if (e.dead || !combat.enemies.list.includes(e)) break;
    const mode = e.mode;
    if (!seen.has(mode) && (e.t ?? 0) > 0.12) {
      seen.add(mode);
      notes.push({ t: +t.toFixed(2), mode });
      await snap(mode);
    }
  }
  record.push({ label: "modes", notes });
  // Shot dead: the fall, and afloat.
  if (combat.enemies.list.includes(e) && !e.dead) {
    combat.enemies.hit(e, 1e6, new THREE.Vector3(0, -1, 0));
    await salmon.run(0.25);
    await snap("tot-1");
    await salmon.run(2.5);
    await snap("tot-2");
  }
}

const SCENES = {
  // The kingfisher over the brook: in flight, from the side and from above; hovering beak
  // down; plunging; under the water; from under the water; dead on the water; the head close.
  async "vogel-eisvogel"(ctx, record) {
    const { salmon } = ctx;
    const { fish, THREE, scene } = salmon;
    const flock = createBirds(scene);
    record.push({ label: "triangles", perKind: Object.fromEntries(Object.entries(flock.kinds).map(([k, v]) => [k, v.mesh.geometry.index.count / 3])) });
    const { ahead, left, at } = stage(salmon);
    await salmon.run(0.2);
    const look = looker(salmon, 0.01);
    const c = fish.position.clone().addScaledVector(ahead, 4);
    const here = at(c);
    const air = c.clone().setY(here.top + 1.6);
    const river = { s: here.s, u: here.u };
    const e = bird(THREE, "kingfisher", air, ahead, { mode: "circle", river, speed: 4 });
    const list = [e];
    look(air, ahead, [0.4, 0.25, 2.6]);
    await picture(ctx, "flug-seite", flock, list, 0.5);
    await picture(ctx, "flug-seite-2", flock, list, 0.05);
    look(air, ahead, [-0.6, 2.4, 0.3]);
    await picture(ctx, "flug-oben", flock, list, 0.52);
    look(air, ahead, [2.2, 0.3, 1.2]);
    await picture(ctx, "flug-vorn", flock, list, 0.53);
    // The hover over the salmon: the heading down at it.
    const down = ahead.clone().multiplyScalar(0.3).setY(-1).normalize();
    Object.assign(e, { mode: "coil", t: 0.8, heading: down });
    look(air, ahead, [0.3, 0.1, 2.4]);
    await picture(ctx, "ruettelt", flock, list, 0.6);
    look(air, ahead, [1.6, 0.4, 1.4]);
    await picture(ctx, "ruettelt-vorn", flock, list, 0.63);
    // The plunge, half folded and folded.
    const steep = ahead.clone().multiplyScalar(0.35).setY(-1).normalize();
    Object.assign(e, { mode: "strike", t: 0.06, heading: steep });
    e.position.y = here.top + 0.8;
    look(e.position, ahead, [0.2, 0.1, 2.2]);
    await picture(ctx, "stoss", flock, list, 0.05);
    e.t = 0.25;
    await picture(ctx, "stoss-zu", flock, list, 0.3);
    // Under the water, folded, a body length or two in.
    e.position.y = here.top - 1.2;
    look(e.position, ahead, [0.3, -0.1, 2.0]);
    await picture(ctx, "unter-wasser", flock, list, 0.3);
    // From under the water, the bird hovering over it.
    Object.assign(e, { mode: "coil", t: 0.8, heading: down });
    e.position.copy(air);
    const eye = air.clone().setY(here.top - 1.0).addScaledVector(ahead, -1.2);
    salmon.view(eye.toArray(), air.toArray(), 0.01);
    await picture(ctx, "von-unten", flock, list, 0.6);
    Object.assign(e, { mode: "circle", t: 0.5, heading: ahead.clone() });
    await picture(ctx, "von-unten-flug", flock, list, 0.5);
    // Dead: falling, then on the water.
    Object.assign(e, { dead: true, mode: "dead", corpse: 0.25, rolled: 0.75 });
    e.position.copy(air);
    look(air, ahead, [0.3, 0.3, 2.4]);
    await picture(ctx, "tot-faellt", flock, list, 0.25);
    // (Shot in the plunge, its heading still steeply down: on the water it lies level all the
    // same.)
    Object.assign(e, { corpse: 4, rolled: Math.PI, heading: steep.clone() });
    e.position.y = here.top - e.size * 0.07;
    look(e.position, ahead, [0.8, 1.6, 1.6]);
    await picture(ctx, "tot-treibt", flock, list, 1.5);
    look(e.position, ahead, [0.3, 0.35, 2.2]);
    await picture(ctx, "tot-treibt-seite", flock, list, 0.1);
    // The head close, from the side.
    Object.assign(e, { dead: false, mode: "circle", corpse: 0, rolled: 0, heading: ahead.clone() });
    e.position.copy(air);
    look(air.clone().addScaledVector(ahead, 0.5), ahead, [0.1, 0.1, 0.9]);
    await picture(ctx, "kopf", flock, list, 0.4);
    // Where its weapon goes: a stand-in along the bill.
    const arms = standIns(salmon, flock);
    look(air, ahead, [0.9, 0.35, 1.6]);
    await picture(ctx, "waffe", flock, list, 0.3, 1 / 60, arms);
    Object.assign(e, { mode: "coil", t: 0.8, heading: down });
    look(air, ahead, [0.4, 0.2, 2.2]);
    await picture(ctx, "waffe-ruettelt", flock, list, 0.6, 1 / 60, arms);
    arms.place([]);
    record.push({ label: "sizes", kingfisher: e.size, beak: +(e.beak ?? 0).toFixed(3) });
  },

  // The goosander: swimming under water (from the side, from below, from ahead), drawn up and
  // lunging, up on the water for air (from above and from below), dead on the water, the head.
  async "vogel-saeger"(ctx, record) {
    const { salmon } = ctx;
    const { fish, THREE, scene } = salmon;
    const flock = createBirds(scene);
    const { ahead, at } = stage(salmon);
    await salmon.run(0.2);
    const look = looker(salmon, 0.02);
    const c = fish.position.clone().addScaledVector(ahead, 9);
    const here = at(c);
    const mid = c.clone().setY(Math.max(here.floor + 1.2, Math.min(here.top - 1.2, (here.top + here.floor) / 2)));
    const river = { s: here.s, u: here.u };
    const e = bird(THREE, "merganser", mid, ahead, { mode: "approach", river, speed: 4 });
    const list = [e];
    record.push({ label: "water", depth: +(here.top - here.floor).toFixed(2), y: +(mid.y - here.floor).toFixed(2) });
    look(mid, ahead, [0.5, 0.2, 7.5]);
    await picture(ctx, "schwimmt", flock, list, 0.6);
    await picture(ctx, "schwimmt-2", flock, list, 0.2);
    look(mid, ahead, [-1.5, -Math.min(2.5, mid.y - here.floor - 0.3), 3.5], mid.clone().setY(mid.y + 0.5));
    await picture(ctx, "schwimmt-unten", flock, list, 0.3);
    look(mid, ahead, [7, 0.6, 3]);
    await picture(ctx, "schwimmt-vorn", flock, list, 0.3);
    Object.assign(e, { mode: "coil", t: 0.3 });
    look(mid, ahead, [0.5, 0.3, 7]);
    await picture(ctx, "zieht-hals", flock, list, 0.5);
    Object.assign(e, { mode: "strike", t: 0.1 });
    await picture(ctx, "stoesst", flock, list, 0.25);
    // Up for air: lying on the water.
    Object.assign(e, { mode: "breathe", t: 1, speed: 1, heading: ahead.clone().setY(0.15).normalize() });
    e.position.y = here.top - e.size * 0.06;
    look(e.position, ahead, [1.5, 2.6, 7.5]);
    await picture(ctx, "atmet", flock, list, 1.6);
    look(e.position, ahead, [-2, -Math.min(2.5, here.top - here.floor - 0.4), 4], e.position.clone().setY(here.top));
    await picture(ctx, "atmet-unten", flock, list, 0.3);
    // Dead on the water.
    Object.assign(e, { dead: true, mode: "dead", corpse: 5, rolled: Math.PI, heading: ahead.clone() });
    e.position.y = here.top - e.size * 0.07;
    look(e.position, ahead, [2, 3.5, 6]);
    await picture(ctx, "tot", flock, list, 2.5);
    look(e.position, ahead, [0.6, 5.5, 1.2]);
    await picture(ctx, "tot-oben", flock, list, 0.1);
    // Alive on the water, from above: the black back between the folded wings.
    Object.assign(e, { dead: false, mode: "breathe", corpse: 0, rolled: 0, heading: ahead.clone().setY(0.15).normalize() });
    look(e.position, ahead, [0.4, 5, 1.4]);
    await picture(ctx, "atmet-oben", flock, list, 1.6);
    // The head, close, from the side and a little above, on the water.
    Object.assign(e, { dead: false, mode: "breathe", corpse: 0, rolled: 0, heading: ahead.clone().setY(0.15).normalize() });
    e.position.y = here.top - e.size * 0.06;
    look(e.position.clone().addScaledVector(ahead, 2.6), ahead, [0.6, 0.9, 2.6], e.position.clone().addScaledVector(ahead, 2.6).setY(here.top + 0.8));
    await picture(ctx, "kopf", flock, list, 1.6);
    // Where its revolver goes, swimming and on the water.
    const arms = standIns(salmon, flock);
    Object.assign(e, { mode: "aim", t: 0.3, speed: 1, heading: ahead.clone() });
    e.position.copy(mid);
    look(mid, ahead, [2.5, 1.2, 5.5]);
    await picture(ctx, "waffe", flock, list, 1.2, 1 / 60, arms);
    Object.assign(e, { mode: "breathe", t: 1, heading: ahead.clone().setY(0.15).normalize() });
    e.position.y = here.top - e.size * 0.06;
    look(e.position, ahead, [2.5, 2.2, 6]);
    await picture(ctx, "waffe-atmet", flock, list, 1.6, 1 / 60, arms);
    arms.place([]);
  },

  // The heron standing in the shallows: from the side and from ahead, drawing its head back
  // (the tell), lunging with the shot, from under the water, the head close, toppled dead.
  async "vogel-reiher"(ctx, record) {
    const { salmon } = ctx;
    const { fish, THREE, scene, course } = salmon;
    const flock = createBirds(scene);
    const { ahead, up, at } = stage(salmon);
    await salmon.run(0.2);
    // Where it stands: in the shallows toward a bank, 1.5 to 4.5 units deep (as the enemy
    // system finds a place for it).
    const s = fish.river.s + 6;
    const c = course.section(s);
    let u = null;
    for (const side of [1, -1]) {
      for (let a = 0.6; a < 1.05 && u === null; a += 0.05) {
        const v = c.thalweg + side * a * c.half;
        const depth = course.level(s) - course.bed(s, v);
        if (depth > 1.5 && depth < 4.5) u = v;
      }
      if (u !== null) break;
    }
    if (u === null) throw new Error("no shallows here");
    const spot = course.place(s, u, {});
    const floor = course.bed(s, u),
      top = course.level(s);
    const stand = new THREE.Vector3(spot.x, floor, spot.z);
    // Facing the middle of the river, where the salmon swims.
    const mid = course.place(s, c.thalweg, {});
    const facing = new THREE.Vector3(mid.x - stand.x, 0, mid.z - stand.z).normalize();
    const muzzle = new THREE.Vector3(stand.x + facing.x * 2, top + 16, stand.z + facing.z * 2);
    const prey = stand.clone().addScaledVector(facing, 9).setY(top - 1.5);
    const aimDir = prey.clone().sub(muzzle).normalize();
    const rest = new THREE.Vector3(facing.x * 0.3, -1, facing.z * 0.3).normalize();
    const e = bird(THREE, "heron", stand.clone().setY(floor + 1.5), up, { mode: "stand", t: 1, river: { s, u }, stand, facing, muzzle, aimDir: rest.clone(), speed: 0 });
    const list = [e];
    record.push({ label: "place", depth: +(top - floor).toFixed(2), muzzleOverWater: 16 });
    const look = looker(salmon, 0.05);
    const body = stand.clone().setY(floor + 13);
    // (The cameras out over the water: behind the heron is the bank and its bushes.)
    look(body, facing, [24, 3, 16]);
    await picture(ctx, "steht", flock, list, 0.8);
    look(body, facing, [30, 2, -6]);
    await picture(ctx, "steht-vorn", flock, list, 0.3);
    look(body, facing, [16, 20, 7]);
    await picture(ctx, "steht-oben", flock, list, 0.3);
    // Taking aim at the salmon: the head drawn back along the line.
    Object.assign(e, { mode: "aim", t: 1.0, aimDir: aimDir.clone() });
    look(body, facing, [24, 3, 16]);
    await picture(ctx, "zielt", flock, list, 0.9);
    // The shot, and the lunge with it.
    Object.assign(e, { mode: "fire", t: 0, firedAt: 1 });
    await picture(ctx, "stoesst", flock, list, 0.09);
    Object.assign(e, { mode: "stand", t: 0 });
    await picture(ctx, "danach", flock, list, 0.5);
    // From under the water, the salmon's view: the legs in the water, the rest through the
    // surface.
    const low = stand.clone().addScaledVector(facing, 11).setY(top - 1.2);
    salmon.view(low.toArray(), stand.clone().setY(top + 2).toArray(), 0.05);
    Object.assign(e, { mode: "aim", t: 1.0 });
    await picture(ctx, "von-unten", flock, list, 0.9);
    const low2 = stand.clone().addScaledVector(facing, 4).setY(Math.max(floor + 0.4, top - 1.2));
    salmon.view(low2.toArray(), stand.clone().setY(top + 6).toArray(), 0.05);
    await picture(ctx, "von-unten-steil", flock, list, 0.3);
    // The head, close.
    Object.assign(e, { mode: "stand", t: 1, aimDir: rest.clone() });
    const head = muzzle.clone();
    look(head, facing, [6, 1.2, 3], head);
    await picture(ctx, "kopf", flock, list, 0.8);
    // Where its harpoon gun goes, aiming.
    const arms = standIns(salmon, flock);
    Object.assign(e, { mode: "aim", t: 0.6, aimDir: aimDir.clone() });
    look(head, facing, [12, 1, 7], head);
    await picture(ctx, "waffe", flock, list, 0.8, 1 / 60, arms);
    arms.place([]);
    // Shot: toppling, and afloat.
    Object.assign(e, { dead: true, mode: "dead", corpse: 0.5, rolled: 1.2 });
    look(body, facing, [24, 3, 16]);
    await picture(ctx, "tot-kippt", flock, list, 0.1);
    Object.assign(e, { corpse: 4, rolled: Math.PI });
    e.position.copy(stand).addScaledVector(facing, 1.5).setY(top);
    look(stand.clone().setY(top), facing, [20, 12, 6]);
    await picture(ctx, "tot-treibt", flock, list, 2.5);
    // (Low over the water from out on the river: how the wings lie on it.)
    look(stand.clone().setY(top), facing, [18, 1.5, 5]);
    await picture(ctx, "tot-treibt-seite", flock, list, 0.1);
  },

  // The gannet over the sea: gliding high, seen from under the water as the salmon sees it,
  // from the side and from above; banking into the tell; the plunge; pulling out; dead on the
  // water; the head close.
  async "vogel-toelpel"(ctx, record) {
    const { salmon } = ctx;
    const { fish, THREE, scene } = salmon;
    const flock = createBirds(scene);
    const { ahead, at } = stage(salmon);
    await salmon.run(0.2);
    const look = looker(salmon, 0.05);
    const c = fish.position.clone().addScaledVector(ahead, 6);
    const here = at(c);
    const high = c.clone().setY(here.top + 17);
    const river = { s: here.s, u: here.u };
    const e = bird(THREE, "gannet", high, ahead, { mode: "circle", t: 0.5, river, speed: 9, bank: 0.35 });
    const list = [e];
    // From under the water, straight below it and a little behind.
    const below = high.clone().setY(here.top - 2).addScaledVector(ahead, -4);
    salmon.view(below.toArray(), high.toArray(), 0.05);
    await picture(ctx, "gleitet-unten", flock, list, 0.5);
    look(high, ahead, [2, 2, 22]);
    await picture(ctx, "gleitet-seite", flock, list, 0.5);
    look(high, ahead, [-4, 16, 3]);
    await picture(ctx, "gleitet-oben", flock, list, 0.5);
    // A bout of beats (the phase moved on by the settling).
    look(high, ahead, [3, -3, 20]);
    Object.assign(e, { mode: "recover", t: 1.5, heading: ahead.clone().setY(0.4).normalize() });
    await picture(ctx, "schlaegt", flock, list, 0.4);
    await picture(ctx, "schlaegt-2", flock, list, 0.12);
    // The tell: banked over steeply, the wings drawn in, looking down.
    Object.assign(e, { mode: "coil", t: 1.1, bank: 1.3, heading: ahead.clone() });
    look(high, ahead, [4, -2, 20]);
    await picture(ctx, "kippt", flock, list, 0.8);
    salmon.view(below.toArray(), high.toArray(), 0.05);
    await picture(ctx, "kippt-unten", flock, list, 0.1);
    // The plunge: the arrow.
    const steep = ahead.clone().multiplyScalar(0.45).setY(-1).normalize();
    Object.assign(e, { mode: "strike", t: 0.5, bank: 0, heading: steep });
    e.position.y = here.top + 8;
    look(e.position, ahead, [1, 1, 18]);
    await picture(ctx, "sturz", flock, list, 0.5);
    look(e.position, ahead, [9, -2, 8]);
    await picture(ctx, "sturz-vorn", flock, list, 0.1);
    salmon.view(e.position.clone().setY(here.top - 1.5).addScaledVector(ahead, 6).toArray(), e.position.toArray(), 0.05);
    await picture(ctx, "sturz-unten", flock, list, 0.1);
    // Pulling out low over the water: wings wide, tail fanned.
    Object.assign(e, { mode: "recover", t: 0.3, heading: ahead.clone().setY(0.1).normalize() });
    e.position.y = here.top + 2.4;
    look(e.position, ahead, [2, 0.5, 16]);
    await picture(ctx, "faengt-ab", flock, list, 0.3);
    salmon.view(e.position.clone().setY(here.top - 1.5).addScaledVector(ahead, -3).toArray(), e.position.toArray(), 0.05);
    await picture(ctx, "faengt-ab-unten", flock, list, 0.1);
    // Dead on the water.
    Object.assign(e, { dead: true, mode: "dead", corpse: 5, rolled: Math.PI, heading: ahead.clone() });
    e.position.y = here.top - e.size * 0.07;
    look(e.position, ahead, [3, 7, 11]);
    await picture(ctx, "tot", flock, list, 2.5);
    // The head, close.
    Object.assign(e, { dead: false, mode: "circle", corpse: 0, rolled: 0, bank: 0, heading: ahead.clone() });
    e.position.copy(high);
    look(high.clone().addScaledVector(ahead, 3.3), ahead, [0.8, 0.4, 3.2]);
    await picture(ctx, "kopf", flock, list, 0.3);
    // Where its bombs hang: under the wing roots, from below and ahead; and in the plunge.
    const arms = standIns(salmon, flock);
    look(high, ahead, [7, -4, 7]);
    await picture(ctx, "waffe", flock, list, 0.3, 1 / 60, arms);
    Object.assign(e, { mode: "strike", t: 0.6, heading: steep });
    look(high, ahead, [3, 0, 12]);
    await picture(ctx, "waffe-sturz", flock, list, 0.6, 1 / 60, arms);
    arms.place([]);
  },

  // What the birds cost: two kingfishers, two goosanders, the heron and the gannet, in view
  // from just over the water as close as a fight brings them; the frame timed with and without
  // them, and the birds alone (only their meshes drawn: an upper bound, nothing in front of
  // them); and the flock's posing on the processor.
  async "vogel-kosten"(ctx, record) {
    const { salmon } = ctx;
    const { fish, THREE, scene, renderer, course, camera } = salmon;
    const flock = createBirds(scene);
    const { ahead, left, up, at } = stage(salmon);
    await salmon.run(0.2);
    const c = fish.position.clone().addScaledVector(ahead, 10);
    const here = at(c);
    const river = { s: here.s, u: here.u };
    const list = [];
    for (const [i, side] of [
      [0, -1],
      [1, 1],
    ]) {
      const p = c.clone().addScaledVector(left, side * 2.5).setY(here.top + 1.8 + i);
      list.push(bird(THREE, "kingfisher", p, ahead, { mode: i ? "coil" : "circle", river, heading: i ? ahead.clone().setY(-1).normalize() : ahead.clone() }));
      const q = c.clone().addScaledVector(left, side * 4).addScaledVector(ahead, -2).setY(here.top - 0.36);
      list.push(bird(THREE, "merganser", q, ahead, { mode: "breathe", t: 1, river, heading: ahead.clone().setY(0.15).normalize() }));
    }
    // (The heron in the shallows off to one side, as the enemy system would stand it.)
    const sec = course.section(here.s);
    let v = null;
    for (let a = 0.6; a < 1.05 && v === null; a += 0.05) {
      const u = sec.thalweg + a * sec.half;
      const depth = course.level(here.s) - course.bed(here.s, u);
      if (depth > 1.5 && depth < 4.5) v = u;
    }
    if (v !== null) {
      const p = course.place(here.s + 6, v, {});
      const stand = new THREE.Vector3(p.x, course.bed(here.s + 6, v), p.z);
      const facing = c.clone().sub(stand).setY(0).normalize();
      const muzzle = stand.clone().addScaledVector(facing, 2).setY(here.top + 16);
      list.push(bird(THREE, "heron", stand.clone().setY(stand.y + 1.5), up, { mode: "stand", river, stand, facing, muzzle, aimDir: new THREE.Vector3(facing.x * 0.3, -1, facing.z * 0.3).normalize() }));
    }
    list.push(bird(THREE, "gannet", c.clone().addScaledVector(ahead, 6).setY(here.top + 12), ahead, { mode: "circle", river, bank: 0.4 }));
    const eye = c.clone().addScaledVector(ahead, -12).setY(here.top + 3);
    salmon.view(eye.toArray(), c.clone().addScaledVector(ahead, 4).setY(here.top + 5).toArray(), 0.02);
    await picture(ctx, "alle", flock, list, 0.4);
    const sync = async () => {
      const device = renderer.backend?.device;
      if (device) return device.queue.onSubmittedWorkDone();
      const gl = renderer.backend?.gl ?? renderer.getContext?.();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    };
    const frame = async (n = 30) => {
      await sync();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) salmon.draw(0);
      await sync();
      return (performance.now() - t0) / n;
    };
    // (The birds alone: moved to a layer of their own for it, only that layer drawn.)
    const alone = async (on, n = 60) => {
      const mask = camera.layers.mask;
      for (const m of flock.meshes) {
        m.layers.set(7);
        m.visible = on && m.count > 0;
      }
      camera.layers.set(7);
      renderer.setRenderTarget(null);
      await sync();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) renderer.render(scene, camera);
      await sync();
      camera.layers.mask = mask;
      for (const m of flock.meshes) m.layers.set(0);
      return (performance.now() - t0) / n;
    };
    const show = (on) => {
      for (const m of flock.meshes) m.visible = on && m.count > 0;
    };
    renderer.setSize(1280, 720, false);
    for (let i = 0; i < 20; i++) salmon.draw(0);
    const times = { without: [], with: [], aloneWithout: [], aloneWith: [] };
    for (let round = 0; round < 24; round++) {
      show(false);
      times.without.push(await frame());
      show(true);
      times.with.push(await frame());
      times.aloneWithout.push(await alone(false));
      times.aloneWith.push(await alone(true));
      await nextTask();
    }
    show(true);
    const stats = (a) => {
      const s = [...a].sort((x, y) => x - y);
      return { median: +s[Math.floor(s.length / 2)].toFixed(3), min: +s[0].toFixed(3), max: +s.at(-1).toFixed(3) };
    };
    const added = (a, b) => stats(times[a].map((v, i) => v - times[b][i]));
    // The processor: a step's posing of all six.
    const n = 3000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      flock.begin(1 / 60);
      for (const e of list) flock.add(e);
      flock.end();
    }
    const micros = ((performance.now() - t0) / n) * 1000;
    record.push({
      label: "cost",
      backend: renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2",
      birds: list.length,
      triangles: Object.fromEntries(Object.entries(flock.kinds).map(([k, v]) => [k, v.mesh.geometry.index.count / 3])),
      draws: flock.meshes.filter((m) => m.visible).length,
      frame: { without: stats(times.without), with: stats(times.with) },
      addedMs: added("with", "without"),
      alone: { without: stats(times.aloneWithout), with: stats(times.aloneWith), added: added("aloneWith", "aloneWithout") },
      poseMicroseconds: +micros.toFixed(1),
    });
  },

  // The wingbeat in motion: the kingfisher and the gannet in flight, a picture every
  // twentieth of a second over one beat of each.
  async "vogel-schlag"(ctx, record) {
    const { salmon } = ctx;
    const { fish, THREE, scene } = salmon;
    const flock = createBirds(scene);
    const { ahead, at } = stage(salmon);
    await salmon.run(0.2);
    const look = looker(salmon, 0.01);
    const c = fish.position.clone().addScaledVector(ahead, 4);
    const here = at(c);
    const air = c.clone().setY(here.top + 1.6);
    const e = bird(THREE, "kingfisher", air, ahead, { mode: "circle", river: { s: here.s, u: here.u } });
    look(air, ahead, [1.2, 0.5, 2.4]);
    for (let i = 0; i < 6; i++) await picture(ctx, `eisvogel-${i}`, flock, [e], i ? 1 / 60 : 0.3, 1 / 60);
  },
};

Object.assign(SCENES, {
  "vogel-live-eisvogel": (ctx, record) => live(ctx, record, "kingfisher", { ahead: 3, distance: 4.5, seconds: 14 }),
  "vogel-live-saeger": (ctx, record) => live(ctx, record, "merganser", { ahead: 8, distance: 11, under: true, seconds: 26 }),
  "vogel-live-reiher": (ctx, record) => live(ctx, record, "heron", { ahead: 6, across: 1, distance: 30, seconds: 14 }),
  "vogel-live-toelpel": (ctx, record) => live(ctx, record, "gannet", { ahead: 5, distance: 26, seconds: 18 }),
});

export const BIRD_SCENES = Object.keys(SCENES);
