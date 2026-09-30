// Wounds: what the shots leave on the fish that are still swimming, and on the dead that
// float up. Where a shot went in there is a hole, torn wider the heavier the gun and the
// worse the fish is hurt: a dark core, a ragged rim of raw flesh, the skin round it smeared
// red and stripped of its scales' shine, and behind it a streak of blood drawn back along
// the flank by the water going past. A heavy round tears a bigger hole where it comes out
// on the far side. The laser's hole is a burnt pinhole with a black rim, the skin round it
// cooked pale, and no streak: it cauterises. A blade leaves a long gash across the body. The
// flamethrower chars the skin where the flame licked it -- a black crust, cracked open to
// the cooked flesh beneath, dull, with no shine left, the eye cooked milky -- and a fish it
// kills floats up charred; the arc thrower dulls the skin in patches and burns branching
// lines into it, as lightning does. The salmon shows its own hurt too, but little
// of it: a few small wounds that close again as it gets its strength back, so a healthy
// fish looks as it always did.
//
// Where the marks are kept: one uniform array for all fish, three vec4s a fish (a "slot"):
//   [0]  how badly it is hurt, how charred, how singed (0..1 each), how many holes
//   [1], [2]  eight holes, one number each: where along the body (8 bits), which way round
//        it (6 bits) and what made it (3 bits: WOUND; 0, none), whole numbers exact in a
//        float
// Slot 0 is the salmon's; the enemies take the others as they are first marked and give
// them back when they are gone. How a fish finds its slot: the enemies are drawn as
// instanced crowds of the base game's fish (anatomy.js), whose shader places each copy
// itself from its own matrix, and of that matrix it never uses the last number (the placed
// point's w is thrown away, and every direction it turns has w 0). A crowd copies all
// sixteen numbers of a fish whenever it packs its copies together or splits them near and
// far, so that number carries the slot: enemies.js writes it right after posing each fish
// (pack(): 1, as a pose leaves it, for none; 2 + slot for one), and the shader hands it on
// flat, not blended across the triangle. Nothing else reads the enemies' crowd matrices
// (their gear is placed by enemies.pose()). The salmon's own matrix is read for its gear and
// its muzzles, so its slot comes by a uniform instead.
//
// Everything is settled before the shaders are compiled: the crowds' skins are wrapped when
// combat is made, the salmon's too, and each new body the salmon grows into is wrapped the
// same way before its first picture (the same code, so the same compiled program). The
// wound work runs only for a fish that has marks; an unhurt one skips it.

import * as THREE from "three";
import { Fn, If, abs, atan, attribute, dFdx, dFdy, float, floor, length, max, mix, mod, property, select, smoothstep, texture, uniform, uniformArray, uv, varying, varyingProperty, vec2, vec3, vec4 } from "three/tsl";
import { MODEL_LENGTH } from "../../anatomy.js";
import { ownInstanceMatrix } from "../../render/instancing.js";

const TAU = Math.PI * 2;
// What made a hole (3 bits; 0 is no hole).
export const WOUND = { BURN: 1, BULLET: 2, HEAVY: 3, TORN: 4, SLASH: 5, SHRAPNEL: 6, BITE: 7 };
// How wide each is (model units: the model is 0.79 long), before the hurt widens it. The
// guns are far too big for the fish, and so are their holes.
const RADIUS = [0, 0.009, 0.015, 0.02, 0.028, 0.026, 0.018, 0.022];
// The body proper, where a hole may sit: from the root of the tail to just behind the snout.
const X0 = -0.3,
  X1 = 0.31;
const HOLES = 8;
// Fish that can carry marks at once (the salmon and the enemies).
const SLOTS = 96;
const UP = new THREE.Vector3(0, 1, 0);

// 1 at `from`, 0 at `to` (from < to), smooth in between.
const fade = (x, from, to) => smoothstep(from, to, x).oneMinus();

// ---- The skin's own noise: three patterns in one small tileable texture, made once. Red and
// green: soft fractal noise (the ragged edge of a wound, where the char lies); blue: how far
// to the nearest crack between plates of uneven size and shape (a burnt crust split open).
let noiseTexture = null;
export function woundNoise(size = 128) {
  if (noiseTexture) return noiseTexture;
  let seed = 90127;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lattice = (n) => Float32Array.from({ length: n * n }, next);
  const smooth = (t) => t * t * (3 - 2 * t);
  const fbm = (octaves) => (u, v) => {
    let sum = 0;
    for (const { n, w, values } of octaves) {
      const fx = u * n,
        fy = v * n;
      const ix = Math.floor(fx),
        iy = Math.floor(fy);
      const tx = smooth(fx - ix),
        ty = smooth(fy - iy);
      const at = (i, j) => values[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
      sum += w * ((at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty);
    }
    return sum;
  };
  const octaves = (ns) => ns.map((n, i) => ({ n, w: [0.5, 0.27, 0.15, 0.08][i], values: lattice(n) }));
  const soft = fbm(octaves([4, 9, 17, 33]));
  const other = fbm(octaves([5, 11, 21, 41]));
  // The plates of the crust: jittered points on an 11 x 11 grid (wrapped round), looked up
  // through a warp so the plates are uneven and their edges wander.
  const cells = 11;
  const points = Array.from({ length: cells * cells }, () => [next(), next()]);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size + (other(x / size, y / size) - 0.5) * 0.12,
        v = y / size + (soft(y / size + 0.31, x / size + 0.77) - 0.5) * 0.12;
      let f1 = Infinity,
        f2 = Infinity;
      const cx = Math.floor(u * cells),
        cy = Math.floor(v * cells);
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i,
            gy = cy + j;
          const p = points[(((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)];
          const d = Math.hypot((gx + p[0]) / cells - u, (gy + p[1]) / cells - v) * cells;
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      const o = (y * size + x) * 4;
      data[o] = Math.round(Math.min(1, Math.max(0, soft(u, v))) * 255);
      data[o + 1] = Math.round(Math.min(1, Math.max(0, other(u, v))) * 255);
      data[o + 2] = Math.round(Math.min(1, (f2 - f1) * 2.2) * 255);
      data[o + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  noiseTexture = texture;
  return texture;
}

// ---- The arc's burns, made once: the current runs over wet skin in branching paths, like a
// fern or a river seen from the air (the figures lightning leaves on skin), not in closed
// loops. A few points in the tile each send out main branches that wander, fork into
// thinner twigs and taper out; red: the burnt line itself, green: the skin cooked round it.
// Drawn wrapped round, so the tile repeats without a seam.
let arcTexture = null;
export function arcBurns(size = 256) {
  if (arcTexture) return arcTexture;
  let seed = 51749;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const line = new Float32Array(size * size),
    halo = new Float32Array(size * size);
  // A soft disc of radius r (texels) at (x, y), kept as the most of any there.
  function stamp(field, x, y, r, strength) {
    const reach = Math.ceil(r + 1);
    const fx = x - Math.floor(x),
      fy = y - Math.floor(y);
    for (let j = -reach; j <= reach; j++)
      for (let i = -reach; i <= reach; i++) {
        const d = Math.hypot(i - fx, j - fy);
        const v = strength * Math.min(1, Math.max(0, r + 0.5 - d));
        if (v <= 0) continue;
        const k = ((((Math.floor(y) + j) % size) + size) % size) * size + ((((Math.floor(x) + i) % size) + size) % size);
        if (v > field[k]) field[k] = v;
      }
  }
  function branch(x, y, angle, length, width, depth) {
    for (let s = 0; s < length; s++) {
      const w = width * (1 - (0.7 * s) / length);
      stamp(line, x, y, w * 0.5, 1);
      stamp(halo, x, y, w * 2.2 + 2, 0.55 + 0.45 * (1 - s / length));
      angle += (next() - 0.5) * 0.7;
      x += Math.cos(angle);
      y += Math.sin(angle);
      // Forks: thinner, off to one side, shorter the deeper they are.
      if (depth < 4 && next() < 0.07) branch(x, y, angle + (next() < 0.5 ? -1 : 1) * (0.35 + 0.6 * next()), (length - s) * (0.45 + 0.3 * next()), w * 0.62, depth + 1);
    }
  }
  for (let n = 0; n < 5; n++) {
    const x = next() * size,
      y = next() * size;
    const arms = 3 + Math.floor(next() * 3);
    for (let a = 0; a < arms; a++) branch(x, y, next() * Math.PI * 2, 45 + 50 * next(), 2.4 + 1.2 * next(), 0);
  }
  const data = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    data[k * 4] = Math.round(line[k] * 255);
    data[k * 4 + 1] = Math.round(halo[k] * 255);
    data[k * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  arcTexture = texture;
  return texture;
}

// ---- The shader: the marks laid over a fish's skin. `slot` is a float node, the fish's
// slot in `data` (below 0: no marks); `scale`, how big its wounds are drawn (the salmon's are
// kept small).
function markSkin(material, slot, data, { scale = 1 } = {}) {
  const base = material.colorNode;
  const map = woundNoise();
  const arcs = arcBurns();
  // What the base shader works out and its lighting reads (anatomy.js): shared by name.
  const vSkinPoint = varyingProperty("vec3", "vSkinPoint");
  const gMetal = property("float", "fishMetal");
  const gRough = property("float", "fishRough");
  const gSilver = property("float", "fishSilver");
  const gEnv = property("float", "fishEnv");
  const gCoat = property("float", "fishCoat");
  const gCoatEnv = property("float", "fishCoatEnv");
  const gThrough = property("vec3", "fishThrough");
  const fishUV = uv();
  // (Which part of the fish: 7 is the eye.)
  const part = attribute("aPart", "vec2").x;
  material.colorNode = Fn(() => {
    const skin = vec3(0).toVar();
    skin.assign(base);
    const index = float(0).toVar();
    index.assign(slot);
    // The noise's coordinates on the skin (along the fish, round it) and how fast they
    // change across the pixel, taken here: inside the branch below a derivative would be
    // undefined, and the texture is read there with these instead.
    const at = vec2(0).toVar();
    at.assign(fishUV.mul(vec2(3, 1)));
    const ddx = vec2(0).toVar(),
      ddy = vec2(0).toVar();
    ddx.assign(dFdx(at));
    ddy.assign(dFdy(at));
    If(index.greaterThan(-0.5), () => {
      const first = index.mul(3).toInt();
      // (Everything the holes and the burns share is worked out here, into variables of
      // its own: each hole is looked at only if the fish has that many, and an expression
      // first met inside one of those branches would be worked out there alone.)
      const state = vec4(0).toVar(),
        holesA = vec4(0).toVar(),
        holesB = vec4(0).toVar();
      state.assign(data.element(first));
      holesA.assign(data.element(first.add(1)));
      holesB.assign(data.element(first.add(2)));
      const hurt = state.x,
        burnt = state.y,
        singed = state.z,
        count = state.w;
      const p = vec3(0).toVar();
      p.assign(vSkinPoint);
      // Round the body: the angle from the back (0) over the right flank (a quarter turn)
      // to the belly, and how far out from the spine this point is.
      const rho = float(0).toVar(),
        theta = float(0).toVar();
      rho.assign(max(length(p.yz), 1e-4));
      theta.assign(atan(p.z, p.y));
      const near = vec4(0).toVar(),
        fine = vec4(0).toVar(),
        wide = vec4(0).toVar(),
        arc = vec4(0).toVar();
      near.assign(texture(map, at).grad(ddx, ddy));
      // (Finer, for the torn edges: a few ragged lobes round each hole, and where its rim
      // shows raw flesh and where clotted blood.)
      fine.assign(texture(map, at.mul(4.3).add(vec2(0.21, 0.63))).grad(ddx.mul(4.3), ddy.mul(4.3)));
      wide.assign(texture(map, at.mul(0.3).add(vec2(0.37, 0.11))).grad(ddx.mul(0.3), ddy.mul(0.3)));
      arc.assign(texture(arcs, at.mul(0.9).add(vec2(0.13, 0.58))).grad(ddx.mul(0.9), ddy.mul(0.9)));
      const ragged = float(0).toVar(),
        tufts = float(0).toVar();
      ragged.assign(fine.r.sub(0.5).mul(3.2).clamp(-1, 1));
      tufts.assign(smoothstep(0.46, 0.58, near.g.mul(0.65).add(fine.g.mul(0.35))));
      // (No wound on the eye itself: it only clouds over when the fish is burnt.)
      const skinOnly = float(0).toVar();
      skinOnly.assign(select(part.sub(7).abs().lessThan(0.5), float(0), float(1)));
      const eye = skinOnly.oneMinus();

      // The holes, each one's parts kept as the most of any hole there.
      const cavity = float(0).toVar(),
        flesh = float(0).toVar(),
        clot = float(0).toVar(),
        crust = float(0).toVar(),
        smear = float(0).toVar(),
        cooked = float(0).toVar(),
        streak = float(0).toVar();
      const grow = float(0).toVar();
      grow.assign(hurt.mul(0.5).add(0.8).mul(scale));
      const hole = (code) => {
        const kind = mod(code, 8);
        const turn = mod(floor(code.div(8)), 64);
        const x = float(X0).add(floor(code.div(512)).mul((X1 - X0) / 255));
        const angle = turn.mul(TAU / 64).sub(Math.PI);
        let r = float(RADIUS[7]);
        for (let i = 6; i >= 0; i--) r = select(kind.lessThan(i + 0.5), float(RADIUS[i]), r);
        r = r.mul(grow);
        const isBurn = select(kind.sub(WOUND.BURN).abs().lessThan(0.5), float(1), float(0));
        const isSlash = select(kind.sub(WOUND.SLASH).abs().lessThan(0.5), float(1), float(0));
        const dx = p.x.sub(x);
        const ds = mod(theta.sub(angle).add(Math.PI), TAU).sub(Math.PI).mul(rho);
        // A slash is a long gash round the body, thin along it.
        const sx = mix(float(1), float(0.3), isSlash),
          sy = mix(float(1), float(2.6), isSlash);
        const d = length(vec2(dx.div(sx), ds.div(sy))).div(r);
        // The edge torn ragged: the dark cavity, then the torn lips of the wound -- raw flesh
        // in tufts, clotted blood between -- or, for the laser, a black crust.
        const torn = d.mul(ragged.mul(0.45).add(1));
        cavity.assign(max(cavity, fade(torn, 0.3, 0.46).mul(skinOnly)));
        const lips = smoothstep(0.22, 0.4, torn).mul(fade(torn, 0.75, 1));
        const open = isBurn.oneMinus().mul(skinOnly);
        flesh.assign(max(flesh, lips.mul(tufts).mul(open)));
        clot.assign(max(clot, lips.mul(tufts.oneMinus()).mul(open)));
        crust.assign(max(crust, lips.mul(isBurn).mul(skinOnly)));
        // Blood smeared over the skin round it, the most behind it, broken up.
        const behind = length(vec2(dx.add(r.mul(0.7)).div(r.mul(2)), ds.div(r.mul(sy).mul(1.2))));
        smear.assign(max(smear, fade(behind.mul(near.r.sub(0.5).mul(1.2).add(1)), 0.5, 1).mul(smoothstep(0.65, 1, torn)).mul(open)));
        cooked.assign(max(cooked, fade(torn, 1.1, 2.3).mul(smoothstep(0.55, 0.9, torn)).mul(isBurn).mul(skinOnly)));
        // And a streak the water draws back toward the tail, longer the worse the fish is
        // hurt, narrowing and running out ragged.
        const reach = r.mul(hurt.mul(5).add(2.5));
        const back = dx.negate().div(reach);
        const width = r.mul(back.clamp(0, 1).mul(-0.35).add(0.62)).mul(sy);
        const trail = smoothstep(0.05, 0.3, back)
          .mul(fade(back, near.g.mul(0.6).add(0.3), 1))
          .mul(fade(abs(ds.add(fine.b.sub(0.5).mul(r))).div(width), 0.45, 1));
        streak.assign(max(streak, trail.mul(open)));
      };
      [holesA.x, holesA.y, holesA.z, holesA.w, holesB.x, holesB.y, holesB.z, holesB.w].forEach((code, i) => {
        If(count.greaterThan(i + 0.5), () => {
          hole(code);
        });
      });

      // Round a wound the skin is smeared with blood and has lost its shine; behind it runs
      // the streak; in it the raw flesh and the clots, and in the middle the dark of the hole
      // itself. Round a laser's pinhole the skin is cooked pale, its rim black. The flesh is
      // a deep wet red, lighter only in soft patches: torn muscle, not a pale net (a mottle
      // of light and dark cells read as a skin disease, not as a wound).
      const meat = mix(vec3(0.19, 0.018, 0.014), vec3(0.4, 0.06, 0.045), smoothstep(0.35, 0.7, fine.r));
      skin.assign(mix(skin, skin.mul(vec3(0.5, 0.26, 0.24)).add(vec3(0.05, 0.004, 0.003)), smear.mul(0.75)));
      skin.assign(mix(skin, vec3(0.2, 0.014, 0.01), streak.mul(0.75)));
      skin.assign(mix(skin, skin.mul(0.45).add(vec3(0.22, 0.2, 0.17)), cooked.mul(0.7)));
      skin.assign(mix(skin, vec3(0.1, 0.009, 0.007), clot));
      skin.assign(mix(skin, meat, flesh));
      skin.assign(mix(skin, vec3(0.025, 0.016, 0.011), crust));
      // (The hole goes dark through a rim of dark red: it has depth, it is not a black dot.)
      skin.assign(mix(skin, vec3(0.07, 0.006, 0.004), smoothstep(0.2, 0.9, cavity).mul(0.8)));
      skin.assign(mix(skin, vec3(0.012, 0.0015, 0.001), smoothstep(0.75, 1, cavity)));

      // Char: a black crust, patchy at first and over the whole fish when it has burnt a
      // while, blistered, dusted with grey ash, split into uneven plates with the cooked
      // flesh showing dull brown-red in the cracks (under water nothing glows; pale cracks
      // on black read as marble); the eye cooked milky.
      // (How much of the skin: a little at first, most of it after a few seconds in the
      // flame, all of it when the flame has killed it.)
      const reach = mix(float(0.78), float(0.08), burnt.pow(2.5));
      const charred = smoothstep(reach, reach.add(0.16), wide.r).mul(smoothstep(0, 0.08, burnt)).mul(skinOnly);
      const crack = fade(near.b, 0.05, 0.15).mul(smoothstep(0.3, 0.5, fine.r));
      const crustColor = mix(vec3(0.014, 0.012, 0.011), vec3(0.05, 0.043, 0.037), near.r.mul(2.2).sub(0.8).clamp(0, 1));
      const ash = smoothstep(0.55, 0.75, fine.g.mul(0.6).add(near.g.mul(0.4))).mul(0.55);
      // (Round the char the skin is browned and has lost its shine: the heat reached
      // further than the flame.)
      const browned = smoothstep(reach.sub(0.14), reach.add(0.02), wide.r).mul(smoothstep(0, 0.08, burnt)).mul(skinOnly);
      skin.assign(mix(skin, skin.mul(vec3(0.42, 0.32, 0.24)).add(vec3(0.02, 0.012, 0.006)), browned.mul(0.8)));
      skin.assign(mix(skin, crustColor, charred));
      skin.assign(mix(skin, vec3(0.13, 0.125, 0.12), ash.mul(charred)));
      skin.assign(mix(skin, vec3(0.2, 0.07, 0.035), crack.mul(charred).mul(0.85)));
      skin.assign(mix(skin, vec3(0.2, 0.19, 0.18), eye.mul(smoothstep(0.35, 0.8, burnt)).mul(0.75)));
      // Singe: where the arcs ran over the skin it is dulled in feathered patches, and across
      // them run the burns of the current itself (arcBurns): branching dark brown lines,
      // the skin cooked pale along them, broken where the noise says the current jumped.
      const scorched = smoothstep(singed.mul(-1.2).add(1.02), singed.mul(-1.2).add(1.18), wide.g).mul(smoothstep(0, 0.06, singed)).mul(skinOnly);
      const broken = smoothstep(0.3, 0.45, fine.g);
      const burn = arc.r.mul(broken).mul(scorched);
      const halo = arc.g.mul(broken.mul(0.5).add(0.5)).mul(scorched);
      skin.assign(mix(skin, skin.mul(vec3(0.7, 0.62, 0.55)).add(vec3(0.02, 0.015, 0.01)), scorched.mul(0.6)));
      skin.assign(mix(skin, skin.mul(0.45).add(vec3(0.17, 0.14, 0.11)), halo.mul(0.6)));
      skin.assign(mix(skin, vec3(0.035, 0.018, 0.01), burn.mul(0.92)));

      // What that does to the light: no scales' mirror or colour film where the skin is torn
      // or burnt; wet and glossy where there is blood; dry and dull where there is crust.
      // A charred body passes no light: the warm glow through the thin belly and the gills
      // (the base fish's) goes with it.
      const opened = max(max(flesh, clot), max(cavity, crust));
      const stripped = max(opened, max(smear.mul(0.7), max(max(charred, browned.mul(0.7)), max(cooked.mul(0.6), max(scorched.mul(0.4), halo)))));
      gMetal.assign(gMetal.mul(stripped.oneMinus()));
      gSilver.assign(gSilver.mul(stripped.oneMinus()));
      gEnv.assign(gEnv.mul(stripped.mul(-0.75).add(1)));
      gRough.assign(mix(gRough, float(0.18), max(max(cavity, clot), max(flesh.mul(0.7), max(streak, smear).mul(0.5)))));
      gRough.assign(mix(gRough, float(0.85), max(charred, crust)));
      gCoat.assign(gCoat.mul(charred.oneMinus()));
      gCoatEnv.assign(gCoatEnv.mul(charred.mul(-0.8).add(1)));
      gThrough.assign(gThrough.mul(max(charred, burn).oneMinus()));
    });
    return skin;
  })();
  material.needsUpdate = true;
}

// A far fish (a few dozen pixels) shows only the char: a burnt one is dark from afar too.
function markFar(material, slot, data) {
  const base = material.colorNode;
  const metal = material.metalnessNode;
  const burnt = select(slot.greaterThan(-0.5), data.element(slot.max(0).mul(3).toInt()).y, float(0));
  const dark = smoothstep(0, 0.9, burnt).mul(0.85);
  material.colorNode = mix(base, vec3(0.03, 0.025, 0.022), dark);
  material.metalnessNode = metal.mul(dark.oneMinus());
  material.needsUpdate = true;
}

// A crowd's slot, from the last number of each copy's own matrix, read in the vertex stage
// and handed on flat (1 as posed: none, -1 here; 2 + slot for a marked fish).
function slotOf(mesh) {
  const matrix = ownInstanceMatrix(mesh);
  return varying(vec4(0, 0, 0, 1).mul(matrix).w.sub(2)).setInterpolation("flat", "either");
}

// ---- The marks themselves, kept per fish: `marks` = { slot, holes (codes), n (holes made so
// far), char, singe } (0..1 each).
export function createWounds() {
  const data = Array.from({ length: SLOTS * 3 }, () => new THREE.Vector4());
  const dataNode = uniformArray(data, "vec4");
  // The slots given out (their marks, by slot), and those free.
  const owners = new Array(SLOTS).fill(null);
  const seen = new Uint32Array(SLOTS);
  const free = [];
  for (let i = SLOTS - 1; i >= 1; i--) free.push(i);
  let stamp = 1;
  // The salmon's (the local player's) marks: slot 0, told to its skin by a uniform.
  const salmonMarks = { slot: 0, holes: new Array(HOLES).fill(0), n: 0, char: 0, singe: 0, fresh: false };
  const salmonSlot = uniform(-1);
  const wrapped = new WeakSet();
  const axisY = new THREE.Vector3(),
    axisZ = new THREE.Vector3(),
    radial = new THREE.Vector3(),
    offset = new THREE.Vector3();

  function marksOf(e) {
    if (e.kind === "salmon") return salmonMarks;
    if (e.marks) return e.marks;
    // (With every slot in use, the fish is marked but its marks are not drawn.)
    const slot = free.length ? free.pop() : -1;
    e.marks = { slot, holes: new Array(HOLES).fill(0), n: 0, char: 0, singe: 0 };
    if (slot > 0) {
      owners[slot] = e.marks;
      seen[slot] = stamp;
    }
    return e.marks;
  }

  // A hole of `kind` in `e` where a shot at `point` flying along `dir` went in (or, with
  // `exit`, came out on the far side). Its place on the model: how far along the body, and
  // the way round it the shot came from (the fish's roll taken out).
  function hole(e, point, dir, kind, { exit = false, jitter = 0, random = Math.random } = {}) {
    const marks = marksOf(e);
    const h = e.heading;
    const k = e.size;
    if (!h || !(k > 0)) return;
    const s = MODEL_LENGTH / k;
    offset.set(point.x - e.position.x, point.y - e.position.y, point.z - e.position.z);
    let x = offset.dot(h) * s + (exit ? (dir.x * h.x + dir.y * h.y + dir.z * h.z) * 0.06 : 0) + (random() - 0.5) * jitter;
    x = Math.min(X1, Math.max(X0, x));
    // Where on the round it came from: against the shot, across the body, and toward where
    // it struck (a shot along the body goes in on the side it grazed).
    radial.set(-dir.x, -dir.y, -dir.z);
    if (exit) radial.negate();
    radial.addScaledVector(h, -radial.dot(h));
    offset.addScaledVector(h, -offset.dot(h)).multiplyScalar((exit ? -2 : 2) / k);
    radial.add(offset);
    axisZ.crossVectors(h, UP);
    if (axisZ.lengthSq() < 1e-6) axisZ.set(0, 0, 1);
    axisZ.normalize();
    axisY.crossVectors(axisZ, h).normalize();
    const wy = radial.dot(axisY),
      wz = radial.dot(axisZ);
    const roll = (e.rolled ?? 0) + (e.bank && !e.dead ? e.bank : 0);
    const my = wy * Math.cos(roll) + wz * Math.sin(roll),
      mz = -wy * Math.sin(roll) + wz * Math.cos(roll);
    const angle = Math.atan2(mz, my) + (random() - 0.5) * jitter * 10;
    const turn = ((Math.round(((angle + Math.PI) / TAU) * 64) % 64) + 64) % 64;
    const xq = Math.max(1, Math.min(255, Math.round(((x - X0) / (X1 - X0)) * 255)));
    const code = xq * 512 + turn * 8 + kind;
    // Room for eight. After that a new hit tears open the nearest wound further (a bullet
    // hole becomes a heavy one, that a torn one) rather than one disappearing.
    if (marks.n < HOLES) {
      marks.holes[marks.n++] = code;
      return;
    }
    let best = 0,
      nearest = Infinity;
    for (let i = 0; i < HOLES; i++) {
      const c = marks.holes[i];
      const dx = ((Math.floor(c / 512) - xq) / 255) * (X1 - X0);
      let dt = Math.abs(((c >> 3) & 63) - turn);
      dt = (Math.min(dt, 64 - dt) / 64) * TAU * 0.05;
      const d = dx * dx + dt * dt;
      if (d < nearest) {
        nearest = d;
        best = i;
      }
    }
    const old = marks.holes[best];
    const was = old & 7;
    const grown = was === WOUND.BURN || was === WOUND.SLASH ? was : Math.min(WOUND.TORN, Math.max(was, kind) + 1);
    marks.holes[best] = old - was + grown;
  }

  // What a hit leaves on the skin, by what made it (weapons.js hands `info`: its mode, the
  // pellets of a shell, a blast).
  function hit(e, point, dir, weapon, info, random) {
    if (!e || !point || !dir) return;
    const marks = marksOf(e);
    if (e.kind === "salmon") marks.fresh = true;
    const mode = info?.mode;
    // (A fish still swimming keeps some patches of its own skin between the char: charred
    // all over is how the flame leaves the ones it kills.)
    if (mode === "flame") {
      marks.char = Math.min(0.8, marks.char + (info.burning ? 0.07 : 0.11));
      return;
    }
    if (mode === "arc") {
      marks.singe = Math.min(1, marks.singe + 0.2);
      return;
    }
    if (info?.blast) {
      // Shrapnel and the shock: torn holes on the side that faced the blast.
      hole(e, point, dir, WOUND.SHRAPNEL, { jitter: 0.1, random });
      if ((info.power ?? 0) > 0.5) hole(e, point, dir, WOUND.SHRAPNEL, { jitter: 0.16, random });
      return;
    }
    if (mode === "bolt" || mode === "beam" || weapon === "piu" || weapon === "strahl") {
      hole(e, point, dir, WOUND.BURN, { jitter: 0.02, random });
      return;
    }
    if (mode === "blade" || mode === "whirl" || mode === "saw" || weapon === "katana" || weapon === "nodachi" || weapon === "saege") {
      hole(e, point, dir, WOUND.SLASH, { random });
      return;
    }
    if (mode === "pellets") {
      const n = Math.min(3, Math.max(1, Math.round((info.pellets ?? 3) / 3)));
      for (let i = 0; i < n; i++) hole(e, point, dir, WOUND.BULLET, { jitter: 0.16, random });
      return;
    }
    if (mode === "charge" || mode === "fuse" || mode === "harpoon" || weapon === "panzerbuechse" || weapon === "kanone" || weapon === "harpune") {
      hole(e, point, dir, WOUND.HEAVY, { random });
      hole(e, point, dir, WOUND.TORN, { exit: true, random });
      return;
    }
    hole(e, point, dir, WOUND.BULLET, { jitter: 0.03, random });
  }

  // The killing blow: fire leaves the body charred through, the arc its lines all over.
  function kill(e, dir, weapon, info) {
    if (!e || e.burst) return;
    if (info?.mode === "flame" || weapon === "flammen") marksOf(e).char = Math.max(marksOf(e).char, 0.92);
    if (info?.mode === "arc" || weapon === "blitz") marksOf(e).singe = Math.max(marksOf(e).singe, 0.75);
  }

  // A fish's marks into its slot of the array.
  function write(marks, hurt) {
    const o = marks.slot * 3;
    const h = marks.holes;
    data[o].set(hurt, marks.char, marks.singe, marks.n);
    data[o + 1].set(h[0], h[1], h[2], h[3]);
    data[o + 2].set(h[4], h[5], h[6], h[7]);
  }
  // enemies.js, right after posing `e` into its crowd's matrices at `offset`: its slot into
  // the matrix's last number, and its marks into the slot.
  function pack(e, matrices, offset) {
    const marks = e.marks;
    if (!marks || marks.slot <= 0) return;
    matrices[offset + 15] = 2 + marks.slot;
    seen[marks.slot] = stamp;
    write(marks, e.dead ? 1 : e.maxHp > 0 ? 1 - Math.max(0, e.hp) / e.maxHp : 0);
  }
  // Each step, after the enemies were drawn: the slots of those not drawn any more (gone
  // from the river) are given back.
  function sweep() {
    for (let i = 1; i < SLOTS; i++)
      if (owners[i] && seen[i] !== stamp) {
        owners[i].slot = -1;
        owners[i] = null;
        free.push(i);
      }
    stamp++;
  }

  // The crowds' skins (near and far), wrapped once, before the shaders are compiled.
  function wearCrowds(crowds) {
    for (const crowd of Object.values(crowds)) {
      if (!crowd?.materials?.skin || wrapped.has(crowd.materials.skin)) continue;
      wrapped.add(crowd.materials.skin);
      markSkin(crowd.materials.skin, slotOf(crowd.body), dataNode);
      const far = crowd.far;
      if (far?.material && !wrapped.has(far.material)) {
        wrapped.add(far.material);
        markFar(far.material, slotOf(far), dataNode);
      }
    }
  }
  // The salmon's skin (each body it grows into, before its first picture).
  function wearSalmon(salmon) {
    const skin = salmon?.materials?.skin;
    if (!skin || wrapped.has(skin)) return;
    wrapped.add(skin);
    markSkin(skin, salmonSlot, dataNode, { scale: 0.8 });
  }

  // Each step, the salmon's: its wounds shown as much as its strength is down (they widen
  // as it weakens and close as it recovers), and gone once it is whole again or another
  // fish of the brood has taken over.
  let lastEnergy = 1;
  // (Scratch for a bite: where, from where, and the salmon as hole() reads a fish.)
  const point = new THREE.Vector3(),
    from = new THREE.Vector3();
  const bitten = { kind: "salmon", position: null, heading: null, size: 1 };
  function stepSalmon(salmon, fish, random) {
    wearSalmon(salmon);
    const energy = fish?.energy ?? 1;
    // (A sudden gain is a new fish taking over, not healing.)
    if (energy > 0.97 || energy - lastEnergy > 0.25) clearSalmon();
    // Strength lost to a blow no shot made (a bite, a blade): a bite on the flank where it
    // came, if nothing else marked it this step.
    if (lastEnergy - energy > 0.035 && !salmonMarks.fresh && fish?.heading) {
      bitten.position = fish.position;
      bitten.heading = fish.heading;
      bitten.size = fish.length;
      point.copy(fish.heading).multiplyScalar((random() - 0.3) * 0.5 * fish.length).add(fish.position);
      from.set(random() - 0.5, (random() - 0.5) * 0.6, random() - 0.5).normalize();
      hole(bitten, point, from, WOUND.BITE, { random });
    }
    salmonMarks.fresh = false;
    lastEnergy = energy;
    const marked = salmonMarks.n > 0 || salmonMarks.char > 0 || salmonMarks.singe > 0;
    write(salmonMarks, Math.min(1, Math.max(0, (1 - energy) * 1.3)));
    salmonSlot.value = marked ? 0 : -1;
  }
  function clearSalmon() {
    salmonMarks.holes.fill(0);
    salmonMarks.n = 0;
    salmonMarks.char = salmonMarks.singe = 0;
  }

  // Where hole `i` of `e` is in the world now (into `out`, any object with x, y, z): along
  // its heading, out from its spine the way the hole faces, with the fish's roll.
  function holeAt(e, i, out) {
    const c = e.marks?.holes[i] ?? 0;
    if (!c) return null;
    const k = e.size;
    const x = X0 + (Math.floor(c / 512) / 255) * (X1 - X0);
    const angle = ((c >> 3) & 63) * (TAU / 64) - Math.PI + (e.rolled ?? 0);
    const h = e.heading;
    axisZ.crossVectors(h, UP);
    if (axisZ.lengthSq() < 1e-6) axisZ.set(0, 0, 1);
    axisZ.normalize();
    axisY.crossVectors(axisZ, h).normalize();
    const along = (x * k) / MODEL_LENGTH,
      up = Math.cos(angle) * (k / MODEL_LENGTH) * 0.06,
      side = Math.sin(angle) * (k / MODEL_LENGTH) * 0.06;
    out.x = e.position.x + h.x * along + axisY.x * up + axisZ.x * side;
    out.y = e.position.y + h.y * along + axisY.y * up + axisZ.y * side;
    out.z = e.position.z + h.z * along + axisY.z * up + axisZ.z * side;
    return out;
  }

  return {
    hit,
    kill,
    pack,
    sweep,
    wearCrowds,
    wearSalmon,
    stepSalmon,
    holeAt,
    // The salmon's marks (for its bleeding and the tests).
    get salmon() {
      return salmonMarks;
    },
    // How many slots are in use (for the tests).
    get used() {
      return SLOTS - 1 - free.length;
    },
  };
}
