// The weapons' own looks that are not glows (moved out of projectiles.js, for the look's
// owner): powder smoke, blast gas, silt, soot and flung gravel -- a sorted cloud of normal-
// blended puffs that darken what is behind them (the glows in fx.js can only brighten) --
// and thin additive strips for the katana's cut and the dash cut's line. weapons.js drives
// them.

import * as THREE from "three";
import { Fn, attribute, cameraPosition, cos, exp, float, length, mix, positionWorld, select, sin, smoothstep, texture, uv, vec2, vec4 } from "three/tsl";
import { bed, level, locate } from "../../course.js";
import { PointCloud, perPoint, skyUniforms } from "../../materials.js";
import { river, waterLit, waterTime } from "../../render/water.js";
import { extinction, fogNodes } from "../../render/fog.js";
import { ditherThreshold } from "../../render/dither.js";
import { FX_LAYER } from "../fx.js";

// What a puff is made of.
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
