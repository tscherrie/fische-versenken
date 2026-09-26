// The weapon capsules along the river: a silver bubble hanging in the water with the weapon
// turning slowly inside it, a ring round it in the colour of the stage the weapon belongs
// to, and a column of bubbles rising from it to the surface in little trailing clusters, dark
// edged so they show against the bright surface too -- which is what gives away one tucked
// into the lee of a stone. Swum into, it pops: the shell swells a little, flashes at its rim
// and is gone within a tenth of a second, the ring flies apart, a cloud of bubbles is flung
// out and drifts up. The ring rides a little above the bubble's middle for a weapon worn on
// the back and a little below it for one worn at the belly, so the place shows before the
// capsule is reached.
//
// Items: { x, y, z, place: "back"|"belly", weapon, state: "idle"|"taken", age, stage?, size?,
// takenAge? }. `size` is the capsule's whole size, across (as pickups.js keeps it for how near
// a fish must come): the bubble's radius is half of it. Without it the stage sets the size.
// `stage` (an index or an id of salmon.js STAGES) picks the ring's colour; without it, the
// weapon's own stage. `takenAge`, if kept, is the time since it was taken; otherwise the burst
// is timed from the first frame the item is drawn taken.
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
import { Fn, PI, abs, atan, attribute, cameraPosition, cameraViewMatrix, clamp, cos, dot, float, fract, length, max, mix, modelWorldMatrix, normalGeometry, normalize, normalView, positionGeometry, positionViewDirection, positionWorld, pow, reflect, round, sin, smoothstep, step, uniform, uv, varyingProperty, vec2, vec3, vec4 } from "three/tsl";
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
// drawn and its anchor shows nothing. (Within the 0.6 s pickups.js keeps a taken item.) The
// shell itself is gone in the first tenth of a second: it pops, it does not fade.
export const BURST_SECONDS = 0.55;
const POP = 0.1 / BURST_SECONDS;
// A capsule grows in over this long after it appears.
const GROW_SECONDS = 0.6;
// The bubble column: how fast its bubbles rise (a few millimetres across, two decimetres a
// second), and the length of water one bubble's loop covers before it starts again at the
// shell. Both fixed, so the bubbles' places follow the clock alone, however the column's
// height or the capsule's place changes: where the surface comes lower, the loop is cut off
// there.
const RISE = 2;
const LOOP = 5;
// The clock runs round every hour (the draw's time modulo 3600): rates in whole turns an hour,
// so nothing jumps when it does.
const HOUR = 3600;
const hourly = (turnsPerSecond) => round(turnsPerSecond.mul(HOUR)).div(HOUR);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

// A stage's index by its id or its phase's name (the first stage of that phase).
const STAGE_INDEX = {};
STAGES.forEach((st, i) => {
  STAGE_INDEX[st.phase] ??= i;
  STAGE_INDEX[st.id] = i;
});

// A capsule's stage: its own `stage` (an index or an id) if the item carries one, else its
// weapon's.
function stageOf(item) {
  const own = item.stage ?? WEAPONS[item.weapon]?.stage ?? WEAPON_STAGES[item.weapon] ?? "fry";
  const index = typeof own === "number" ? own : (STAGE_INDEX[own] ?? 1);
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, index))];
}

export function createCapsules(scene, { capacity = 24, light = false } = {}) {
  const columnBubbles = light ? 24 : 45;
  const burstBubbles = light ? 20 : 40;
  const perCapsule = columnBubbles + burstBubbles;
  const clock = uniform(0);
  // The daylight on the bubbles (1 by day; falls.js and life.js get the same from the game).
  const daylight = uniform(1);

  // Per capsule, shared by the shell and the ring: (seed, burst 0..1, grow 0..1, radius) and
  // the stage colour (rgb, and the place: 1 back, -1 belly).
  const state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);

  // ---- The shell: a bubble of air, a band of quicksilver at its rim (the water's light turned
  // back whole at the glancing surface) and clear in the middle, where the weapon shows
  // through. It breathes in slow wobbles, as a trapped bubble does in the current. Taken, it
  // swells a little, flashes at the rim and is gone.
  const shellGeometry = new THREE.SphereGeometry(1, light ? 24 : 40, light ? 16 : 28);
  shellGeometry.setAttribute("capsule", state);
  const shell = new THREE.InstancedMesh(shellGeometry, undefined, capacity);
  const shellMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, transparent: true, depthWrite: false });
  {
    const matrix = ownInstanceMatrix(shell);
    const s = attribute("capsule", "vec4");
    const vNormal = varyingProperty("vec3", "vShellNormal");
    const vFade = varyingProperty("float", "vShellFade");
    const vFlash = varyingProperty("float", "vShellFlash");
    shellMaterial.positionNode = Fn(() => {
      const p = positionGeometry;
      const seed = s.x.mul(TAU);
      const t = clock;
      // Low modes of a wobbling drop: squashing and stretching across a few axes.
      const wobble = sin(t.mul(2.3).add(seed).add(p.y.mul(2.2)))
        .mul(0.03)
        .add(sin(t.mul(3.1).add(seed.mul(1.7)).add(p.x.mul(2.8))).mul(0.022))
        .add(sin(t.mul(1.7).add(seed.mul(2.3)).add(p.z.mul(2.5))).mul(0.018));
      const pop = s.y.div(POP).clamp(0, 1);
      const k = wobble.add(1).mul(smoothstep(0, 1, pop).mul(0.15).add(1)).mul(s.z);
      const world = modelWorldMatrix.mul(matrix);
      vNormal.assign(cameraViewMatrix.mul(world.mul(vec4(normalGeometry, 0))).xyz);
      vFade.assign(smoothstep(0.55, 1, pop).oneMinus().mul(s.z));
      vFlash.assign(sin(pop.mul(PI)));
      return matrix.mul(vec4(p.mul(k), 1)).xyz;
    })();
    shellMaterial.normalNode = normalize(vNormal);
    // A bubble in water mirrors almost nothing face on and everything toward its rim, where
    // the light inside it is turned back whole (total reflection): a narrow bright band of
    // quicksilver round a clear middle.
    const facing = abs(dot(normalize(vNormal), positionViewDirection));
    const fresnel = pow(facing.oneMinus(), 3.2);
    shellMaterial.opacityNode = mix(0.06, 1, fresnel).mul(vFade);
    shellMaterial.colorNode = vec3(0.95, 0.97, 1);
    // (And a thin neutral band right at the rim, where the mirror turns the bright surface
    // back: what makes it read as quicksilver rather than tinted glass.)
    const band = smoothstep(0.78, 0.97, facing.oneMinus());
    shellMaterial.emissiveNode = vec3(2.2, 2.3, 2.4).mul(fresnel).mul(vFlash).add(vec3(0.55, 0.58, 0.6).mul(band)).mul(daylight.mul(0.8).add(0.2));
    waterLit(shellMaterial, {
      mirror: 0,
      // What the rim mirrors: the water round it, bright toward the lit surface and the
      // window of sky overhead, dim toward the bed (as a fish's silver flank does).
      beforeIndirect: ({ radiance }) => {
        const reflectView = reflect(positionViewDirection.negate(), normalView);
        const reflectWorld = normalize(cameraViewMatrix.transpose().mul(vec4(reflectView, 0)).xyz);
        const surroundings = underwaterInscatter(reflectWorld).mul(3.2).add(fogNodes().color.mul(8).mul(smoothstep(0.45, 0.97, reflectWorld.y)));
        radiance.addAssign(surroundings);
      },
    });
  }
  shell.material = shellMaterial;
  shell.name = "Combat capsule shell";
  // After the opaque world and the weapon inside, before the effects.
  shell.renderOrder = 2;

  // ---- The ring: a band of lit metal in the stage colour, glowing, slowly turning on a
  // tilted axis; three brighter marks run round it so the turning shows. Taken, it flies
  // apart: widening and fading over the whole burst.
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
      const k = burst.oneMinus().pow(3).oneMinus().mul(1.1).add(1).mul(s.z);
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
  // (centre xyz, radius) and (seed, burst 0..1, grow, kind: 0-2 a column bubble and its place
  // in its cluster, -1 a burst bubble); position is there for the point count.
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
      kind = bub.w;
    const burstOne = step(kind, -0.5);
    const hash = (k) => fract(sin(seed.mul(k).add(k * 0.37)).mul(43758.5453));
    // The column: bubbles let go from the top of the shell in little clusters, each cluster at
    // its own speed, spiralling as they rise and a little larger the higher they get, up to
    // the surface; gone there. (A cluster's bubbles share its seed and trail one another.)
    const top = surfaceLevelAt(centre);
    const u = fract(clock.mul(hourly(hash(4.7).mul(0.6).add(0.7).mul(RISE / LOOP))).add(seed).sub(kind.mul(hash(11.3).mul(0.05).add(0.008))));
    const h = u.mul(LOOP);
    const spin = clock.mul(hourly(hash(6.1).mul(4 / TAU).add(5 / TAU))).add(hash(8.3)).mul(TAU).add(kind.mul(1.3));
    const swing = h.clamp(0, 1).mul(0.025).add(0.018);
    const rise = centre.add(
      vec3(
        sin(spin).mul(swing).add(hash(2.9).sub(0.5).mul(R).mul(0.3)),
        R.mul(0.92).add(h),
        cos(spin.mul(1.21)).mul(swing).add(hash(7.7).sub(0.5).mul(R).mul(0.3)),
      ),
    );
    const columnAlpha = smoothstep(0, 0.012, u)
      .mul(smoothstep(0.85, 1, u).oneMinus())
      .mul(smoothstep(top.sub(0.08), top, rise.y).oneMinus())
      .mul(burst.oneMinus())
      .mul(grow);
    // The burst: flung out all round from the shell (more upward), slowing, then drifting up.
    const dir = normalize(vec3(hash(12.9).sub(0.5), hash(78.2).sub(0.3), hash(37.7).sub(0.5)));
    const out = burst.oneMinus().pow(3).oneMinus();
    const flung = centre
      .add(dir.mul(R).mul(out.mul(hash(5.1).mul(0.9).add(0.3)).add(0.9)))
      .add(vec3(sin(burst.mul(9).add(hash(1.3).mul(TAU))).mul(R).mul(0.05), R.mul(burst).mul(1.2), 0));
    const burstAlpha = smoothstep(0, 0.02, burst).mul(smoothstep(0.6, 1, burst).oneMinus());
    bubbleMaterial.positionNode = mix(rise, flung, burstOne);
    const scale = clamp(R.mul(2), 0.6, 1.8);
    const size = mix(hash(3.3).mul(0.04).add(0.03).mul(u.mul(0.5).add(0.8)).mul(scale), R.mul(hash(9.1).mul(0.1).add(0.05)).mul(burst.mul(-0.3).add(1)), burstOne);
    // Never smaller than about four pixels, so the column still gives away a capsule hidden in
    // the lee of a stone from further off than the bubbles themselves would show.
    const seen = max(size, length(centre.sub(cameraPosition)).mul(0.007));
    bubbleMaterial.scaleNode = vec2(seen, seen);
    const alpha = mix(columnAlpha, burstAlpha, burstOne);
    // A bubble under water seen against the light: a dark edge (the light bent away at the
    // glancing rim), a bright ring inside it, a clear middle and a highlight up and to one
    // side. The dark edge is what keeps it visible against the bright surface.
    const q = uv().sub(0.5);
    const r = length(q);
    const edge = smoothstep(0.36, 0.44, r).mul(step(r, 0.5));
    const ringIn = smoothstep(0.26, 0.36, r).mul(smoothstep(0.36, 0.42, r).oneMinus());
    const body = smoothstep(0.1, 0.4, r).oneMinus();
    const glint = smoothstep(0, 0.12, length(q.sub(vec2(-0.1, 0.12)))).oneMinus();
    const near = smoothstep(0.1, 0.6, length(positionWorld.sub(cameraPosition)));
    const bright = vec3(1.6, 1.75, 1.8).mul(daylight);
    bubbleMaterial.colorNode = mix(bright, vec3(0.03, 0.045, 0.05), edge.mul(glint.oneMinus()));
    bubbleMaterial.opacityNode = edge.mul(0.7).add(ringIn.mul(0.75)).add(body.mul(0.18)).add(glint.mul(0.9)).clamp(0, 1).mul(alpha).mul(near).mul(step(r, 0.5));
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
  // When each taken item was first drawn taken, for items that do not keep their takenAge. (A
  // weak map: the item is the owner's, and goes when the owner drops it, whatever its index.)
  const takenAt = new WeakMap();

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
    // Every frame: the capsules to show (see the top of the file), and the game's clock in
    // seconds (it drives the wobble, the turning and the bubbles).
    draw(items, time) {
      clock.value = time % 3600;
      let n = 0;
      const count = Math.min(items.length, capacity);
      for (let i = 0; i < count; i++) {
        const item = items[i];
        shows[i] = 0;
        // How far into the burst.
        let burst = 0;
        if (item.state === "taken") {
          let since = item.takenAge;
          if (typeof since !== "number") {
            let at = takenAt.get(item);
            if (at === undefined) takenAt.set(item, (at = time));
            since = time - at;
          }
          burst = Math.max(0, since) / BURST_SECONDS;
        }
        if (burst >= 1) continue;
        const grow = item.state === "taken" ? 1 : smooth01((item.age ?? GROW_SECONDS) / GROW_SECONDS);
        const st = stageOf(item);
        const R = item.size > 0 ? item.size * 0.5 : Math.max(0.16, Math.min(2.6, 0.21 * (st.length[0] + st.length[1])));
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
          // Column bubbles in threes (a cluster shares its seed, and its bubbles trail one
          // another closely or loosely), then the burst's, each its own.
          const inColumn = b < columnBubbles;
          const cluster = inColumn ? Math.floor(b / 3) : b;
          bubble[o] = (seed * 7.31 + cluster * 0.618034) % 1;
          bubble[o + 1] = burst;
          bubble[o + 2] = grow;
          bubble[o + 3] = inColumn ? b % 3 : -1;
        }
        // The weapon's anchor: at the centre, turning slowly about the vertical, sized so a
        // model a unit long fits inside; it goes with the shell as it pops.
        quaternion.setFromAxisAngle(up, time * 0.9 + seed * TAU);
        anchors[i].compose(position, quaternion, scale.setScalar(R * 1.45 * grow));
        shows[i] = grow * (1 - smooth01(burst / POP));
        n++;
      }
      for (let i = count; i < capacity; i++) shows[i] = 0;
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
    // once the shell has popped, and for an index with no capsule: hide it then).
    anchor(i, out) {
      if (i < 0 || i >= capacity || shows[i] <= 0) return 0;
      out.copy(anchors[i]);
      return shows[i];
    },
    // The daylight on the bubbles, 0 (night) to 1, as the game gives falls.js and life.js.
    light(value) {
      daylight.value = value;
    },
    // The meshes (for costs and tests).
    meshes: { shell, ring, bubbles },
  };
}
