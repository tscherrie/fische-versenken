// The weapons of the salmon's own school (fv/school.js) on their bodies: from the smolt on
// every fish of the school carries one of the salmon's own guns, strapped on with the
// salmon's own harness (model-harness.js, model-weapons.js), and turns it toward what it aims
// at. Up to the school's whole size of them are about at once, so the gear is drawn as the
// enemies' is (foe-gear.js): one mesh per weapon (and one for the harness), each drawn once
// for every fish that wears it, with room for the whole school (`capacity`).
//
// ONE material for all of it, built before the shader warm-up with every mesh: a copy's place
// and what its gun is doing travel as per-copy attributes (an instanced buffer of 24 floats a
// copy: the three rows of its matrix; yaw, pitch, kick and the first moving part's turn; the
// ammunition window, the hump and the glow; the second moving part's turn), so one shader
// serves every weapon. The gun turns about its mount toward the aim and kicks back along its
// bore; the harness and what is bolted to the fish stay; the webbing rises with a spawner's
// hump as the skin under it does (as models.js has it for the salmon); spent ammunition (a
// torpedo's nose, a rocket's tip, the harpoon) folds away until it is back.
//
// Each copy follows its fish exactly as school.js draws it: along its heading, scaled to its
// size. A fish that falls keeps its gun strapped on as its body floats up belly first (an
// enemy record of its own by then: enemies.pose), and loses it with the body when it bursts.
// Nothing is allocated per frame.

import * as THREE from "three";
import { Fn, attribute, cos, cross, dot, exp, float, mod, normalGeometry, normalLocal, positionGeometry, select, sin, uniform, vec3, vec4 } from "three/tsl";
import { MODEL_LENGTH } from "../../anatomy.js";
import { waterLit } from "../../render/water.js";
import { PALETTE, bodyFrame, buildHarness } from "../model-harness.js";
import { Kit, colour, lift } from "../model-parts.js";
import { WEAPON_MODELS } from "../model-weapons.js";

// Floats a copy: rows of its matrix (12), pose (4), more (4), extra (4).
const STRIDE = 24;
// anatomy.js: the spawner's back rises by up to 42 % at x = 0.12 (as models.js has it).
const HUMP = 0.42;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// How far each kind of mount lets its gun turn from straight ahead (radians): [least, most]
// yaw (positive toward the fish's left) and pitch (positive up). A gun on the middle rail
// turns like a turret; one on the right side clamps swings out to the right far more than in
// over the back; what is bolted rigidly under the belly does not turn at all (its fish points
// it: school.js fires it only at what is ahead).
export const ARCS = {
  rail: { yaw: [-1.1, 1.1], pitch: [-0.3, 0.7] },
  side: { yaw: [-1.0, 0.3], pitch: [-0.4, 0.6] },
  rigid: { yaw: [0, 0], pitch: [0, 0] },
};

function schoolMaterial(F) {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.5 });
  const gear = attribute("aGear", "vec4");
  const surf = attribute("aSurf", "vec4");
  const r0 = attribute("iRow0", "vec4"),
    r1 = attribute("iRow1", "vec4"),
    r2 = attribute("iRow2", "vec4");
  // (yaw, pitch, kick, the first moving part's turn), (first empty slot, empty slots, hump,
  // glow) and (the second moving part's turn, -, -, -).
  const pose = attribute("iPose", "vec4");
  const more = attribute("iMore", "vec4");
  const extra = attribute("iExtra", "vec4");
  // The code: zone + 16 mode + 64 part + 256 team (+0.5: exact after interpolation).
  const code = gear.w.add(0.5).floor();
  const team = code.div(256).floor();
  const low = code.sub(team.mul(256));
  const part = low.div(64).floor();
  const low2 = low.sub(part.mul(64));
  const mode = low2.div(16).floor();
  const zone = low2.sub(mode.mul(16));
  const is = (value, n) => value.sub(n).abs().lessThan(0.5);
  // Per mesh: where the gun turns, and how its two moving parts move (each turned about its
  // axis through its pivot, or slid along it).
  const perObject = (initial, key) => uniform(initial).onObjectUpdate(({ object }) => object.userData[key]);
  const pivot = perObject(new THREE.Vector3(), "pivot");
  const aPivot = perObject(new THREE.Vector3(), "aPivot");
  const aAxis = perObject(new THREE.Vector3(1, 0, 0), "aAxis");
  const bPivot = perObject(new THREE.Vector3(), "bPivot");
  const bAxis = perObject(new THREE.Vector3(1, 0, 0), "bAxis");
  // The webbing in its player's colour: the school is its player's (plan, part 5). (One player
  // for now; co-op will hand each player's school its own.)
  const webbing = uniform(new THREE.Vector3(...lift(colour(PALETTE.webbing[0]))));

  const rgb = gear.xyz;
  material.colorNode = select(is(team, 1), rgb.mul(webbing), rgb);
  material.roughnessNode = surf.x;
  material.metalnessNode = surf.y;
  const glowing = select(is(zone, 7), more.w, float(0));
  const lamp = select(is(zone, 14), float(4), float(0));
  material.emissiveNode = rgb.mul(glowing.add(lamp));

  // A point and a normal turned by `a` about `axis` through `at` (Rodrigues).
  const turn = (p, n, at, axis, a) => {
    const c = cos(a),
      s = sin(a);
    const v = p.sub(at);
    const tp = v.mul(c).add(cross(axis, v).mul(s)).add(axis.mul(dot(axis, v).mul(float(1).sub(c)))).add(at);
    const tn = n.mul(c).add(cross(axis, n).mul(s)).add(axis.mul(dot(axis, n).mul(float(1).sub(c))));
    return [tp, tn];
  };
  material.positionNode = Fn(() => {
    const p = positionGeometry,
      n = normalGeometry;
    // The moving parts, each about its own axis.
    const [pa, na] = turn(p, n, aPivot, aAxis, pose.w);
    const [pb, nb] = turn(p, n, bPivot, bAxis, extra.x);
    const isA = is(part, 2),
      isB = is(part, 3);
    const pm = select(isA, pa, select(isB, pb, p));
    const nm = select(isA, na, select(isB, nb, n));
    // The gun and all it carries: kicked back along its bore, then turned about its mount,
    // pitched (about z) and swung (about y).
    const g = pm.sub(pivot).sub(vec3(pose.z, 0, 0));
    const cp = cos(pose.y),
      sp = sin(pose.y),
      cy = cos(pose.x),
      sy = sin(pose.x);
    const pitchP = vec3(g.x.mul(cp).sub(g.y.mul(sp)), g.x.mul(sp).add(g.y.mul(cp)), g.z);
    const pitchN = vec3(nm.x.mul(cp).sub(nm.y.mul(sp)), nm.x.mul(sp).add(nm.y.mul(cp)), nm.z);
    const aimedP = vec3(pitchP.x.mul(cy).add(pitchP.z.mul(sy)), pitchP.y, pitchP.z.mul(cy).sub(pitchP.x.mul(sy))).add(pivot);
    const aimedN = vec3(pitchN.x.mul(cy).add(pitchN.z.mul(sy)), pitchN.y, pitchN.z.mul(cy).sub(pitchN.x.mul(sy)));
    const onGun = part.greaterThan(0.5);
    const placed = select(onGun, aimedP, pm);
    const m = select(onGun, aimedN, nm);
    // The spawner's hump: the webbing rises like the skin under it; a gun rides up rigidly
    // with its mount (the rail at x 0.12, or the side clamps); the belly does not rise.
    const f = more.z.mul(HUMP);
    const u = placed.x.sub(0.12).div(0.14);
    const skin = placed.y.max(0).mul(f).mul(exp(u.mul(u).negate()));
    const dy = select(mode.lessThan(0.5), float(0), select(mode.lessThan(1.5), skin, select(mode.lessThan(2.5), f.mul(F.railTop), f.mul(F.side.y * 0.975))));
    const q = vec4(placed.add(vec3(0, dy, 0)), 1);
    normalLocal.assign(vec3(dot(r0.xyz, m), dot(r1.xyz, m), dot(r2.xyz, m)).normalize());
    // Spent ammunition folds to a point (no area): the items in the window of empty slots;
    // and so do the co-op ID tapes, which a school fish has none of.
    const slot = surf.z,
      slots = surf.w.max(1);
    const along = mod(slot.sub(1).sub(more.x).add(slots).add(0.5), slots);
    const hidden = slot.greaterThan(0.5).and(along.lessThan(more.y)).or(is(team, 2));
    return select(hidden, vec3(0, 0, 0), vec3(dot(r0, q), dot(r1, q), dot(r2, q)));
  })();
  return waterLit(material);
}

// A weapon's mount on the salmon body (models.js: mountOf), which its gun turns about, and how
// far it may turn there.
function mountOf(def, F) {
  if (def.anchor === "rail") return { at: [0.12, F.railTop, 0], arc: ARCS.rail, rise: "rail" };
  if (def.anchor === "side") return { at: [0.12, F.side.y, (def.side ?? 0) * F.side.z], arc: def.side ? ARCS.side : ARCS.rail, rise: "side" };
  return { at: [0.12, F.keel?.top ?? F.bottom(0.12), 0], arc: ARCS.rigid, rise: "none" };
}

// `ids`: the weapons the school may carry (school.js; the torpedo's four-tube rack comes
// with it).
export function createSchoolGear(scene, { ids, capacity = 26, clock }) {
  const F = bodyFrame("salmon");
  const material = schoolMaterial(F);
  const timeOf = clock ?? (() => performance.now() / 1000);
  const meshes = [];
  const gear = {};

  function addMesh(name, geometry, userData) {
    const data = new Float32Array(capacity * STRIDE);
    const buffer = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    ["iRow0", "iRow1", "iRow2", "iPose", "iMore", "iExtra"].forEach((key, i) => geometry.setAttribute(key, new THREE.InterleavedBufferAttribute(buffer, 4, i * 4)));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    // (The draw's copies: the renderer takes an object's `count` as its instance count.)
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    // Under the water with the fish (layer 1: the mirror and the window leave it out, as they
    // leave out the salmon's own gear).
    mesh.layers.set(1);
    mesh.userData = {
      pivot: new THREE.Vector3(),
      aPivot: new THREE.Vector3(),
      aAxis: new THREE.Vector3(1, 0, 0),
      bPivot: new THREE.Vector3(),
      bAxis: new THREE.Vector3(1, 0, 0),
      ...userData,
    };
    scene.add(mesh);
    meshes.push(mesh);
    return { mesh, buffer, data, n: 0 };
  }

  // The harness: the same for every fish (the eco build: the school is many and small).
  const harness = addMesh("School harness", buildHarness(F, { detail: false }).geometry(), {});
  const axisOf = (axis) => (axis === "x" ? [1, 0, 0] : axis === "y" ? [0, 1, 0] : axis === "z" ? [0, 0, 1] : axis ?? [1, 0, 0]);
  for (const id of new Set(ids.flatMap((id) => (id === "torpedo" ? ["torpedo", "torpedo4"] : [id])))) {
    const def = WEAPON_MODELS[id];
    if (!def) continue;
    const b = def.build(F);
    const all = new Kit().append(b.main);
    const parts = {};
    for (const [name, part] of Object.entries(b.parts ?? {})) {
      all.append(part.kit);
      parts[name] = { ...part, index: part.kit.part };
    }
    // The moving parts (PART.a, PART.b) and their axes.
    const byIndex = (index) => Object.values(parts).find((p) => p.index === index);
    const a = byIndex(2),
      bb = byIndex(3);
    const mount = mountOf(def, F);
    const slot = addMesh(`School ${id}`, all.geometry(), {
      pivot: new THREE.Vector3(...mount.at),
      aPivot: new THREE.Vector3(...(a?.pivot ?? [0, 0, 0])),
      aAxis: new THREE.Vector3(...axisOf(a?.axis)).normalize(),
      bPivot: new THREE.Vector3(...(bb?.pivot ?? [0, 0, 0])),
      bAxis: new THREE.Vector3(...axisOf(bb?.axis)).normalize(),
    });
    gear[id] = { ...slot, id, def, parts, a, b: bb, mount, muzzles: b.muzzles, ammo: b.ammo ?? null, triangles: all.triangles };
  }

  // The model of weapon `id` on a fish at `stage` (the torpedo rack grows to 2 x 2 at sea).
  const modelOf = (id, stage) => (id === "torpedo" && stage >= 6 ? gear.torpedo4 : gear[id]) ?? null;

  // Scratch.
  const body = new THREE.Matrix4(),
    basis = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    axisY = new THREE.Vector3(),
    axisZ = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    point = new THREE.Vector3();

  // A fish's body matrix as school.js draws it: along its heading, scaled to its size.
  function frameOf(position, heading, size, out) {
    axisZ.crossVectors(heading, UP);
    if (axisZ.lengthSq() < 1e-6) axisZ.set(0, 0, 1);
    axisZ.normalize();
    axisY.crossVectors(axisZ, heading).normalize();
    basis.makeBasis(heading, axisY, axisZ);
    quaternion.setFromRotationMatrix(basis);
    const k = size / MODEL_LENGTH;
    return out.compose(position, quaternion, scale.set(k, k, k));
  }

  // The kick of the last shot: back fast, then home, and the muzzle's flip (as models.js).
  function kickOf(g, rec, now, out) {
    const r = g.def.recoil;
    const u = (now - (rec.kickAt ?? -9)) / (r?.time || 0.1);
    out.kick = 0;
    out.flip = 0;
    if (!r || u < 0 || u >= 1) return out;
    const f = u < 0.18 ? u / 0.18 : Math.pow(1 - (u - 0.18) / 0.82, 2);
    out.kick = (r.d ?? 0) * f;
    out.flip = (r.flip ?? 0) * f;
    return out;
  }
  const kicked = { kick: 0, flip: 0 };

  // What a copy of weapon gear `g` shows on fish `rec` now: its moving parts, its ammunition,
  // its glow (into `out`: a, b, first, empty, glow).
  const shows = { a: 0, b: 0, first: 0, empty: 0, glow: 0 };
  function showOf(g, rec, now, out) {
    out.a = out.b = out.first = out.empty = out.glow = 0;
    const arsenal = rec.arsenal;
    const id = rec.weapon;
    const loaded = arsenal?.ammo?.[id];
    const count = g.ammo?.count ?? 0;
    switch (g.id) {
      case "minigun":
        // The barrels wind up with the trigger and run on a moment after it.
        out.a = rec.spinAngle ?? 0;
        break;
      case "granate":
        // The cylinder turns on a sixth with every shot.
        out.a = ((rec.shots ?? 0) * Math.PI) / 3;
        break;
      case "flinte":
        // (The spent hulls are only seen flying out, which the school's gun does not show.)
        out.empty = 1;
        break;
      case "torpedo":
      case "torpedo4": {
        // The tubes fired are empty until the rack is reloaded; its doors stand open while any
        // is loaded.
        const left = typeof loaded === "number" ? loaded : count;
        out.empty = Math.max(0, count - left);
        const open = left > 0 || now - (rec.kickAt ?? -9) < 0.25 ? 1 : 0;
        out.a = (g.a?.open ?? 0) * open;
        out.b = (g.b?.open ?? 0) * open;
        break;
      }
      case "raketen":
      case "harpune":
        out.empty = count ? Math.max(0, count - (typeof loaded === "number" ? loaded : count)) : 0;
        break;
      case "blitz": {
        // The windings flicker blue-white while it arcs (each level held a few frames).
        const q = Math.floor(now * 15) + rec.id * 7;
        out.glow = now - (rec.kickAt ?? -9) < 0.2 ? 3 + 3 * (((q * 2654435761) >>> 0) / 4294967296) : 0.15;
        break;
      }
    }
    return out;
  }

  function write(target, m, yaw, pitch, kick, a, first, empty, hump, glow, b) {
    const o = target.n++ * STRIDE,
      d = target.data;
    const e = m.elements;
    d[o] = e[0];
    d[o + 1] = e[4];
    d[o + 2] = e[8];
    d[o + 3] = e[12];
    d[o + 4] = e[1];
    d[o + 5] = e[5];
    d[o + 6] = e[9];
    d[o + 7] = e[13];
    d[o + 8] = e[2];
    d[o + 9] = e[6];
    d[o + 10] = e[10];
    d[o + 11] = e[14];
    d[o + 12] = yaw;
    d[o + 13] = pitch;
    d[o + 14] = kick;
    d[o + 15] = a;
    d[o + 16] = first;
    d[o + 17] = empty;
    d[o + 18] = hump;
    d[o + 19] = glow;
    d[o + 20] = b;
  }

  // One fish's harness and gun, drawn with body matrix `m`.
  function place(rec, m, now) {
    const g = modelOf(rec.weapon, rec.stage ?? 5);
    if (harness.n < capacity) write(harness, m, 0, 0, 0, 0, 0, 0, rec.hump ?? 0, 0, 0);
    if (!g || g.n >= capacity) return;
    kickOf(g, rec, now, kicked);
    showOf(g, rec, now, shows);
    write(g, m, rec.yaw ?? 0, (rec.pitch ?? 0) + kicked.flip, kicked.kick, shows.a, shows.first, shows.empty, rec.hump ?? 0, shows.glow, shows.b);
  }

  const api = {
    meshes,
    gear,
    // The arc a weapon's gun may turn in on the school's fish (ARCS).
    arcOf(id) {
      const g = gear[id];
      return g ? g.mount.arc : ARCS.rigid;
    },
    // Every frame: the gear of every armed fish of the school on its body (`records`: each
    // with its member's position, heading and size, its weapon, the gun's yaw and pitch), and
    // on the fallen ones' bodies (`fallen`: { e (the enemy record the body has become),
    // record }) until they have burst or gone.
    update(records, fallen, pose) {
      const now = timeOf();
      harness.n = 0;
      for (const id in gear) gear[id].n = 0;
      for (const rec of records) {
        if (rec.down || !rec.weapon) continue;
        const f = rec.fish;
        place(rec, frameOf(f.position, f.heading, f.length, body), now);
      }
      for (const { e, record } of fallen) {
        if (e.burst || e.eaten || (e.shown ?? 1) <= 0.01) continue;
        place(record, pose(e, body), now);
      }
      for (const target of [harness, ...Object.values(gear)]) {
        const mesh = target.mesh;
        if (target.n === 0 && mesh.count === 0) continue;
        mesh.count = target.n;
        mesh.visible = target.n > 0;
        if (target.n > 0) {
          target.buffer.clearUpdateRanges();
          target.buffer.addUpdateRange(0, target.n * STRIDE);
          target.buffer.needsUpdate = true;
        }
      }
    },
    // Where the round of `rec`'s next shot leaves its barrel, in the world, into `out` (the
    // gun as it points now: its yaw and pitch, its kick, the hump). Always true: every fish of
    // the school carries its gun.
    muzzle(rec, out) {
      const f = rec.fish;
      const g = modelOf(rec.weapon, rec.stage ?? 5);
      if (!g) return out.copy(f.position);
      const list = g.muzzles;
      const slot = g.ammo && g.ammo.kind !== "chain" ? (g.ammo.count - Math.max(1, rec.arsenal?.ammo?.[rec.weapon] ?? g.ammo.count) + list.length) % list.length : (rec.shots ?? 0) % list.length;
      const m = list[slot % list.length];
      kickOf(g, rec, timeOf(), kicked);
      const [px, py, pz] = g.mount.at;
      const yaw = rec.yaw ?? 0,
        pitch = (rec.pitch ?? 0) + kicked.flip;
      const x = m[0] - px - kicked.kick,
        y = m[1] - py,
        z = m[2] - pz;
      const cp = Math.cos(pitch),
        sp = Math.sin(pitch),
        cy = Math.cos(yaw),
        sy = Math.sin(yaw);
      const x1 = x * cp - y * sp,
        y1 = x * sp + y * cp;
      point.set(x1 * cy + z * sy + px, y1 + py, z * cy - x1 * sy + pz);
      const f0 = (rec.hump ?? 0) * HUMP;
      if (g.mount.rise === "rail") point.y += f0 * F.railTop;
      else if (g.mount.rise === "side") point.y += f0 * F.side.y * 0.975;
      return out.copy(point.applyMatrix4(frameOf(f.position, f.heading, f.length, body)));
    },
    // Where the gun of weapon `id` turns on a fish (its mount), in the fish's model units.
    pivotOf(id) {
      return gear[id]?.mount.at ?? [0.12, 0, 0];
    },
    // Copies drawn per mesh this frame, and triangles per weapon (for the tests).
    counts: () => Object.fromEntries([["harness", harness.mesh.visible ? harness.n : 0], ...Object.entries(gear).map(([id, g]) => [id, g.mesh.visible ? g.n : 0])]),
    triangles: () => Object.fromEntries([["harness", harness.mesh.geometry.index.count / 3], ...Object.entries(gear).map(([id, g]) => [id, g.triangles])]),
  };
  return api;
}
