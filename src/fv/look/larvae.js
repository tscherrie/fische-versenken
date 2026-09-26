// The larvae of the gravel defence, drawn: the great diving beetle larva and the dragonfly
// larva, grown to the alevin's own size and bigger, crawling through the redd on six legs.
// One instanced mesh a kind, both made here before the first frame (so the warm-up render
// compiles them with everything else), on layer 1 with the other enemies: the main camera
// sees them, the water's mirror and window do not draw them again.
//
//   const larvae = createLarvae(scene, { capacity: 24, light });
//   larvae.draw(enemies.list);   // every frame, with the whole list
//
// draw() picks out the records with `spec.render === "larva"` and poses each from what the
// enemy system keeps on it: position (the body's centre, REST.foot of its size above the
// ground), heading, size; phase drives the legs; gape, mode and t open the jaws or shoot the
// mask, rear it toward its prey and jab it forward in the strike (t below 0 in recover is a
// larva held back, not attacking); dead and rolled turn it limp, legs curled, on its back
// where the enemy system lays a corpse. A third draw lays a soft dark patch on the ground
// under each one, so the camouflaged animals still stand out from the gravel at the distance
// the player meets them. Nothing is allocated per frame.
//
// The shader moves each part itself (larva-shapes.js rigs them): a leg swings at the hip and
// lifts on its way forward in the insects' tripod gait and folds at the knee when the animal
// dies; the mandibles turn at their bases; the mask unfolds from under the face; the abdomen
// sways and, dead, curls. Normals turn with the parts, and the chitin gets its plates, pits
// and wet gloss in the fragment shader, lit through the water like everything in it.

import * as THREE from "three";
import {
  Fn,
  abs,
  asin,
  atan,
  attribute,
  cameraViewMatrix,
  cos,
  cross,
  dFdx,
  dFdy,
  dot,
  float,
  floor,
  fract,
  fwidth,
  instancedBufferAttribute,
  length,
  max,
  mix,
  modelWorldMatrix,
  mx_noise_float,
  normalView,
  normalGeometry,
  normalize,
  positionGeometry,
  positionView,
  positionViewDirection,
  pow,
  reflect,
  select,
  sign,
  sin,
  smoothstep,
  step,
  uv,
  varying,
  varyingProperty,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { ownInstanceMatrix } from "../../render/instancing.js";
import { underwaterInscatter } from "../../render/fog.js";
import { waterLit } from "../../render/water.js";
import { BACK, EYE, MASK, PART, REST, WAIST, beetleLarvaGeometry, dragonflyLarvaGeometry } from "./larva-shapes.js";

export { REST };

const LAYER = 1;
const TAU = Math.PI * 2;
// A dead enemy's record stays this long, fading out over its last second and a half, as the
// enemy system's own crowds do. (Main's fv/enemies.js exports it as CORPSE_SECONDS: import it
// from there once look-models has main merged in; the branch's base does not have it yet.)
const CORPSE_SECONDS = 40;

const rotX = (v, a) => {
  const c = cos(a),
    s = sin(a);
  return vec3(v.x, v.y.mul(c).sub(v.z.mul(s)), v.y.mul(s).add(v.z.mul(c)));
};
const rotY = (v, a) => {
  const c = cos(a),
    s = sin(a);
  return vec3(v.x.mul(c).add(v.z.mul(s)), v.y, v.z.mul(c).sub(v.x.mul(s)));
};
const rotZ = (v, a) => {
  const c = cos(a),
    s = sin(a);
  return vec3(v.x.mul(c).sub(v.y.mul(s)), v.x.mul(s).add(v.y.mul(c)), v.z);
};

// How each kind looks beyond its shape: its mottling (0 fine grain, 1 blotched camouflage),
// how far the abdomen sways as it crawls, how high it rears when it draws up to strike, how
// far (in its lengths) it jabs forward as the strike goes off, and the size of the dark
// patch it leaves on the gravel under it (long, wide).
const KIND = {
  beetleLarva: { shape: beetleLarvaGeometry, blotch: 0, relief: 1, sway: 0.05, rear: 0.24, jab: 0.1, shadow: [1.3, 0.52] },
  dragonflyLarva: { shape: dragonflyLarvaGeometry, blotch: 1, relief: 0.5, sway: 0.012, rear: 0.2, jab: 0.13, shadow: [1.25, 0.72] },
};
// How many facets across a radian of the compound eye.
const FACETS = 11;

function larvaMaterial(mesh, kind, { light }) {
  const { blotch, relief } = KIND[kind];
  const material = light ? new THREE.MeshStandardNodeMaterial() : new THREE.MeshPhysicalNodeMaterial();
  const matrix = ownInstanceMatrix(mesh);
  const state = instancedBufferAttribute(mesh.userData.state);
  const look = instancedBufferAttribute(mesh.userData.look);
  const rig = attribute("rig", "vec4");
  const joint = attribute("joint", "vec4");
  const turned = varyingProperty("vec3", "vLarvaNormal");
  const waist = float(WAIST[kind]);

  material.positionNode = Fn(() => {
    const p = positionGeometry,
      n = normalGeometry;
    const part = rig.x,
      pivot = rig.yzw;
    const phase = state.x,
      jaw = state.y,
      claw = state.z,
      limp = state.w;
    const stride = look.y;

    // The legs, in the insects' tripod: the front and hind legs of one side step with the
    // middle leg of the other. A leg swings forward lifted and pushes back on the ground; dead,
    // it folds in under the body and bends at the knee.
    const leg = part.sub(PART.leg);
    const pair = floor(leg.mul(0.5).add(0.01));
    const sideBit = leg.sub(pair.mul(2));
    const side = sideBit.mul(-2).add(1);
    const ph = phase.add(fract(pair.add(sideBit).mul(0.5)).mul(TAU));
    const swing = sin(ph).mul(0.34).mul(stride).mul(side);
    const lift = max(cos(ph), 0).mul(0.4).mul(stride);
    const hip = side.mul(limp.mul(1.05).sub(lift));
    const knee = side.mul(limp.mul(1.6).add(lift.mul(0.4))).mul(joint.w);
    const kneeAt = joint.xyz;
    const legP = rotY(rotX(rotX(p.sub(kneeAt), knee).add(kneeAt).sub(pivot), hip), swing).add(pivot);
    const legN = rotY(rotX(rotX(n, knee), hip), swing);

    // The abdomen behind the waist: a sway across as it crawls, growing toward the tail, and
    // dead, a curl toward the belly (a bend of even curvature, so it stays whole).
    const behind = max(waist.sub(p.x), 0),
      ahead = max(p.x.sub(waist), 0);
    const curl = max(limp.mul(1.3), 0.001);
    const a = curl.mul(behind);
    const sway = look.z.mul(behind).mul(sin(phase.sub(behind.mul(9))));
    const bodyP = vec3(
      waist.add(ahead).sub(sin(a).div(curl)).sub(p.y.mul(sin(a))),
      cos(a).sub(1).div(curl).add(p.y.mul(cos(a))),
      p.z.add(sway),
    );
    const bodyN = rotZ(n, a);

    let P = bodyP,
      N = bodyN;
    if (kind === "beetleLarva") {
      // The mandibles turn outward at their bases; shut, their points cross a little.
      const jawSide = sign(pivot.z);
      const open = jawSide.mul(jaw.mul(0.95).sub(0.08)).negate();
      const isJaw = part.greaterThan(PART.mandible - 0.5).and(part.lessThan(PART.mandible + 0.5));
      P = select(isJaw, rotY(p.sub(pivot), open).add(pivot), P);
      N = select(isJaw, rotY(n, open), N);
    } else {
      // The mask: the postmentum swings down and forward about its hinge under the head, the
      // prementum rides out on its end and straightens, and the hooks at its front open
      // outward on the way and close on what they reach. (Squeezed a little up and down
      // halfway, so the elbow does not sweep through the gravel.)
      const B = vec3(...MASK.base),
        H = vec3(...MASK.elbow);
      const hookSide = sign(pivot.z);
      const isPalp = part.greaterThan(PART.palp - 0.5);
      const isPlate = part.greaterThan(PART.prementum - 0.5);
      const isMask = part.greaterThan(PART.postmentum - 0.5);
      const phi1 = jaw.mul(Math.PI * 0.97);
      const phi2 = phi1.negate().add(sin(jaw.mul(Math.PI)).mul(0.4));
      const hook = hookSide.mul(claw.mul(1.2)).negate();
      const q0 = select(isPalp, rotY(p.sub(pivot), hook).add(pivot), p);
      const m0 = select(isPalp, rotY(n, hook), n);
      const q1 = select(isPlate, rotZ(q0.sub(H), phi2).add(H), q0);
      const m1 = select(isPlate, rotZ(m0, phi2), m0);
      const q2 = rotZ(q1.sub(B), phi1).add(B);
      const m2 = rotZ(m1, phi1);
      const squash = sin(jaw.mul(Math.PI)).mul(-0.55).add(1);
      P = select(isMask, vec3(q2.x, q2.y.sub(B.y).mul(squash).add(B.y), q2.z), P);
      N = select(isMask, vec3(m2.x, m2.y.div(squash), m2.z), N);
    }
    const isLeg = part.greaterThan(0.5).and(part.lessThan(6.5));
    P = select(isLeg, legP, P);
    N = select(isLeg, legN, N);
    turned.assign(cameraViewMatrix.mul(modelWorldMatrix.mul(matrix.mul(vec4(N, 0)))).xyz);
    return matrix.mul(vec4(P, 1)).xyz;
  })();

  // ---- The surface.
  const paint = attribute("paint", "vec4");
  const seg = attribute("seg", "float");
  const local = varying(positionGeometry);
  const seed = varying(look.x);
  const size = varying(look.w);
  const hard = paint.a;
  // (The mask's plates and palps keep their straw colour: only a trace of the body's mottling.)
  const plain = step(PART.postmentum - 0.5, varying(rig.x));
  // How much of the animal one pixel spans (in its own units): fine detail fades out before it
  // is small enough to glitter from one frame to the next.
  const spread = length(fwidth(local));
  const fine = (frequency) => smoothstep(0.35, 0.8, spread.mul(frequency)).oneMinus();
  // Noise laid on the animal's own resting frame, so it stays on the chitin as it moves; each
  // animal its own (the seed).
  const broad = mx_noise_float(local.mul(26).add(seed.mul(13.7)));
  const grain = mx_noise_float(local.mul(150).add(seed.mul(3.1))).mul(fine(150));
  const pits = mx_noise_float(local.mul(520)).mul(fine(520));
  // The segments: each plate darker toward its hind edge, and a pale soft joint between one
  // plate and the next (only on the body: elsewhere seg is -1).
  const onBody = step(0, seg);
  // Eyes are left unmottled: a compound eye (seg -2) is faceted below, a simple eye (-3) is a
  // glossy black bead.
  const eye = step(seg, -1.5);
  const simple = step(seg, -2.5);
  const compound = eye.sub(simple);
  const within = fract(seg);
  const margin = smoothstep(0.66, 0.93, within).mul(onBody).mul(hard);
  const join = smoothstep(0.955, 0.995, within).max(smoothstep(0, 0.035, within).oneMinus()).mul(onBody);
  const base = paint.rgb;
  const mottle = mix(
    blotch ? mix(float(1.18), float(0.42), smoothstep(-0.05, 0.35, broad)).mul(grain.mul(0.14).add(0.94)) : broad.mul(0.2).add(0.92).mul(grain.mul(0.12).add(0.95)),
    grain.mul(0.1).add(1),
    plain,
  );
  const skin = base.mul(1.35).add(vec3(0.04, 0.035, 0.015));
  let colour = mix(mix(base.mul(mix(mottle, float(1), eye)), base.mul(0.32), margin.mul(0.85)), skin, join.mul(0.85));
  const N0 = normalize(turned);
  // The compound eye: a honeycomb of facets laid round the eye's middle (longitude and
  // latitude, so they keep their size over the dome), each a little different, dark between.
  // (No dark pseudopupil: at the game's sizes it reads as a cartoon's pupil.)
  let furrow = float(0);
  if (EYE[kind]) {
    const [ex, ey, ez] = EYE[kind];
    const d = normalize(local.sub(vec3(ex, ey, sign(local.z).mul(ez))));
    const g = vec2(atan(d.x, abs(d.z)), asin(d.y.clamp(-1, 1))).mul(FACETS);
    const cell = vec2(1, 1.7320508);
    const ia = floor(g.div(cell)).add(0.5);
    const ib = floor(g.sub(vec2(0.5, 1)).div(cell)).add(0.5);
    const qa = g.sub(ia.mul(cell));
    const qb = g.sub(ib.add(0.5).mul(cell));
    const nearer = dot(qa, qa).lessThan(dot(qb, qb));
    const q = select(nearer, qa, qb);
    const id = select(nearer, ia, ib.add(0.5));
    const edge = max(abs(q.x), dot(abs(q), vec2(0.5, 0.8660254)));
    const sharp = smoothstep(0.3, 0.7, length(fwidth(g))).oneMinus();
    const tone = fract(sin(dot(id, vec2(12.9898, 78.233))).mul(43758.5453)).mul(0.22).add(0.89);
    const facets = mix(float(1), smoothstep(0.3, 0.5, edge).mul(-0.62).add(1).mul(tone), sharp);
    colour = mix(colour, colour.mul(facets), compound);
    furrow = smoothstep(0.32, 0.5, edge).mul(sharp).mul(compound);
  }
  material.colorNode = colour;
  material.metalnessNode = float(0);
  material.roughnessNode = mix(mix(mix(float(0.66), float(0.4), hard).add(grain.mul(0.05)).add(join.mul(0.2)), float(0.12), simple), float(0.3), compound);

  // Relief: fine pits in the chitin, a groove at each join and between the facets, in world
  // size (the height is in the animal's own units), tilted into the normal from how it changes
  // across the pixel.
  const height = pits.mul(0.0012 * relief).add(grain.mul(0.0016 * relief)).mul(eye.oneMinus()).sub(join.mul(0.004)).sub(margin.mul(0.0012)).sub(furrow.mul(0.0007)).mul(size);
  const dpx = dFdx(positionView),
    dpy = dFdy(positionView);
  const dhx = dFdx(height),
    dhy = dFdy(height);
  const r1 = cross(dpy, N0),
    r2 = cross(N0, dpx);
  const det = dot(dpx, r1);
  const perturbed = abs(det).mul(N0).sub(sign(det).mul(dhx.mul(r1).add(dhy.mul(r2))));
  // (The normal before the relief, for the look scenes' views of the shading.)
  mesh.userData.smoothNormal = N0;
  const shading = light ? N0 : select(dot(perturbed, perturbed).greaterThan(1e-24), normalize(perturbed), N0);
  material.normalNode = shading;

  // Soft skin and thin legs pass light: amber where the sun is behind them.
  const through = vec3(0.95, 0.62, 0.26).mul(hard.oneMinus().mul(0.55).add(0.08));
  const lighting = {
    perLight: ({ lightDirection, lightColor, reflectedLight }) => {
      const behind = max(dot(normalView, lightDirection).negate(), 0);
      const lobe = pow(max(dot(positionViewDirection, normalize(lightDirection.add(normalView.mul(0.3))).negate()), 0), 3).mul(0.8).add(0.3);
      reflectedLight.directDiffuse.addAssign(lightColor.mul(through).mul(behind.mul(lobe)).mul(1 / Math.PI));
    },
    // The wet film on the chitin mirrors the water round it, as the fish's slime does.
    beforeIndirect: (context, builder) => {
      const model = builder.context.lightingModel;
      if (!model?.clearcoatRadiance) return;
      const reflectView = reflect(positionViewDirection.negate(), normalView);
      const reflectWorld = normalize(cameraViewMatrix.transpose().mul(vec4(reflectView, 0)).xyz);
      model.clearcoatRadiance.addAssign(underwaterInscatter(reflectWorld).mul(0.7));
    },
    afterIndirect: ({ irradiance, reflectedLight }) => {
      reflectedLight.indirectDiffuse.addAssign(irradiance.mul(through).mul(0.35 / Math.PI));
    },
  };
  if (!light) {
    // (A compound eye keeps a little of the wet film, not a glassy shine.)
    material.clearcoatNode = mix(mix(float(0.45), float(1), hard).mul(join.mul(-0.6).add(1)).max(simple), float(0.35), compound);
    // (The coat's own normal would otherwise be the geometry's, not placed by the instance.)
    material.clearcoatNormalNode = shading;
    material.clearcoatRoughnessNode = grain.mul(0.04).add(0.2);
  }
  return waterLit(material, lighting);
}

// The dark patch under each larva: the gravel in its own shade. It grounds the animal on the
// stones and gives it an edge against them, where its camouflage would otherwise lose it at the
// distance the player meets it. A soft oval, darkest under the middle of the body.
function shadowMaterial() {
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const q = uv().sub(0.5).mul(2);
  material.colorNode = vec3(0);
  material.opacityNode = smoothstep(0.3, 1, length(q)).oneMinus().mul(0.7);
  return material;
}

export function createLarvae(scene, { capacity = 24, light = false } = {}) {
  const kinds = {};
  const entries = [];
  let triangles = 0;
  for (const [kind, def] of Object.entries(KIND)) {
    const geometry = def.shape({ detail: light ? 0.6 : 1 });
    const mesh = new THREE.InstancedMesh(geometry, undefined, capacity);
    // Per larva: (leg phase, jaw or mask, hooks, limp) and (seed, stride, sway, size).
    mesh.userData.state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    mesh.userData.look = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.material = larvaMaterial(mesh, kind, { light });
    mesh.name = `Combat ${kind}`;
    kinds[kind] = { kind, mesh, def, n: 0, state: mesh.userData.state.array, look: mesh.userData.look.array };
    entries.push(kinds[kind]);
    triangles += geometry.index.count / 3;
  }
  // The shadows of both kinds in one draw, after the larvae (it is see-through).
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMaterial(), capacity * entries.length);
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.name = "Combat larva shadows";
  shadows.renderOrder = 1;
  for (const mesh of [...entries.map((e) => e.mesh), shadows]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.layers.set(LAYER);
    scene.add(mesh);
  }

  // Scratch.
  const X = new THREE.Vector3(),
    Y = new THREE.Vector3(0, 1, 0),
    Z = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const lean = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ease = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // (Rearing: nose up about where the tail rests on the ground.)
  const TAIL = [-0.36, -REST.foot + 0.005];
  let shadowCount = 0;

  function pose(slot, e, entry) {
    const { kind, mesh, def, state, look } = entry;
    const dead = !!e.dead;
    const mode = e.mode;
    // (The enemy system sets t below 0 to hold an enemy back -- all of them, when the player
    // goes down -- in recover: that is not an attack, and it must not look like one.)
    const t = e.t ?? 0;
    const holding = mode === "recover" && t < 0;
    // Facing: the heading laid flat (a crawler keeps its belly to the bed).
    X.set(e.heading.x, 0, e.heading.z);
    if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
    X.normalize();
    Z.set(-X.z, 0, X.x);
    basis.makeBasis(X, Y, Z);
    // Dead, it lies still on its back (no rocking: it lies on the stones, not in open water).
    const rolled = dead ? (e.rolled ?? Math.PI) : (e.rolled ?? 0);
    if (rolled !== 0) basis.multiply(turn.makeRotationX(rolled));
    // Drawing up to strike, it rears its head toward its prey (higher when the prey is above
    // it: the heading's own rise, which the flat body does not follow otherwise); it holds that
    // through the strike, the mask or the jaws shooting out along it, and jabs forward as the
    // strike goes off; turning away, it settles back.
    const aim = Math.max(def.rear, Math.min(0.3, Math.asin(clamp(e.heading.y, -1, 1))));
    let rear = 0,
      jab = 0;
    if (!dead && mode === "coil") rear = aim * ease(0, 0.25, t);
    else if (!dead && mode === "strike") {
      rear = aim;
      jab = def.jab * ease(0, 0.06, t);
    } else if (!dead && mode === "recover" && !holding) {
      rear = aim * (1 - ease(0.05, 0.35, t));
      jab = def.jab * (1 - ease(0.04, 0.3, t));
    }
    if (rear !== 0) {
      lean.makeRotationZ(rear);
      const c = Math.cos(rear),
        s = Math.sin(rear);
      lean.setPosition(TAIL[0] - (TAIL[0] * c - TAIL[1] * s), TAIL[1] - (TAIL[0] * s + TAIL[1] * c), 0);
    }
    const fade = dead ? clamp((CORPSE_SECONDS - (e.corpse ?? 0)) / 1.5, 0, 1) : 1;
    const k = e.size * fade;
    matrix.makeScale(k, k, k);
    if (rear !== 0) matrix.multiply(lean);
    matrix.premultiply(basis);
    // (The lean's own shift stays: the place is added to it, not set over it.) On its back, a
    // dead one is lifted so its back, not its middle, lies where the enemy system lays it.
    const over = (1 - Math.cos(rolled)) * 0.5;
    const raise = dead ? (BACK[kind] - REST.dead) * over * e.size : 0;
    const m = matrix.elements;
    m[12] += e.position.x + X.x * jab * e.size;
    m[13] += e.position.y + raise;
    m[14] += e.position.z + X.z * jab * e.size;
    mesh.setMatrixAt(slot, matrix);

    // Its shadow on the ground under it (where the feet, or a dead one's back, touch it). (Each
    // kind has room for `capacity`, so the shadows never run out before the larvae do.)
    const [long, wide] = def.shadow;
    const under = (dead ? REST.dead : REST.foot) * e.size - 0.004 * e.size;
    matrix.makeBasis(X, Y, Z);
    m[0] *= long * k;
    m[1] *= long * k;
    m[2] *= long * k;
    m[8] *= wide * k;
    m[9] *= wide * k;
    m[10] *= wide * k;
    m[12] = e.position.x + X.x * (jab - 0.04) * e.size;
    m[13] = e.position.y - under;
    m[14] = e.position.z + X.z * (jab - 0.04) * e.size;
    shadows.setMatrixAt(shadowCount++, matrix);

    // What the jaws or the mask do, from gape and, where the record says, the plan of attack:
    // drawn up (coil) the weapon is cocked, in the strike it is out for as long as the lunge
    // lasts, and it snaps shut as the enemy turns away (recover: it has hit, or missed).
    const gape = e.gape ?? 0;
    let jaw, claw;
    if (kind === "beetleLarva") {
      // The mandibles: wide open drawn up and lunging, shut in a tenth of a second after.
      if (dead) jaw = 0.35;
      else if (mode === "coil") jaw = Math.max(gape, ease(0, 0.2, t));
      else if (mode === "strike") jaw = 1;
      else if (mode === "recover") jaw = holding ? Math.min(gape, 0.2) : Math.max(Math.min(gape, 0.2), 1 - ease(0, 0.1, t));
      else jaw = gape;
      claw = 0;
    } else {
      // The mask: held folded while it draws up (the hooks already parting), shot out in a few
      // hundredths of a second and held out through the lunge, the hooks spreading wide as it
      // goes and snapping shut as it turns away, the mask drawn back in.
      if (dead) jaw = 0.12;
      else if (mode === "strike") jaw = ease(0, 0.07, t);
      else if (mode === "recover") jaw = holding ? 0 : 1 - ease(0.04, 0.3, t);
      else if (mode === "coil" || mode === "approach" || mode === "lurk") jaw = 0;
      else jaw = clamp((gape - 0.35) / 0.65, 0, 1);
      if (dead) claw = 0.35;
      else if (mode === "coil") claw = 0.25 * ease(0, 0.2, t);
      else if (mode === "strike") claw = 0.25 + 0.75 * ease(0.01, 0.06, t);
      else if (mode === "recover") claw = holding ? 0 : 1 - ease(0, 0.06, t);
      else claw = 0;
    }
    const limp = dead ? ease(0, Math.PI, rolled) : 0;
    const speedStride = e.speed === undefined ? 1 : clamp(0.35 + e.speed / Math.max(0.05, e.size * 0.8), 0.35, 1.3);
    const stride = dead ? 0 : mode === "coil" ? 0.12 : mode === "strike" ? 1.25 : speedStride;
    const i = slot * 4;
    state[i] = e.phase ?? 0;
    state[i + 1] = jaw;
    state[i + 2] = claw;
    state[i + 3] = limp;
    const id = e.id ?? slot + 1;
    look[i] = ((id * 0.6180339) % 1) * 10;
    look[i + 1] = stride;
    look[i + 2] = def.sway * (dead ? 0 : Math.min(1, stride));
    look[i + 3] = e.size;
  }

  return {
    // For the numbers: triangles of one of each.
    triangles,
    meshes: [kinds.beetleLarva.mesh, kinds.dragonflyLarva.mesh, shadows],
    // Every frame, with the whole enemy list (or any list of such records).
    draw(list) {
      kinds.beetleLarva.n = 0;
      kinds.dragonflyLarva.n = 0;
      shadowCount = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.spec?.render !== "larva") continue;
        const entry = kinds[e.kind];
        if (!entry || entry.n >= capacity) continue;
        pose(entry.n++, e, entry);
      }
      for (let k = 0; k < entries.length; k++) {
        const { mesh, n } = entries[k];
        if (n === 0 && mesh.count === 0) continue;
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.state.needsUpdate = true;
        mesh.userData.look.needsUpdate = true;
      }
      if (shadowCount > 0 || shadows.count > 0) {
        shadows.count = shadowCount;
        shadows.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
