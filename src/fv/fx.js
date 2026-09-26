// What combat looks like: glowing bolts and sparks (one additive cloud of camera-facing
// streaks), and bubbles (the game's own bubble beads) from sunk fish and from shots into the
// bed. Everything sits on layer 1, which the main camera sees and the mirror and the
// Snell's-window cameras do not, so no effect is drawn twice.
//
// The glow does its own water: its colour is dimmed by what the water between it and the
// eye lets through (the fog would lay haze over the whole quad instead), and it is bright
// enough (HDR) for the bloom to pick up.

import * as THREE from "three";
import { atan, cameraPosition, cameraViewMatrix, exp, length, positionWorld, uv, vec2, vec4 } from "three/tsl";
import { PointCloud, createBubbleMaterial, perPoint } from "../materials.js";
import { extinction, fogNodes } from "../render/fog.js";
import { level, locate } from "../course.js";

export const FX_LAYER = 1;

export function createFx(scene, camera, { capacity = 768, bubbleCapacity = 480 } = {}) {
  camera.layers.enable(FX_LAYER);

  // ---- Glow: bolts, sparks, flashes, the weapons' own lights.
  const glow = new THREE.BufferGeometry();
  for (const name of ["position", "tint", "dir"]) glow.setAttribute(name, new THREE.BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
  glow.setDrawRange(0, 0);
  const P = perPoint(glow, "position"),
    T = perPoint(glow, "tint"),
    D = perPoint(glow, "dir");
  const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  material.positionNode = P.xyz;
  // Stretched along the way it flies, as seen on the screen.
  const onScreen = cameraViewMatrix.mul(vec4(D.xyz, 0)).xy;
  material.rotationNode = atan(onScreen.y, onScreen.x);
  material.scaleNode = vec2(P.w.mul(T.w), P.w);
  const q = uv().sub(0.5).mul(2);
  const r2 = q.dot(q);
  // A hot core and a faint wide halo (the halo also keeps small, fast things from being
  // averaged away by the temporal resolve).
  const shape = exp(r2.mul(-16)).add(exp(r2.mul(-2.5)).mul(0.3));
  const fog = fogNodes();
  const transmit = exp(fog.density.mul(length(positionWorld.sub(cameraPosition))).mul(extinction).negate());
  material.colorNode = T.rgb.mul(shape).mul(transmit);
  material.opacityNode = shape.greaterThan(0.004).select(1, 0);
  material.alphaTest = 0.5;
  const glowCloud = new PointCloud(glow, material);
  glowCloud.name = "Combat glow";
  glowCloud.renderOrder = 4;
  glowCloud.layers.set(FX_LAYER);
  scene.add(glowCloud);
  const gp = glow.attributes.position.array,
    gt = glow.attributes.tint.array,
    gd = glow.attributes.dir.array;
  let n = 0;

  // ---- Bubbles.
  const beads = new THREE.BufferGeometry();
  beads.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bubbleCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
  beads.setAttribute("size", new THREE.BufferAttribute(new Float32Array(bubbleCapacity), 1).setUsage(THREE.DynamicDrawUsage));
  beads.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(bubbleCapacity), 1).setUsage(THREE.DynamicDrawUsage));
  beads.setDrawRange(0, 0);
  const bubbleCloud = new PointCloud(beads, createBubbleMaterial(beads));
  bubbleCloud.name = "Combat bubbles";
  bubbleCloud.renderOrder = 3;
  bubbleCloud.layers.set(FX_LAYER);
  scene.add(bubbleCloud);

  // Particles that live a while: sparks and bubbles.
  const sparks = [];
  const bubbles = [];
  const where = { s: 0, u: 0 };

  function spark(x, y, z, { vx = 0, vy = 0, vz = 0, size = 0.05, life = 0.25, r = 6, g = 2, b = 0.6, stretch = 1 } = {}) {
    if (sparks.length > capacity * 0.6) sparks.shift();
    sparks.push({ x, y, z, vx, vy, vz, size, life, age: 0, r, g, b, stretch });
  }
  // A burst of sparks, flying out from a point.
  function burst(x, y, z, { count = 8, speed = 1, size = 0.05, life = 0.3, r = 6, g = 2, b = 0.6, random = Math.random } = {}) {
    for (let i = 0; i < count; i++) {
      const u = random() * 2 - 1,
        a = random() * Math.PI * 2,
        w = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + 0.6 * random());
      spark(x, y, z, { vx: w * Math.cos(a) * v, vy: u * v, vz: w * Math.sin(a) * v, size: size * (0.6 + 0.6 * random()), life: life * (0.6 + 0.8 * random()), r, g, b, stretch: 2.2 });
    }
  }
  function bubble(x, y, z, size, { rise = 1, life = 3, random = Math.random } = {}) {
    if (bubbles.length >= bubbleCapacity) bubbles.shift();
    bubbles.push({ x, y, z, size, rise: rise * (0.7 + 0.6 * random()), wobble: random() * 6.28, life: life * (0.6 + 0.8 * random()), age: 0, s: null });
  }
  function fizz(x, y, z, { count = 10, size = 0.04, spread = 0.1, rise = 1, random = Math.random } = {}) {
    for (let i = 0; i < count; i++) bubble(x + (random() - 0.5) * spread, y + (random() - 0.5) * spread, z + (random() - 0.5) * spread, size * (0.5 + random()), { rise, random });
  }

  // Advance what moves (in the world's own time: it stops in the pause and slows in the
  // celebration).
  function update(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        sparks.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-dt * 5);
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += dt;
      b.wobble += dt * 7;
      b.y += b.rise * dt * (0.6 + b.size * 4);
      b.x += Math.sin(b.wobble) * b.size * dt * 2;
      b.z += Math.cos(b.wobble * 0.8) * b.size * dt * 2;
      // Gone at the surface (checked now and then: it costs a lookup).
      if ((i + Math.floor(b.age * 10)) % 6 === 0) {
        locate(b.x, b.z, b.s, where);
        b.s = where.s;
        b.top = level(where.s);
      }
      if (b.age >= b.life || (b.top !== undefined && b.y > b.top - b.size)) bubbles.splice(i, 1);
    }
  }

  // ---- Writing a frame's glow: begin, any number of add(), end.
  function begin() {
    n = 0;
  }
  function add(x, y, z, size, r, g, b, stretch = 1, dx = 1, dy = 0, dz = 0) {
    if (n >= capacity) return;
    const o = n * 4;
    gp[o] = x;
    gp[o + 1] = y;
    gp[o + 2] = z;
    gp[o + 3] = size;
    gt[o] = r;
    gt[o + 1] = g;
    gt[o + 2] = b;
    gt[o + 3] = stretch;
    gd[o] = dx;
    gd[o + 1] = dy;
    gd[o + 2] = dz;
    gd[o + 3] = 0;
    n++;
  }
  function end() {
    for (const p of sparks) {
      const fade = 1 - p.age / p.life;
      const speed = Math.hypot(p.vx, p.vy, p.vz);
      add(p.x, p.y, p.z, p.size * (0.5 + 0.5 * fade), p.r * fade, p.g * fade, p.b * fade, speed > 0.05 ? p.stretch : 1, p.vx, p.vy, p.vz);
    }
    for (const name of ["position", "tint", "dir"]) {
      const attribute = glow.attributes[name];
      attribute.clearUpdateRanges();
      if (n > 0) attribute.addUpdateRange(0, n * 4);
      attribute.needsUpdate = true;
    }
    glow.setDrawRange(0, n);
    const bp = beads.attributes.position.array,
      bs = beads.attributes.size.array,
      ba = beads.attributes.alpha.array;
    let m = 0;
    for (const b of bubbles) {
      bp[m * 3] = b.x;
      bp[m * 3 + 1] = b.y;
      bp[m * 3 + 2] = b.z;
      bs[m] = b.size;
      ba[m] = Math.min(1, (b.life - b.age) * 2) * Math.min(1, b.age * 8);
      m++;
    }
    for (const [name, size] of [
      ["position", 3],
      ["size", 1],
      ["alpha", 1],
    ]) {
      const attribute = beads.attributes[name];
      attribute.clearUpdateRanges();
      if (m > 0) attribute.addUpdateRange(0, m * size);
      attribute.needsUpdate = true;
    }
    beads.setDrawRange(0, m);
  }

  function reset() {
    sparks.length = 0;
    bubbles.length = 0;
  }

  return { spark, burst, bubble, fizz, update, begin, add, end, reset, get busy() { return sparks.length + bubbles.length; } };
}
