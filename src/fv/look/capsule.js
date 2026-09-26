// The weapon capsules along the river: a silver bubble hanging in the water with the weapon
// turning slowly inside it, a ring round it in the colour of the stage the weapon belongs
// to, and a thin column of little bubbles rising from it to the surface -- which is what
// gives away one tucked into the lee of a stone. Swum into, it bursts: the shell swells and
// is gone, the ring flies apart, a cloud of bubbles scatters.
//
// Three instanced draws on layer 1 (out of the water's mirror and the Snell's window, with
// the enemies and the effects): the shells, the rings, the bubbles. The shell and the ring
// share one instance matrix (the capsule's place and size); the shader turns the ring and
// makes the shell breathe, so a still capsule costs the processor next to nothing.
//
// The weapon inside is not drawn here (models.js owns the weapon models). Each capsule has a
// docking point for it: anchor(i, out) gives the world matrix for the model of items[i] --
// see below.

import * as THREE from "three";
import { Fn, abs, atan, attribute, cameraPosition, cameraViewMatrix, clamp, cos, dot, float, fract, length, max, mix, modelWorldMatrix, normalGeometry, normalize, normalView, positionGeometry, positionViewDirection, positionWorld, pow, reflect, sin, smoothstep, step, uniform, uv, varyingProperty, vec2, vec3, vec4 } from "three/tsl";
import { STAGES } from "../../salmon.js";
import { PointCloud, perPoint } from "../../materials.js";
import { ditherThreshold } from "../../render/dither.js";
import { fogNodes, underwaterInscatter } from "../../render/fog.js";
import { ownInstanceMatrix } from "../../render/instancing.js";
import { surfaceLevelAt, waterLit } from "../../render/water.js";
import { WEAPONS } from "../weapons.js";

const LAYER = 1;
const TAU = Math.PI * 2;

// The ring's colour for each phase of life, taken from the game's own screen: the yolk ring
// of the alevin, the growth greens of fry and parr, a cold silver-blue for the smolt (the
// sea coat coming), the gold of the sea stages' medals, and the spawner's red.
export const STAGE_COLOURS = {
  alevin: 0xffab52,
  fry: 0xa6f07a,
  parr: 0x2fc59a,
  smolt: 0x9fdcff,
  sea: 0xffd24a,
  spawner: 0xec6378,
};
// The stage a weapon's capsule belongs to, where WEAPONS does not say (weapons.js may give
// each weapon a `stage`: a stage id from salmon.js STAGES, which then wins).
const WEAPON_STAGES = { piu: "alevin" };

// How long the burst takes once a capsule is taken, in seconds; after it the capsule is not
// drawn and its anchor shows nothing.
export const BURST_SECONDS = 0.7;
// A capsule grows in over this long after it appears.
const GROW_SECONDS = 0.6;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

// A capsule's stage: its own `stage` (an index or an id) if the item carries one, else its
// weapon's.
function stageOf(item) {
  const own = item.stage ?? WEAPONS[item.weapon]?.stage ?? WEAPON_STAGES[item.weapon] ?? "fry";
  const index = typeof own === "number" ? own : STAGES.findIndex((st) => st.id === own || st.phase === own);
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, index < 0 ? 1 : index))];
}

export function createCapsules(scene, { capacity = 24, light = false } = {}) {
  const columnBubbles = light ? 10 : 20;
  const burstBubbles = light ? 12 : 24;
  const perCapsule = columnBubbles + burstBubbles;
  const clock = uniform(0);

  // Per capsule, shared by the shell and the ring: (seed, burst 0..1, grow 0..1, radius) and
  // the stage colour (rgb, and the place: 1 back, -1 belly).
  const state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);

  // ---- The shell: a bubble of air, a mirror at its rim (the water's light turned back at
  // the glancing surface) and clear in the middle, where the weapon shows through. It breathes
  // in slow wobbles, as a trapped bubble does in the current.
  const shellGeometry = new THREE.SphereGeometry(1, light ? 24 : 40, light ? 16 : 28);
  shellGeometry.setAttribute("capsule", state);
  const shell = new THREE.InstancedMesh(shellGeometry, undefined, capacity);
  const shellMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, transparent: true, depthWrite: false });
  {
    const matrix = ownInstanceMatrix(shell);
    const s = attribute("capsule", "vec4");
    const vNormal = varyingProperty("vec3", "vShellNormal");
    const vFade = varyingProperty("float", "vShellFade");
    shellMaterial.positionNode = Fn(() => {
      const p = positionGeometry;
      const seed = s.x.mul(TAU);
      const t = clock;
      // Low modes of a wobbling drop: squashing and stretching across a few axes.
      const wobble = sin(t.mul(2.3).add(seed).add(p.y.mul(2.2)))
        .mul(0.03)
        .add(sin(t.mul(3.1).add(seed.mul(1.7)).add(p.x.mul(2.8))).mul(0.022))
        .add(sin(t.mul(1.7).add(seed.mul(2.3)).add(p.z.mul(2.5))).mul(0.018));
      const burst = s.y;
      const k = wobble.add(1).mul(burst.mul(0.7).add(1)).mul(s.z);
      const world = modelWorldMatrix.mul(matrix);
      vNormal.assign(cameraViewMatrix.mul(world.mul(vec4(normalGeometry, 0))).xyz);
      vFade.assign(burst.oneMinus().pow(2).mul(s.z));
      return matrix.mul(vec4(p.mul(k), 1)).xyz;
    })();
    shellMaterial.normalNode = normalize(vNormal);
    // A bubble in water mirrors almost nothing face on and everything toward its rim, where
    // the light inside it is turned back whole (total reflection): a broad band of quicksilver
    // round a clear middle.
    const facing = abs(dot(normalize(vNormal), positionViewDirection));
    const fresnel = pow(facing.oneMinus(), 1.7);
    shellMaterial.opacityNode = mix(0.1, 1, fresnel).mul(vFade);
    shellMaterial.colorNode = vec3(0.95, 0.97, 1);
    waterLit(shellMaterial, {
      mirror: 0,
      // What the rim mirrors: the water round it, bright toward the lit surface and the
      // window of sky overhead, dim toward the bed (as a fish's silver flank does).
      beforeIndirect: ({ radiance }) => {
        const reflectView = reflect(positionViewDirection.negate(), normalView);
        const reflectWorld = normalize(cameraViewMatrix.transpose().mul(vec4(reflectView, 0)).xyz);
        const surroundings = underwaterInscatter(reflectWorld).mul(2.1).add(fogNodes().color.mul(6).mul(smoothstep(0.45, 0.97, reflectWorld.y)));
        radiance.addAssign(surroundings);
      },
    });
  }
  shell.material = shellMaterial;
  shell.name = "Combat capsule shell";
  // After the opaque world and the weapon inside, before the effects.
  shell.renderOrder = 2;

  // ---- The ring: a band of lit metal in the stage colour, glowing, slowly turning on a
  // tilted axis; three brighter marks run round it so the turning shows.
  const ringGeometry = new THREE.TorusGeometry(1.28, 0.045, light ? 6 : 10, light ? 48 : 96).rotateX(Math.PI / 2);
  ringGeometry.setAttribute("capsule", state);
  ringGeometry.setAttribute("tint", tint);
  const ring = new THREE.InstancedMesh(ringGeometry, undefined, capacity);
  ring.instanceMatrix = shell.instanceMatrix;
  const ringMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.3 });
  {
    const matrix = ownInstanceMatrix(ring);
    const s = attribute("capsule", "vec4");
    const c = attribute("tint", "vec4");
    const vNormal = varyingProperty("vec3", "vRingNormal");
    const vAround = varyingProperty("float", "vRingAround");
    const vFade = varyingProperty("float", "vRingFade");
    const vTint = varyingProperty("vec4", "vRingTint");
    const vSeed = varyingProperty("float", "vRingSeed");
    const turn = (v, tilt, spin) => {
      // Tilted about x, then turned about the vertical.
      const ct = cos(tilt),
        st = sin(tilt);
      const tilted = vec3(v.x, v.y.mul(ct).sub(v.z.mul(st)), v.y.mul(st).add(v.z.mul(ct)));
      const cs = cos(spin),
        ss = sin(spin);
      return vec3(tilted.x.mul(cs).add(tilted.z.mul(ss)), tilted.y, tilted.x.negate().mul(ss).add(tilted.z.mul(cs)));
    };
    ringMaterial.positionNode = Fn(() => {
      const p = positionGeometry;
      const seed = s.x.mul(TAU);
      const burst = s.y;
      const tilt = sin(clock.mul(0.7).add(seed)).mul(0.12).add(0.32);
      const spin = clock.mul(0.5).add(seed);
      const k = burst.mul(1.1).add(1).mul(s.z);
      const world = modelWorldMatrix.mul(matrix);
      vNormal.assign(cameraViewMatrix.mul(world.mul(vec4(turn(normalGeometry, tilt, spin), 0))).xyz);
      vAround.assign(atan(p.z, p.x));
      vFade.assign(burst.oneMinus().mul(s.z));
      vTint.assign(c);
      vSeed.assign(s.x);
      // (Where the weapon goes on the fish shows in the ring's height: above the bubble's
      // middle for the back, below it for the belly.)
      const lift = vec3(0, c.w.mul(0.3).mul(burst.oneMinus()), 0);
      return matrix.mul(vec4(turn(p.mul(k), tilt, spin).add(lift), 1)).xyz;
    })();
    ringMaterial.normalNode = normalize(vNormal);
    const marks = smoothstep(0.55, 0.95, sin(vAround.mul(3).sub(clock.mul(1.6))));
    const pulse = sin(clock.mul(2.4).add(vSeed.mul(TAU))).mul(0.25).add(1);
    ringMaterial.colorNode = vTint.rgb.mul(0.55);
    // Bright enough for the bloom to take it up, so the colour carries through the haze.
    ringMaterial.emissiveNode = vTint.rgb.mul(marks.mul(2.6).add(0.9)).mul(pulse).mul(vFade);
    ringMaterial.opacityNode = vFade;
    ringMaterial.alphaTestNode = ditherThreshold();
    waterLit(ringMaterial);
  }
  ring.material = ringMaterial;
  ring.name = "Combat capsule ring";

  // ---- The bubbles: a column rising from each capsule, and a cloud flung out when it
  // bursts. Each sprite knows its capsule (centre, radius) and its own seed; the shader
  // works out where it is, so the processor only writes the capsule's place.
  const bubbleGeometry = new THREE.BufferGeometry();
  // (centre xyz, radius) and (seed, burst 0..1, grow, 1 for a burst bubble); position is
  // there for the point count.
  bubbleGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(capacity * perCapsule * 3), 3));
  bubbleGeometry.setAttribute("column", new THREE.BufferAttribute(new Float32Array(capacity * perCapsule * 4), 4).setUsage(THREE.DynamicDrawUsage));
  bubbleGeometry.setAttribute("bubble", new THREE.BufferAttribute(new Float32Array(capacity * perCapsule * 4), 4).setUsage(THREE.DynamicDrawUsage));
  bubbleGeometry.setDrawRange(0, 0);
  const bubbleMaterial = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, sizeAttenuation: true });
  {
    const col = perPoint(bubbleGeometry, "column");
    const bub = perPoint(bubbleGeometry, "bubble");
    const centre = col.xyz,
      R = col.w;
    const seed = bub.x,
      burst = bub.y,
      grow = bub.z,
      burstOne = bub.w;
    const hash = (k) => fract(sin(seed.mul(k).add(k * 0.37)).mul(43758.5453));
    // The column: small bubbles let go from the top of the shell, rising and zigzagging, a
    // little larger the higher they get, all the way to the surface (the column spans the
    // water above the capsule, so it is as dense in a shallow run as in a pool); gone there.
    const top = surfaceLevelAt(centre);
    const height = clamp(top.sub(centre.y).sub(R), R.mul(2), 12);
    // (Bubbles of a few millimetres rise at a steady two decimetres a second, whatever size
    // the capsule is.)
    const speed = float(2.2);
    const u = fract(clock.mul(speed).div(height).add(seed));
    const rise = centre.add(
      vec3(
        sin(clock.mul(5.3).add(seed.mul(40))).mul(R).mul(0.06).mul(u.add(0.2)),
        R.mul(0.92).add(u.mul(height)),
        cos(clock.mul(4.7).add(seed.mul(31))).mul(R).mul(0.06).mul(u.add(0.2)),
      ),
    );
    const columnAlpha = smoothstep(0, 0.06, u)
      .mul(smoothstep(0.75, 1, u).oneMinus())
      .mul(smoothstep(top.sub(R.mul(0.3).add(0.05)), top, rise.y).oneMinus())
      .mul(burst.oneMinus())
      .mul(grow);
    // The burst: flung out all round (more upward), slowing, and drifting up.
    const dir = normalize(vec3(hash(12.9).sub(0.5), hash(78.2).sub(0.35), hash(37.7).sub(0.5)));
    const out = burst.oneMinus().pow(3).oneMinus();
    const flung = centre.add(dir.mul(R).mul(out.mul(hash(5.1).mul(1.4).add(0.6)).add(0.8))).add(vec3(0, R.mul(burst).mul(1.5), 0));
    const burstAlpha = smoothstep(0, 0.05, burst).mul(burst.oneMinus());
    bubbleMaterial.positionNode = mix(rise, flung, burstOne);
    const scale = clamp(R.mul(2), 0.6, 1.8);
    const size = mix(hash(3.3).mul(0.026).add(0.016).mul(u.mul(0.6).add(0.8)).mul(scale), R.mul(hash(9.1).mul(0.07).add(0.03)), burstOne);
    // Never smaller than a few pixels, so the column still gives away a capsule hidden in the
    // lee of a stone from further off than the bubbles themselves would show.
    const seen = max(size, length(centre.sub(cameraPosition)).mul(0.0032));
    bubbleMaterial.scaleNode = vec2(seen, seen);
    const alpha = mix(columnAlpha, burstAlpha, burstOne);
    // Shaded as the game's own bubbles: a thin bright rim, a milky body, a highlight up and
    // to one side (materials.js createBubbleMaterial).
    const q = uv().sub(0.5);
    const r = length(q);
    const rim = smoothstep(0.38, 0.47, r).mul(smoothstep(0.47, 0.5, r).oneMinus());
    const body = smoothstep(0.2, 0.5, r).oneMinus();
    const glint = smoothstep(0, 0.14, length(q.sub(vec2(-0.12, 0.14)))).oneMinus();
    const near = smoothstep(0.1, 0.6, length(positionWorld.sub(cameraPosition)));
    bubbleMaterial.colorNode = vec3(1.6, 1.75, 1.8);
    bubbleMaterial.opacityNode = rim.mul(0.5).add(body.mul(0.3)).add(glint.mul(0.9)).mul(alpha).mul(near).mul(step(r, 0.5));
  }
  const bubbles = new PointCloud(bubbleGeometry, bubbleMaterial);
  bubbles.name = "Combat capsule bubbles";
  bubbles.renderOrder = 3;

  for (const mesh of [shell, ring]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  for (const object of [shell, ring, bubbles]) {
    object.layers.set(LAYER);
    scene.add(object);
  }

  // Per item (by its index in the last list drawn): its anchor for the weapon model, and how
  // much of that model shows.
  const anchors = Array.from({ length: capacity }, () => new THREE.Matrix4());
  const shows = new Float32Array(capacity);
  // The item last seen at each index and when it was first seen taken (-1: not yet), so a
  // burst plays out even where the caller's age counts from the capsule's appearing.
  const seen = new Array(capacity).fill(null);
  const waiting = new Uint8Array(capacity);
  const takenAt = new Float64Array(capacity).fill(-1);

  // Scratch.
  const colour = new THREE.Color();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);

  const column = bubbleGeometry.attributes.column.array;
  const bubble = bubbleGeometry.attributes.bubble.array;
  const states = state.array,
    tints = tint.array;

  return {
    // Every frame: the capsules to show, { x, y, z, place, weapon, state, age, stage?, size? }
    // (size: the bubble's radius, when it should not follow the stage), and the game's clock
    // in seconds (it drives the wobble, the turning and the bubbles).
    draw(items, time) {
      clock.value = time % 3600;
      let n = 0;
      const count = Math.min(items.length, capacity);
      for (let i = 0; i < count; i++) {
        const item = items[i];
        shows[i] = 0;
        // How far into the burst (the age counted from the taking, or from when this index
        // was first seen taken, whichever is less).
        let burst = 0;
        if (item.state === "taken") {
          if (seen[i] !== item) takenAt[i] = -1;
          else if (waiting[i]) takenAt[i] = time;
          const age = item.age ?? 0;
          burst = (takenAt[i] >= 0 ? Math.min(time - takenAt[i], age) : age) / BURST_SECONDS;
          waiting[i] = 0;
        } else {
          takenAt[i] = -1;
          waiting[i] = 1;
        }
        seen[i] = item;
        if (burst >= 1) continue;
        const grow = item.state === "taken" ? 1 : smooth01((item.age ?? GROW_SECONDS) / GROW_SECONDS);
        const st = stageOf(item);
        const R = item.size ?? Math.max(0.16, Math.min(2.6, 0.21 * (st.length[0] + st.length[1])));
        const seed = ((item.x * 12.9898 + item.z * 78.233) % 1 + 1) % 1;
        // Hovering: a slow bob, as a buoyant thing tethered in the current would.
        position.set(item.x, item.y + Math.sin(time * 1.1 + seed * TAU) * 0.06 * R, item.z);
        matrix.compose(position, quaternion.identity(), scale.setScalar(R));
        matrix.toArray(shell.instanceMatrix.array, n * 16);
        states[n * 4] = seed;
        states[n * 4 + 1] = burst;
        states[n * 4 + 2] = Math.max(grow, 0.001);
        states[n * 4 + 3] = R;
        colour.setHex(STAGE_COLOURS[st.phase] ?? STAGE_COLOURS.fry);
        tints[n * 4] = colour.r;
        tints[n * 4 + 1] = colour.g;
        tints[n * 4 + 2] = colour.b;
        tints[n * 4 + 3] = item.place === "belly" ? -1 : 1;
        for (let b = 0; b < perCapsule; b++) {
          const o = (n * perCapsule + b) * 4;
          column[o] = position.x;
          column[o + 1] = position.y;
          column[o + 2] = position.z;
          column[o + 3] = R;
          bubble[o] = (seed * 7.31 + b / columnBubbles) % 1;
          bubble[o + 1] = burst;
          bubble[o + 2] = grow;
          bubble[o + 3] = b < columnBubbles ? 0 : 1;
        }
        // The weapon's anchor: at the centre, turning slowly about the vertical, sized so a
        // model a unit long fits inside; it vanishes in the first half of the burst.
        quaternion.setFromAxisAngle(up, time * 0.9 + seed * TAU);
        anchors[i].compose(position, quaternion, scale.setScalar(R * 1.45 * grow));
        shows[i] = grow * (1 - smooth01(burst * 2));
        n++;
      }
      for (let i = count; i < capacity; i++) {
        seen[i] = null;
        waiting[i] = 0;
        takenAt[i] = -1;
        shows[i] = 0;
      }
      shell.count = n;
      ring.count = n;
      bubbleGeometry.setDrawRange(0, n * perCapsule);
      if (n > 0) {
        shell.instanceMatrix.needsUpdate = true;
        state.needsUpdate = true;
        tint.needsUpdate = true;
        bubbleGeometry.attributes.column.needsUpdate = true;
        bubbleGeometry.attributes.bubble.needsUpdate = true;
      }
    },
    // The docking point for the weapon model inside items[i] (as last drawn): fills `out`
    // with its world matrix -- origin at the bubble's centre, turning slowly about the
    // vertical, scaled so that a model one unit long (along x, centred on its origin) fits in
    // the bubble -- and returns how much of the model shows (1 while the capsule waits, 0
    // once the burst is half over, and for an index with no capsule: hide it then).
    anchor(i, out) {
      if (i < 0 || i >= capacity || shows[i] <= 0) return 0;
      out.copy(anchors[i]);
      return shows[i];
    },
    // The meshes (for costs and tests).
    meshes: { shell, ring, bubbles },
  };
}
