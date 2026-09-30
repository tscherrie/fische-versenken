// The weapons as things on the fish: real guns and blades, strapped to the body with a
// harness, each on its place (the back, left, right or middle, or the belly).
//
// Everything is built here once, before the game compiles its shaders (createWeaponModels runs
// before the warm-up), and afterwards only shown, hidden and moved: every harness and every
// weapon for every body the fish can wear, for all four co-op players, all drawn with ONE lit
// material, so nothing ever compiles mid-swim. The shapes are made in model-harness.js and
// model-weapons.js; this file places them on the fish every frame, makes them kick, spin and
// glow, and says where their muzzles are.
//
// One draw per thing: a player costs the harness plus one mesh per carried weapon (2-3 draws).
// A weapon's vertices say which part they belong to (the mount bolted to the fish, the gun
// that kicks, two moving parts); the material moves each part by a matrix of its own, per
// object, and hides spent ammunition (a fired rocket's tip, a launched torpedo's nose) by the
// object's "ammunition window". Nothing is copied per player: the meshes of all players share
// the geometries, each with its own per-object values in userData.
//
// The gear is not parented to the fish (its mesh is instanced and swapped at stage changes):
// each player's gear hangs in a group whose matrix is the fish's own instance matrix, read
// fresh every frame, so it banks, turns and grows with the fish.
//
// Time is the game's (it stops while the world stands still and slows in the celebration):
// `clock` if given, else the game's own clock.
//
// What the weapons are doing comes from the arsenal where it says so, and is guessed from the
// shots (recoil()) and the heat where it does not. The optional contract, read every frame:
//   player.arsenal.state?.[id] = { spin, loaded, reloading, drawn, charge }
//     spin 0..1 (the minigun's barrels), loaded (rounds or tubes ready), reloading (bool),
//     drawn (a blade out), charge 0..1 (the cannon's fuse)
// and the magazine fields some arsenals keep: ammo[id] (rounds left), reloading[id] (> 0 while
// reloading).
//
// The enemies' own weapons are strapped on the same way (look/foe-gear.js, the shapes in
// model-foes.js), given the enemy system (`enemies`: their poses) and the camera (what is out
// of view is not drawn): enemies(list, larvae) places them every frame, enemyMuzzle(e, out)
// says where an enemy's round leaves its barrel, enemyShot(e) makes the gun kick.

import * as THREE from "three";
import { Fn, attribute, exp, float, mod, normalGeometry, normalLocal, positionGeometry, select, uniform, vec3, vec4 } from "three/tsl";
import { BODIES } from "../anatomy.js";
import { waterLit } from "../render/water.js";
import { extreme } from "./extreme.js";
import { PALETTE, bodyFrame, buildAlevinGear, buildHarness } from "./model-harness.js";
import { Kit, colour, lift } from "./model-parts.js";
import { WEAPON_MODELS } from "./model-weapons.js";
import { createFoeGear } from "./look/foe-gear.js";

const KINDS = ["alevin", "parr", "salmon"];
const PLACES = ["back", "belly"];
const PLAYERS = 4;
const HUMP = 0.42; // anatomy.js: the spawner's back rises by up to 42 % at x = 0.12
const DEG = Math.PI / 180;
// How much bigger a small fish's weapons are shown, by stage (a comic size that reads at the
// chase camera: a 4 cm fry with a coach gun). Scaled about the weapon's mount.
const GAG = [1.2, 1.3, 1.25, 1.12];
// The katana's draw: out of the saya along its axis, then swung round outboard to the cut.
const PULL = 0.06,
  SWING = 0.07,
  CUT = 0.17,
  WHIRL = 0.35;
const IDENTITY = new THREE.Matrix4();
const ZERO = new THREE.Vector3();
const NO_AMMO = new THREE.Vector2();
const NO_GAG = new THREE.Vector4(0, 0, 0, 1);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (u) => u * u * (3 - 2 * u);

// Which of our bodies a plan is (the body mesh is swapped at stages 0->1 and 4->5).
function kindOf(plan) {
  if (!plan?.profile) return null;
  for (const kind of KINDS) if (plan === BODIES[kind]) return kind;
  return plan.yolk ? "alevin" : plan.profile[6][1] > 0.074 ? "salmon" : "parr";
}

// ONE material for all the gear. Per vertex (aGear, aSurf): colour, roughness and metalness,
// the kind of surface (glow, lamp), how it follows the hump, which part it is, whether it is
// team fabric, and its ammunition slot. Per object (userData): the hump, the glow, the team
// colour, the parts' matrices, the ammunition window and the comic scale. Lit through the
// water like the fish.
function gearMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.5 });
  const gear = attribute("aGear", "vec4");
  const surf = attribute("aSurf", "vec4");
  // The code: zone + 16 mode + 64 part + 256 team (+0.5: exact after interpolation).
  const code = gear.w.add(0.5).floor();
  const team = code.div(256).floor();
  const low = code.sub(team.mul(256));
  const part = low.div(64).floor();
  const low2 = low.sub(part.mul(64));
  const mode = low2.div(16).floor();
  const zone = low2.sub(mode.mul(16));
  const is = (value, n) => value.sub(n).abs().lessThan(0.5);

  const perObject = (initial, key, fallback) => uniform(initial).onObjectUpdate(({ object }) => object.userData[key] ?? fallback);
  const humpOf = perObject(new THREE.Vector3(), "hump", ZERO); // (hump, rail top, side axis height)
  const glowOf = perObject(new THREE.Vector3(), "glow", ZERO);
  const teamOf = perObject(new THREE.Vector3(), "team", ZERO);
  const idOf = perObject(new THREE.Vector3(), "id", ZERO);
  const gagOf = perObject(new THREE.Vector4(0, 0, 0, 1), "gag", NO_GAG); // (mount xyz, scale)
  const ammoOf = perObject(new THREE.Vector2(), "ammo", NO_AMMO); // (first empty slot, empty)
  const partM = [0, 1, 2].map((i) => uniform(new THREE.Matrix4()).onObjectUpdate(({ object }) => object.userData.parts?.[i] ?? IDENTITY));

  const rgb = gear.xyz;
  material.colorNode = select(is(team, 1), rgb.mul(teamOf), select(is(team, 2), rgb.mul(idOf), rgb));
  material.roughnessNode = surf.x;
  material.metalnessNode = surf.y;
  const glowing = select(is(zone, 7), float(1), float(0));
  const lamp = select(is(zone, 14), float(4), float(0));
  material.emissiveNode = rgb.mul(glowOf.mul(glowing).add(vec3(lamp)));

  material.positionNode = Fn(() => {
    const p = vec4(positionGeometry, 1);
    const n = vec4(normalGeometry, 0);
    // The part's own matrix (the mount stays as built).
    const moved = select(is(part, 1), partM[0].mul(p).xyz, select(is(part, 2), partM[1].mul(p).xyz, select(is(part, 3), partM[2].mul(p).xyz, p.xyz)));
    const turned = select(is(part, 1), partM[0].mul(n).xyz, select(is(part, 2), partM[1].mul(n).xyz, select(is(part, 3), partM[2].mul(n).xyz, n.xyz)));
    normalLocal.assign(turned.normalize());
    // A small fish's weapon, bigger about its mount (not what follows the skin).
    const follow = is(mode, 1);
    const scaled = select(follow, moved, gagOf.xyz.add(moved.sub(gagOf.xyz).mul(gagOf.w)));
    // The spawner's hump: harness vertices rise like the skin under them; a weapon rides up
    // rigidly with its mount (the rail at x 0.12, or the side clamps).
    const f = humpOf.x.mul(HUMP);
    const u = scaled.x.sub(0.12).div(0.14);
    const skin = scaled.y.max(0).mul(f).mul(exp(u.mul(u).negate()));
    const dy = select(mode.lessThan(0.5), float(0), select(mode.lessThan(1.5), skin, select(mode.lessThan(2.5), humpOf.y.mul(f), humpOf.z.mul(f).mul(0.975))));
    const placed = scaled.add(vec3(0, dy, 0));
    // Spent ammunition: the items in the window of empty slots fold to a point (no area).
    const slot = surf.z,
      slots = surf.w.max(1);
    const along = mod(slot.sub(1).sub(ammoOf.x).add(slots).add(0.5), slots);
    const hidden = slot.greaterThan(0.5).and(along.lessThan(ammoOf.y));
    return select(hidden, vec3(0, 0, 0), placed);
  })();
  return waterLit(material);
}

// Scratch for the per-frame maths (nothing is allocated per frame).
const turnM = new THREE.Matrix4(),
  backM = new THREE.Matrix4(),
  scratch = new THREE.Matrix4(),
  hullM = new THREE.Matrix4(),
  point = new THREE.Vector3(),
  pos = new THREE.Vector3(),
  pos2 = new THREE.Vector3(),
  vx = new THREE.Vector3(),
  vy = new THREE.Vector3(),
  vz = new THREE.Vector3(),
  u0 = new THREE.Vector3(),
  sv = new THREE.Vector3();

// out = a turn about the axis through a pivot.
function aboutPivot(out, px, py, pz, axis, angle) {
  if (axis === "x") turnM.makeRotationX(angle);
  else if (axis === "y") turnM.makeRotationY(angle);
  else turnM.makeRotationZ(angle);
  return out.makeTranslation(px, py, pz).multiply(turnM).multiply(backM.makeTranslation(-px, -py, -pz));
}

// A moving part turned about its pivot, riding on the gun's kick and the mount's rise.
function onGun(out, rise, kick, part, angle, axis = part.axis) {
  return out.makeTranslation(0, rise, 0).multiply(kick).multiply(aboutPivot(scratch, part.pivot[0], part.pivot[1], part.pivot[2], axis, angle));
}
const DOORS = ["doorA", "doorB"];

// A blade's frame: its tsuba at (px, py, pz), the blade heading `alpha` round the fish (0 ahead,
// +-pi back), pitched `pitch` up, rolled `roll` from edge up (the leading edge sideways at
// +-pi/2).
function bladeFrame(out, px, py, pz, alpha, pitch, roll) {
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    ca = Math.cos(alpha),
    sa = Math.sin(alpha);
  vx.set(cp * ca, sp, cp * sa);
  u0.set(-sp * ca, cp, -sp * sa);
  sv.crossVectors(vx, u0);
  vy.copy(u0).multiplyScalar(Math.cos(roll)).addScaledVector(sv, Math.sin(roll));
  vz.crossVectors(vx, vy);
  return out.makeBasis(vx, vy, vz).setPosition(px, py, pz);
}

export function createWeaponModels(scene, { mirror, clock, enemies, camera } = {}) {
  const material = gearMaterial();
  const game = extreme.game;
  // The game's clock (paused with the world, slowed in the celebration).
  const timeOf = clock ?? (() => game?.now?.time ?? performance.now() / 1000);
  const detail = !(game?.settings?.detail === false || game?.touchMode);
  const frames = Object.fromEntries(KINDS.map((kind) => [kind, bodyFrame(kind)]));

  // Every weapon on every body it can be worn on, built once and shared by all players: the
  // gun, its mount and its moving parts in one geometry.
  const built = { alevin: {}, parr: {}, salmon: {} };
  for (const [id, def] of Object.entries(WEAPON_MODELS))
    for (const kind of def.bodies) {
      const F = frames[kind];
      const b = def.build(F);
      const all = new Kit().append(b.main);
      const parts = {};
      for (const [name, part] of Object.entries(b.parts ?? {})) {
        all.append(part.kit);
        const { kit, ...rest } = part;
        parts[name] = { ...rest, index: kit.part };
      }
      built[kind][id] = { id, def, F, geometry: all.geometry(), triangles: all.triangles, parts, muzzles: b.muzzles, ammo: b.ammo ?? null };
    }
  const harnessGeometry = { parr: buildHarness(frames.parr, { detail }).geometry(), salmon: buildHarness(frames.salmon, { detail }).geometry() };
  const teamColour = PALETTE.webbing.map((hex) => new THREE.Vector3(...lift(colour(hex))));
  const idColour = PALETTE.id.map((hex) => new THREE.Vector3(...colour(hex)));

  let now = 0,
    last = timeOf(),
    dtFrame = 1 / 60,
    frameNo = 0;
  const kick = new THREE.Matrix4(),
    swordM = new THREE.Matrix4(),
    armM = new THREE.Matrix4(),
    matrix = new THREE.Matrix4();

  function addMesh(rig, geometry, F, weapon) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "FV gear";
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    // (Cast at the warm-up, so the shadow pipeline is built; update() decides afterwards.)
    mesh.castShadow = rig.local && weapon;
    mesh.receiveShadow = true;
    mesh.userData = {
      hump: new THREE.Vector3(0, F.railTop, F.side.y),
      glow: new THREE.Vector3(),
      team: teamColour[rig.id % PLAYERS],
      id: idColour[rig.id % PLAYERS],
      gag: new THREE.Vector4(0, 0, 0, 1),
      ammo: new THREE.Vector2(),
      parts: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()],
    };
    rig.group.add(mesh);
    rig.meshes.push(mesh);
    return mesh;
  }

  // A player's gear: a group that follows the fish, holding a harness per body and every
  // weapon (hidden until carried). All four rigs are made at once, before the warm-up, so
  // nothing is built or compiled when a player joins.
  const rigs = [];
  function createRig(id) {
    const group = new THREE.Group();
    group.name = "FV gear";
    group.matrixAutoUpdate = false;
    group.visible = false;
    scene.add(group);
    const rig = { id, local: id === 0, group, meshes: [], harness: {}, entries: { alevin: {}, parr: {}, salmon: {} }, state: {}, shown: { back: null, belly: null }, shownId: { back: null, belly: null }, yolk: 1, seen: -1, wasShown: false, updated: -9, s: {} };
    for (const kind of ["parr", "salmon"]) rig.harness[kind] = addMesh(rig, harnessGeometry[kind], frames[kind], false);
    // The alevin's strap is the rig's own: it is rewritten as the yolk sac shrinks.
    rig.harness.alevin = addMesh(rig, buildAlevinGear(frames.alevin, 1).geometry(), frames.alevin, false);
    for (const kind of KINDS)
      for (const [wid, b] of Object.entries(built[kind])) {
        const mesh = addMesh(rig, b.geometry, b.F, true);
        rig.entries[kind][wid] = { ...b, mesh };
      }
    rigs[id] = rig;
    return rig;
  }
  for (let i = 0; i < PLAYERS; i++) createRig(i);
  if (mirror) mirror(rigs[0].meshes);
  // The enemies' weapons, made now too (before the warm-up), on the game's clock.
  const foes = enemies ? createFoeGear(scene, { enemies, camera, clock: timeOf }) : null;

  const stateOf = (rig, id) =>
    (rig.state[id] ??= {
      kick: -9,
      shot: 0,
      heat: 0,
      firing: -9,
      spin: 0,
      angle: 0,
      cyl: 0,
      cylShown: 0,
      swing: 0,
      shells: WEAPON_MODELS[id]?.shells ?? 0,
      open: -9,
      reloadAt: -9,
      start: 0,
      empty: 0,
      refill: 0,
      queue: [],
      doors: [1, 1],
      slide: 0,
      cut: -9,
      cutDir: -1,
      drawn: false,
      drawAt: -9,
      lastCut: -9,
      sheathAt: -9,
      chain: 0,
      equip: -9,
      charge: 0,
    });

  // Where this player's fish is and what it wears (into the rig's own object); null when
  // there is nothing to show.
  function situate(rig, player) {
    const salmon = player?.salmon;
    const body = salmon?.meshes?.[0];
    const kind = kindOf(salmon?.materials?.plan);
    if (!body?.instanceMatrix || !kind) return null;
    const f = player.fish;
    const s = rig.s;
    const uniforms = salmon.materials.uniforms ?? {};
    s.body = body;
    s.kind = kind;
    s.F = frames[kind];
    s.hidden = !!(player.down || f?.captive || (f?.shrink ?? 0) > 0);
    s.stage = f?.stage ?? 0;
    s.hump = kind === "salmon" ? (uniforms.coat_hump?.value ?? 0) : 0;
    s.yolk = uniforms.coat_yolk?.value ?? 0;
    s.gag = GAG[s.stage] ?? 1;
    return s;
  }
  // The model of weapon `id` on this body (the torpedo rack grows to 2 x 2 at sea).
  function entryOf(rig, s, id) {
    if (!id || !s) return null;
    const entries = rig.entries[s.kind];
    if (id === "torpedo" && s.stage >= 6) return entries.torpedo4 ?? null;
    return entries[id] ?? null;
  }

  // How far a mount rises with the hump.
  const riseOf = (anchor, F, hump) => (anchor === "rail" ? F.railTop * HUMP * hump : anchor === "side" ? F.side.y * HUMP * hump * 0.975 : 0);
  // The point a weapon is scaled about (its mount).
  function mountOf(entry, out) {
    const { def, F } = entry;
    if (def.anchor === "rail") return out.set(0.12, F.railTop, 0);
    if (def.anchor === "side") return out.set(0.12, F.side.y, (def.side ?? 0) * F.side.z);
    return out.set(0.12, F.keel?.top ?? F.bottom(0.12), 0);
  }

  // The kick of a shot: back along -x, the muzzle flipping up about the rear mount.
  function kickOf(entry, st, out) {
    const r = entry.def.recoil;
    const u = (now - st.kick) / r.time;
    out.identity();
    if (u < 0 || u >= 1 || (!r.d && !r.flip)) return out;
    const f = u < 0.18 ? u / 0.18 : Math.pow(1 - (u - 0.18) / 0.82, 2);
    const F = entry.F;
    const py = entry.def.anchor === "rail" ? F.railTop : F.side.y;
    out.makeTranslation(-r.d * f, 0, 0);
    if (r.flip) out.premultiply(aboutPivot(scratch, r.pivot ?? 0.1, py, 0, "z", r.flip * f));
    return out;
  }

  // ---- The ammunition window: slots in firing order, a run of empty ones from `start`.
  // Fired: the slot after the window empties. Refilled: the window's first slot is back (so
  // the tube that fired first reloads first). Mines always drop the rearmost: start stays 0.
  function nextSlot(entry, st) {
    return (st.start + st.empty) % entry.ammo.count;
  }
  function fireSlot(entry, st) {
    if (st.empty < entry.ammo.count) st.empty++;
    st.queue.push(now);
    st.refill = 0;
  }
  function refillSlot(entry, st) {
    if (st.empty <= 0) return;
    st.empty--;
    st.queue.shift();
    if (entry.ammo.kind !== "drop") st.start = (st.start + 1) % entry.ammo.count;
  }
  // Refills over time where the arsenal does not say (the roster's reload times).
  function reloadRack(entry, st, loaded) {
    const { ammo, def } = entry;
    if (loaded !== null) {
      const target = Math.max(0, Math.min(ammo.count, ammo.count - loaded));
      while (st.empty < target) fireSlot(entry, st);
      while (st.empty > target) refillSlot(entry, st);
      return;
    }
    if (st.empty <= 0) return;
    if (ammo.kind === "tubes" || ammo.count === 1) {
      // Each tube reloads on its own, `reload` seconds after it fired.
      while (st.empty > 0 && now - st.queue[0] >= (ammo.reload ?? 3)) refillSlot(entry, st);
      return;
    }
    // A rack refills one by one once empty, or after a rest.
    const each = (def.reload ?? 3) / ammo.count;
    if (st.empty >= ammo.count || now - st.kick > (def.rest ?? 2)) {
      st.refill += dtFrame / each;
      while (st.refill >= 1 && st.empty > 0) {
        st.refill -= 1;
        refillSlot(entry, st);
      }
    } else st.refill = 0;
  }

  // ---- Blades. The katana is pulled out of its saya along its axis, swung round outboard
  // (never through the head) to the start of its cut, and swept across in front of the snout,
  // the blade tilted 15 degrees on alternate cuts; after a rest it goes back the same way. The
  // nodachi is pulled out and raised on its mast above the back and whirled once round the
  // fish, the tip drooping to fish level. out: the sword in model units; returns how far it is
  // "up" (0 in the saya ... 1 drawn: its lift blends from the side clamps' to the rail's).
  const PITCH = 5 * DEG;
  function sheathedAt(entry, pulled) {
    const m = entry.parts.sword.matrix;
    point.setFromMatrixPosition(m);
    if (pulled) point.addScaledVector(pos2.set(Math.cos(PITCH), -Math.sin(PITCH), 0), entry.parts.sword.blade);
    return point;
  }
  function upPose(entry, st, dir, u, out) {
    // The drawn pose's parameters at the start of the cut or whirl (u = 0) ... its end (u = 1).
    const F = entry.F;
    if (entry.id === "nodachi") {
      const a = dir * (Math.PI + u * Math.PI * 2);
      const droop = -10 * DEG;
      out.alpha = a;
      out.pitch = droop;
      out.roll = (dir * Math.PI) / 2;
      out.x = 0.12 + 0.09 * Math.cos(droop) * Math.cos(a);
      out.y = F.railTop + 0.12 + 0.09 * Math.sin(droop);
      out.z = 0.09 * Math.cos(droop) * Math.sin(a);
    } else {
      out.alpha = dir * (-75 + 150 * smooth(u)) * DEG;
      out.pitch = -0.13;
      out.roll = dir * (Math.PI / 2 + 0.26);
      out.x = 0.25;
      out.y = F.railTop + 0.024;
      out.z = -0.004;
    }
    return out;
  }
  const poseA = {},
    poseB = {};
  // Blend from the pulled-out pose (blade back along the saya, edge up) to a drawn pose: the
  // tsuba rises first and comes back over the fish last.
  function swingPose(entry, from, to, u, out) {
    const e = smooth(u);
    const up = 1 - Math.pow(1 - u, 2),
      late = u * u;
    return bladeFrame(out, from.x + (to.x - from.x) * late, from.y + (to.y - from.y) * up, from.z + (to.z - from.z) * late, from.alpha + (to.alpha - from.alpha) * e, from.pitch + (to.pitch - from.pitch) * e, from.roll + (to.roll - from.roll) * e);
  }
  function pulledPose(entry, alpha, out) {
    const p = sheathedAt(entry, true);
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    out.alpha = alpha;
    out.pitch = PITCH;
    out.roll = 0;
    return out;
  }
  function swordPose(entry, st, out) {
    const nodachi = entry.id === "nodachi";
    const sheathed = entry.parts.sword.matrix;
    if (st.drawn) {
      const t = now - st.drawAt;
      const firstDir = st.firstDir;
      if (t < PULL) {
        // Out of the saya along its axis.
        const e = smooth(clamp01(t / PULL));
        const p = sheathedAt(entry, false);
        const q = pos.copy(p);
        const r = sheathedAt(entry, true);
        out.copy(sheathed).setPosition(q.lerp(r, e));
        return 0;
      }
      if (t < PULL + SWING) {
        const u = (t - PULL) / SWING;
        // (The katana swings round the side it will cut from; the nodachi keeps pointing back.)
        pulledPose(entry, (nodachi ? firstDir : -firstDir) * Math.PI, poseA);
        upPose(entry, st, firstDir, 0, poseB);
        swingPose(entry, poseA, poseB, u, out);
        return smooth(u);
      }
      const u = clamp01((now - st.cut) / (nodachi ? WHIRL : CUT));
      const p = upPose(entry, st, st.cutDir, u, poseB);
      bladeFrame(out, p.x, p.y, p.z, p.alpha, p.pitch, p.roll);
      return 1;
    }
    const t = now - st.sheathAt;
    if (t >= SWING + PULL) {
      out.copy(sheathed);
      return 0;
    }
    // Back the way it came: from the last cut's end round to the pulled-out pose, then in.
    upPose(entry, st, st.cutDir, 1, poseB);
    const back = nodachi ? poseB.alpha : Math.sign(poseB.alpha || 1) * Math.PI;
    pulledPose(entry, back, poseA);
    if (t < SWING) {
      const u = t / SWING;
      swingPose(entry, poseA, poseB, 1 - u, out);
      return smooth(1 - u);
    }
    const e = smooth(clamp01((t - SWING) / PULL));
    const r = pos.copy(sheathedAt(entry, true));
    const p = sheathedAt(entry, false);
    out.copy(sheathed).setPosition(r.lerp(p, e));
    return 0;
  }

  // The arm reaches from its pivot to the sword's grip, stretching as a hydraulic ram does.
  function armPose(entry, sword, pivotLift, out) {
    const arm = entry.parts.arm;
    const g = point.set(...entry.parts.sword.grip).applyMatrix4(sword);
    const target = pos2.set(g.x + arm.offset[0], g.y + arm.offset[1], g.z + arm.offset[2]);
    const p = pos.set(arm.pivot[0], arm.pivot[1] + pivotLift, arm.pivot[2]);
    vx.subVectors(target, p);
    const length = vx.length();
    vx.normalize();
    vz.crossVectors(vx, vy.set(0, 1, 0));
    if (vz.lengthSq() < 1e-8) vz.set(0, 0, 1);
    vz.normalize();
    vy.crossVectors(vz, vx);
    out.makeBasis(vx, vy, vz).setPosition(p);
    return out.multiply(scratch.makeScale(length / arm.length, 1, 1));
  }

  // A sword's matrix with its lift (side clamps' in the saya, the rail's when drawn), into
  // `out`; returns the arm pivot's lift.
  function liftedSword(entry, st, hump, out) {
    const up = swordPose(entry, st, out);
    const side = riseOf("side", entry.F, hump),
      rail = riseOf("rail", entry.F, hump);
    out.premultiply(scratch.makeTranslation(0, side + (rail - side) * up, 0));
    return entry.parts.arm.anchor === "rail" ? rail : side;
  }

  // What the arsenal says about weapon `id` (null: it does not say).
  function external(a, id, key) {
    const own = a.state?.[id]?.[key];
    if (own !== undefined && own !== null) return own;
    if (key === "loaded" && typeof a.ammo?.[id] === "number") return a.ammo[id];
    if (key === "reloading" && typeof a.reloading?.[id] === "number") return a.reloading[id] > 0;
    return null;
  }

  // Move one weapon: the kick, and whatever moves on it.
  function animate(entry, st, s, a, id) {
    const { mesh, def, F, parts } = entry;
    const data = mesh.userData;
    const m1 = data.parts[0],
      m2 = data.parts[1],
      m3 = data.parts[2];
    const heat = Math.min(1, a.heat?.[id] ?? 0);
    if (heat > st.heat + 1e-6) st.firing = now;
    st.heat = heat;
    const firing = now - st.firing < 0.15 || now - st.kick < 0.15;
    const rise = riseOf(def.anchor, F, s.hump);
    data.hump.x = s.hump;
    kickOf(entry, st, kick);
    m1.copy(kick);
    m2.identity();
    m3.identity();
    data.ammo.set(0, 0);
    // The comic size of a small fish's weapon, and the slide into the clamps when it is new.
    mountOf(entry, point);
    data.gag.set(point.x, point.y, point.z, s.gag);
    const slideU = clamp01((now - st.equip) / 0.2);
    st.slide = slideU < 1 ? -0.05 * Math.pow(1 - slideU, 2) : 0;
    mesh.matrix.makeTranslation(st.slide, 0, 0);
    mesh.matrixWorldNeedsUpdate = true;
    switch (entry.id) {
      case "piu":
        // The lens glows with the heat: the gun is its own heat gauge.
        data.glow.setScalar(0.45 + 11 * heat);
        break;
      case "flinte": {
        // Both barrels fired (or one, after a rest): the action breaks open, the spent hulls
        // fly out, it snaps shut loaded.
        const reloading = external(a, id, "reloading");
        if (reloading !== null) {
          if (reloading && now - st.open > 0.9) st.open = now;
          // (Reloaded early: straight to the snap shut.)
          if (!reloading && now - st.open > 0.25 && now - st.open < 0.78) st.open = now - 0.78;
        } else if (st.shells < (def.shells ?? 2) && now - st.kick > (def.rest ?? 1.5)) {
          // One shell left and a rest: it reloads anyway.
          st.open = st.kick + (def.rest ?? 1.5);
          st.shells = def.shells ?? 2;
        }
        const t = now - st.open;
        const open = t < 0 || t > 0.9 ? 0 : Math.min(1, t / 0.1, (0.9 - t) / 0.12);
        onGun(m2, rise, kick, parts.barrels, -0.52 * open);
        // The hulls: out of the chambers backward and up, tumbling, then gone (as in air).
        const h = t - 0.06;
        if (h > 0 && h < 0.45) {
          m3.copy(m2).multiply(scratch.makeTranslation(-0.35 * h, 0.22 * h - 0.9 * h * h, 0.06 * h));
          m3.multiply(aboutPivot(hullM, parts.hulls.pivot[0] + 0.01, parts.hulls.pivot[1], parts.hulls.pivot[2], "z", 9 * h));
          data.ammo.set(0, 0);
        } else data.ammo.set(0, 1);
        break;
      }
      case "granate": {
        // The cylinder turns on to the next chamber; for the reload it swings out on its crane.
        st.cylShown += Math.sign(st.cyl - st.cylShown) * Math.min(Math.abs(st.cyl - st.cylShown), (Math.PI / 3) * (dtFrame / 0.07));
        const reloading = external(a, id, "reloading") ?? (now - st.reloadAt < (def.reload ?? 2.4));
        st.swing += ((reloading ? 1 : 0) - st.swing) * Math.min(1, dtFrame / 0.08);
        const c = parts.cylinder;
        m2.makeTranslation(0, rise, 0).multiply(kick);
        m2.multiply(aboutPivot(scratch, 0, c.crane[0], c.crane[1], c.axis, 40 * DEG * st.swing));
        m2.multiply(aboutPivot(scratch, c.pivot[0], c.pivot[1], c.pivot[2], c.axis, st.cylShown));
        break;
      }
      case "minigun": {
        // The barrels wind up (0.45 s) and run on for 0.8 s after the trigger lets go; shown no
        // faster than 25 degrees a frame (six barrels: faster would seem to turn backward).
        const spin = external(a, id, "spin");
        if (spin !== null) st.spin = clamp01(spin);
        else st.spin = clamp01(st.spin + (firing ? dtFrame / 0.45 : -dtFrame / 0.8));
        st.angle = (st.angle + Math.min(25 * DEG, st.spin * 40 * dtFrame)) % (Math.PI * 2);
        onGun(m2, rise, kick, parts.barrels, st.angle);
        // Heat colour: nothing until a third of the way, then dull red, then orange at the lock.
        const t = clamp01((heat - 0.3) / 0.7);
        data.glow.set(45 * Math.pow(t, 1.5), 14 * Math.pow(t, 2.6), 3 * Math.pow(t, 4));
        break;
      }
      case "raketen":
      case "harpune": {
        // What has left is gone from its tube until it is back.
        reloadRack(entry, st, external(a, id, "loaded"));
        data.ammo.set(st.start, st.empty);
        break;
      }
      case "torpedo":
      case "torpedo4": {
        reloadRack(entry, st, external(a, id, "loaded"));
        data.ammo.set(st.start, st.empty);
        // A door stands open while a tube behind it is loaded; it shuts a moment after the
        // last one left, and opens again as it is reloaded.
        const n = entry.ammo.count;
        for (let i = 0; i < 2; i++) {
          const door = parts[DOORS[i]];
          let loaded = false;
          for (const tube of door.tubes) if ((tube - st.start + n) % n >= st.empty) loaded = true;
          const want = loaded || now - st.kick < 0.25 ? 1 : 0;
          st.doors[i] += Math.sign(want - st.doors[i]) * Math.min(Math.abs(want - st.doors[i]), dtFrame / 0.12);
          aboutPivot(i ? m3 : m2, door.pivot[0], door.pivot[1], door.pivot[2], door.axis, door.open * smooth(st.doors[i]));
        }
        break;
      }
      case "minen": {
        // The rearmost rolls off; the others slide back to fill the cups behind them.
        reloadRack(entry, st, external(a, id, "loaded"));
        data.ammo.set(0, st.empty);
        st.slidePos = (st.slidePos ?? 0) + (-st.empty * parts.mines.step - (st.slidePos ?? 0)) * Math.min(1, dtFrame / 0.07);
        m2.makeTranslation(st.slidePos, 0, 0);
        break;
      }
      case "blitz": {
        // The windings flicker blue-white while it arcs (each level held 4 frames: the temporal
        // blend would average a faster flicker into a flat glow).
        const q = Math.floor(now * 15);
        const f = firing ? 3 + 3 * (((q * 2654435761) >>> 0) / 4294967296) : 0.15;
        data.glow.set(0.5 * f, 0.8 * f, 1.6 * f);
        break;
      }
      case "strahl": {
        // Cyan rings: a standby glow, brighter with the heat of a long focus.
        const f = 1.2 + 5 * heat + (firing ? 1.5 : 0);
        data.glow.set(0.8 * f, 1.2 * f, 1.3 * f);
        break;
      }
      case "kanone": {
        // The fuse ember in the vent while it is charged.
        const charge = external(a, id, "charge");
        st.charge = charge !== null ? clamp01(charge) : Math.max(0, st.charge - dtFrame * 4);
        const flicker = 0.8 + 0.2 * Math.sin(now * 37);
        data.glow.set(40, 16, 4).multiplyScalar(st.charge * flicker);
        break;
      }
      case "flammen":
        // A millimetre of shake while the jet roars (still while the world stands still).
        if (firing && dtFrame > 0) m1.multiply(scratch.makeTranslation((Math.random() - 0.5) * 0.0016, (Math.random() - 0.5) * 0.0012, (Math.random() - 0.5) * 0.0012));
        break;
      case "saege": {
        // The chain: the two tooth sets swap every frame while it runs, and it shakes.
        if (firing && dtFrame > 0) {
          st.chain ^= 1;
          m1.multiply(scratch.makeTranslation(0, (Math.random() - 0.5) * 0.0016, (Math.random() - 0.5) * 0.001));
          data.ammo.set(st.chain, 1);
        }
        break;
      }
      case "katana":
      case "nodachi": {
        const drawn = external(a, id, "drawn");
        if (drawn === false && st.drawn) st.lastCut = -9;
        if (st.drawn && now - st.lastCut > (def.idle ?? 1.5) && now - st.drawAt > PULL + SWING) {
          st.drawn = false;
          st.sheathAt = Math.max(st.lastCut + (def.idle ?? 1.5), st.drawAt + PULL + SWING);
        }
        const pivotLift = liftedSword(entry, st, s.hump, swordM);
        m2.copy(swordM);
        m3.copy(armPose(entry, swordM, pivotLift, armM));
        break;
      }
    }
  }

  function show(entry, on) {
    if (entry) entry.mesh.visible = on;
  }

  const api = {
    // Each frame, after the fish have moved: every player's weapons on their bodies.
    update(players) {
      now = timeOf();
      dtFrame = Math.min(0.1, Math.max(0, now - last));
      last = now;
      frameNo++;
      for (const player of players) {
        const rig = rigs[player.id % PLAYERS];
        if (!rig) continue;
        rig.seen = frameNo;
        rig.local = !!player.local;
        const s = situate(rig, player);
        const a = player.arsenal ?? {};
        if (!s || s.hidden || (!a.back && !a.belly)) {
          rig.group.visible = false;
          rig.wasShown = false;
          continue;
        }
        rig.group.visible = true;
        rig.group.matrix.fromArray(s.body.instanceMatrix.array, 0);
        rig.group.matrixWorldNeedsUpdate = true;
        for (const kind of KINDS) rig.harness[kind].visible = kind === s.kind;
        const harness = rig.harness[s.kind];
        harness.castShadow = false;
        harness.userData.hump.x = s.hump;
        harness.userData.team = teamColour[rig.id % PLAYERS];
        // (The ID tapes only when there is more than one fish.)
        harness.userData.ammo.set(0, players.length > 1 ? 0 : 1);
        if (s.kind === "alevin" && Math.abs(s.yolk - rig.yolk) >= 0.03) {
          rig.yolk = s.yolk;
          buildAlevinGear(frames.alevin, s.yolk).writeInto(harness.geometry);
        }
        // Shadows only from the local player's weapons, and only once they are big enough
        // for the shadow map (at fry size they would be blotches on the skin).
        const shadows = rig.local && (s.stage >= 5 || (player.fish?.length ?? 0) >= 1);
        for (const place of PLACES) {
          const id = a[place];
          const entry = entryOf(rig, s, id);
          if (rig.shown[place] !== entry) {
            show(rig.shown[place], false);
            show(entry, true);
            rig.shown[place] = entry;
          }
          if (id && rig.shownId[place] !== id) {
            // A weapon found: it slides into its clamps (not at the start, nor on a body swap,
            // nor when the change was not seen as it happened: tests swap weapons unseen).
            if (rig.wasShown && rig.shownId[place] && now - rig.updated < 0.1) stateOf(rig, id).equip = now;
            rig.shownId[place] = id;
          }
          if (!entry) continue;
          entry.mesh.castShadow = shadows;
          animate(entry, stateOf(rig, id), s, a, id);
        }
        rig.wasShown = true;
        rig.updated = now;
      }
      // Players who left: their gear goes with them.
      for (const rig of rigs) if (rig.seen !== frameNo) rig.group.visible = false;
    },
    // Where the barrel of the weapon in `place` ends, in the world (null: no model).
    muzzle(player, place, out) {
      const rig = rigs[player.id % PLAYERS];
      const s = rig && situate(rig, player);
      const id = player.arsenal?.[place];
      const entry = entryOf(rig, s, id);
      if (!entry || s.hidden) return null;
      now = timeOf();
      const st = stateOf(rig, id);
      if (entry.parts.sword) {
        // The blade's tip: where it is when drawn, or where a cut would reach straight ahead
        // (not inside the saya).
        if (st.drawn) {
          liftedSword(entry, st, s.hump, swordM);
          point.set(...entry.parts.sword.tip).applyMatrix4(swordM);
        } else {
          const nodachi = entry.id === "nodachi";
          const reach = entry.parts.sword.tip[0] + (nodachi ? 0.09 : 0);
          const pitch = nodachi ? -10 * DEG : -0.13;
          point.set(nodachi ? 0.12 : 0.25, entry.F.railTop + (nodachi ? 0.12 : 0.024), nodachi ? 0 : -0.004);
          point.x += Math.cos(pitch) * reach;
          point.y += Math.sin(pitch) * reach + riseOf("rail", entry.F, s.hump);
        }
      } else {
        const list = entry.muzzles;
        const slot = entry.ammo && entry.ammo.kind !== "chain" ? nextSlot(entry, st) : st.shot;
        point.set(...list[slot % list.length]);
        point.y += riseOf(entry.def.anchor, entry.F, s.hump);
      }
      // The comic size, and the slide into the clamps.
      mountOf(entry, pos);
      point.sub(pos).multiplyScalar(s.gag).add(pos);
      point.x += st.slide;
      matrix.fromArray(s.body.instanceMatrix.array, 0);
      return out.copy(point.applyMatrix4(matrix));
    },
    // A shot fired: the weapon kicks (and turns its cylinder, breaks open, cuts, empties a
    // tube ...).
    recoil(player, place) {
      const rig = rigs[player.id % PLAYERS];
      const id = player.arsenal?.[place];
      if (!rig || !id) return;
      now = timeOf();
      const st = stateOf(rig, id);
      st.kick = now;
      st.firing = now;
      st.shot++;
      const def = WEAPON_MODELS[id];
      if (id === "granate") {
        st.cyl += Math.PI / 3;
        if (--st.shells <= 0) {
          st.shells = def.shells;
          st.reloadAt = now;
        }
      }
      if (id === "flinte" && --st.shells <= 0) {
        // Both barrels fired: it breaks open as the second one's kick is over.
        st.open = now + 0.12;
        st.shells = def.shells;
      }
      const s = situate(rig, player);
      const entry = entryOf(rig, s, id);
      if (entry?.ammo && entry.ammo.kind !== "chain") fireSlot(entry, st);
      if (id === "katana" || id === "nodachi") {
        st.cutDir = -st.cutDir;
        if (!st.drawn) {
          st.drawn = true;
          st.drawAt = now;
          st.firstDir = st.cutDir;
          st.cut = now + PULL + SWING;
        } else st.cut = Math.max(now, st.drawAt + PULL + SWING);
        st.lastCut = now;
      }
    },
    // Each frame, after the enemies have moved and the larvae are drawn: the enemies' weapons
    // on their bodies.
    enemies(list, larvae) {
      foes?.update(list, larvae);
    },
    // Where an enemy's round leaves its barrel, in the world, into `out` (false: it has none,
    // and the round leaves from its snout).
    enemyMuzzle(e, out) {
      return foes ? foes.muzzle(e, out) : false;
    },
    // An enemy fired: its gun kicks (the next barrel, the cylinder turning on ...).
    enemyShot(e) {
      foes?.shot(e);
    },
    // Everything gone (a new game in the same page).
    dispose() {
      foes?.dispose();
      for (const rig of rigs) {
        rig.group.removeFromParent();
        rig.harness.alevin.geometry.dispose();
      }
      for (const g of Object.values(harnessGeometry)) g.dispose();
      for (const kind of KINDS) for (const b of Object.values(built[kind])) b.geometry.dispose();
      material.dispose();
    },
  };
  // Development handle, under the same condition as the game's own window.salmon: the test
  // tools pose the moving parts (a cut, a volley), count triangles and draws through it.
  const query = new URLSearchParams(globalThis.location?.search ?? "");
  if (query.get("capture") || query.get("diagnostics") === "1" || query.has("shots"))
    globalThis.fvModels = {
      api,
      rigs,
      triangles: () =>
        Object.fromEntries(
          KINDS.flatMap((kind) => Object.entries(built[kind]).map(([id, b]) => [`${kind}/${id}`, b.triangles]))
            .concat(["parr", "salmon"].map((kind) => [`${kind}/harness`, harnessGeometry[kind].index.count / 3]))
            .concat([["alevin/harness", rigs[0].harness.alevin.geometry.index.count / 3]]),
        ),
      // Visible gear meshes per player (each one draw, plus its shadow and mirror passes).
      draws: () => rigs.map((rig) => (rig.group.visible ? rig.meshes.filter((m) => m.visible).length : 0)),
      // The enemies' gear: copies drawn per kind, triangles per kind.
      foes,
    };
  return api;
}
