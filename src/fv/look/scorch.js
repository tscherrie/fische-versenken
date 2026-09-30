// What a charge leaves on the bed: where a grenade, a rocket, a torpedo, a mine or a bomb
// went off near the bottom, the gravel is blown out into a shallow pit of dark churned mud
// and soot, rays of dark grit are flung out from it, and a pale ring of freshly turned
// stones lies round its edge; where the cannon's ball struck the bed and bounced on, a short
// furrow with the gravel thrown up along both sides. A mark is darkest at once, greys as the
// silt settles on it, and is gone after a minute. Only near the bottom: a charge that goes
// off in mid-water leaves nothing on it.
//
// A mark is a small grid laid over the ground where it lies -- the bed, and the tops of the
// stones and the loose gravel there (their shapes as the colliders keep them: soot and silt
// settle on top of everything) -- worked out once when it is made. Where the ground rises
// steeply (the flank of a big stone) the mark thins out, so it never hangs in the water as
// a sheet. Between its points the grid can still run through a pebble's rounded top (and
// the colliders are only near the pebbles' true shapes), so it is drawn pulled toward the
// eye along the line of sight, by about a pebble's height: it covers the same place on the
// screen, whatever lies within that of the ground is drawn over, and a fish swimming above
// the mark is not. All marks are one mesh and one draw, drawn over the ground
// by multiplying what is already there: the bed keeps its own light, its caustics and its
// colour and is only darkened (or, on the pale ring, lightened), and the water between it
// and the eye is left as it was. A fixed number of marks (half on light settings); a new one
// close to a fresh one deepens that one instead of taking another, and when all are in use
// the oldest goes. Time is the game's (waterTime), so a mark does not fade in the pause.

import * as THREE from "three";
import { Fn, abs, atan, attribute, cameraPosition, exp, length, max, min, mix, normalize, positionGeometry, positionWorld, sin, smoothstep, texture, vec3, vec4 } from "three/tsl";
import { bed, locate } from "../../course.js";
import { waterTime } from "../../render/water.js";
import { extinction, fogNodes } from "../../render/fog.js";
import { FX_LAYER } from "../fx.js";
import { woundNoise } from "./wounds.js";

// The grid of one mark (vertices a side), how long a mark lasts (s), and how long it keeps
// its full strength before it fades.
// (Odd, so that every other point is looked up and the grid's edges are among them.)
const SIDE = 13;
const LIFE = 60;
const HOLD = 18;
export const BLAST = 0;
export const FURROW = 1;

// 1 at `from`, 0 at `to` (from < to), smooth in between.
const fade = (x, from, to) => smoothstep(from, to, x).oneMinus();

export function createScorch(scene, { light = false } = {}) {
  const MARKS = light ? 8 : 16;
  const per = SIDE * SIDE;
  const quads = (SIDE - 1) * (SIDE - 1);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(MARKS * per * 3), 3).setUsage(THREE.DynamicDrawUsage);
  // Per vertex: where in the mark it is (-1..1 either way), when the mark was made, how
  // strong it is; and the mark's own seed, its kind, how much of it shows here (thinned on
  // steep ground and at the grid's edge) and its radius (u).
  const marks = new THREE.BufferAttribute(new Float32Array(MARKS * per * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const looks = new THREE.BufferAttribute(new Float32Array(MARKS * per * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("aMark", marks);
  geometry.setAttribute("aLook", looks);
  const index = new Uint16Array(MARKS * quads * 6);
  for (let m = 0, o = 0; m < MARKS; m++)
    for (let j = 0; j < SIDE - 1; j++)
      for (let i = 0; i < SIDE - 1; i++) {
        const a = m * per + j * SIDE + i;
        index.set([a, a + SIDE, a + 1, a + 1, a + SIDE, a + SIDE + 1], o);
        o += 6;
      }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  // (One mark's grid at first, all of its points in one place: the warm-up render draws it,
  // so the shader is compiled then, and no pixel is covered. An empty draw would be a
  // warning on WebGPU; afterwards the mesh is hidden while there is no mark.)
  geometry.setDrawRange(0, quads * 6);

  const mesh = new THREE.Mesh(geometry, markMaterial());
  mesh.name = "Combat scorch";
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false;
  // Over the bed and the stones (drawn with the solid things), before the blood and the
  // smoke, which blend over it.
  mesh.renderOrder = 2;
  mesh.layers.set(FX_LAYER);
  scene.add(mesh);

  // Each mark: where, how big, when made (-Infinity: never), how strong, what kind.
  const cx = new Float32Array(MARKS),
    cz = new Float32Array(MARKS),
    radius = new Float32Array(MARKS),
    born = new Float32Array(MARKS).fill(-Infinity),
    power = new Float32Array(MARKS),
    kinds = new Uint8Array(MARKS);
  const heights = new Float32Array(per),
    raised = new Float32Array(per);
  const where = { s: 0, u: 0 };
  const stones = [];
  const centre = { x: 0, y: 0, z: 0 };
  let used = 0;
  let terrain = null,
    pebbles = null;

  // Lay mark `m` over the ground: a grid `long` by `wide` (u) turned `angle` about (x, z).
  // Its height at each point: the bed there, raised to the top of any stone or pebble lying
  // over it (each one's footprint marked on the grid, a little higher than its collider,
  // which is a little smaller than the stone as drawn), and then to the highest of its
  // neighbours, so that between two points the grid never sinks into a pebble.
  function lay(m, x, z, hint, long, wide, angle, seed, kind, strength, now) {
    stones.length = 0;
    const reach = Math.max(long, wide);
    terrain?.collidersNear?.(x, z, reach + 0.5, stones);
    centre.x = x;
    centre.z = z;
    pebbles?.near?.(centre, reach + 0.3, stones);
    const cs = Math.cos(angle),
      sn = Math.sin(angle);
    const last = SIDE - 1;
    const pointX = (i, j) => x + ((i / last) * 2 - 1) * long * cs - ((j / last) * 2 - 1) * wide * sn;
    const pointZ = (i, j) => z + ((i / last) * 2 - 1) * long * sn + ((j / last) * 2 - 1) * wide * cs;
    // (The bed is smooth: looked up at every other point, and the rest filled in between;
    // finding a place on the river is what a mark costs the most.)
    for (let j = 0; j < SIDE; j += 2)
      for (let i = 0; i < SIDE; i += 2) {
        locate(pointX(i, j), pointZ(i, j), hint, where);
        hint = where.s;
        heights[j * SIDE + i] = bed(where.s, where.u);
      }
    for (let j = 0; j < SIDE; j += 2) for (let i = 1; i < SIDE; i += 2) heights[j * SIDE + i] = 0.5 * (heights[j * SIDE + i - 1] + heights[j * SIDE + i + 1]);
    for (let j = 1; j < SIDE; j += 2) for (let i = 0; i < SIDE; i++) heights[j * SIDE + i] = 0.5 * (heights[(j - 1) * SIDE + i] + heights[(j + 1) * SIDE + i]);
    for (let n = 0; n < stones.length; n++) {
      const c = stones[n];
      const rx = c.rx ?? c.r,
        rz = c.rz ?? c.r,
        ry = (c.ry ?? c.r) * 1.12;
      const bound = Math.max(rx, rz);
      // Its middle in the grid's own frame, and the points its footprint can reach.
      const du = (c.x - x) * cs + (c.z - z) * sn,
        dv = -(c.x - x) * sn + (c.z - z) * cs;
      const i0 = Math.max(0, Math.floor((((du - bound) / long + 1) / 2) * last)),
        i1 = Math.min(last, Math.ceil((((du + bound) / long + 1) / 2) * last));
      const j0 = Math.max(0, Math.floor((((dv - bound) / wide + 1) / 2) * last)),
        j1 = Math.min(last, Math.ceil((((dv + bound) / wide + 1) / 2) * last));
      const ccs = c.cos ?? 1,
        csn = c.sin ?? 0;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const ox = pointX(i, j) - c.x,
            oz = pointZ(i, j) - c.z;
          const ax = (ox * ccs - oz * csn) / (rx * 1.08),
            az = (ox * csn + oz * ccs) / (rz * 1.08);
          const inside = 1 - ax * ax - az * az;
          if (inside <= 0) continue;
          const y = c.y + ry * Math.sqrt(inside);
          const k = j * SIDE + i;
          if (y > heights[k]) heights[k] = y;
        }
    }
    for (let k = 0; k < per; k++) raised[k] = heights[k];
    for (let j = 0; j < SIDE; j++)
      for (let i = 0; i < SIDE; i++) {
        const k = j * SIDE + i;
        let h = heights[k];
        if (i > 0) h = Math.max(h, heights[k - 1]);
        if (i < last) h = Math.max(h, heights[k + 1]);
        if (j > 0) h = Math.max(h, heights[k - SIDE]);
        if (j < last) h = Math.max(h, heights[k + SIDE]);
        raised[k] = h;
      }
    // (A little over it: the bed as drawn is the bed's function between its vertices, not
    // the function itself.)
    const lift = 0.02;
    const step = (2 * reach) / last;
    for (let j = 0; j < SIDE; j++)
      for (let i = 0; i < SIDE; i++) {
        const k = j * SIDE + i;
        const o = m * per + k;
        const h = raised[k];
        positions.array[o * 3] = pointX(i, j);
        positions.array[o * 3 + 1] = h + lift;
        positions.array[o * 3 + 2] = pointZ(i, j);
        // How steep the ground is here: the most it rises or falls to a neighbour. The
        // gravel's and the cobbles' ups and downs are not steep in this sense (soot lies on
        // a cobbled bed as on any other); the flank of a big stone is.
        let rise = 0;
        if (i > 0) rise = Math.max(rise, Math.abs(h - raised[k - 1]));
        if (i < last) rise = Math.max(rise, Math.abs(h - raised[k + 1]));
        if (j > 0) rise = Math.max(rise, Math.abs(h - raised[k - SIDE]));
        if (j < last) rise = Math.max(rise, Math.abs(h - raised[k + SIDE]));
        const shows = 1 - THREE.MathUtils.smoothstep(rise, step + 0.3, 2.5 * step + 0.6);
        marks.array[o * 4] = (i / last) * 2 - 1;
        marks.array[o * 4 + 1] = (j / last) * 2 - 1;
        marks.array[o * 4 + 2] = now;
        marks.array[o * 4 + 3] = strength;
        looks.array[o * 4] = seed;
        looks.array[o * 4 + 1] = kind;
        looks.array[o * 4 + 2] = shows;
        looks.array[o * 4 + 3] = reach;
      }
    for (const attribute of [positions, marks, looks]) {
      const size = attribute.itemSize;
      attribute.addUpdateRange(m * per * size, per * size);
      attribute.needsUpdate = true;
    }
  }

  // A slot for a new mark near (x, z), into `found`: a fresh one close by (to deepen), one
  // gone, a new one, or the oldest.
  const found = { m: 0, merge: false };
  function slotFor(x, z, r, now, kind) {
    let oldest = 0;
    found.merge = false;
    for (let m = 0; m < used; m++) {
      if (kinds[m] === kind && now - born[m] < LIFE && Math.hypot(cx[m] - x, cz[m] - z) < 0.5 * Math.max(r, radius[m])) {
        found.m = m;
        found.merge = true;
        return found;
      }
      if (born[m] < born[oldest]) oldest = m;
    }
    found.m = oldest;
    for (let m = 0; m < used; m++)
      if (now - born[m] >= LIFE) {
        found.m = m;
        return found;
      }
    if (used < MARKS) found.m = used++;
    return found;
  }

  return {
    mesh,
    // The river's stones (terrain.js) and the gravel (pebbles.js), for laying marks over
    // them.
    set terrain(t) {
      terrain = t;
    },
    set pebbles(p) {
      pebbles = p;
    },
    // A charge went off at `at` with blast radius R: a mark if it was near enough the bed
    // (`floor`, its height there; `hint`, the river place to look up from).
    blast(at, R, floor, hint, random) {
      const over = at.y - floor;
      if (!(R > 0) || over > R * 1.25) return false;
      const strength = Math.min(1, 1.15 - over / (R * 1.25));
      const now = waterTime.value;
      const r = R * (0.95 + 0.25 * Math.min(1, over / R));
      const slot = slotFor(at.x, at.z, r, now, BLAST);
      const m = slot.m;
      if (slot.merge) {
        power[m] = Math.min(1, power[m] + 0.5 * strength);
        radius[m] = Math.max(radius[m], r);
      } else {
        power[m] = strength;
        radius[m] = r;
        cx[m] = at.x;
        cz[m] = at.z;
      }
      born[m] = now;
      kinds[m] = BLAST;
      lay(m, cx[m], cz[m], hint, radius[m], radius[m], random() * Math.PI * 2, random(), BLAST, power[m], now);
      geometry.setDrawRange(0, used * quads * 6);
      return true;
    },
    // A heavy ball struck the bed at `at`, flying along (dx, dz): a furrow `size` wide.
    furrow(at, dx, dz, size, hint, random) {
      const now = waterTime.value;
      const long = size * 3.2,
        wide = size * 1.3;
      const slot = slotFor(at.x + dx * long * 0.5, at.z + dz * long * 0.5, long, now, FURROW);
      const m = slot.m;
      cx[m] = at.x + dx * long * 0.6;
      cz[m] = at.z + dz * long * 0.6;
      radius[m] = long;
      power[m] = 1;
      born[m] = now;
      kinds[m] = FURROW;
      lay(m, cx[m], cz[m], hint, long, wide, Math.atan2(dz, dx), random(), FURROW, 1, now);
      geometry.setDrawRange(0, used * quads * 6);
    },
    // Where the marks are (for the tests): [x, z, radius, age] of each live one.
    live() {
      const now = waterTime.value;
      const list = [];
      for (let m = 0; m < used; m++) if (now - born[m] < LIFE) list.push([+cx[m].toFixed(2), +cz[m].toFixed(2), +radius[m].toFixed(2), +(now - born[m]).toFixed(1)]);
      return list;
    },
    // Each frame: the draw is left out while no mark shows.
    frame() {
      const now = waterTime.value;
      let any = false;
      for (let m = 0; m < used && !any; m++) any = now - born[m] < LIFE;
      mesh.visible = any;
    },
  };
}

// The marks' shading: what the ground under them is multiplied by. Dark churned mud and
// soot in the pit, dark rays of flung grit, a pale ring of turned stones; for a furrow, a
// dark groove with pale ridges along both sides. Thinned by the water between it and the eye
// (else a far mark would darken the haze in front of it), and faded as the mark ages.
function markMaterial() {
  const mark = attribute("aMark", "vec4");
  const look = attribute("aLook", "vec4");
  const map = woundNoise();
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.DstColorFactor;
  material.blendDst = THREE.ZeroFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  material.forceSinglePass = true;
  const fog = fogNodes();
  // Pulled toward the eye along the line of sight (see above): by a fifth of the mark's
  // radius and a little, at most about a pebble's height.
  material.positionNode = Fn(() => {
    const toEye = cameraPosition.sub(positionGeometry);
    const pull = min(look.w.mul(0.2).add(0.06), min(0.3, length(toEye).mul(0.5)));
    return positionGeometry.add(normalize(toEye).mul(pull));
  })();
  material.colorNode = Fn(() => {
    const q = mark.xy;
    const seed = look.x,
      kind = look.y,
      shows = look.z,
      size = look.w;
    const age = max(waterTime.sub(mark.z), 0);
    // Full a while, then fading out; fresh soot at first, greying as silt settles on it.
    const alive = fade(age, HOLD, LIFE).mul(min(age.mul(8), 1));
    const settled = exp(age.mul(-1 / 18)).oneMinus();
    const strength = mark.w.mul(alive).mul(shows);
    const world = positionWorld.xz;
    // (Read once, here: not inside a choice between the blast and the furrow, where the
    // texture's derivatives would be undefined.)
    const n = vec4(0).toVar();
    n.assign(texture(map, world.div(size.mul(1.6)).add(seed.mul(7.3))));
    const r = length(q);
    const torn = r.mul(n.r.sub(0.5).mul(0.55).add(1));
    const edge = fade(r, 0.88, 1);
    // A blast: a dark stain over most of the blast's reach thinning out to its ragged edge,
    // the pit darker still, rays of flung grit, a few dark specks further out, and a faint
    // pale ring of turned stones.
    const stain = fade(torn, 0.58, 0.95);
    const pit = fade(torn, 0.2, 0.55);
    const angle = atan(q.y, q.x);
    const rays = sin(angle.mul(9).add(seed.mul(40)).add(n.g.mul(6))).max(0).pow(2).mul(smoothstep(0.3, 0.55, torn)).mul(fade(torn, 0.85, 1.08));
    const ring = smoothstep(0.7, 0.79, torn).mul(fade(torn, 0.81, 0.93));
    const grit = smoothstep(0.6, 0.66, n.g).mul(smoothstep(0.55, 0.75, torn)).mul(fade(torn, 0.98, 1.15));
    const blastDark = max(stain.mul(0.9).add(pit.mul(0.1)), max(rays.mul(0.75), grit.mul(0.65)));
    // A furrow: the groove along its length, wandering a little and ragged at its sides,
    // deepest where the ball first struck, with ridges of thrown gravel on both sides.
    const across = abs(q.y.add(n.g.sub(0.5).mul(0.5))).mul(n.r.sub(0.5).mul(0.9).add(1));
    const along = fade(abs(q.x.add(0.15)), 0.35, 0.95).mul(q.x.mul(-0.3).add(0.8));
    const groove = fade(across, 0.12, 0.5).mul(along);
    const ridges = smoothstep(0.35, 0.5, across).mul(fade(across, 0.55, 0.85)).mul(along);
    const isFurrow = smoothstep(0.4, 0.6, kind);
    const dark = mix(blastDark, groove.mul(0.6), isFurrow).mul(edge);
    const pale = mix(ring, ridges, isFurrow).mul(edge);
    // (Soot and churned mud: black at first, a grey-brown once silt lies on it. What is
    // multiplied here is the light the ground sends back, before the picture's tone curve,
    // which lifts the darks: a quarter of it still reads as grey, not as a burnt pit.)
    const soot = mix(vec3(0.02, 0.018, 0.016), vec3(0.28, 0.25, 0.21), settled);
    const factor = mix(vec3(1), soot, dark.mul(strength)).mul(mix(vec3(1), vec3(1.3, 1.24, 1.1), pale.mul(strength).mul(0.55)));
    const distance = length(positionWorld.sub(cameraPosition));
    const through = exp(fog.density.mul(distance).mul(extinction).negate());
    return mix(vec3(1), factor, through);
  })();
  return material;
}
