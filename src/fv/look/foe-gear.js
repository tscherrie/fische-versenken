// The enemies' weapons on their bodies (the shapes are model-foes.js): every armed kind's gear
// is one mesh, drawn once for all the enemies of that kind that are about -- hundreds of small
// fish may be armed at once -- with room for as many as kinds.js lets come (`capacity`).
//
// ONE material for all of it, built before the shader warm-up with every mesh: a copy's place
// and what its gun is doing travel as per-copy attributes of the same names in every mesh
// (an instanced buffer of 20 floats a copy: the three rows of its matrix, then yaw, pitch,
// kick and the moving part, then the rounds loaded and the glow), so one shader serves every
// kind. The material turns the gun about its mount toward the aim, kicks it back along its
// bore, moves its moving part (a revolver's cylinder, a pump's fore-end, a flicked-open blade,
// the minigun's barrels) and hides the ammunition that is gone (a bolt, a bomb, a star). The
// renderer's own instancing is not used: it would place a copy before the gun is turned.
//
// Each copy follows its enemy's body exactly as the body is drawn: a fish's matrix from
// enemies.pose (the crowd's own), a bird's with its model's scale and middle, a larva's from
// the larvae's last draw, the heron's gun along its aim from its head. Nothing is allocated
// per frame; an enemy's own state (its aim, eased; its last shot) lives in a WeakMap made
// once per enemy.
//
// Time is the game's clock (stops in pause).

import * as THREE from "three";
import { Fn, attribute, cos, cross, dot, float, normalGeometry, normalLocal, positionGeometry, select, sin, uniform, vec3, vec4 } from "three/tsl";
import { MODEL_LENGTH } from "../../anatomy.js";
import { waterLit } from "../../render/water.js";
import { KINDS } from "../kinds.js";
import { FOE_GEAR } from "../model-foes.js";
import { colour, lift } from "../model-parts.js";

// Floats a copy: rows of its matrix (12), pose (4), more (4).
const STRIDE = 20;
// The enemies' webbing (team fabric in the shapes shared with the players: the king's harness).
const WEBBING = lift(colour(0x1c1d1a));
const UP = new THREE.Vector3(0, 1, 0);

function foeMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.5 });
  const gear = attribute("aGear", "vec4");
  const surf = attribute("aSurf", "vec4");
  const r0 = attribute("iRow0", "vec4"),
    r1 = attribute("iRow1", "vec4"),
    r2 = attribute("iRow2", "vec4");
  // (yaw, pitch, kick, the moving part) and (rounds loaded, glow, -, -).
  const pose = attribute("iPose", "vec4");
  const more = attribute("iMore", "vec4");
  // The code: zone + 16 mode + 64 part + 256 team (+0.5: exact after interpolation).
  const code = gear.w.add(0.5).floor();
  const team = code.div(256).floor();
  const low = code.sub(team.mul(256));
  const part = low.div(64).floor();
  const low2 = low.sub(part.mul(64));
  const zone = low2.sub(low2.div(16).floor().mul(16));
  const is = (value, n) => value.sub(n).abs().lessThan(0.5);
  // Per mesh: where the gun turns, and how its moving part moves.
  const perObject = (initial, key) => uniform(initial).onObjectUpdate(({ object }) => object.userData[key]);
  const pivot = perObject(new THREE.Vector3(), "pivot");
  const aPivot = perObject(new THREE.Vector3(), "aPivot");
  const aAxis = perObject(new THREE.Vector3(1, 0, 0), "aAxis");
  const aSlide = perObject(0, "aSlide");

  const rgb = gear.xyz;
  material.colorNode = select(is(team, 1), rgb.mul(vec3(...WEBBING)), rgb);
  material.roughnessNode = surf.x;
  material.metalnessNode = surf.y;
  const glowing = select(is(zone, 7), more.y, float(0));
  const lamp = select(is(zone, 14), float(4), float(0));
  material.emissiveNode = rgb.mul(glowing.add(lamp));

  material.positionNode = Fn(() => {
    const p = positionGeometry,
      n = normalGeometry;
    // The moving part: turned about its axis through its pivot (Rodrigues), or slid along it.
    const a = pose.w;
    const c = cos(a),
      s = sin(a);
    const v = p.sub(aPivot);
    const turnedP = v.mul(c).add(cross(aAxis, v).mul(s)).add(aAxis.mul(dot(aAxis, v).mul(float(1).sub(c)))).add(aPivot);
    const turnedN = n.mul(c).add(cross(aAxis, n).mul(s)).add(aAxis.mul(dot(aAxis, n).mul(float(1).sub(c))));
    const sliding = aSlide.greaterThan(0.5);
    const isA = is(part, 2);
    const pa = select(isA, select(sliding, p.add(aAxis.mul(a)), turnedP), p);
    const na = select(isA, select(sliding, n, turnedN), n);
    // The gun and all it carries: kicked back along its bore, then turned about its mount,
    // pitched (about z) and swung (about y).
    const g = pa.sub(pivot).sub(vec3(pose.z, 0, 0));
    const cp = cos(pose.y),
      sp = sin(pose.y),
      cy = cos(pose.x),
      sy = sin(pose.x);
    const pitchP = vec3(g.x.mul(cp).sub(g.y.mul(sp)), g.x.mul(sp).add(g.y.mul(cp)), g.z);
    const pitchN = vec3(na.x.mul(cp).sub(na.y.mul(sp)), na.x.mul(sp).add(na.y.mul(cp)), na.z);
    const aimedP = vec3(pitchP.x.mul(cy).add(pitchP.z.mul(sy)), pitchP.y, pitchP.z.mul(cy).sub(pitchP.x.mul(sy))).add(pivot);
    const aimedN = vec3(pitchN.x.mul(cy).add(pitchN.z.mul(sy)), pitchN.y, pitchN.z.mul(cy).sub(pitchN.x.mul(sy)));
    const onGun = part.greaterThan(0.5);
    const q = vec4(select(onGun, aimedP, pa), 1);
    const m = select(onGun, aimedN, na);
    normalLocal.assign(vec3(dot(r0.xyz, m), dot(r1.xyz, m), dot(r2.xyz, m)).normalize());
    // Ammunition beyond the rounds loaded folds to a point (no area), and so do the co-op ID
    // tapes of a harness shared with the players: an enemy has none.
    const slot = surf.z;
    const hidden = slot.greaterThan(0.5).and(slot.greaterThan(more.x.add(0.5))).or(is(team, 2));
    return select(hidden, vec3(0, 0, 0), vec3(dot(r0, q), dot(r1, q), dot(r2, q)));
  })();
  return waterLit(material);
}

export function createFoeGear(scene, { enemies, camera, clock }) {
  const material = foeMaterial();
  const gear = {};
  const meshes = [];
  for (const [kind, build] of Object.entries(FOE_GEAR)) {
    const spec = KINDS[kind];
    if (!spec) continue;
    // (A bird's straps are laid on its model as the enemies draw it.)
    const g = build({ body: enemies?.birds?.[kind]?.mesh?.geometry ?? null });
    const geometry = g.kit.geometry();
    const capacity = Math.max(1, spec.capacity ?? 1);
    const data = new Float32Array(capacity * STRIDE);
    const buffer = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    ["iRow0", "iRow1", "iRow2", "iPose", "iMore"].forEach((name, i) => geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, 4, i * 4)));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Combat ${kind} gear`;
    // (The draw's copies: the renderer takes an object's `count` as its instance count.)
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    // Under the water with the fish (layer 1: the mirror and the window leave it out); a bird's
    // above it with the bird, where the window must show it.
    const layer = g.frame === "bird" || g.frame === "head" ? 0 : 1;
    mesh.layers.set(layer);
    const part = g.part ?? { pivot: [0, 0, 0], axis: [1, 0, 0], slide: false };
    mesh.userData = {
      pivot: new THREE.Vector3(...g.pivot),
      aPivot: new THREE.Vector3(...part.pivot),
      aAxis: new THREE.Vector3(...part.axis).normalize(),
      aSlide: part.slide ? 1 : 0,
    };
    scene.add(mesh);
    meshes.push(mesh);
    gear[kind] = { ...g, kind, spec, weapon: spec.weapon, mesh, layer, buffer, data, capacity, n: 0, triangles: g.kit.triangles };
  }

  const timeOf = clock ?? (() => performance.now() / 1000);
  const states = new WeakMap();
  const stateOf = (e) => {
    let st = states.get(e);
    if (!st) states.set(e, (st = { t: timeOf(), yaw: 0, pitch: 0, kickAt: -9, shot: 0, thrust: 0, swing: 0, open: 0, openAt: -9, spin: 0, angle: 0, cyl: 0, cylShown: 0, glow: 0 }));
    return st;
  };
  let larvae = null;

  // Scratch.
  const body = new THREE.Matrix4(),
    scale = new THREE.Matrix4(),
    vx = new THREE.Vector3(),
    vy = new THREE.Vector3(),
    vz = new THREE.Vector3(),
    dir = new THREE.Vector3(),
    point = new THREE.Vector3(),
    sphere = new THREE.Sphere(),
    frustum = new THREE.Frustum(),
    viewProjection = new THREE.Matrix4();
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  // How far an eased value goes toward its aim in dt at `rate` (a function made once, not a
  // closure per enemy per frame).
  const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

  // Whether an enemy carries its weapon to be seen: the gear goes where the body goes -- a
  // sunk fish floats up belly first with its gun still strapped on, and shrinks away with the
  // corpse -- and is gone with it: burst (the body came apart), eaten. A peaceful shoal fish
  // stood in for (e.neutral) carries none, nor one that only flees (passive); nor a dead heron
  // (its head, which held the gun, is no longer drawn).
  const armed = (e, g) => !e.neutral && !e.passive && !e.eaten && !e.burst && (e.shown ?? 1) > 0.01 && !(e.dead && g.frame === "head");

  // The matrix the gear of `e` is drawn with (the frame its shapes were built in), into `out`;
  // false when there is none.
  function frameOf(e, g, out) {
    switch (g.frame) {
      case "fish":
        enemies.pose(e, out);
        return true;
      case "bird": {
        const b = enemies.birds?.[e.kind];
        if (!b) return false;
        const model = b.plunge && e.mode === "strike" && !e.dead ? b.plunge : b;
        const s = MODEL_LENGTH / model.length;
        enemies.pose(e, out).multiply(scale.makeScale(s, s, s).setPosition(-model.middle * s, 0, 0));
        return true;
      }
      case "head": {
        // Along its aim from its head, the gun's top turned toward its body (back and up).
        if (!e.muzzle || !e.aimDir) return false;
        vx.copy(e.aimDir).normalize();
        vy.copy(UP).multiplyScalar(0.5);
        if (e.facing) vy.sub(e.facing);
        vy.addScaledVector(vx, -vy.dot(vx));
        if (vy.lengthSq() < 1e-6) vy.set(1, 0, 0).addScaledVector(vx, -vx.x);
        vy.normalize();
        vz.crossVectors(vx, vy);
        out.makeBasis(vx, vy, vz).setPosition(e.muzzle);
        return true;
      }
      case "larva":
        return !!larvae?.matrixOf?.(e, out);
    }
    return false;
  }

  // Whether it is out of rounds just now: reloading after a burst, or the burst's last shot
  // gone and the reload not yet begun.
  const reloading = (e) => (e.reload ?? 0) > 0 || (e.mode === "fire" && (e.shots ?? 1) <= 0);

  // Bring an enemy's gear up to now: its aim (eased toward where the round will go while it
  // aims and fires), its kick, what its moving part and its ammunition do. Returns the state.
  function advance(e, g, st, frame, now) {
    // (Settled at once for the look scenes' posed stills.)
    const dt = api.settle ? 5 : clamp(now - st.t, 0, 0.1);
    st.t = now;
    const spec = e.spec;
    const gun = spec.weapon;
    // The aim: the lead the enemy fires along (enemies.js: lead), in the gear's own frame.
    let yaw = 0,
      pitch = 0;
    const fish = e.target?.fish;
    if (g.aim && fish && (e.mode === "aim" || e.mode === "fire")) {
      const d = fish.position.distanceTo(e.position);
      const t = Math.min(1.2, d / Math.max(1, gun.speed ?? 10));
      dir.copy(fish.position);
      if (fish.velocity) dir.addScaledVector(fish.velocity, t);
      dir.sub(e.position);
      const m = frame.elements;
      const lx = m[0] * dir.x + m[1] * dir.y + m[2] * dir.z,
        ly = m[4] * dir.x + m[5] * dir.y + m[6] * dir.z,
        lz = m[8] * dir.x + m[9] * dir.y + m[10] * dir.z;
      yaw = clamp(Math.atan2(-lz, lx), -g.aim[0], g.aim[0]);
      pitch = clamp(Math.atan2(ly, Math.hypot(lx, lz)), -g.aim[1], g.aim[1]);
    }
    st.yaw += (yaw - st.yaw) * ease(dt, 9);
    st.pitch += (pitch - st.pitch) * ease(dt, 9);
    // The kick of the last shot: back fast, then home (and the muzzle's flip).
    const r = g.recoil;
    let kick = 0,
      flip = 0;
    if (r) {
      const u = (now - st.kickAt) / r.time;
      if (u >= 0 && u < 1) {
        const f = u < 0.18 ? u / 0.18 : Math.pow(1 - (u - 0.18) / 0.82, 2);
        kick = r.d * f;
        flip = (r.flip ?? 0) * f;
      }
    }
    st.kick = kick;
    st.aimPitch = st.pitch + flip;
    st.a = 0;
    st.loaded = 99;
    st.glow = 0;
    const mode = e.mode;
    switch (g.melee) {
      case "thrust":
        // The knife goes in with the lunge.
        st.thrust += ((mode === "strike" ? -0.05 : 0) - st.thrust) * ease(dt, mode === "strike" ? 30 : 8);
        st.kick = st.thrust;
        break;
      case "chop": {
        // The machete is raised as the otter rears for the blow, and comes down with it.
        const coil = spec.coil || 0.6;
        const want = mode === "coil" ? 1.1 * Math.min(1, (e.t ?? 0) / coil) : mode === "strike" || (e.blow ?? 0) > 0 ? -0.7 : 0;
        st.swing += (want - st.swing) * ease(dt, mode === "strike" || (e.blow ?? 0) > 0 ? 30 : 10);
        st.aimPitch = st.swing;
        break;
      }
      case "shock": {
        // Live while it draws up and strikes: the arc crackles between the electrodes (each
        // level held a few frames: the temporal blend would smooth a faster flicker away).
        const live = mode === "coil" || mode === "strike";
        if (live) {
          const q = Math.floor(now * 15) + e.id * 7;
          st.glow = 2.5 + 3 * (((q * 2654435761) >>> 0) / 4294967296);
        }
        st.loaded = live ? 1 : 0;
        break;
      }
      case "flick": {
        // The blade springs open as the larva draws up to strike, and is folded away again a
        // while after.
        if (mode === "coil" || mode === "strike") st.openAt = now;
        const open = now - st.openAt < 2.5 ? 1 : 0;
        st.open += (open - st.open) * ease(dt, open ? 40 : 5);
        st.a = (1 - st.open) * Math.PI * 0.94;
        break;
      }
    }
    if (g.spins) {
      // The barrels wind up while it aims and runs on a moment after the burst; no faster
      // than 25 degrees a frame (six barrels: faster would seem to turn backward).
      const on = mode === "aim" || mode === "fire";
      st.spin = clamp(st.spin + (on ? dt / 0.45 : -dt / 0.8), 0, 1);
      st.angle = (st.angle + Math.min(25 * (Math.PI / 180), st.spin * 40 * dt)) % (Math.PI * 2);
      st.a = st.angle;
    }
    if (g.revolver) {
      // The cylinder turns on a fifth with every shot.
      st.cylShown += Math.min(st.cyl - st.cylShown, ((Math.PI * 2) / 5) * (dt / 0.07));
      st.a = st.cylShown;
    }
    if (g.blowback) {
      // The slide runs back and home with each shot.
      const u = (now - st.kickAt) / 0.09;
      st.a = u >= 0 && u < 1 ? -g.blowback * Math.sin(Math.PI * u) : 0;
    }
    if (g.pump) {
      // Pumped after the shot: the fore-end back and forward again.
      const u = (now - st.kickAt - 0.2) / 0.34;
      st.a = u >= 0 && u < 1 ? -g.pump * Math.sin(Math.PI * u) : 0;
    }
    if (g.items) {
      const empty = reloading(e);
      if (g.throws) st.loaded = empty ? g.items - 1 : g.items;
      else if (g.melee !== "shock") st.loaded = empty ? 0 : g.items;
    }
    if (g.bombs) {
      // A bomb under each wing until it has let them go; both back once it has reloaded.
      st.loaded = (e.reload ?? 0) > 0 ? (e.dropping ?? 0) : g.bombs;
    }
    return st;
  }

  // A point of the gun (in its build frame) where the gun is now, into `out` (same frame).
  function onGun(g, st, p, out) {
    const px = p[0] - g.pivot[0] - st.kick,
      py = p[1] - g.pivot[1],
      pz = p[2] - g.pivot[2];
    const cp = Math.cos(st.aimPitch),
      sp = Math.sin(st.aimPitch),
      cy = Math.cos(st.yaw),
      sy = Math.sin(st.yaw);
    const x1 = px * cp - py * sp,
      y1 = px * sp + py * cp;
    return out.set(x1 * cy + pz * sy + g.pivot[0], y1 + g.pivot[1], pz * cy - x1 * sy + g.pivot[2]);
  }

  const api = {
    gear,
    meshes,
    // For the look scenes: the easing settled at once, and an enemy's gear state.
    settle: false,
    state: (e) => stateOf(e),
    // Every frame, after the enemies have moved (and after the larvae are drawn: their gear
    // takes their matrices): every armed enemy's gear on its body.
    update(list, larvaeModels = null) {
      if (larvaeModels) larvae = larvaeModels;
      const now = timeOf();
      for (const kind in gear) gear[kind].n = 0;
      if (camera) {
        camera.updateMatrixWorld();
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(viewProjection);
      }
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        const g = gear[e.kind];
        if (!g || g.n >= g.capacity || !armed(e, g)) continue;
        // (Out of the view, or too far to make out, it is not drawn and its state waits: tried
        // on the body's middle before its pose is worked out. Not so a bird's: a bird is drawn
        // for the water's mirror and the window in the surface too, which see what the camera
        // does not, and there are never more than a few.)
        if (camera && g.layer === 1) {
          sphere.center.copy(e.position);
          sphere.radius = e.size * 1.2;
          if (!frustum.intersectsSphere(sphere)) continue;
          if (sphere.center.distanceTo(camera.position) > 12 + e.size * 60) continue;
        }
        if (!frameOf(e, g, body)) continue;
        const m = body.elements;
        const st = advance(e, g, stateOf(e), body, now);
        const o = g.n++ * STRIDE,
          d = g.data;
        d[o] = m[0];
        d[o + 1] = m[4];
        d[o + 2] = m[8];
        d[o + 3] = m[12];
        d[o + 4] = m[1];
        d[o + 5] = m[5];
        d[o + 6] = m[9];
        d[o + 7] = m[13];
        d[o + 8] = m[2];
        d[o + 9] = m[6];
        d[o + 10] = m[10];
        d[o + 11] = m[14];
        d[o + 12] = st.yaw;
        d[o + 13] = st.aimPitch;
        d[o + 14] = st.kick;
        d[o + 15] = st.a;
        d[o + 16] = st.loaded;
        d[o + 17] = st.glow;
      }
      for (const kind in gear) {
        const g = gear[kind];
        const mesh = g.mesh;
        if (g.n === 0 && mesh.count === 0) continue;
        mesh.count = g.n;
        mesh.visible = g.n > 0;
        if (g.n > 0) {
          g.buffer.clearUpdateRanges();
          g.buffer.addUpdateRange(0, g.n * STRIDE);
          g.buffer.needsUpdate = true;
        }
      }
    },
    // Where the round of `e`'s next shot leaves its barrel, in the world (false: no barrel).
    muzzle(e, out) {
      const g = gear[e.kind];
      if (!g?.muzzles || e.dead || !armed(e, g) || !frameOf(e, g, body)) return false;
      const st = advance(e, g, stateOf(e), body, timeOf());
      onGun(g, st, g.muzzles[st.shot % g.muzzles.length], point);
      out.copy(point.applyMatrix4(body));
      return true;
    },
    // A shot fired: the gun kicks, the next barrel's turn, the cylinder turns on.
    shot(e) {
      const g = gear[e.kind];
      if (!g) return;
      const st = stateOf(e);
      st.kickAt = timeOf();
      st.shot++;
      if (g.revolver) st.cyl += (Math.PI * 2) / 5;
    },
    // Where a point of `e`'s gear (in its build frame) is in the world, into `out` (the look
    // scenes aim their camera by it); null when it has no frame now.
    where(e, p, out) {
      const g = gear[e.kind];
      if (!g || !frameOf(e, g, body)) return null;
      return out.set(p[0], p[1], p[2]).applyMatrix4(body);
    },
    // The line of `e`'s bore as its gun points now, into `from` (a little behind the muzzle)
    // and `to` (the muzzle), in the world: the look scenes check the rounds fly along it.
    aimLine(e, from, to) {
      const g = gear[e.kind];
      if (!g?.muzzles || !frameOf(e, g, body)) return false;
      const st = stateOf(e);
      const m = g.muzzles[st.shot % g.muzzles.length];
      onGun(g, st, m, to).applyMatrix4(body);
      onGun(g, st, [m[0] - 0.1, m[1], m[2]], from).applyMatrix4(body);
      return true;
    },
    // Copies drawn per kind this frame, and triangles in all (for the tests).
    counts: () => Object.fromEntries(Object.entries(gear).map(([kind, g]) => [kind, g.mesh.visible ? g.n : 0])),
    triangles: () => Object.fromEntries(Object.entries(gear).map(([kind, g]) => [kind, g.triangles])),
    dispose() {
      for (const g of Object.values(gear)) {
        g.mesh.removeFromParent();
        g.mesh.geometry.dispose();
      }
      material.dispose();
    },
  };
  return api;
}
