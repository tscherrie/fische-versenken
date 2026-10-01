// Everything that flies: laser bolts, pellets, grenades, the flame's puffs. A shot is a small
// record -- where it is, how fast it goes, what it does when it hits -- kept in one list and
// moved each step. Hits are tested along the whole path of the step (a fast bolt moves more
// than a small fish's length in one step), against the enemies' bodies, the stones near the
// players, the bed, and the surface. The records are pooled: nothing is allocated per shot.
//
// Ballistics as in water (the user's rule, which replaced "as in air"): a round marked
// `water` loses its speed to `drag`, does harm only while it still has a quarter of its first
// speed, and then, spent, hangs in the water and sinks to lie on the bed a while. What has
// `gravity` falls with it and may bounce off the bed and the stones. Lasers are not rounds:
// they fly straight.
//
// In co-op a shot is one event: it flies the same on every machine, and only the enemy's
// owner decides what it did (plan, part 5). Here it is the local game alone.
//
// (The weapons' smoke and ribbons are in look/smoke.js, re-exported from here.)

import * as THREE from "three";
import { Fn, attribute, cameraPosition, cos, exp, float, length, mix, positionWorld, select, sin, smoothstep, texture, uv, vec2, vec4 } from "three/tsl";
import { bed, level, locate } from "../course.js";
import { PointCloud, perPoint, skyUniforms } from "../materials.js";
import { river, waterLit, waterTime } from "../render/water.js";
import { extinction, fogNodes } from "../render/fog.js";
import { ditherThreshold } from "../render/dither.js";
import { FX_LAYER } from "./fx.js";
export { createSmoke, createRibbons, POWDER, GAS, SILT, SOOT, GRIT } from "./look/smoke.js";

// Whether segments p0-p1 and q0-q1 come near each other (a standard clamp-and-project). The
// numbers go in and out through `near`: how near is near enough (squared) at [0], and back
// at [1] how far along p0-p1 the closest point lies (0 to 1), or Infinity if not near.
// (A number kept in a variable of the module, or handed back from a call that is not inlined,
// is boxed anew each time: a new object on the heap for every shot near every enemy. One in
// a typed array is not.)
const near = new Float64Array(2);
function segmentsNear(p0, p1, q0, q1) {
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
  near[1] = dx * dx + dy * dy + dz * dz < near[0] ? s : Infinity;
}

// A point of the shots' own arithmetic: where a step begins and ends, an enemy's spine. Not a
// THREE.Vector3: in this game V8 keeps the x and y of every Vector3 boxed (three.js's
// TextureSource.getSize hands Vector3.set the missing width and height of a texture without
// a size), so each number written into them is a new object on the heap. A record of this
// file's own shape keeps its numbers unboxed.
class Point {
  x = 0;
  y = 0;
  z = 0;
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
  p.water = false;
  p.speed0 = 0;
  p.spent = false;
  p.rested = false;
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
  // A mate's shot replayed here for the eye (weapons.js): it hurts nothing, and passes
  // through the fish that are this page's own alone (the larvae, the shoal fish).
  p.echo = false;
  // A shot of a fish of the salmon's school (weapons.js): this page's own, but what it does
  // stays on this page, so it goes through an enemy another page runs (`remote`).
  p.kept = false;
  p.spin = Math.random() * Math.PI * 2;
  return p;
}

export function createProjectiles({ capacity = 300, scene = null, camera = null, solidCapacity = 32 } = {}) {
  const live = [];
  // The records, made once; `free` holds those not in flight.
  const free = [];
  for (let i = 0; i < capacity; i++) free.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), last: new THREE.Vector3(), river: { s: null, u: 0 }, passed: new Set(), born: 0 });
  let born = 0;
  const tail = new Point();
  const head = new Point();
  const from = new Point();
  const end = new Point();
  const normal = new THREE.Vector3();

  // The living enemies' middles and sizes in flat arrays. The first test of a shot against an
  // enemy -- can its step come near it at all? -- runs for every shot and every enemy, and
  // the enemy records come in many shapes (fields are added to them as they fight): a number
  // read from records of that many shapes is looked up the slow, general way, and a fraction
  // comes back in a new box each time. From a typed array it does neither. Only the enemies
  // that pass are read as records. Filled when the first shot of a step needs them, and again
  // after every callback, which may kill, move or add enemies.
  let enemyX = new Float64Array(64),
    enemyZ = new Float64Array(64),
    enemySize = new Float64Array(64);
  const enemyOf = [];
  let packed = 0;
  function pack(enemies) {
    const n = enemies.length;
    if (n > enemyX.length) {
      enemyX = new Float64Array(2 * n);
      enemyZ = new Float64Array(2 * n);
      enemySize = new Float64Array(2 * n);
    }
    let k = 0;
    for (let j = 0; j < n; j++) {
      const e = enemies[j];
      if (e.dead) continue;
      enemyX[k] = e.position.x;
      enemyZ[k] = e.position.z;
      enemySize[k] = e.size;
      enemyOf[k++] = e;
    }
    // (Let go of the enemies no longer in the list.)
    for (let j = k; j < packed; j++) enemyOf[j] = null;
    packed = k;
  }

  // The stones in cells of STONE_CELL units: a shot's end is tested only against the stones
  // of its cell. A stone goes into every cell of the square the test below looks within (its
  // two radii together either way from its middle, and a little more for rounding), and the
  // stones go in in the list's order, so the first stone a shot is found inside is the one a
  // pass over the whole list would find. The list is handed in afresh every step
  // (collidersNear) but mostly holds the same stones: it is sorted again only when its
  // entries are not those last sorted. Each stone's numbers are copied out as it is sorted,
  // for the same reason as the enemies' (the colliders are records of many shapes too); the
  // colliders are made once with their blocks and never changed, so the same entries still
  // have the same numbers.
  const STONE_CELL = 2;
  // (A wide spread of stones -- a big fish reaches far -- gets bigger cells, not more.)
  const MAX_CELLS = 16384;
  const sorted = [];
  let sortedCount = -1;
  // Eight numbers a stone: its middle (x, y, z), its radii (x, y, z) and its turn (cos, sin).
  let stoneData = new Float64Array(8 * 64);
  // Per cell, where its stones begin in `cellStones` (one past the last cell: the end), and
  // the stones themselves, as places in `sorted`.
  let cellFirst = new Int32Array(1025),
    cellNext = new Int32Array(1024),
    cellStones = new Int32Array(1024);
  let gridX = 0,
    gridZ = 0,
    gridNX = 0,
    gridNZ = 0,
    cell = STONE_CELL;
  function sameStones(stones) {
    if (stones.length !== sortedCount) return false;
    for (let j = 0; j < sortedCount; j++) if (stones[j] !== sorted[j]) return false;
    return true;
  }
  function sortStones(stones) {
    const n = stones.length;
    if (8 * n > stoneData.length) stoneData = new Float64Array(16 * n);
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (let j = 0; j < n; j++) {
      const c = stones[j];
      const d = 8 * j;
      sorted[j] = c;
      stoneData[d] = c.x;
      stoneData[d + 1] = c.y;
      stoneData[d + 2] = c.z;
      stoneData[d + 3] = c.rx ?? c.r;
      stoneData[d + 4] = c.ry ?? c.r;
      stoneData[d + 5] = c.rz ?? c.r;
      stoneData[d + 6] = c.cos ?? 1;
      stoneData[d + 7] = c.sin ?? 0;
      const reach = stoneData[d + 3] + stoneData[d + 5] + 0.01;
      if (stoneData[d] - reach < x0) x0 = stoneData[d] - reach;
      if (stoneData[d] + reach > x1) x1 = stoneData[d] + reach;
      if (stoneData[d + 2] - reach < z0) z0 = stoneData[d + 2] - reach;
      if (stoneData[d + 2] + reach > z1) z1 = stoneData[d + 2] + reach;
    }
    for (let j = n; j < sortedCount; j++) sorted[j] = null;
    sortedCount = n;
    gridNX = gridNZ = 0;
    if (!(x1 >= x0 && z1 >= z0)) return;
    if (!Number.isFinite(x1 - x0) || !Number.isFinite(z1 - z0)) {
      // (A stone without bounds: one cell, everywhere, with every stone in it.)
      gridX = gridZ = 0;
      gridNX = gridNZ = 1;
      cell = Infinity;
      if (n > cellStones.length) cellStones = new Int32Array(2 * n);
      for (let j = 0; j < n; j++) cellStones[j] = j;
      cellFirst[0] = 0;
      cellFirst[1] = n;
      return;
    }
    cell = STONE_CELL;
    while ((Math.floor((x1 - x0) / cell) + 1) * (Math.floor((z1 - z0) / cell) + 1) > MAX_CELLS) cell *= 2;
    gridX = x0;
    gridZ = z0;
    gridNX = Math.floor((x1 - x0) / cell) + 1;
    gridNZ = Math.floor((z1 - z0) / cell) + 1;
    const cells = gridNX * gridNZ;
    if (cells >= cellFirst.length) {
      cellFirst = new Int32Array(2 * cells + 1);
      cellNext = new Int32Array(2 * cells);
    }
    // Counted first, then each cell's share laid out, then filled.
    cellFirst.fill(0, 0, cells + 1);
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) {
        for (let k = 0; k < cells; k++) cellFirst[k + 1] += cellFirst[k];
        if (cellFirst[cells] > cellStones.length) cellStones = new Int32Array(2 * cellFirst[cells]);
        for (let k = 0; k < cells; k++) cellNext[k] = cellFirst[k];
      }
      for (let j = 0; j < n; j++) {
        const d = 8 * j;
        const reach = stoneData[d + 3] + stoneData[d + 5] + 0.01;
        const ix0 = Math.floor((stoneData[d] - reach - x0) / cell),
          ix1 = Math.floor((stoneData[d] + reach - x0) / cell),
          iz0 = Math.floor((stoneData[d + 2] - reach - z0) / cell),
          iz1 = Math.floor((stoneData[d + 2] + reach - z0) / cell);
        for (let ix = ix0; ix <= ix1; ix++)
          for (let iz = iz0; iz <= iz1; iz++) {
            if (pass === 0) cellFirst[ix * gridNZ + iz + 1]++;
            else cellStones[cellNext[ix * gridNZ + iz]++] = j;
          }
      }
    }
  }

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
  // The kinds of solid shot the look draws with models of its own (look/ordnance.js).
  const drawnElsewhere = new Set();
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
  // kept if anything else can go. `echo`: a mate's shot replayed for the eye (weapons.js);
  // when the pool is nearly full such a shot gets a record that is never put in the water,
  // so the mates' miniguns never push the player's own rounds out.
  const scratch = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), last: new THREE.Vector3(), river: { s: null, u: 0 }, passed: new Set(), born: 0 };
  function spawn(owner, weapon, position, velocity, s = null, echo = false) {
    if (echo && live.length > capacity * 0.85) return blank(scratch);
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
    p.echo = echo;
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
    // Whether the enemies' arrays and the stones' cells are up to date: made so by the first
    // shot that tests them, and no longer after any callback. (The loops here go by index: a
    // for-of makes an iterator, and a result for each item, wherever the code has not been
    // optimized fully.)
    let enemiesPacked = false,
      stonesSorted = false;
    // (Backwards, so a shot moved into a freed place has had its step already.)
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (p.fuse) {
          onExpire?.(p);
          enemiesPacked = stonesSorted = false;
        }
        drop(i);
        continue;
      }
      if (p.rested) continue;
      from.x = p.position.x;
      from.y = p.position.y;
      from.z = p.position.z;
      p.last.copy(p.position);
      if (p.drag) p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
      if (p.water) {
        if (!p.spent && p.velocity.lengthSq() < 0.0625 * p.speed0 * p.speed0) p.spent = true;
        if (p.spent) p.velocity.y += (-0.45 - p.velocity.y) * (1 - Math.exp(-dt * 2));
      }
      p.position.addScaledVector(p.velocity, dt);
      // (Exact for a constant pull, whatever the step: the arc lands where it was aimed.)
      if (p.gravity) {
        p.position.y -= 0.5 * p.gravity * dt * dt;
        p.velocity.y -= p.gravity * dt;
      }
      p.spin += dt * 14;
      // The enemies: the nearest body along the path (not for a spent round).
      if (!p.ghost && !p.spent) {
        if (!enemiesPacked) {
          pack(enemies);
          enemiesPacked = true;
        }
        let best = null,
          bestS = 2;
        const radius = p.radius;
        const fromX = from.x,
          fromZ = from.z;
        const stepX = Math.abs(p.velocity.x * dt),
          stepZ = Math.abs(p.velocity.z * dt);
        for (let j = 0; j < packed; j++) {
          const size = enemySize[j];
          const reach = size * 0.6 + radius;
          if (Math.abs(enemyX[j] - fromX) > reach + stepX + size || Math.abs(enemyZ[j] - fromZ) > reach + stepZ + size) continue;
          const e = enemyOf[j];
          if (p.pierce && p.passed.has(e)) continue;
          // (A mate's shot, replayed, goes through what only this page has: shared false.)
          if (p.echo && e.shared === false) continue;
          // (A school fish's shot goes through what another page runs: its hits stay here.)
          if (p.kept && e.remote) continue;
          // (Along its body as it is drawn: one reared for a blow lies pitched, enemies.js.)
          const at = e.position,
            heading = e.along ?? e.heading;
          const back = -0.5 * size,
            ahead = 0.44 * size;
          tail.x = at.x + heading.x * back;
          tail.y = at.y + heading.y * back;
          tail.z = at.z + heading.z * back;
          head.x = at.x + heading.x * ahead;
          head.y = at.y + heading.y * ahead;
          head.z = at.z + heading.z * ahead;
          const r = size * 0.09 + radius;
          near[0] = r * r;
          segmentsNear(from, p.position, tail, head);
          if (near[1] < bestS) {
            best = e;
            bestS = near[1];
          }
        }
        if (best) {
          if (p.pierce > 0) {
            // On through it, a little slower.
            p.pierce--;
            p.passed.add(best);
            end.x = p.position.x;
            end.y = p.position.y;
            end.z = p.position.z;
            p.position.lerpVectors(from, end, bestS);
            onEnemy?.(p, best);
            enemiesPacked = stonesSorted = false;
            p.position.copy(end);
            p.damage *= p.pierceKeep;
          } else {
            p.position.lerpVectors(from, p.position, bestS);
            onEnemy?.(p, best);
            enemiesPacked = stonesSorted = false;
            drop(i);
            continue;
          }
        }
      }
      // Stones: the end of the step inside one (each a turned ellipsoid), among those of the
      // cell it is in.
      if (!stonesSorted) {
        if (!sameStones(stones)) sortStones(stones);
        stonesSorted = true;
      }
      let struck = null;
      const ix = Math.floor((p.position.x - gridX) / cell),
        iz = Math.floor((p.position.z - gridZ) / cell);
      if (ix >= 0 && ix < gridNX && iz >= 0 && iz < gridNZ) {
        const k = ix * gridNZ + iz;
        for (let q = cellFirst[k], stop = cellFirst[k + 1]; q < stop; q++) {
          const d = 8 * cellStones[q];
          const rx = stoneData[d + 3],
            ry = stoneData[d + 4],
            rz = stoneData[d + 5];
          const ox = p.position.x - stoneData[d],
            oy = p.position.y - stoneData[d + 1],
            oz = p.position.z - stoneData[d + 2];
          if (Math.abs(ox) > rx + rz || Math.abs(oz) > rx + rz) continue;
          const cs = stoneData[d + 6],
            sn = stoneData[d + 7];
          const ax = (ox * cs - oz * sn) / rx,
            ay = oy / ry,
            az = (ox * sn + oz * cs) / rz;
          if (ax * ax + ay * ay + az * az < 1) {
            struck = sorted[cellStones[q]];
            // The surface's normal there (the ellipsoid's gradient, turned back to the world).
            const gx = ax / rx,
              gy = ay / ry,
              gz = az / rz;
            normal.set(gx * cs + gz * sn, gy, -gx * sn + gz * cs).normalize();
            break;
          }
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
          enemiesPacked = stonesSorted = false;
          continue;
        }
        onStone?.(p, struck);
        enemiesPacked = stonesSorted = false;
        drop(i);
        continue;
      }
      // The bed and the surface.
      locate(p.position.x, p.position.z, p.river.s, p.river);
      const floor = bed(p.river.s, p.river.u);
      if (p.position.y < floor) {
        // A spent round settles on the bed and lies there until its life is over.
        if (p.spent) {
          p.position.y = floor;
          p.velocity.set(0, 0, 0);
          p.rested = true;
          continue;
        }
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
          enemiesPacked = stonesSorted = false;
          continue;
        }
        onGround?.(p);
        enemiesPacked = stonesSorted = false;
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
      if (!p.solid || n >= solidCapacity || drawnElsewhere.has(p.solid)) continue;
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

  // A kind of solid shot ("torpedo", "rocket" ...) now drawn by its own model.
  const drawnBy = (kind) => drawnElsewhere.add(kind);

  return { live, spawn, fire, update, draw, reset, drawnBy };
}

// ---- Smoke: what darkens the water instead of lighting it up.
//
// What a puff is made of (its colour in daylight; the water above takes its share of that
// light, red first, as it does for everything in the river).
