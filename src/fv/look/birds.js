// The birds, drawn: the kingfisher, the goosander, the grey heron and the gannet, each with a
// model of its own (bird-shapes.js) that beats and folds its wings, bends its neck, turns its
// head, lifts its tail and swings its legs as the enemy system's plan for it goes on. One
// instanced mesh a kind, all four with ONE material, made here before the first frame so the
// warm-up render compiles it with everything else; afterwards they are only shown, hidden
// and posed. On the ordinary layer, as the base game's birds: over the water a bird is seen
// from below only through the window in the surface, and that draws layer 0 alone.
//
//   const flock = createBirds(scene);
//   flock.begin(dt);            // every step, dt the game's seconds since the last
//   flock.add(e);               // each record with spec.render === "bird"
//   flock.end();
//   flock.mount(e, "beak", m);  // where a bird's weapon is strapped, as a world matrix
//
// What is read from a record: kind, position, heading, size, mode and t (the plan: circle,
// coil, strike, recover, leave; the goosander's swim and breathe, aim and fire; the heron's
// stand, aim, fire), speed, bank, hitAt, firedAt, dead, corpse, rolled and shown; the
// heron's stand, facing, muzzle and aimDir. Nothing on it is changed but `beak` (how far the
// bill reaches ahead of the middle, which the diver's strike measures), as the stand-ins did.
//
// Everything per bird that must carry from one frame to the next (the wingbeat, the eased
// fold, the neck) is kept in a table by record, so a pause (dt 0) holds every bird where it is.
//
// The shader (one for all four) poses each vertex by its part: a wing goes from spread to
// folded (two shapes of the same vertices), the hand turning at the wrist and the whole wing
// at the shoulder, beating and sweeping back; the neck follows a curve from its base to where
// the head is put, and the head turns about its joint; the tail lifts and fans; a leg swings
// at the hip and folds at the heel. Per bird: its matrix and four vec4 of pose, in one
// instanced buffer.

import * as THREE from "three";
import { Fn, abs, attribute, cos, cross, dot, float, fract, fwidth, mix, mx_noise_float, mx_worley_noise_float, normalGeometry, normalLocal, normalize, positionGeometry, positionWorld, select, sin, smoothstep, step, varying, vec3, vec4 } from "three/tsl";
import { level } from "../../course.js";
import { surfaceLevelAt, waterLit } from "../../render/water.js";
import { CORPSE_SECONDS } from "../enemies.js";
import { HERON, PART, SHAPES } from "./bird-shapes.js";

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Eases `from` toward `to` at `rate` per second.
const toward = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));

// The mount frames each kind has, for whoever straps the weapons on (models.js): the
// kingfisher's push dagger along the top of its bill, the goosander's revolver on its right
// shoulder, the heron's harpoon gun along its head over the bill, the gannet's bombs under
// the roots of its wings (on the body, which they stay on as the wings fold). flock.mount()
// gives each as a world matrix without scale: its origin on the bird, +x along the weapon's
// line, +y the part's up, +z to its right.
export const MOUNTS = { kingfisher: ["beak"], merganser: ["shoulder"], heron: ["head"], gannet: ["left", "right"] };

// Per bird in the instanced buffer: the matrix's three rows, then the pose.
const FLOATS = 28;

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

// ONE material for every bird. Everything it needs comes with the geometry: the rig per
// vertex (bird-shapes.js) and the pose per bird, as instanced attributes of the same names on
// each kind's mesh.
function birdMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  const paint = attribute("paint", "vec4");
  const rig = attribute("rig", "vec4");
  const joint = attribute("joint", "vec4");
  const fold = attribute("fold", "vec4");
  const folded = attribute("folded", "vec4");
  const row0 = attribute("birdRow0", "vec4"),
    row1 = attribute("birdRow1", "vec4"),
    row2 = attribute("birdRow2", "vec4");
  // (armFlap, handFlap, sweep, fold), (head joint moved by xyz, head pitch), (head yaw, pitch
  // of the neck's base, tail pitch, tail fan), (left hip, right hip, heel, neck curl).
  const W = attribute("birdWing", "vec4"),
    H = attribute("birdHead", "vec4"),
    K = attribute("birdLook", "vec4"),
    L = attribute("birdLegs", "vec4");

  material.positionNode = Fn(() => {
    const p = positionGeometry,
      n = normalGeometry;
    const part = rig.x,
      pivot = rig.yzw;
    const is = (k) => abs(part.sub(k)).lessThan(0.5);
    const side = select(pivot.z.lessThan(0), float(-1), float(1));

    // The wing, spread: the hand turned at the wrist (as far as the vertex follows it), then
    // the whole wing at the shoulder -- swept back about the upright, beaten about the body's
    // long axis (up for a positive flap on either side) -- and then gone over to its folded
    // shape by W.w.
    const wrist = joint.xyz,
      hand = joint.w;
    const handSweep = W.z.mul(1.4).mul(hand).mul(side).negate(),
      handFlap = W.y.mul(hand).mul(side).negate();
    const armSweep = W.z.mul(side).negate(),
      armFlap = W.x.mul(side).negate();
    const q0 = rotX(rotY(p.sub(wrist), handSweep), handFlap).add(wrist);
    const m0 = rotX(rotY(n, handSweep), handFlap);
    const q1 = rotX(rotY(q0.sub(pivot), armSweep), armFlap).add(pivot);
    const m1 = rotX(rotY(m0, armSweep), armFlap);
    const wingP = mix(q1, fold.xyz, W.w);
    const wingN = mix(m1, folded.xyz, W.w);

    // The neck: from its base B, leaving it along its rest line turned by K.y, to the head's
    // joint moved by H.xyz, arriving along the rest line turned as the head is -- a cubic
    // curve, its handles `curl` of the neck's length -- and each ring of it turned from the
    // rest line onto the curve's own direction there.
    const B = pivot,
      J0 = joint.xyz,
      t = joint.w;
    const rest = J0.sub(B);
    // (Guarded: the parts that are not a neck have no rest line, and their result is not
    // used, but it must not be undefined.)
    const length = rest.length().max(1e-4);
    const d0 = rest.div(length);
    const headTurn = (v) => rotY(rotZ(v, H.w), K.x);
    const J = J0.add(H.xyz);
    const T0 = rotZ(d0, K.y);
    const T3 = headTurn(d0);
    const handle = length.mul(L.w);
    const P1 = B.add(T0.mul(handle)),
      P2 = J.sub(T3.mul(handle));
    const u = t.oneMinus();
    const curve = B.mul(u.mul(u).mul(u)).add(P1.mul(u.mul(u).mul(t).mul(3))).add(P2.mul(u.mul(t).mul(t).mul(3))).add(J.mul(t.mul(t).mul(t)));
    const slope = P1.sub(B).mul(u.mul(u).mul(3)).add(P2.sub(P1).mul(u.mul(t).mul(6))).add(J.sub(P2).mul(t.mul(t).mul(3)));
    const T = normalize(slope);
    // (The shortest turn from d0 onto T, for a vector v: v cos + a x v + a (a.v) / (1 + cos),
    // a = d0 x T.)
    const a = cross(d0, T),
      c = dot(d0, T).max(-0.95);
    const turn = (v) => v.mul(c).add(cross(a, v)).add(a.mul(dot(a, v).div(c.add(1))));
    const neckP = curve.add(turn(p.sub(mix(B, J0, t))));
    const neckN = turn(n);
    // (A head vertex has the joint as its pivot.)
    const headP = pivot.add(H.xyz).add(headTurn(p.sub(pivot)));
    const headN = headTurn(n);

    // The tail: fanned out across and lifted (a positive pitch lowers it) about its root.
    const tailQ = p.sub(pivot).mul(vec3(1, 1, K.w.add(1)));
    const tailP = rotZ(tailQ, K.z).add(pivot);
    const tailN = rotZ(n.mul(vec3(1, 1, float(1).div(K.w.add(1)))), K.z);

    // A leg: folded at the heel (as far as the vertex follows it), then swung at the hip
    // (positive forward), each side its own.
    const hip = select(side.greaterThan(0), L.y, L.x);
    const heel = L.z.mul(joint.w);
    const legQ = rotZ(p.sub(joint.xyz), heel).add(joint.xyz);
    const legP = rotZ(legQ.sub(pivot), hip).add(pivot);
    const legN = rotZ(rotZ(n, heel), hip);

    const P = select(is(PART.wing), wingP, select(is(PART.neck), neckP, select(is(PART.head), headP, select(is(PART.tail), tailP, select(is(PART.leg), legP, p)))));
    const N = select(is(PART.wing), wingN, select(is(PART.neck), neckN, select(is(PART.head), headN, select(is(PART.tail), tailN, select(is(PART.leg), legN, n)))));
    // Placed in the world by the bird's own matrix (its scale is the same every way, so the
    // normal goes with its rotation alone).
    const P4 = vec4(P, 1);
    normalLocal.assign(normalize(vec3(dot(row0.xyz, N), dot(row1.xyz, N), dot(row2.xyz, N))));
    return vec3(dot(row0, P4), dot(row1, P4), dot(row2, P4));
  })();

  // ---- The plumage: the painted colours; over them the feathers' edges, a fine net of cells
  // drawn out along the body (as many a unit as the vertex says: folded.w), the pale spots
  // where it asks for them, and a fine unevenness laid along the feathers -- all in the
  // bird's own frame, so it stays on the bird as it moves, and each fading out before it is
  // fine enough to flicker; the lines between the flight feathers. Wet under the water:
  // darker and glossier.
  const local = varying(positionGeometry);
  const lines = varying(fold.w);
  const plume = varying(folded.w);
  const density = abs(plume);
  const size = fwidth(local).length();
  const shows = (frequency) => smoothstep(0.55, 0.2, size.mul(frequency));
  const cells = mx_worley_noise_float(local.mul(vec3(density.mul(0.6), density, density)));
  const edges = smoothstep(0.45, 0.95, cells).mul(shows(density)).mul(step(0.01, density));
  // (The pale spots at the feathers' middles, where a spotted plumage asks for them.)
  const spots = smoothstep(0.26, 0.12, cells).mul(shows(density)).mul(step(plume, -0.01));
  const streak = mx_noise_float(local.mul(vec3(4, 22, 22))).mul(0.5).add(mx_noise_float(local.mul(vec3(30, 30, 30))).mul(0.5));
  const gap = abs(fract(lines.add(0.5)).sub(0.5));
  const width = fwidth(lines);
  // (Faint on a folded wing, where the feathers lie close over one another.)
  const seam = smoothstep(width.mul(1.2).add(0.05), float(0), gap).mul(step(0, lines)).mul(smoothstep(0.45, 0.15, width)).mul(varying(W.w).mul(-0.6).add(1));
  const surface = paint.w;
  const feathered = smoothstep(0.45, 0.2, surface);
  const depth = surfaceLevelAt(positionWorld).sub(positionWorld.y);
  const wet = smoothstep(0, 0.4, depth);
  const colour = mix(paint.rgb, paint.rgb.mul(2.2).add(vec3(0.05, 0.12, 0.16)), spots.mul(0.8));
  // (The shadows between feathers show more on a pale plumage than on a dark one, and less
  // than a line drawn: kept soft on white.)
  const pale = dot(paint.rgb, vec3(0.3, 0.55, 0.15)).clamp(0, 1);
  const shade = pale.mul(-0.5).add(1);
  const plumage = colour
    .mul(streak.mul(0.12).mul(feathered).add(1))
    .mul(edges.mul(-0.2).mul(shade).add(1))
    .mul(seam.mul(-0.36).mul(shade).add(1));
  // Soaked: the feathers darker and greyer, a little of the water's blue in them (a white
  // flank no longer shines white down there).
  const grey = dot(plumage, vec3(0.3, 0.55, 0.15));
  material.colorNode = mix(plumage, vec3(grey).mul(vec3(0.82, 0.92, 1)), wet.mul(0.35)).mul(wet.mul(-0.38).add(1));
  const dry = float(0.82).sub(surface.mul(0.74)).add(streak.mul(0.08).mul(feathered)).add(edges.mul(0.06));
  material.roughnessNode = mix(dry, dry.mul(0.75).max(0.3), wet);
  // (A weak mirror of the water round it: wet feathers are no glazed skin.)
  return waterLit(material, { mirror: 0.2 });
}

// ---- The kinds.

// What each kind's model says about itself, worked out once: its length along x (bill tip to
// tail tip) and middle (placed where the enemy is), the tip of its bill, and the rig's points.
function describe(kind, shape) {
  const box = shape.geometry.boundingBox;
  // (Only the body along x: the wings spread out sideways and do not count.)
  const tailTip = kind === "heron" ? box.min.x : minTail(shape);
  const length = shape.beak[0] - tailTip;
  return { kind, shape, length, middle: 0.5 * (shape.beak[0] + tailTip) };
}
function minTail(shape) {
  const pos = shape.geometry.attributes.position;
  const rig = shape.geometry.attributes.rig;
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const part = Math.round(rig.getX(i));
    if (part === PART.body || part === PART.tail) min = Math.min(min, pos.getX(i));
  }
  return min;
}

// ---- Poses: for each kind, from the record and what is kept of it, the wings, neck, tail and
// legs (into st.pose) and how the body lies beyond its heading (st.pitch about the skull, nose
// up; st.roll about its length).

// The wings' beat: `phase` runs on at `rate` beats a second; the arm swings `amplitude`
// about `lift`, the hand lags behind it.
function beat(st, dt, rate, amplitude, lift, handLag = 0.9) {
  st.phase = (st.phase + dt * rate * TAU) % TAU;
  const s = Math.sin(st.phase);
  // (Down fast, up slower: the downstroke is the stroke.)
  const down = s - 0.18 * Math.sin(2 * st.phase);
  st.pose.armFlap = lift + amplitude * down;
  st.pose.handFlap = 0.45 * amplitude * Math.sin(st.phase - handLag);
}
function glide(st, dt, lift = 0.07, hand = -0.04) {
  st.pose.armFlap = toward(st.pose.armFlap, lift, 6, dt);
  st.pose.handFlap = toward(st.pose.handFlap, hand, 6, dt);
}
// The limp, crumpled wings of a bird shot dead: a flutter in the first moment as it falls,
// half open and hanging; once it lies on the water (`floating`) spread flat on it, swept back
// and drooping onto it. (Opened all the way: between spread and folded a wing is twisted
// half round, and on the water that showed as a wing standing on its edge.)
function limp(st, e, dt, { fold = 0.45, droop = -0.45, floating }) {
  const p = st.pose;
  const spasm = Math.max(0, 1 - (e.corpse ?? 0) / 0.5);
  st.phase = (st.phase + dt * 9 * TAU) % TAU;
  p.fold = toward(p.fold, floating ? 0 : fold, 3, dt);
  p.sweep = toward(p.sweep, floating ? 0.3 : 0.12, 3, dt);
  p.armFlap = toward(p.armFlap, (floating ? -0.12 : droop) + 0.35 * spasm * Math.sin(st.phase), 5, dt);
  p.handFlap = toward(p.handFlap, floating ? -0.08 : -0.35, 4, dt);
  p.tailSpread = toward(p.tailSpread, 0.35, 3, dt);
  p.tailPitch = toward(p.tailPitch, 0, 3, dt);
  // (The legs hang back, one further than the other: swung forward, the feet lay flat on the
  // belly and the flank.)
  p.hipL = toward(p.hipL, -0.45, 3, dt);
  p.hipR = toward(p.hipR, -0.85, 3, dt);
  p.heel = toward(p.heel, 0.35, 3, dt);
}
// How a dead bird lies: tumbling as it falls, then on the water on its belly, hardly tipped
// (which way its id says; tipped further, the wing on the high side would stand up out of the
// water as no limp wing does), the head down in the water.
function lying(st, e, dt, floating, tumble) {
  const side = e.id % 2 ? 1 : -1;
  if (floating) st.roll = toward(st.roll, side * 0.07, 2, dt);
  else st.roll = side * Math.min(e.rolled ?? 0, 1.4) + tumble * Math.sin((e.corpse ?? 0) * 9);
  st.pitch = toward(st.pitch, 0, 3, dt);
  const p = st.pose;
  p.headPitch = toward(p.headPitch, floating ? -0.95 : -0.5, 3, dt);
  p.headYaw = toward(p.headYaw, side * 0.5, 3, dt);
}

const POSES = {
  // The kingfisher: whirring flight low over the water; hovering beak down over the salmon,
  // its body raised, wings beating fast, tail fanned and pressed down; the plunge with the
  // wings folding back; out of the water with hard beats.
  kingfisher(e, st, dt) {
    const p = st.pose;
    const mode = e.mode;
    if (e.dead) {
      const floating = e.position.y <= st.top + 0.05;
      limp(st, e, dt, { fold: 0.4, floating });
      lying(st, e, dt, floating, 0.8);
      return;
    }
    const wet = e.position.y < st.top;
    if (mode === "strike") {
      // Folding as it goes: wings swept back, then shut before the water.
      const k = ease(0, 0.14, e.t ?? 0);
      p.fold = toward(p.fold, 0.55 + 0.45 * k, 20, dt);
      p.sweep = toward(p.sweep, 0.5, 10, dt);
      glide(st, dt, 0.05, -0.1);
      p.headPitch = toward(p.headPitch, 0, 12, dt);
      st.pitch = toward(st.pitch, 0, 12, dt);
      p.tailSpread = toward(p.tailSpread, 0, 10, dt);
      p.tailPitch = toward(p.tailPitch, 0, 10, dt);
      p.hipL = p.hipR = toward(p.hipL, -1.3, 10, dt);
      return;
    }
    if (wet) {
      // Under the water, wings shut, working its way out.
      p.fold = toward(p.fold, 1, 10, dt);
      glide(st, dt, 0, 0);
      p.headPitch = toward(p.headPitch, 0.2, 6, dt);
      return;
    }
    p.fold = toward(p.fold, 0, 9, dt);
    if (mode === "coil") {
      // The hover: the body raised toward upright, the head bent down along the heading at
      // the salmon; the wings beat through a flatter stroke, swinging forward and back.
      const down = Math.asin(clamp(e.heading.y, -1, 1));
      const body = Math.min(0.45, down + 1.15);
      st.pitch = toward(st.pitch, body - down, 8, dt);
      p.headPitch = toward(p.headPitch, Math.max(-1.3, down - body), 8, dt);
      beat(st, dt, 12, 0.85, 0.25);
      p.sweep = -0.28 * Math.cos(st.phase);
      p.tailSpread = toward(p.tailSpread, 0.7, 6, dt);
      p.tailPitch = toward(p.tailPitch, 0.45, 6, dt);
      p.hipL = p.hipR = toward(p.hipL, -0.2, 6, dt);
      return;
    }
    // Flight: fast whirring beats, harder climbing out of the water.
    const climbing = mode === "recover";
    beat(st, dt, climbing ? 12 : 10, climbing ? 0.85 : 0.62, 0.12);
    p.sweep = toward(p.sweep, 0.05, 6, dt);
    p.headPitch = toward(p.headPitch, climbing ? 0.25 : -0.05, 5, dt);
    st.pitch = toward(st.pitch, 0, 5, dt);
    p.tailSpread = toward(p.tailSpread, climbing ? 0.4 : 0.05, 5, dt);
    p.tailPitch = toward(p.tailPitch, 0.1, 5, dt);
    p.hipL = p.hipR = toward(p.hipL, -1.3, 6, dt);
  },

  // The goosander: under water it swims by its feet alone, both together, the wings shut
  // tight, the neck stretched out ahead; drawing up it pulls the neck back, lunging it shoots
  // it forward. Up for air it lies on the water, the neck raised and the head level, paddling
  // slowly, one foot after the other.
  merganser(e, st, dt) {
    const p = st.pose;
    if (e.dead) {
      // (Its wings stay shut: it dies under the water or on it, where they were shut already.)
      p.fold = toward(p.fold, 1, 2, dt);
      p.armFlap = toward(p.armFlap, -0.2, 2, dt);
      // (The neck limp, the head hanging in the water.)
      p.headX = toward(p.headX, -0.2, 2, dt);
      p.headY = toward(p.headY, -0.75, 2, dt);
      p.headPitch = toward(p.headPitch, -0.9, 2, dt);
      p.basePitch = toward(p.basePitch, -0.6, 2, dt);
      p.curl = toward(p.curl, 0.36, 2, dt);
      // (The feet hanging back and down: swung forward, the big webs lay on the flank.)
      p.hipL = toward(p.hipL, -0.6, 2, dt);
      p.hipR = toward(p.hipR, -1.0, 2, dt);
      p.heel = toward(p.heel, 0.3, 2, dt);
      p.tailSpread = toward(p.tailSpread, 0.3, 2, dt);
      st.pitch = toward(st.pitch, 0, 2, dt);
      st.roll = toward(st.roll, (e.id % 2 ? 1 : -1) * 0.45, 2, dt);
      return;
    }
    p.fold = 1;
    p.sweep = 0;
    p.armFlap = p.handFlap = 0;
    const up = e.mode === "breathe" && e.position.y > st.top - e.size * 0.2;
    st.float = toward(st.float ?? 0, up ? 1 : 0, 3, dt);
    const f = st.float;
    const speed = Math.max(0, e.speed ?? 0) / e.size;
    // The feet: together, far back and pushing under water; one after the other below it on
    // the surface.
    const rate = f > 0.5 ? 1.2 : 0.8 + speed * 3.2;
    st.phase = (st.phase + dt * rate * TAU) % TAU;
    const stroke = Math.sin(st.phase);
    const swim = 1 - f;
    p.hipL = swim * (-1.35 + 0.5 * stroke) + f * (-0.25 + 0.45 * stroke);
    p.hipR = swim * (-1.35 + 0.5 * stroke) + f * (-0.25 - 0.45 * stroke);
    p.heel = swim * (-0.7 + 0.55 * Math.max(0, Math.cos(st.phase))) + f * 0.2;
    // The neck: out ahead swimming, up with the head level floating; pulled back drawing up,
    // shot out in the strike.
    let reach = 0.18,
      raise = -0.04;
    if (e.mode === "coil") {
      reach = -0.35;
      raise = 0.2;
    } else if (e.mode === "strike") {
      reach = 0.5;
      raise = -0.08;
    }
    const wantX = swim * reach + f * -0.5,
      wantY = swim * raise + f * 0.8;
    p.headX = toward(p.headX, wantX, e.mode === "strike" ? 20 : 7, dt);
    p.headY = toward(p.headY, wantY, e.mode === "strike" ? 20 : 7, dt);
    p.basePitch = toward(p.basePitch, f * 0.95, 5, dt);
    p.headPitch = toward(p.headPitch, swim * (e.mode === "coil" ? 0.12 : -0.04) - f * 0.05, 7, dt);
    p.curl = 0.34 + 0.06 * f;
    p.tailPitch = toward(p.tailPitch, -0.25 * f, 4, dt);
    p.tailSpread = toward(p.tailSpread, 0.1, 4, dt);
    // Lying on the water: level, whatever the plan's heading lifts it by.
    const heading = Math.asin(clamp(e.heading.y, -1, 1));
    st.pitch = toward(st.pitch, -heading * f, 4, dt);
    // A shot of its revolver jerks it.
    if (e.firedAt !== undefined && e.firedAt !== st.firedAt) {
      st.firedAt = e.firedAt;
      st.kick = 1;
    }
    st.kick = Math.max(0, (st.kick ?? 0) - dt * 7);
    st.pitch += 0.05 * st.kick;
  },

  // The heron: standing with its neck in an S, the head where the enemy system keeps it (its
  // gun's muzzle) and the bill along its aim; taking aim it draws the head back along the line
  // of its aim (the tell), and with the shot it lunges along that line and settles again.
  // (Always on the line of fire: a shot from anywhere on it goes where the plan aimed.)
  heron(e, st, dt) {
    const p = st.pose;
    if (e.dead) {
      const floating = (e.corpse ?? 0) > 1.2;
      limp(st, e, dt, { fold: 0.55, droop: -0.3, floating });
      // (Afloat it lies toppled forward, so its wings' turns are the standing bird's: about
      // its upright, which now lies along the water, a sweep lifts both wings into a V and a
      // sweep forward lowers them; about its length, which now points down, a flap sweeps
      // them back. So they are flapped back, and swept forward just enough to bring their
      // tips down from the shoulders onto the water.)
      if (floating) {
        p.sweep = toward(p.sweep, -0.12, 3, dt);
        p.armFlap = toward(p.armFlap, -0.3, 3, dt);
        p.handFlap = toward(p.handFlap, -0.2, 3, dt);
      }
      p.headPitch = toward(p.headPitch, -0.9, 2.5, dt);
      p.headYaw = toward(p.headYaw, 0.3, 2.5, dt);
      p.basePitch = toward(p.basePitch, -1.9, 2.5, dt);
      p.curl = toward(p.curl, 0.3, 2.5, dt);
      p.headX = toward(p.headX, -1.3, 2.5, dt);
      p.headY = toward(p.headY, -3.9, 2.5, dt);
      p.headZ = toward(p.headZ, 0, 2.5, dt);
      return;
    }
    p.fold = 1;
    p.sweep = 0;
    p.armFlap = p.handFlap = 0;
    p.tailSpread = 0.1;
    p.hipL = p.hipR = p.heel = 0;
    const tell = e.spec.weapon?.tell ?? 1;
    if (e.firedAt !== undefined && e.firedAt !== st.firedAt) {
      st.firedAt = e.firedAt;
      st.sinceShot = 0;
    }
    st.sinceShot = (st.sinceShot ?? 9) + dt;
    // Along the aim: drawn back while it aims, the lunge with the shot and back.
    let along = 0;
    if (e.mode === "aim") along = -1.0 * ease(0, tell * 0.8, e.t ?? 0);
    // (Between the end of the tell and the shot it holds the head drawn back.)
    else if (e.mode === "fire" && st.sinceShot > 0.6) along = -1.0;
    const lunge = st.sinceShot < 0.6 ? Math.sin(Math.PI * clamp(st.sinceShot / 0.18, 0, 1)) * 0.9 * (1 - ease(0.1, 0.6, st.sinceShot)) + (1 - ease(0, 0.12, st.sinceShot)) * -1.0 : 0;
    st.along = toward(st.along ?? 0, along + lunge, st.sinceShot < 0.6 ? 40 : 6, dt);
    p.curl = toward(p.curl, e.mode === "aim" ? 0.46 : 0.4, 4, dt);
    p.basePitch = toward(p.basePitch, -0.55, 4, dt);
  },

  // The gannet: gliding on stiff straight wings round its circle, now and then a few beats;
  // banking steeper and steeper, the wings drawn in, as it tips over (the tell); in the
  // plunge the wings swept back into an arrow; pulling out with the wings wide and the tail
  // fanned, then beating hard to climb away.
  gannet(e, st, dt) {
    const p = st.pose;
    if (e.dead) {
      const floating = e.position.y <= st.top + 0.05;
      limp(st, e, dt, { fold: 0.3, droop: -0.5, floating });
      lying(st, e, dt, floating, 0.6);
      return;
    }
    const mode = e.mode;
    p.hipL = p.hipR = toward(p.hipL, -1.45, 4, dt);
    p.heel = toward(p.heel, 0.5, 4, dt);
    if (mode === "strike") {
      const k = ease(0, 0.4, e.t ?? 0);
      p.fold = toward(p.fold, 0.4 + 0.6 * k, 10, dt);
      p.sweep = toward(p.sweep, 0.5, 8, dt);
      glide(st, dt, 0.05, 0);
      p.headPitch = toward(p.headPitch, 0, 8, dt);
      p.headYaw = toward(p.headYaw, 0, 8, dt);
      p.tailSpread = toward(p.tailSpread, 0, 8, dt);
      return;
    }
    // Beats: while pulling out and climbing, and in short bouts on the circle.
    st.bout = (st.bout ?? 2 + (e.id % 3)) - dt;
    if (st.bout < -1.6) st.bout = 3 + ((e.id * 7 + Math.floor(st.phase * 10)) % 4);
    const climbing = mode === "recover" || mode === "leave";
    const flapping = climbing || st.bout < 0;
    if (flapping) beat(st, dt, climbing ? 3.2 : 2.8, climbing ? 0.72 : 0.5, 0.08, 0.8);
    else glide(st, dt);
    const coil = mode === "coil" ? ease(0, e.spec.coil ?? 1, e.t ?? 0) : 0;
    p.fold = toward(p.fold, 0.2 * coil, 6, dt);
    p.sweep = toward(p.sweep, 0.04 + 0.3 * coil, 5, dt);
    p.headPitch = toward(p.headPitch, -0.25 - 0.35 * coil, 4, dt);
    p.headYaw = toward(p.headYaw, (e.bank ?? 0) * 0.35, 3, dt);
    const braking = mode === "recover" && (e.t ?? 0) < 0.9;
    p.tailSpread = toward(p.tailSpread, braking ? 0.7 : 0.1, 5, dt);
    p.tailPitch = toward(p.tailPitch, braking ? 0.25 : 0, 5, dt);
    st.pitch = toward(st.pitch, 0, 4, dt);
  },
};

// ---- The flock.

export function createBirds(scene, { capacity = { kingfisher: 2, merganser: 2, heron: 1, gannet: 1 } } = {}) {
  const material = birdMaterial();
  const kinds = {};
  let triangles = 0;
  for (const [kind, make] of Object.entries(SHAPES)) {
    const shape = make();
    const info = describe(kind, shape);
    const room = capacity[kind] ?? 2;
    const geometry = shape.geometry;
    const data = new THREE.InstancedInterleavedBuffer(new Float32Array(room * FLOATS), FLOATS, 1).setUsage(THREE.DynamicDrawUsage);
    ["birdRow0", "birdRow1", "birdRow2", "birdWing", "birdHead", "birdLook", "birdLegs"].forEach((name, i) => geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(data, 4, i * 4)));
    const mesh = new THREE.InstancedMesh(geometry, material, room);
    // (The bird places itself: its matrix is in its own attributes, not the renderer's.)
    mesh.instanceMatrix.isInstancedBufferAttribute = false;
    mesh.name = `Combat ${kind}`;
    // One bird with no size (its rows all 0) until the first step: the warm-up, which shows
    // everything hidden, then compiles it with the rest.
    mesh.count = 1;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    scene.add(mesh);
    kinds[kind] = { ...info, mesh, data, room, n: 0 };
    triangles += geometry.index.count / 3;
  }

  // Per bird, what carries over from one frame to the next.
  const kept = new WeakMap();
  // (Each bird's wingbeat starts where its id says, so a scene comes out the same each time.)
  const fresh = (e) => ({
    phase: ((e.id ?? 1) * 2.39996) % TAU,
    pitch: 0,
    roll: 0,
    float: 0,
    top: 0,
    pose: { armFlap: 0, handFlap: 0, sweep: 0, fold: 0, headX: 0, headY: 0, headZ: 0, headPitch: 0, headYaw: 0, basePitch: 0, tailPitch: 0, tailSpread: 0, hipL: -1.3, hipR: -1.3, heel: 0, curl: 1 / 3 },
    matrix: new THREE.Matrix4(),
    head: new THREE.Matrix4(),
    frame: -1,
  });
  let frame = 0,
    dt = 0;

  // Scratch.
  const X = new THREE.Vector3(),
    Y = new THREE.Vector3(),
    Z = new THREE.Vector3(),
    UP = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3(),
    w = new THREE.Vector3(),
    aim = new THREE.Vector3();
  const basis = new THREE.Matrix4(),
    turn = new THREE.Matrix4(),
    shift = new THREE.Matrix4(),
    back = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  // The head's own turn (as the shader does it: pitch about z, then yaw about y) and where
  // that puts its joint, as a matrix in the model's frame.
  function headMatrix(shape, pose, out) {
    const J0 = shape.neck.joint;
    turn.makeRotationY(pose.headYaw).multiply(back.makeRotationZ(pose.headPitch));
    out.makeTranslation(J0[0] + pose.headX, J0[1] + pose.headY, J0[2] + pose.headZ).multiply(turn).multiply(shift.makeTranslation(-J0[0], -J0[1], -J0[2]));
    return out;
  }

  // The heron: stood on its legs at e.stand, facing e.facing, drawn HERON.scale times life;
  // the head put where the plan keeps it and turned along its aim. Dead, it topples over
  // sideways into the water, and floats there, drifting with the record.
  function placeHeron(e, st, entry, out) {
    const { shape } = entry;
    const pose = st.pose;
    const fade = e.dead ? clamp((CORPSE_SECONDS - (e.corpse ?? 0)) / 1.5, 0, 1) : 1;
    const S = HERON.scale * fade * (e.shown ?? 1);
    const yaw = Math.atan2(-e.facing.z, e.facing.x);
    if (!e.dead) {
      out.makeRotationY(yaw).scale(v.set(S, S, S)).setPosition(e.stand);
      // The aim in the model's frame: the head turned to it (pitch, then yaw).
      aim.copy(e.aimDir).applyAxisAngle(UP, -yaw).normalize();
      const pitch = Math.asin(clamp(aim.y, -1, 1));
      const headYaw = Math.atan2(-aim.z, aim.x);
      pose.headPitch = toward(pose.headPitch, pitch, 10, dt);
      pose.headYaw = toward(pose.headYaw, headYaw, 10, dt);
      // Where the skull goes: the muzzle, moved along the aim by the tell and the lunge.
      v.copy(e.muzzle).sub(e.stand).applyAxisAngle(UP, -yaw).divideScalar(S).addScaledVector(aim, st.along ?? 0);
      // (The joint is behind the skull by the head's own turn.)
      turn.makeRotationY(pose.headYaw).multiply(back.makeRotationZ(pose.headPitch));
      w.set(shape.skull[0] - shape.neck.joint[0], shape.skull[1] - shape.neck.joint[1], 0).applyMatrix4(turn);
      const J0 = shape.neck.joint;
      pose.headX = v.x - w.x - J0[0];
      pose.headY = v.y - w.y - J0[1];
      pose.headZ = v.z - w.z - J0[2];
      st.lastYaw = yaw;
      return out;
    }
    // (Shrinking away at the end of a corpse's time, and by `shown` while a burst one fades.)
    if (S <= 0) return out.makeScale(0, 0, 0);
    // Toppling: about its feet, forward into the river (out from the bank it stood by) and a
    // little to one side, until its body lies at the surface; then afloat, rocking.
    const fall = e.id % 2 ? 1 : -1;
    const t = e.corpse ?? 0;
    const top = st.top;
    const floor = e.stand.y;
    const middle = HERON.centre[1] * HERON.scale;
    const tip = Math.acos(clamp((top - floor + 0.4) / middle, 0, 1));
    const angle = tip * ease(0, 1.1, t) + 0.06 * Math.sin(t * 1.3) * ease(1.1, 2, t);
    out.makeRotationY(st.lastYaw ?? yaw).multiply(turn.makeRotationZ(-angle)).multiply(back.makeRotationX(fall * 0.35 * ease(0.3, 1.4, t))).scale(v.set(S, S, S));
    // (Its feet where the record drifts, lifted as the body comes to rest on the water.)
    v.set(e.position.x, floor, e.position.z);
    out.setPosition(v);
    w.set(HERON.centre[0], HERON.centre[1], 0).applyMatrix4(out);
    const lift = Math.max(0, top - 0.3 - w.y) * ease(0.8, 1.6, t);
    out.elements[13] += lift;
    return out;
  }

  // A flying or swimming bird: its model along its heading (the middle where the enemy is),
  // banked into its turns, pitched about its skull as its pose says, rolled over dead.
  function placeBird(e, st, entry, out) {
    const { shape, length, middle } = entry;
    X.copy(e.heading);
    X.y *= 1 - st.level;
    if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
    X.normalize();
    Z.crossVectors(X, UP);
    if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1);
    Z.normalize();
    Y.crossVectors(Z, X).normalize();
    basis.makeBasis(X, Y, Z);
    if (e.bank && !e.dead) basis.multiply(turn.makeRotationX(e.bank));
    // A hit jolts it.
    const jolt = st.jolt ?? 0;
    const roll = st.roll + jolt * 0.35 * Math.sin(frame * 1.7);
    if (roll) basis.multiply(turn.makeRotationX(roll));
    const fade = e.dead ? clamp((CORPSE_SECONDS - (e.corpse ?? 0)) / 1.5, 0, 1) : 1;
    const k = (e.size / length) * fade * (e.shown ?? 1);
    out.copy(basis).scale(v.set(k, k, k)).setPosition(e.position);
    out.multiply(shift.makeTranslation(-middle, 0, 0));
    if (st.pitch) {
      const [sx, sy] = shape.skull;
      out.multiply(shift.makeTranslation(sx, sy, 0)).multiply(turn.makeRotationZ(st.pitch)).multiply(back.makeTranslation(-sx, -sy, 0));
    }
    // (Where its bill reaches ahead of its middle, for its strike.)
    e.beak = (shape.beak[0] - middle) * (e.size / length);
    return out;
  }

  function write(entry, st) {
    const slot = entry.n++;
    const a = entry.data.array;
    const o = slot * FLOATS;
    const m = st.matrix.elements;
    a[o] = m[0];
    a[o + 1] = m[4];
    a[o + 2] = m[8];
    a[o + 3] = m[12];
    a[o + 4] = m[1];
    a[o + 5] = m[5];
    a[o + 6] = m[9];
    a[o + 7] = m[13];
    a[o + 8] = m[2];
    a[o + 9] = m[6];
    a[o + 10] = m[10];
    a[o + 11] = m[14];
    const p = st.pose;
    a[o + 12] = p.armFlap;
    a[o + 13] = p.handFlap;
    a[o + 14] = p.sweep;
    a[o + 15] = clamp(p.fold, 0, 1);
    a[o + 16] = p.headX;
    a[o + 17] = p.headY;
    a[o + 18] = p.headZ;
    a[o + 19] = p.headPitch;
    a[o + 20] = p.headYaw;
    a[o + 21] = p.basePitch;
    a[o + 22] = p.tailPitch;
    a[o + 23] = p.tailSpread;
    a[o + 24] = p.hipL;
    a[o + 25] = p.hipR;
    a[o + 26] = p.heel;
    a[o + 27] = p.curl;
  }

  const api = {
    kinds,
    triangles,
    meshes: Object.values(kinds).map((k) => k.mesh),
    material,
    // Every step, before the birds: dt the game's seconds since the last (0 holds them).
    begin(seconds = 0) {
      dt = Math.max(0, seconds);
      frame++;
      for (const kind in kinds) kinds[kind].n = 0;
    },
    // One bird, posed from its record.
    add(e) {
      const entry = kinds[e.spec?.model ?? e.kind];
      if (!entry || entry.n >= entry.room) return;
      let st = kept.get(e);
      if (!st) {
        st = fresh(e);
        kept.set(e, st);
      }
      st.top = e.river?.s != null ? level(e.river.s) : (st.top ?? 0);
      // A corpse on the water lies level whatever way it was going when it was shot (killed in
      // the plunge, its heading still points down, and drawn along it the bird stood on its
      // head in the water with its wings up).
      st.level = toward(st.level ?? 0, e.dead && e.position.y <= st.top + 0.05 ? 1 : 0, 3, dt);
      if (e.hitAt !== undefined && e.hitAt !== st.hitAt) {
        st.hitAt = e.hitAt;
        st.jolt = 1;
      }
      st.jolt = Math.max(0, (st.jolt ?? 0) - dt * 5);
      POSES[entry.kind](e, st, dt);
      if (entry.kind === "heron") placeHeron(e, st, entry, st.matrix);
      else placeBird(e, st, entry, st.matrix);
      headMatrix(entry.shape, st.pose, st.head);
      st.frame = frame;
      if (st.matrix.elements[0] === 0 && st.matrix.elements[1] === 0 && st.matrix.elements[2] === 0) return;
      write(entry, st);
    },
    // After the last bird: what has birds is shown, the rest hidden.
    end() {
      for (const kind in kinds) {
        const entry = kinds[kind];
        entry.mesh.count = entry.n;
        entry.mesh.visible = entry.n > 0;
        if (entry.n > 0) entry.data.needsUpdate = true;
      }
    },
    // Where a bird's weapon is strapped (`name`, one of mountsOf(kind): the kingfisher's
    // "beak", the goosander's "shoulder", the heron's "head", the gannet's "left" and
    // "right"), as it was posed last: a world matrix without scale, its origin on the bird,
    // +x along the weapon's line (the way it points), +y the part's up, +z to its right.
    // Returns `out`, or null if the bird has not been drawn yet. Multiply by `scaleOf(e)` for
    // the bird's own size (world units a model unit).
    mount(e, name, out) {
      const st = kept.get(e);
      const entry = kinds[e.spec?.model ?? e.kind];
      const spot = entry?.shape.mounts[name];
      if (!st || st.frame < 0 || !spot) return null;
      out.copy(st.matrix);
      if (spot.part === "head") out.multiply(st.head);
      v.set(...spot.along).normalize();
      w.set(0, 1, 0);
      Z.crossVectors(v, w).normalize();
      w.crossVectors(Z, v).normalize();
      turn.makeBasis(v, w, Z).setPosition(...spot.at);
      out.multiply(turn);
      // (Scale taken out: the axes made unit length again, square to one another.)
      out.extractBasis(X, Y, Z);
      X.normalize();
      Z.crossVectors(X, Y).normalize();
      Y.crossVectors(Z, X).normalize();
      v.setFromMatrixPosition(out);
      return out.makeBasis(X, Y, Z).setPosition(v);
    },
    // The mounts a kind has.
    mountsOf(kind) {
      return Object.keys(kinds[kind]?.shape.mounts ?? {});
    },
    // World units a model unit, as a bird is drawn now.
    scaleOf(e) {
      const st = kept.get(e);
      return st ? new THREE.Vector3().setFromMatrixColumn(st.matrix, 0).length() : 0;
    },
  };
  return api;
}
