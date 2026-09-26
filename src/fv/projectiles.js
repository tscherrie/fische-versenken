// Everything that flies: laser bolts, pellets, grenades, the flame's puffs. A shot is a small
// record -- where it is, how fast it goes, what it does when it hits -- kept in one list and
// moved each step. Hits are tested along the whole path of the step (a fast bolt moves more
// than a small fish's length in one step), against the enemies' bodies, the stones near the
// players, the bed, and the surface. The records are pooled: nothing is allocated per shot.
//
// Ballistics as in air (the user's rule): no water drag on bullets; what has `gravity` falls
// with it and may bounce off the bed and the stones; `drag` is only for fire and smoke.
//
// In co-op a shot is one event: it flies the same on every machine, and only the enemy's
// owner decides what it did (plan, part 5). Here it is the local game alone.
//
// Two more pictures live here, for the weapons' own looks (weapons.js drives them):
//   createSmoke    powder smoke, blast gas, silt off the bed, soot, gravel flung by a blast:
//                  a sorted cloud of normal-blended puffs that darken what is behind them
//                  (the glows in fx.js can only brighten).
//   createRibbons  thin additive strips: the katana's cut, the dash cut's line.

import * as THREE from "three";
import { Fn, attribute, cameraPosition, cos, exp, float, length, mix, positionWorld, select, sin, smoothstep, texture, uv, vec2, vec4 } from "three/tsl";
import { bed, level, locate } from "../course.js";
import { PointCloud, perPoint, skyUniforms } from "../materials.js";
import { river, waterLit, waterTime } from "../render/water.js";
import { extinction, fogNodes } from "../render/fog.js";
import { ditherThreshold } from "../render/dither.js";
import { FX_LAYER } from "./fx.js";

// Closest distance between segments p0-p1 and q0-q1, squared (a standard clamp-and-project);
// how far along p0-p1 the closest point lies is left in `along`.
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

// A 40 mm grenade (HE-DP): a stubby olive body with a gold ogive, along +x, 1 long.
function grenadeGeometry() {
  const body = new THREE.CylinderGeometry(0.42, 0.42, 0.62, 10, 1);
  body.rotateZ(-Math.PI / 2);
  body.translate(-0.12, 0, 0);
  const nose = new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.scale(1, 1.1, 1);
  nose.rotateZ(-Math.PI / 2);
  nose.translate(0.19, 0, 0);
  const band = new THREE.CylinderGeometry(0.44, 0.44, 0.1, 10, 1);
  band.rotateZ(-Math.PI / 2);
  band.translate(-0.4, 0, 0);
  const parts = [
    [body, [0.24, 0.26, 0.16]],
    [nose, [0.78, 0.6, 0.18]],
    [band, [0.62, 0.45, 0.2]],
  ];
  const positions = [],
    normals = [],
    colors = [];
  for (const [g, c] of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    positions.push(...n.attributes.position.array);
    normals.push(...n.attributes.normal.array);
    for (let i = 0; i < n.attributes.position.count; i++) colors.push(...c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// The fields a shot record carries, with their values for a new shot (weapons set what they
// need after fire()).
const NO_TINT = [6, 1, 0.5];
function blank(p) {
  p.owner = 0;
  p.weapon = null;
  p.damage = 0;
  p.radius = 0.03;
  p.life = 1.5;
  p.age = 0;
  p.size = 0.05;
  p.tint = NO_TINT;
  p.core = null;
  p.stretch = 3;
  p.gravity = 0;
  p.bounce = 0;
  p.maxBounces = 0;
  p.bounces = 0;
  p.drag = 0;
  p.ghost = false;
  p.pierce = 0;
  p.pierceKeep = 0.85;
  p.passed.clear();
  p.sky = 0.05;
  p.solid = null;
  p.scale = 1;
  p.shooter = 1;
  p.volley = 0;
  p.falloff = null;
  p.shove = 0;
  p.grow = 0;
  p.cool = null;
  p.fade = 0;
  p.fuse = false;
  p.spin = Math.random() * Math.PI * 2;
  return p;
}

export function createProjectiles({ capacity = 300, scene = null, camera = null, solidCapacity = 32 } = {}) {
  const live = [];
  // The records, made once; `free` holds those not in flight.
  const free = [];
  for (let i = 0; i < capacity; i++) free.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), last: new THREE.Vector3(), river: { s: null, u: 0 }, passed: new Set(), born: 0 });
  let born = 0;
  const tail = new THREE.Vector3();
  const head = new THREE.Vector3();
  const from = new THREE.Vector3();
  const end = new THREE.Vector3();
  const normal = new THREE.Vector3();

  // Grenades are solid, lit bodies (one instanced draw), not glows.
  let solids = null;
  if (scene) {
    const material = waterLit(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }));
    solids = new THREE.InstancedMesh(grenadeGeometry(), material, solidCapacity);
    solids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    solids.name = "Combat grenades";
    solids.frustumCulled = false;
    solids.castShadow = false;
    solids.receiveShadow = true;
    solids.layers.set(FX_LAYER);
    // One instance, too small to see, until the first frame: the warm-up compiles it.
    solids.setMatrixAt(0, new THREE.Matrix4().makeScale(1e-5, 1e-5, 1e-5));
    solids.count = 1;
    scene.add(solids);
  }
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const dir = new THREE.Vector3();
  const eye = new THREE.Vector3();

  // A new shot from `position` along `velocity` (both copied), for `owner` (a player id) and
  // `weapon` (an id). The record comes back with every field at its default: the weapon sets
  // what it needs (damage, radius, life, size, tint, core, stretch; gravity, bounce and
  // maxBounces, fuse, drag, ghost, pierce, sky, solid, scale; volley, falloff, shove, grow,
  // cool, fade, shooter). When the pool is dry the oldest glow goes first; a grenade is
  // kept if anything else can go.
  function spawn(owner, weapon, position, velocity, s = null) {
    let p = free.pop();
    if (!p) {
      let oldest = -1;
      for (let i = 0; i < live.length; i++) if (!live[i].solid && (oldest < 0 || live[i].born < live[oldest].born)) oldest = i;
      if (oldest < 0) oldest = 0;
      p = live[oldest];
      live[oldest] = live[live.length - 1];
      live.pop();
    }
    blank(p);
    p.owner = owner ?? 0;
    p.weapon = weapon;
    p.position.copy(position);
    p.last.copy(position);
    p.velocity.copy(velocity);
    p.river.s = s;
    p.river.u = 0;
    p.born = ++born;
    live.push(p);
    return p;
  }
  // The same with the fields given in one object (for tests and rare shots).
  function fire(o) {
    const p = spawn(o.owner, o.weapon, o.position, o.velocity, o.s ?? null);
    for (const k in o) if (k !== "position" && k !== "velocity" && k !== "s" && k !== "owner" && k !== "weapon") p[k] = o[k];
    return p;
  }
  // (Taken out of the list at `i`, its place filled from the end, and back to the pool.)
  function drop(i) {
    const p = live[i];
    live[i] = live[live.length - 1];
    live.pop();
    free.push(p);
  }

  // Move every shot one step. `enemies`: the enemy list; `stones`: colliders near the
  // players (terrain.collidersNear); the callbacks get the shot, and the enemy or point hit:
  // onEnemy, onGround, onStone, onBounce(shot, "bed" | "stone"), onExpire (fused shots). The
  // shot is handed back to the pool right after its callback: keep nothing of it.
  function update(dt, { enemies, stones, onEnemy, onGround, onStone, onBounce, onExpire }) {
    // (Backwards, so a shot moved into a freed place has had its step already.)
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (p.fuse) onExpire?.(p);
        drop(i);
        continue;
      }
      from.copy(p.position);
      p.last.copy(p.position);
      if (p.drag) p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
      p.position.addScaledVector(p.velocity, dt);
      // (Exact for a constant pull, whatever the step: the arc lands where it was aimed.)
      if (p.gravity) {
        p.position.y -= 0.5 * p.gravity * dt * dt;
        p.velocity.y -= p.gravity * dt;
      }
      p.spin += dt * 14;
      // The enemies: the nearest body along the path.
      if (!p.ghost) {
        let best = null,
          bestS = 2;
        for (const e of enemies) {
          if (e.dead || (p.pierce && p.passed.has(e))) continue;
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
          if (p.pierce > 0) {
            // On through it, a little slower.
            p.pierce--;
            p.passed.add(best);
            end.copy(p.position);
            p.position.lerpVectors(from, end, bestS);
            onEnemy?.(p, best);
            p.position.copy(end);
            p.damage *= p.pierceKeep;
          } else {
            p.position.lerpVectors(from, p.position, bestS);
            onEnemy?.(p, best);
            drop(i);
            continue;
          }
        }
      }
      // Stones: the end of the step inside one (each a turned ellipsoid).
      let struck = null;
      for (const c of stones) {
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
          // The surface's normal there (the ellipsoid's gradient, turned back to the world).
          const gx = ax / rx,
            gy = ay / ry,
            gz = az / rz;
          normal.set(gx * cs + gz * sn, gy, -gx * sn + gz * cs).normalize();
          break;
        }
      }
      if (struck) {
        if (p.ghost) {
          drop(i);
          continue;
        }
        if (p.bounce && p.bounces < p.maxBounces) {
          p.bounces++;
          p.position.copy(from);
          const vn = p.velocity.dot(normal);
          if (vn < 0) p.velocity.addScaledVector(normal, -(1 + p.bounce) * vn);
          p.velocity.multiplyScalar(0.8);
          onBounce?.(p, "stone");
          continue;
        }
        onStone?.(p, struck);
        drop(i);
        continue;
      }
      // The bed and the surface.
      locate(p.position.x, p.position.z, p.river.s, p.river);
      const floor = bed(p.river.s, p.river.u);
      if (p.position.y < floor) {
        if (p.ghost) {
          // Fire along the bed: it spreads and dies.
          p.position.y = floor + 0.01;
          p.velocity.y = Math.abs(p.velocity.y) * 0.2;
          continue;
        }
        if (p.bounce && p.bounces < p.maxBounces) {
          p.bounces++;
          p.position.y = floor + 0.005;
          p.velocity.y = Math.abs(p.velocity.y) * p.bounce;
          p.velocity.x *= 0.7;
          p.velocity.z *= 0.7;
          onBounce?.(p, "bed");
          continue;
        }
        onGround?.(p);
        drop(i);
        continue;
      }
      if (p.position.y > level(p.river.s) + p.sky) {
        drop(i);
        continue;
      }
    }
  }

  // Each frame: the solid shots' bodies, turned along their flight and tumbling a little.
  function draw() {
    if (!solids) return;
    if (camera) camera.getWorldPosition(eye);
    // (How tall the picture is at one unit from the eye.)
    const tall = 2 * Math.tan(((camera?.fov ?? 62) * Math.PI) / 360);
    let n = 0;
    for (const p of live) {
      if (!p.solid || n >= solidCapacity) continue;
      dir.copy(p.velocity);
      if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
      dir.normalize();
      quaternion.setFromUnitVectors(X, dir);
      quaternion.multiply(spin.setFromAxisAngle(X, p.spin));
      // 40 mm on a launcher sized to the fish (the model's 0.024 long x k), shown half again
      // as big so it reads at the chase camera's distance -- and never smaller than about
      // eight pixels in a 720 p picture, so the arc can be followed at any size.
      const k = Math.max(p.scale * 0.046, camera ? 0.011 * tall * eye.distanceTo(p.position) : 0);
      matrix.compose(p.position, quaternion, scale.set(k, k, k));
      solids.setMatrixAt(n++, matrix);
    }
    solids.count = n;
    if (n) solids.instanceMatrix.needsUpdate = true;
  }

  function reset() {
    while (live.length) drop(live.length - 1);
  }

  return { live, spawn, fire, update, draw, reset };
}

// ---- Smoke: what darkens the water instead of lighting it up.
//
// What a puff is made of (its colour in daylight; the water above takes its share of that
// light, red first, as it does for everything in the river).
export const POWDER = 0; // grey powder smoke off a muzzle
export const GAS = 1; // the grey-brown gas of a charge that went off
export const SILT = 2; // the brown of the bed, stirred up
export const SOOT = 3; // black smoke off a flame
export const GRIT = 4; // gravel and dirt flung by a blast (small, falls as in air)
const ALBEDO = [
  [0.8, 0.8, 0.77],
  [0.48, 0.42, 0.32],
  [0.83, 0.68, 0.47],
  [0.048, 0.045, 0.04],
  [0.12, 0.105, 0.085],
];

// 1 at `from`, 0 at `to` (from < to), smooth in between.
const fall = (x, from, to) => smoothstep(from, to, x).oneMinus();

// Per puff, three vec4s: position (xyz, width), shade (opacity, seed, turn on the screen,
// stretch), tone (its colour in the light that reaches it, and how solid it is: grit is hard,
// gas soft). Normal blending with the scene's fog, like the blood clouds of the splatter.
//
// Two materials over the same puffs: the colour, blended; and the depth of its thick middle,
// written by leaving pixels out (a different share each frame, which the temporal resolve
// averages). The light shafts are added after the scene, traced through the water up to what
// the depth buffer holds: without a depth of its own a puff would get all the shafts' light
// of the water behind it and all but vanish in a sunny reach.
function createSmokeMaterials(geometry) {
  const P = perPoint(geometry, "position");
  const S = perPoint(geometry, "shade");
  const C = perPoint(geometry, "tone");
  const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, sizeAttenuation: true });
  material.positionNode = P.xyz;
  material.scaleNode = vec2(P.w.mul(S.w), P.w);
  material.rotationNode = S.z;
  // (The lumps from the river's tileable fractal noise: a few texture reads, not a lot of
  // arithmetic, as smoke can fill much of the screen.)
  const lumpMap = river.canopyMap.value;
  const shade = Fn(() => {
    const q = uv().sub(0.5).mul(2);
    const r = length(q);
    const seed = S.y;
    // The lumps turn slowly round the puff's middle, each puff its own way: it rolls.
    const turn = waterTime
      .mul(seed.mul(0.35).add(0.12))
      .mul(select(seed.greaterThan(0.5), float(1), float(-1)))
      .add(seed.mul(6.283));
    const ct = cos(turn),
      st = sin(turn);
    const w = vec2(q.x.mul(ct).sub(q.y.mul(st)), q.x.mul(st).add(q.y.mul(ct)));
    const home = vec2(seed.mul(7.31), seed.mul(3.97));
    const big = texture(lumpMap, w.mul(0.17).add(home)).r.sub(0.5).mul(3.2);
    const fine = texture(lumpMap, w.mul(0.43).add(home.yx)).r.sub(0.5).mul(3.2);
    const lumps = big.mul(0.75).add(fine.mul(0.25)).clamp(-1, 1);
    // Soft gas has a billowing edge; hard grit is a small round speck.
    const soft = C.w;
    const edge = r.sub(lumps.mul(0.42).mul(soft).mul(fall(r, 0.35, 1)));
    const density = fall(edge, mix(float(0.7), float(0.2), soft), 0.95).mul(fall(r, 0.8, 1));
    // Lit from above (screen up, turned into the sprite's own frame), thick middles darker.
    const up = vec2(sin(S.z), cos(S.z));
    const lit = q.dot(up).mul(0.4).add(big.mul(0.22)).add(0.55).clamp(0, 1);
    const color = C.rgb.mul(mix(float(1.2), float(0.4), density.mul(soft))).mul(lit.mul(1.1).add(0.3));
    // (Thinned right at the lens: a puff the eye swims through only tints the view.)
    const near = smoothstep(P.w.mul(0.3), P.w.mul(1.1), length(positionWorld.sub(cameraPosition)));
    const alpha = density.mul(density.mul(0.3).add(0.7)).mul(S.x).mul(near);
    return vec4(color, alpha);
  })();
  material.colorNode = shade.rgb;
  material.opacityNode = shade.a;
  material.alphaTest = 0.003;
  const depth = new THREE.SpriteNodeMaterial({ transparent: false, depthWrite: true, sizeAttenuation: true });
  depth.positionNode = material.positionNode;
  depth.scaleNode = material.scaleNode;
  depth.rotationNode = material.rotationNode;
  depth.colorNode = shade.rgb;
  // (As thick as the colour is, a little firmer: the faint fringe writes none.)
  depth.opacityNode = smoothstep(0.08, 0.6, shade.a);
  depth.alphaTestNode = ditherThreshold();
  depth.colorWrite = false;
  return { material, depth };
}

export function createSmoke(scene, camera, { capacity = 256 } = {}) {
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "shade", "tone"]) geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const materials = createSmokeMaterials(geometry);
  const cloud = new PointCloud(geometry, materials.material);
  cloud.name = "Combat smoke";
  // (Before the bubbles (3) and the glows (4): fire shines through smoke, not under it.)
  cloud.renderOrder = 2;
  cloud.layers.set(FX_LAYER);
  cloud.castShadow = false;
  scene.add(cloud);
  const body = new PointCloud(geometry, materials.depth);
  body.name = "Combat smoke";
  body.layers.set(FX_LAYER);
  body.castShadow = false;
  scene.add(body);
  const gp = geometry.attributes.position.array,
    gs = geometry.attributes.shade.array,
    gc = geometry.attributes.tone.array;

  // The puffs, in flat arrays (slot i).
  const F = (n = capacity) => new Float32Array(n);
  const px = F(),
    py = F(),
    pz = F(),
    vx = F(),
    vy = F(),
    vz = F(),
    size0 = F(),
    size1 = F(),
    age = F(),
    life = F(),
    alpha = F(),
    seed = F(),
    drag = F(),
    lift = F(),
    top = F(),
    floor = F(),
    turn = F();
  const stuff = new Uint8Array(capacity);
  const alive = new Uint8Array(capacity);
  const order = new Int32Array(capacity);
  const depth = F();
  let live = 0,
    cursor = 0;
  const where = { s: null, u: 0 };
  const eye = new THREE.Vector3(),
    ahead = new THREE.Vector3();

  // A puff of `kind` at (x, y, z). o: vx vy vz (units/s), size (width at birth) and grow (the
  // width it swells to over its life, x size), life (s), alpha, drag (1/s), lift (units/s2:
  // smoke rises, grit falls with the game's gravity), random (a stream for the looks), s (the
  // river hint), or top and floor (the surface's and the bed's height there) if known.
  function puff(kind, x, y, z, o) {
    let i = -1;
    if (live < capacity) {
      for (let k = 0; k < capacity; k++) {
        const j = (cursor + k) % capacity;
        if (!alive[j]) {
          i = j;
          break;
        }
      }
    }
    if (i < 0) {
      // Full: the oldest in its life goes.
      let most = -1;
      for (let j = 0; j < capacity; j++) {
        const t = age[j] / life[j];
        if (t > most) {
          most = t;
          i = j;
        }
      }
    } else {
      order[live++] = i;
    }
    cursor = (i + 1) % capacity;
    const random = o.random ?? Math.random;
    alive[i] = 1;
    stuff[i] = kind;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = o.vx ?? 0;
    vy[i] = o.vy ?? 0;
    vz[i] = o.vz ?? 0;
    size0[i] = o.size ?? 0.1;
    size1[i] = size0[i] * (o.grow ?? 3);
    age[i] = o.age ?? 0;
    life[i] = o.life ?? 1.5;
    alpha[i] = o.alpha ?? 0.5;
    seed[i] = random();
    drag[i] = o.drag ?? 2;
    lift[i] = o.lift ?? 0;
    turn[i] = random() * Math.PI * 2;
    // (The surface and the bed where it starts: given by the caller who knows them, or
    // looked up.)
    if (o.top !== undefined && o.floor !== undefined) {
      top[i] = o.top;
      floor[i] = o.floor;
    } else {
      locate(x, z, o.s ?? null, where);
      top[i] = level(where.s);
      floor[i] = bed(where.s, where.u);
    }
  }

  // Each step: they drift, slow, rise or fall, and go.
  function update(dt) {
    for (let j = live - 1; j >= 0; j--) {
      const i = order[j];
      age[i] += dt;
      if (age[i] >= life[i]) {
        alive[i] = 0;
        order[j] = order[--live];
        continue;
      }
      const k = Math.exp(-drag[i] * dt);
      vx[i] *= k;
      vz[i] *= k;
      vy[i] = vy[i] * k + lift[i] * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;
      // Grit stops on the bed and is gone; smoke stops at the surface and spreads.
      const w = size0[i] + (size1[i] - size0[i]) * Math.min(1, age[i] / life[i]);
      if (py[i] < floor[i] + (stuff[i] === GRIT ? 0 : 0.2 * w)) {
        if (stuff[i] === GRIT) {
          alive[i] = 0;
          order[j] = order[--live];
          continue;
        }
        py[i] = floor[i] + 0.2 * w;
        vy[i] = Math.abs(vy[i]) * 0.2;
      }
      if (py[i] > top[i] - 0.15 * w) {
        py[i] = top[i] - 0.15 * w;
        vy[i] = 0;
      }
    }
  }

  // Each frame: far to near (normal blending needs it), in the light that reaches each.
  const farFirst = (a, b) => depth[b] - depth[a];
  function frame() {
    camera.getWorldPosition(eye);
    camera.getWorldDirection(ahead);
    const tall = 2 * Math.tan(((camera.fov ?? 62) * Math.PI) / 360);
    for (let j = 0; j < live; j++) {
      const i = order[j];
      depth[i] = (px[i] - eye.x) * ahead.x + (py[i] - eye.y) * ahead.y + (pz[i] - eye.z) * ahead.z;
    }
    // (Insertion sort: the order barely changes from one frame to the next; a full sort
    // when the camera cut or whipped round.)
    const patience = 6 * live + 32;
    let shifts = 0;
    for (let j = 1; j < live && shifts <= patience; j++) {
      const i = order[j];
      const d = depth[i];
      let h = j - 1;
      while (h >= 0 && depth[order[h]] < d) {
        order[h + 1] = order[h];
        h--;
        shifts++;
      }
      order[h + 1] = i;
    }
    if (shifts > patience) order.subarray(0, live).sort(farFirst);
    // The daylight at a puff: the sun (or what is left of it), less what the water above it
    // has taken out, red first.
    const day = 0.28 + 0.72 * Math.min(1, Math.max(0, skyUniforms.sun.value));
    const ab = river.absorb.value;
    const slant = Math.max(0.2, river.lightDirection.value.y);
    let n = 0;
    for (let j = 0; j < live; j++) {
      const i = order[j];
      const d = depth[i];
      const t = age[i] / life[i];
      let width = size0[i] + (size1[i] - size0[i]) * (1 - (1 - t) * (1 - t));
      if (d < 0.3 * width) continue;
      // Never more than a screen tall: nearer, it shrinks and thins (the eye is inside it).
      let opacity = alpha[i] * Math.min(1, age[i] / 0.08) * Math.pow(1 - t, 1.3);
      const screens = width / (d * tall);
      if (screens > 1) {
        width /= screens;
        opacity /= Math.sqrt(screens);
      }
      if (opacity < 0.004) continue;
      const kind = stuff[i];
      const under = Math.max(0, top[i] - py[i]) / slant;
      const c = ALBEDO[kind];
      const o = n * 4;
      gp[o] = px[i];
      gp[o + 1] = py[i];
      gp[o + 2] = pz[i];
      gp[o + 3] = width;
      gs[o] = opacity;
      gs[o + 1] = seed[i];
      gs[o + 2] = turn[i];
      gs[o + 3] = 1;
      gc[o] = c[0] * day * Math.exp(-ab.x * under);
      gc[o + 1] = c[1] * day * Math.exp(-ab.y * under);
      gc[o + 2] = c[2] * day * Math.exp(-ab.z * under);
      gc[o + 3] = kind === GRIT ? 0.15 : 1;
      n++;
    }
    for (const name of ["position", "shade", "tone"]) {
      const a = geometry.attributes[name];
      a.clearUpdateRanges();
      if (n > 0) a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
    geometry.setDrawRange(0, n);
  }

  function reset() {
    alive.fill(0);
    live = 0;
    geometry.setDrawRange(0, 0);
  }

  return {
    puff,
    update,
    frame,
    reset,
    get live() {
      return live;
    },
    // (For tests: what was written for the last frame.)
    probe: () => ({ live, drawn: geometry.drawRange.count, count: cloud.count, visible: cloud.visible, first: [...gp.slice(0, 4), ...gs.slice(0, 4), ...gc.slice(0, 4)].map((v) => +v.toFixed(3)) }),
  };
}

// ---- Ribbons: thin strips of light, written each frame (a strip is a run of points, each an
// inner and an outer edge point with a colour; begin(), any number of point() and cut(),
// end()). Additive and unlit, dimmed by the water between it and the eye like the glows.
export function createRibbons(scene, { capacity = 384 } = {}) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity * 6 * 3);
  const tints = new Float32Array(capacity * 6 * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("tint", new THREE.BufferAttribute(tints, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  material.forceSinglePass = true;
  const fog = fogNodes();
  const transmit = exp(fog.density.mul(length(positionWorld.sub(cameraPosition))).mul(extinction).negate());
  material.colorNode = attribute("tint", "vec3").mul(transmit);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Combat ribbons";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.renderOrder = 4;
  mesh.layers.set(FX_LAYER);
  scene.add(mesh);
  let n = 0,
    open = false;
  const prev = new Float32Array(9);

  function begin() {
    n = 0;
    open = false;
  }
  function vertex(v, x, y, z, r, g, b) {
    const o = v * 3;
    positions[o] = x;
    positions[o + 1] = y;
    positions[o + 2] = z;
    tints[o] = r;
    tints[o + 1] = g;
    tints[o + 2] = b;
  }
  // The next point of the strip: inner edge (ix, iy, iz), outer edge (ox, oy, oz), colour.
  function point(ix, iy, iz, ox, oy, oz, r, g, b) {
    if (open && n < capacity) {
      const v = n * 6;
      vertex(v, prev[0], prev[1], prev[2], prev[6], prev[7], prev[8]);
      vertex(v + 1, prev[3], prev[4], prev[5], prev[6], prev[7], prev[8]);
      vertex(v + 2, ox, oy, oz, r, g, b);
      vertex(v + 3, prev[0], prev[1], prev[2], prev[6], prev[7], prev[8]);
      vertex(v + 4, ox, oy, oz, r, g, b);
      vertex(v + 5, ix, iy, iz, r, g, b);
      n++;
    }
    prev[0] = ix;
    prev[1] = iy;
    prev[2] = iz;
    prev[3] = ox;
    prev[4] = oy;
    prev[5] = oz;
    prev[6] = r;
    prev[7] = g;
    prev[8] = b;
    open = true;
  }
  function cut() {
    open = false;
  }
  function end() {
    for (const name of ["position", "tint"]) {
      const a = geometry.attributes[name];
      a.clearUpdateRanges();
      if (n > 0) a.addUpdateRange(0, n * 18);
      a.needsUpdate = true;
    }
    geometry.setDrawRange(0, n * 6);
  }
  return { begin, point, cut, end };
}
