import * as THREE from "three";
import {
  BRDF_Lambert,
  Fn,
  If,
  abs,
  attribute,
  cameraPosition,
  cameraViewMatrix,
  cos,
  cross,
  dFdx,
  dFdy,
  dot,
  exp,
  faceDirection,
  float,
  floor,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  mod,
  modelNormalMatrix,
  modelWorldMatrix,
  normalGeometry,
  normalView,
  normalize,
  positionGeometry,
  positionView,
  positionViewDirection,
  positionWorld,
  pow,
  property,
  reference,
  renderGroup,
  saturate,
  select,
  sign,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  varying,
  varyingProperty,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { range, smoothstep as smoothJS, vec } from "./geometry.js";
import { FLOW_DIRECTION, currentStrength, surfaceLevelAt, waterLit, waterTime } from "./water.js";
import { flowAt } from "../flowfield.js";
import { ditherThreshold } from "./dither.js";

// Shared foliage construction: the current model in the vertex stage, the submerged leaf
// material, and the blade and stem generators every plant species is built from.

export const TAU = Math.PI * 2;

// The sky's light, for the glow through the back of a leaf (set once from main.js).
let skyLight = null;
export function foliageSky(hemisphereLight) {
  skyLight = hemisphereLight;
}

// Displacement of a strand along its bending direction, and its slope along the strand, at
// distance s from the root. Drag bends the strand downstream with a deflection that grows
// with the square of the distance and saturates as it streams out; the shear layer over its
// surface raises a wave that travels from root to tip and grows toward the tip. The slope
// rotates the shading normal so light travels down the blade with the wave.
function strandMotion(root, direction, s, compliance, stir) {
  const strength = currentStrength(root, waterTime);
  const seed = fract(sin(root.x.mul(12.9898).add(root.z.mul(78.233))).mul(43758.5453));
  const phase = seed.mul(6.2832).add(root.x.mul(0.9));
  // The steady part of the river's push is already in the shape the plant grew into; what
  // moves it is the gusting about that mean.
  const drag = compliance.mul(dot(vec3(FLOW_DIRECTION.x, FLOW_DIRECTION.y, FLOW_DIRECTION.z), direction)).mul(strength.sub(0.92));
  const saturation = s.mul(s).mul(0.06).add(1);
  const bendAmount = drag.mul(0.16).mul(s).mul(s).div(saturation);
  const bendSlope = drag.mul(0.32).mul(s).div(saturation.mul(saturation));
  // Flutter grows with the flow, and more where something has just stirred the water. Only
  // its size answers the stir, never its rate: the phase runs on the clock itself. It grows
  // toward the free end, but not without end: a strand streaming out twenty metres down the
  // current waves over some tens of centimetres, not metres, and in long, slow bends (its
  // waves metres long at the foot, longer out along it) -- one that fluttered to its end
  // with a wave a few metres long and a metre high drew it in corners between its rows, and
  // pressed long crowfoot stems flat against the surface between steep dives. So the reach
  // s is counted as R = s / sqrt(1 + (s / 8)^2), the same over the first few metres, never
  // past eight, for the wave's size and for how far along it the wave has run.
  const gain = compliance.mul(strength.mul(0.024).add(0.014).add(min(stir, 1.5).mul(0.025)));
  const safeS = max(s, 1e-4);
  const settle = float(1).add(safeS.mul(0.125).mul(safeS.mul(0.125)));
  const reach = safeS.div(settle.sqrt());
  const reachSlope = float(1).div(settle.mul(settle.sqrt()));
  const sPower = pow(reach, 0.3);
  const envelope = gain.mul(reach).mul(sPower);
  const envelopeSlope = gain.mul(1.3).mul(sPower).mul(reachSlope);
  const theta = waterTime.mul(1.05).sub(reach.mul(1.1)).add(phase);
  const ripple = waterTime.mul(1.75).sub(reach.mul(1.8)).add(phase.mul(2.3));
  const shape = sin(theta).add(sin(ripple).mul(0.3));
  const wave = envelope.mul(shape);
  const waveSlope = envelopeSlope.mul(shape).sub(envelope.mul(cos(theta).mul(1.1).add(cos(ripple).mul(0.54))).mul(reachSlope));
  return vec2(bendAmount.add(wave), bendSlope.add(waveSlope));
}

// The strand's place this frame: the river's own sway along its bending direction, then
// whatever a fish has done to the water here: the foliage is pushed along the local
// displacement, more toward the free end, and never along its own length. Also hands the
// bent normal (view space) and the strand's thinness to the fragment stage.
const vLeafNormal = varyingProperty("vec3", "vLeafNormal");
// How much of a block's plants are kept at a distance from the eye: all of them near, then
// fewer and fewer, down to three in ten far off, where the haze hides the rest anyway. Each
// plant fades out over the last PLANT_FADE of its share (by its rank, terrain.js plantLod),
// dithered, so the weed thins over some metres instead of popping at a boundary.
export const PLANT_FADE = 0.1;
export const plantShare = (d) => Math.min(1, Math.max(0.3, 1 - (d - 40) * 0.0125));
const vPlantFade = varyingProperty("float", "vPlantFade");
// What sort of leaf a blade is, packed beside its thinness (all eight vertex buffers are in
// use): the vertex's first `thin` number is thinness + 2 x code, where the code is the cut
// its material gives it (CUT) plus LOW for a plant low on the bed that casts no shadow worth
// the drawing, plus NEAR for the crossing strip of a strand, drawn only near the eye. (Read
// back as floor(x / 2 + 1 / 4), which the interpolation between a blade's vertices cannot
// tip into the next code.)
//
// The cuts give a leaf its species' outline out of the same few triangles, by leaving out
// what lies outside it (foliageMaterial):
//   BEDLEAF   a leaf lying on the bed (whole; not thinned in front of the lens)
//   FEATHER   milfoil: fine pinnae off a midrib, angled toward the tip
//   BRUSH     threads fanning from the foot (green algae, the rush of the turf)
//   SCALES    a moss shoot's overlapping scale leaves
//   NOTCH     the notched tip of a starwort leaf
//   FRILL     a frilled margin (dulse, sugar kelp)
//   FINGERS   a kelp blade split into straps
//   MONOCOT   whole, with the parallel veins of a grass-like leaf
//   FLOWER    a petal: out only in summer (plantSeason.bloom), each plant's in its own week
//   TRESS     a crowfoot tress: thread-fine leaves combed out along the current into one
//             streaming strand, whole but for its frayed end
export const CUT = { NONE: 0, BEDLEAF: 1, FEATHER: 2, BRUSH: 3, SCALES: 4, NOTCH: 5, FRILL: 6, FINGERS: 7, MONOCOT: 8, FLOWER: 9, TRESS: 10 };
export const LOW = 16;
export const NEAR = 32;
const packThin = (thin, cut, low, near = false) => thin + 2 * (cut + (low ? LOW : 0) + (near ? NEAR : 0));
const thinCode = attribute("thin", "vec2").x;
const plantCode = floor(thinCode.mul(0.5).add(0.25));
const leafThin = thinCode.sub(plantCode.mul(2)).clamp(0, 1);
const cutMode = mod(plantCode, 16);
const lowPlant = mod(plantCode, 32).greaterThanEqual(LOW);
const nearOnly = plantCode.greaterThanEqual(NEAR);
// Each plant's own shade (vPlantTint: brighter or darker, greener or yellower, from a hash of
// where it stands), and per vertex (vPlantShade) how much of the water's light reaches in to
// the foot of a clump (x), how much of a brown film of diatoms and silt lies on the leaf
// there (y), and a number of the plant's own for its cut shapes (z). All worked out per
// vertex: per pixel it cost milliseconds.
const vPlantTint = varyingProperty("vec3", "vPlantTint");
const vPlantShade = varyingProperty("vec3", "vPlantShade");
// Hashes without a sine (after Dave Hoskins), steady at the river's coordinates of some
// thousands of metres, where a sine of the scaled coordinate has lost its digits.
const hash13 = (p) => {
  const q = fract(p.mul(0.1031)).toVar();
  q.addAssign(dot(q, q.zyx.add(31.32)));
  return fract(q.x.add(q.y).mul(q.z));
};
const hash33 = (p) => {
  const q = fract(p.mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  q.addAssign(dot(q, q.yxz.add(33.33)));
  return fract(q.xxy.add(q.yxx).mul(q.zyx));
};
// A smooth, patchy field over space, 0 to 1, from four sines of one another: as good as a
// value noise for patches some metres across, for a tenth of the work (it is worked out for
// every plant vertex, the shadow's aside). (Sines of the coordinates themselves, not
// multiplied up as in a hash, keep their digits thousands of metres out.)
const patches = (p) =>
  sin(p.x.mul(1.1).add(p.y.mul(0.7)).add(sin(p.z.mul(0.9)).mul(1.4)))
    .mul(0.28)
    .add(sin(p.z.mul(1.3).sub(p.y.mul(0.8)).add(sin(p.x.mul(0.7)).mul(1.2))).mul(0.22))
    .add(0.5);
// (From the eye, set each frame by main.js: in the sun's shadow pass the camera is the
// sun's, and a plant must not lose its shadow by its distance from that.)
export const plantEye = uniform(new THREE.Vector3());
// The weed's year, set each frame by main.js from the season: bloom, how far summer's
// flowers are out (0 to 1); fade, how far autumn and winter have browned the leaves.
export const plantSeason = { bloom: uniform(1), fade: uniform(0) };
// shadow: the same motion for the sun's shadow map, with nothing handed on to be shaded.
function strandPosition({ shadow = false } = {}) {
  const anchor = attribute("anchor", "vec3");
  const bend = attribute("bend", "vec4");
  const along = attribute("along", "vec4");
  return Fn(() => {
    const position = positionGeometry;
    const root = modelWorldMatrix.mul(vec4(anchor, 1)).xyz.toVar();
    const share = float(1).sub(length(root.sub(plantEye)).sub(40).mul(0.0125)).clamp(0.3, 1);
    const fade = smoothstep(0, PLANT_FADE, share.sub(attribute("thin", "vec2").y)).toVar();
    const stir = flowAt(position);
    const motion = strandMotion(anchor, bend.xyz, along.w, bend.w, stir.a);
    const rest = modelWorldMatrix.mul(vec4(position, 1)).xyz.toVar();
    const ceiling = surfaceLevelAt(rest).sub(0.04).toVar();
    if (!shadow) {
      vPlantFade.assign(fade);
      const n = normalize(normalGeometry.sub(along.xyz.mul(motion.y.mul(dot(bend.xyz, normalGeometry)))));
      vLeafNormal.assign(cameraViewMatrix.mul(vec4(modelNormalMatrix.mul(n), 0)).xyz);
      // A plant a little lighter or darker than its neighbours, some yellower; the foot of a
      // clump, where the stems crowd, in the shade of the rest (over the lowest metre or so of
      // a weed, the lowest hand's breadth of a tuft of moss or threads); and patches of the
      // brown film on the old growth near the foot more than on the young growth out in the
      // light -- under the water only: what stands in the air has none. (By the distance
      // from the root, not the height over it: moss hangs from the roof of a cave, leaves
      // from a branch, grass from the bank.)
      const h = hash33(vec3(root.x, root.z, root.y.mul(7.1))).toVar();
      vPlantTint.assign(mix(vec3(1), vec3(1.12, 1, 0.7), h.y.mul(0.7)).mul(h.x.mul(0.32).add(0.84)));
      const out = length(rest.sub(root)).toVar();
      const reach = select(cutMode.equal(CUT.SCALES).or(cutMode.equal(CUT.BRUSH)), 0.3, 1.2);
      const film = smoothstep(0.55, 0.85, patches(rest.mul(vec3(0.8, 1.5, 0.8)).add(h.z.mul(17)))).mul(smoothstep(0.3, 2.5, out).mul(-0.6).add(1));
      vPlantShade.assign(vec3(mix(0.62, 1, smoothstep(0, reach, out)), select(rest.y.lessThan(ceiling), film, 0), h.z));
    }
    const pushed = stir.rgb.mul(bend.w.mul(0.17).mul(along.w).mul(along.w).div(along.w.mul(along.w).mul(0.07).add(1))).toVar();
    pushed.subAssign(along.xyz.mul(dot(pushed, along.xyz)));
    // A blade can be pushed aside, not torn off: the displacement saturates.
    pushed.mulAssign(float(1.6).div(max(1.6, length(pushed))));
    const moved = position.add(bend.xyz.mul(motion.x)).add(pushed).toVar();
    // What grows under the water stays under it: a long ribbon lying out under the surface
    // flaps with the current, and would flap up through it into the air.
    If(rest.y.lessThan(ceiling), () => {
      moved.y.assign(min(moved.y, ceiling.sub(rest.y).add(position.y)));
    });
    // A plant faded out altogether is folded into its root: no pixels at all; and out of
    // season, so are a plant's flowers, each plant's a little earlier or later. In the sun's
    // shadow map, so are the plants low on the bed (turf, fallen leaves, crowfoot flowers)
    // and the fine threads and moss shoots of the small tufts on the stones, whose cut
    // outlines the map cannot hold: whole, they would throw solid shadows of nothing.
    // So too is the second, crossing strip of a strand (NEAR) in the shadow map, where it
    // stands edge-on to the sun, and beyond twenty metres from the eye, where the strand is
    // a few pixels across whichever way it turns.
    const offSeason = cutMode.equal(CUT.FLOWER).and(plantSeason.bloom.lessThan(hash13(root.xzx.add(5.3)).mul(0.8).add(0.1)));
    if (shadow) return select(fade.greaterThan(0).and(lowPlant.or(offSeason).or(nearOnly).or(cutMode.equal(CUT.SCALES)).or(cutMode.equal(CUT.BRUSH)).not()), moved, anchor);
    const far = nearOnly.and(length(root.sub(plantEye)).greaterThan(20));
    return select(fade.greaterThan(0).and(offSeason.or(far).not()), moved, anchor);
  })();
}

// Submerged leaves show almost no specular reflection: leaf tissue and water have nearly the
// same refractive index, so what reaches the eye is diffuse reflection and light
// transmitted through the thin blade.
export function foliageMaterial() {
  const material = new THREE.MeshPhysicalNodeMaterial({
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0,
    specularIntensity: 0.07,
    side: THREE.DoubleSide,
  });
  // See-through tissue: a share of the pixels left out, differently each frame, for the
  // temporal resolve to average into a soft transparency (render/dither.js).
  material.alphaTestNode = ditherThreshold();
  material.positionNode = strandPosition();
  material.castShadowPositionNode = strandPosition({ shadow: true });
  const thin = leafThin;
  const leafUv = uv();
  // The colour of the light a leaf passes: its own, before the film over it (set with its
  // colour below, read by the lighting).
  const passed = property("vec3", "leafPassed");
  // (Its colour only: what of the leaf is there, its alpha, is the opacity below. The sun's
  // shadow pass takes the colour's alpha, and would work out every cut to throw it away; it
  // is handed a plain one, and none of the colour's sums.)
  material.colorNode = Fn((builder) => {
    if (builder.material?.isShadowPassMaterial) return vec4(0, 0, 0, 1);
    // The plant's own shade, and the film of diatoms and silt, olive-brown, over the old
    // growth: a veil over the leaf's own colour, not a coat of mud.
    const base = attribute("color", "vec3").mul(vPlantTint).toVar();
    passed.assign(base);
    base.assign(mix(base, vec3(0.15, 0.12, 0.055), vPlantShade.y.mul(0.3)));
    // How far the leaf's coordinates move across a pixel. (Worked out here, at the top,
    // once: a derivative taken in a branch is garbage.)
    const du = float(0).toVar();
    du.assign(fwidth(leafUv.x));
    const across = abs(leafUv.x.sub(0.5)).toVar();
    const v = leafUv.y;
    // The midrib highlight fades once a leaf is only a few pixels wide, so needle leaves do
    // not clip to white specks.
    const midrib = smoothstep(0.008, 0.035, across).oneMinus().mul(smoothstep(0.02, 0.06, du).oneMinus());
    // Veins: pinnate off the midrib, or parallel along a grass-like leaf; none in the
    // weed of the sea, whose blades are not leaves.
    const monocot = cutMode.equal(CUT.MONOCOT);
    const veinless = cutMode.equal(CUT.FINGERS).or(cutMode.equal(CUT.FRILL));
    const veins = select(monocot, pow(cos(across.mul(88)).mul(0.5).add(0.5), 10).mul(0.6), pow(cos(v.sub(across.mul(0.32)).mul(155)).mul(0.5).add(0.5), 22)).mul(select(veinless, 0, 1));
    const edge = pow(across.mul(2), 5);
    const mottling = sin(v.mul(64).add(sin(leafUv.x.mul(25)))).mul(0.035).add(0.965);
    base.mulAssign(mottling.mul(edge.mul(-0.09).add(1).add(veins.mul(0.12))));
    base.assign(mix(base, base.mul(1.22).add(vec3(0.008, 0.012, 0)), midrib.mul(0.6)));
    // A crowfoot tress is a bundle of threads: lighter and darker ones side by side along
    // it, wavering, as long as they have pixels to show in.
    If(cutMode.equal(CUT.TRESS), () => {
      const strand = floor(leafUv.x.mul(7).add(sin(v.mul(13).add(vPlantShade.z.mul(40))).mul(0.35)));
      const shade = fract(sin(strand.mul(12.9898).add(vPlantShade.z.mul(71))).mul(43758.5453));
      base.mulAssign(mix(1, shade.mul(0.45).add(0.78), smoothstep(0.12, 0.3, du.mul(7)).oneMinus()));
    });
    // Leaf undersides are paler and warmer than the upper surface.
    base.mulAssign(select(faceDirection.lessThan(0), vec3(0.82, 0.76, 0.66), vec3(1)));
    // In autumn the weed dies back: browner, the old growth more than the tips.
    const dying = plantSeason.fade.mul(0.35).mul(v.mul(-0.5).add(1)).toVar();
    base.assign(mix(base, vec3(1.25, 0.95, 0.45).mul(dot(base, vec3(0.2126, 0.7152, 0.0722))), dying));
    passed.assign(mix(passed, vec3(1.25, 0.95, 0.45).mul(dot(passed, vec3(0.2126, 0.7152, 0.0722))), dying));
    return vec4(base, 1);
  })();

  // What of a leaf is there. The cut shapes give it its species' outline out of the same few
  // triangles. Each edge is softened over the width of a pixel (the alpha test's dither
  // makes that a clean edge over a few frames), and once its detail is too fine for the
  // pixels it gives way to a plain, narrower outline, so a distant feather is a slim leaf
  // and not a paddle or a shimmer.
  material.opacityNode = Fn(() => {
    // (Everything the cuts share is a variable set here, derivatives first: a shared
    // expression is worked out where it is first used, and that may be inside another cut's
    // branch.)
    const du = float(0).toVar();
    du.assign(fwidth(leafUv.x));
    const dv = float(0).toVar();
    dv.assign(fwidth(leafUv.y));
    const across = abs(leafUv.x.sub(0.5)).toVar();
    const a = float(0).toVar();
    a.assign(across.mul(2));
    const v = leafUv.y;
    const aw = float(0).toVar();
    aw.assign(du.mul(2));
    // (1 inside the edge, 0 outside, softened over w; never over nothing, which is a NaN.)
    const inside = (edgeAt, d, w) => {
      const half = max(w, 1e-4).mul(0.5);
      return smoothstep(edgeAt.sub(half), edgeAt.add(half), d).oneMinus();
    };
    const pick = (i) => fract(sin(i.mul(12.9898).add(seed)).mul(43758.5453));
    const seed = float(0).toVar();
    seed.assign(vPlantShade.z.mul(6.2832));
    // Milfoil: five pinnae a side, the midrib between them. (The phases' change across a
    // pixel is worked out from the leaf coordinates', not taken again: that keeps each cut's
    // sums inside its own branch, and only the leaves that have it pay for it.)
    const featherPhase = v.mul(5).sub(a);
    const featherW = dv.mul(5).add(aw);
    const pinna = inside(float(0.2), abs(fract(featherPhase).sub(0.5)), featherW).mul(inside(v.mul(-0.35).add(1), a, aw));
    const feather = mix(max(pinna, inside(float(0.08), a, aw)), inside(float(0.5), a, aw), smoothstep(0.35, 0.6, featherW));
    // Four threads from the foot, each its own length, tapering and wavering; far off, a
    // slim blade.
    const fan = v.mul(0.85).add(0.15);
    const brushPhase = leafUv.x.sub(0.5).div(fan).mul(4).add(sin(v.mul(9).add(seed)).mul(0.15));
    const brushW = du.mul(4).add(across.mul(3.4).mul(dv).div(fan)).div(fan).add(dv.mul(1.35));
    const threadLength = fract(sin(floor(brushPhase).mul(12.9898).add(seed)).mul(43758.5453));
    const thread = inside(v.mul(-0.18).add(0.3), abs(fract(brushPhase).sub(0.5)), brushW).mul(inside(threadLength.mul(0.4).add(0.6), v, dv));
    const brush = mix(thread, inside(v.mul(-0.45).add(0.75), a, aw), smoothstep(0.5, 0.8, brushW));
    // Scale leaves in overlapping tiers up a moss shoot.
    const scaleEdge = mix(float(1).sub(abs(fract(v.mul(6)).sub(0.5)).mul(2)).mul(0.45).add(0.55), float(0.8), smoothstep(0.2, 0.4, dv.mul(6)));
    const scales = inside(scaleEdge, a, aw);
    // A notch at the tip.
    const notch = float(1).sub(inside(v.sub(0.88).mul(3), a, aw));
    // A frilled margin.
    const frillEdge = mix(sin(v.mul(43).add(seed)).mul(0.14).add(0.86), float(0.86), smoothstep(0.3, 0.6, dv.mul(43).mul(0.14)));
    const frill = inside(frillEdge, a, aw);
    // Straps from a third of the way up.
    const fingerW = du.mul(5);
    const fingers = mix(max(inside(float(0.38), abs(fract(leafUv.x.mul(5)).sub(0.5)), fingerW), inside(float(0.3), v, dv)), float(1), smoothstep(0.2, 0.4, fingerW));
    // A crowfoot tress, whole but for its end, where its threads part and end one by one.
    const tressW = du.mul(6);
    const tressHalf = mix(0.62, 0.2, smoothstep(0.6, 1, v));
    const tressEnd = pick(floor(leafUv.x.mul(6)).add(3.1)).mul(0.25).add(0.75);
    const tress = mix(inside(tressHalf, abs(fract(leafUv.x.mul(6)).sub(0.5)), tressW).mul(inside(tressEnd, v, dv)), float(1), smoothstep(0.3, 0.5, tressW));
    const cut = select(
      cutMode.equal(CUT.FEATHER),
      feather,
      select(cutMode.equal(CUT.BRUSH), brush, select(cutMode.equal(CUT.SCALES), scales, select(cutMode.equal(CUT.NOTCH), notch, select(cutMode.equal(CUT.FRILL), frill, select(cutMode.equal(CUT.FINGERS), fingers, select(cutMode.equal(CUT.TRESS), tress, float(1))))))),
    );
    // (Thin tissue passes light, which the lighting below gives it; a leaf itself is drawn
    // whole: left-out pixels would read as a grain wherever the view moves.)
    const alpha = float(1).toVar();
    alpha.assign(cut);
    // A leaf right in front of the lens thins away rather than filling the picture -- but not
    // a leaf lying flat on the bed, which would only show as a pale, see-through patch on the
    // ground.
    If(cutMode.notEqual(CUT.BEDLEAF), () => {
      alpha.mulAssign(smoothstep(0.25, 0.8, length(positionWorld.sub(cameraPosition))));
    });
    alpha.mulAssign(vPlantFade);
    return alpha;
  })();
  // The same cuts, plainly, for the sun's shadow map where a cut leaf is big enough to throw
  // a shadow of its own shape: a milfoil leaf its pinnae, a kelp blade its straps (the small
  // tufts are left out of the map altogether, strandPosition).
  material.maskShadowNode = Fn(() => {
    const a = abs(leafUv.x.sub(0.5)).mul(2).toVar();
    const v = leafUv.y;
    const pinna = step(abs(fract(v.mul(5).sub(a)).sub(0.5)), 0.2).mul(step(a, v.mul(-0.35).add(1)));
    const feather = max(pinna, step(a, 0.08));
    const fingers = max(step(abs(fract(leafUv.x.mul(5)).sub(0.5)), 0.38), step(v, 0.3));
    return select(cutMode.equal(CUT.FEATHER), feather, select(cutMode.equal(CUT.FINGERS), fingers, float(1))).greaterThan(0.5);
  })();
  // The rib and veins in relief, from their height's change across the pixel.
  material.normalNode = Fn(() => {
    const normal = normalize(vLeafNormal).mul(faceDirection).toVar();
    const rib = exp(pow(leafUv.x.sub(0.5).mul(60), 2).negate()).mul(0.0015);
    const veinHeight = select(cutMode.equal(CUT.MONOCOT), pow(cos(abs(leafUv.x.sub(0.5)).mul(88)).mul(0.5).add(0.5), 8).mul(0.00018), pow(cos(leafUv.y.sub(abs(leafUv.x.sub(0.5)).mul(0.32)).mul(155)).mul(0.5).add(0.5), 16).mul(0.00025)).mul(select(cutMode.equal(CUT.FINGERS).or(cutMode.equal(CUT.FRILL)), 0, 1));
    const detailFade = smoothstep(0.003, 0.012, max(fwidth(leafUv.x), fwidth(leafUv.y))).oneMinus();
    const micro = sin(leafUv.x.mul(230)).mul(sin(leafUv.y.mul(310))).mul(0.00003).mul(detailFade);
    const height = rib.add(veinHeight).add(micro);
    const dp1 = dFdx(positionView),
      dp2 = dFdy(positionView);
    const r1 = cross(dp2, normal),
      r2 = cross(normal, dp1);
    const det = dot(dp1, r1);
    // A sliver of a blade tip can cover a pixel with no screen-space extent at all; the
    // perturbation then vanishes and must not be normalised into NaN.
    const perturbed = abs(det).mul(normal).sub(sign(det).mul(dFdx(height).mul(r1).add(dFdy(height).mul(r2))));
    If(dot(perturbed, perturbed).greaterThan(1e-20), () => {
      normal.assign(normalize(perturbed));
    });
    return normal;
  })();
  // Light through the leaf: what the tissue passes is its own colour, yellower than what it
  // reflects (the green is spent on the way through), and more of it the thinner the leaf --
  // its own colour, not the film's: the silt on a leaf takes little from the light through it.
  const through = () => passed.mul(vec3(1.2, 1.05, 0.55)).mul(thin);
  waterLit(material, {
    // Light reaching the far side of a thin leaf is scattered through the tissue: evenly
    // about, and more of it straight on, so a leaf between the eye and the sun glows.
    perLight: ({ lightDirection, lightColor, reflectedLight }) => {
      const backLight = dot(normalView.negate(), lightDirection).clamp(0, 1);
      const forward = pow(saturate(dot(positionViewDirection.negate(), lightDirection)), 4).mul(0.8);
      reflectedLight.directDiffuse.addAssign(lightColor.mul(through()).mul(backLight.mul(1 / Math.PI).add(forward)));
    },
    afterIndirect: ({ reflectedLight }) => {
      // A blade seen edge-on can present a shading normal turned away from the eye, and the
      // energy-conserving split of indirect light then goes negative: light is never less
      // than none.
      reflectedLight.indirectDiffuse.assign(max(reflectedLight.indirectDiffuse, vec3(0)));
      reflectedLight.indirectSpecular.assign(max(reflectedLight.indirectSpecular, vec3(0)));
      reflectedLight.directSpecular.assign(max(reflectedLight.directSpecular, vec3(0)));
      // Into the foot of a clump less of the water's light finds its way.
      reflectedLight.indirectDiffuse.mulAssign(vPlantShade.x);
      // The bright water all round lights a leaf from behind as well as in front: the sky's
      // light reaching its far face comes through the tissue. Without it the underside of a
      // blade in shade reads as a hole in the picture.
      if (skyLight) {
        const sky = reference("color", "color", skyLight).setGroup(renderGroup);
        const ground = reference("groundColor", "color", skyLight).setGroup(renderGroup);
        const intensity = reference("intensity", "float", skyLight).setGroup(renderGroup);
        const behindWorld = cameraViewMatrix.transpose().mul(vec4(normalView.negate(), 0)).xyz;
        const behind = mix(ground, sky, behindWorld.y.mul(0.5).add(0.5)).mul(intensity);
        reflectedLight.indirectDiffuse.addAssign(behind.mul(BRDF_Lambert({ diffuseColor: passed })).mul(vec3(1.2, 1.05, 0.55)).mul(thin.mul(0.7).add(0.3)));
      }
    },
  });
  return material;
}

// How a stem or petiole answers the current at parameter t: it bends across its axis,
// toward wherever the flow pushes it.
export function stemStrand(curve, t, length, compliance) {
  const tangent = curve.getTangent(t);
  const direction = FLOW_DIRECTION.clone().addScaledVector(
    tangent,
    -FLOW_DIRECTION.dot(tangent),
  );
  if (direction.lengthSq() < 1e-4) direction.crossVectors(tangent, vec(0, 1, 0));
  return {
    direction: direction.normalize(),
    tangent,
    distance: t * length,
    compliance,
  };
}

// A plant's colours by age: `young` at a growing tip, `body` for the bulk of a leaf, `old`
// where the tissue has aged, fouled and darkened (at the base of a stem, the lower leaves).
// A blade or stem given such a palette instead of one colour grades it along its length,
// from the age at its base to the age at its tip (age: [base, tip], 0 young, 1 old).
export function paletteAt(palette, age, target = new THREE.Color()) {
  const a = Math.min(1, Math.max(0, age));
  return a < 0.5 ? target.copy(palette.young).lerp(palette.body, a * 2) : target.copy(palette.body).lerp(palette.old, a * 2 - 1);
}

// Leaf outlines, half-width along the blade (t from foot to tip) for the envelope option:
//   linear      the same width all along, the tip blunt (a starwort leaf under water)
//   obovate     widest three quarters of the way out, rounded (a starwort's floating leaf)
//   lanceolate  widest a third of the way out, tapering long (a pondweed leaf)
//   strap       the same width all along, cut off square (a length of wrack)
//   strapEnd    the same, with a rounded end (the tip of a wrack frond)
//   tress       narrow at the stem, then broad nearly all its length, fraying out at the
//               end (a crowfoot tress: CUT.TRESS parts its threads there)
// Without one, a leaf is widest near its middle, a ribbon near its foot.
const ENVELOPES = {
  linear: (t) => Math.min(1, 5 * t) * (1 - 0.4 * Math.pow(t, 6)),
  obovate: (t) => Math.pow(Math.sin(Math.PI * 0.9 * Math.pow(t, 2.4)), 0.6),
  lanceolate: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.66)), 0.8),
  strap: (t) => Math.min(1, 6 * t),
  strapEnd: (t) => Math.min(1, 6 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.75) / 0.25, 2))),
  tress: (t) => (0.35 + 0.65 * Math.min(1, 5 * t)) * (1 - 0.45 * t * t),
};

// Each blade is a curved, cupped surface (cup: how far its edges rise over its middle, in
// half-widths; crossed: a second strip along it, that share of its width, turned a quarter
// round its length and riding on the first strip's strands, so that a strand lying out
// along the current shows a body from the side as well as from above). It bends across its face unless it rides on a
// parent strand, in which case it inherits the parent's motion at the attachment. Returns
// its curve, its length and its frame at t ({ tangent, side, normal }), for what grows on it
// to ride along (or nothing, for a blade not grown).
export function blade(
  batch,
  points,
  width,
  color,
  root,
  compliance,
  {
    rows = 12,
    cols = 4,
    twist = 0,
    ribbon = false,
    thin = 0.3,
    attached = null,
    browning = 0,
    emit = true,
    random = null,
    age = [0.7, 0.3],
    cut = CUT.NONE,
    low = false,
    envelope: outline = null,
    crinkle = 0.016,
    spacing = 0,
    cup = 0.19,
    crossed = 0,
  } = {},
) {
  // Even an omitted background blade consumes its original two random values. This
  // preserves all subsequent procedural geometry rather than regenerating the scene.
  // (A plant grown from a stream of its own passes it, and leaves the shared one alone.)
  const draw = random ? (a, b) => a + (b - a) * random() : range;
  const phase = draw(0, TAU);
  const turn = ribbon ? draw(-0.7, 0.7) : draw(-0.12, 0.12);
  if (!emit) return;
  const curve =
    points.length === 3
      ? new THREE.QuadraticBezierCurve3(...points)
      : ribbon && points.length === 4
        ? new THREE.CubicBezierCurve3(...points)
        : new THREE.CatmullRomCurve3(points);
  const length = curve.getLength();
  // (spacing: rows no further apart than that, up to 28, so a long ribbon bends without
  // corners.)
  if (spacing) rows = Math.min(28, Math.max(rows, Math.ceil(length / spacing)));
  const brown = new THREE.Color("#6b5a2a");
  const frame = (t) => {
    const tangent = curve.getTangent(t);
    const theta = twist + turn * t;
    const side = vec(Math.cos(theta), 0, Math.sin(theta));
    side.addScaledVector(tangent, -side.dot(tangent)).normalize();
    return { tangent, side, normal: new THREE.Vector3().crossVectors(side, tangent).normalize() };
  };
  for (const quarter of crossed ? [false, true] : [false]) {
    const first = batch.positions.length / 3;
    const code = packThin(thin, cut, low, quarter);
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const center = curve.getPoint(t);
      const { tangent, side: flat, normal: up } = frame(t);
      // (The crossing strip's side is the first one's normal; it rides on the first one's
      // strand, so the two sway as one.)
      const side = quarter ? up : flat;
      const normal = quarter ? flat.clone().negate() : up;
      const envelope = outline
        ? ENVELOPES[outline](t)
        : ribbon
          ? Math.pow(Math.sin(Math.PI * Math.pow(t, 0.58)), 0.34)
          : Math.pow(Math.sin(Math.PI * Math.pow(t, 0.73)), 0.76);
      const halfWidth = width * Math.max(0.005, envelope) * (quarter ? crossed : 1);
      const strand = attached || {
        direction: up,
        tangent,
        distance: t * length,
        compliance,
      };
      const tint = (color.isColor ? color.clone() : paletteAt(color, age[0] + (age[1] - age[0]) * t)).multiplyScalar(0.86 + 0.14 * Math.sin(Math.PI * t * 0.9));
      if (browning) tint.lerp(brown, smoothJS(1 - browning, 1, t) * 0.8);
      for (let j = 0; j <= cols; j++) {
        const u = (j / cols) * 2 - 1;
        // (crinkle: how much the margin waves, in the leaf's plane and out of it.)
        const wave = 1 + crinkle * Math.sin(t * 25 + phase) * u * u;
        const p = center.clone().addScaledVector(side, u * halfWidth * wave);
        p.addScaledVector(
          normal,
          halfWidth *
            (cup * u * u + (0.045 + 1.5 * (crinkle - 0.016)) * Math.sin(t * 15 + phase) * Math.abs(u)),
        );
        batch.vertex(p, [j / cols, t], tint, root, strand, code);
        if (i < rows && j < cols) {
          const a = first + i * (cols + 1) + j;
          batch.quad(a, a + 1, a + cols + 1, a + cols + 2);
        }
      }
    }
  }
  return { curve, length, frame };
}

// taper: how much of its radius a stem has lost at its tip; rows: rings along it (more
// for a long thin stem, so it bends without corners); age: as for a blade, when the colour
// is a palette (old at the foot, young at the tip).
export function stem(batch, points, radius, color, root, compliance, attached = null, { taper = 0.65, rows: ringCount = 0, age = [0.9, 0.1], cut = CUT.NONE, low = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const length = curve.getLength();
  const rows = ringCount || Math.max(4, points.length * 3),
    cols = 5;
  const code = packThin(0, cut, low);
  const start = batch.positions.length / 3;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows,
      p = curve.getPoint(t),
      tangent = curve.getTangent(t);
    const a = new THREE.Vector3()
      .crossVectors(tangent, vec(0.2, 0.01, 1))
      .normalize();
    const b = new THREE.Vector3().crossVectors(tangent, a).normalize();
    const strand = attached || stemStrand(curve, t, length, compliance);
    const tint = color.isColor ? color : paletteAt(color, age[0] + (age[1] - age[0]) * t);
    for (let j = 0; j <= cols; j++) {
      const angle = (j / cols) * TAU;
      const v = p
        .clone()
        .addScaledVector(a, Math.cos(angle) * radius * (1 - taper * t))
        .addScaledVector(b, Math.sin(angle) * radius * (1 - taper * t));
      batch.vertex(v, [j / cols, t], tint, root, strand, code);
      if (i < rows && j < cols) {
        const k = start + i * (cols + 1) + j;
        batch.quad(k, k + 1, k + cols + 1, k + cols + 2);
      }
    }
  }
  return { curve, length };
}
