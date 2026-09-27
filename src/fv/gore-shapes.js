// What splatter is made of: the blood in the water (billowing clouds, one sorted sprite
// cloud), the small hard bits (flecks, loose scales, steam beads and embers: a second, cheap
// sprite cloud that is cut out instead of blended, so it needs no sorting and none of the
// clouds' noise reads) and the chunks of flesh that fly out of a fish that bursts (one
// instanced mesh, lit like everything else in the river). Only the looks live here; what
// moves them is gore.js.

import * as THREE from "three";
import { Fn, abs, attribute, cos, exp, float, instancedBufferAttribute, length, max, mix, positionGeometry, positionLocal, positionWorld, select, sin, smoothstep, texture, uniform, uv, vec2, vec3, vec4 } from "three/tsl";
import { perPoint, skyUniforms } from "../materials.js";
import { river, surfaceLevelAt, waterLit, waterTime } from "../render/water.js";
import { ditherThreshold } from "../render/dither.js";

// Sprite kinds (gore.js keeps them per sprite; the clouds go to one draw, the rest to the
// other).
export const CLOUD = 0;
export const FLECK = 1;
export const SCALE = 2;
export const STEAM = 3;
export const EMBER = 4;

// What a cloud or a fleck is made of: blood; smoke from a burnt wound; the yellow-green
// ichor of larvae and insects; the clear goo of a jellyfish; silt kicked up off the bed.
export const BLOOD = 0;
export const SMOKE = 1;
export const ICHOR = 2;
export const GOO = 3;
export const SILT = 4;

// Which way the camera's right and up point in the world (their heights), set each frame by
// gore.js: a cloud works out how high each of its pixels is from them, to fade out where it
// runs into the bed.
export const spriteBasis = { rightY: uniform(0), upY: uniform(1) };

// 1 at `from`, 0 at `to` (from < to), smooth in between.
const fade = (x, from, to) => smoothstep(from, to, x).oneMinus();

// Blood (and smoke, ichor, goo, silt) in water, per sprite (four vec4s per point, so one
// interleaved quad buffer and four instance buffers, well inside the eight a draw may have):
//   position  xyz, width in scene units
//   shade     opacity, seed, what it is made of, freshness (1 just spilt, 0 old and brown)
//   turn      rotation on the screen, stretch along that way and across it, (unused)
//   tone      the daylight that reaches it through the water above (rgb), the bed's height
export function createCloudMaterial(geometry) {
  const P = perPoint(geometry, "position");
  const S = perPoint(geometry, "shade");
  const T = perPoint(geometry, "turn");
  const L = perPoint(geometry, "tone");
  // Normal blending with the scene's fog on: blood darkens what is behind it instead of
  // glowing, and the water model hazes it with distance like everything else.
  const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, sizeAttenuation: true });
  material.positionNode = P.xyz;
  material.scaleNode = vec2(P.w.mul(T.y), P.w.mul(T.z));
  material.rotationNode = T.x;
  // The lumps come from the river's tileable fractal noise (the canopy's), a few texture
  // reads instead of a lot of arithmetic noise: clouds can fill much of the screen.
  const lumpMap = river.canopyMap.value;
  const shade = Fn(() => {
    const q = uv().sub(0.5).mul(2);
    const r = length(q);
    const opacity = S.x,
      seed = S.y,
      stuff = S.z,
      fresh = S.w;

    // The noise turns slowly round the puff's middle, each puff its own way, and is warped
    // by a second read, so a cloud of many puffs rolls and billows rather than slides. The
    // lumps push the edge in and out (the cauliflower outline of blood spreading in water),
    // but less and less toward the rim of the quad, which the cloud never reaches: no puff
    // may show the straight edge of its sprite.
    const turn = waterTime
      .mul(seed.mul(0.3).add(0.08))
      .mul(select(seed.greaterThan(0.5), float(1), float(-1)))
      .add(seed.mul(6.283));
    const ct = cos(turn),
      st = sin(turn);
    const spin = (v) => vec2(v.x.mul(ct).sub(v.y.mul(st)), v.x.mul(st).add(v.y.mul(ct)));
    const home = vec2(seed.mul(7.31), seed.mul(3.97));
    const w = spin(q);
    const warp = texture(lumpMap, w.mul(0.19).add(home.yx).add(vec2(waterTime.mul(0.011), 0))).r.sub(0.5);
    const big = texture(lumpMap, w.mul(0.16).add(home).add(warp.mul(0.3))).r.sub(0.5).mul(3.2);
    const fine = texture(lumpMap, w.mul(0.38).add(home.mul(1.7)).sub(warp.mul(0.5))).r.sub(0.5).mul(3.2);
    const lumps = big.mul(0.8).add(fine.mul(0.2)).clamp(-1, 1);
    const edge = r.sub(lumps.mul(0.45).mul(fade(r, 0.35, 1)));
    const density = fade(edge, 0.25, 0.95).mul(fade(r, 0.8, 1));
    // Lit from above, as if the cloud had a body: a lump whose top faces the light (where
    // the noise falls off going up) is brighter than one lying under more blood. "Up" on
    // the sprite turns with its rotation (clouds are stretched along their flight).
    const up = vec2(sin(T.x), cos(T.x));
    const above = texture(lumpMap, spin(q.add(up.mul(0.35))).mul(0.16).add(home).add(warp.mul(0.3))).r.sub(0.5).mul(3.2);
    const lit = big.sub(above).mul(1.6).add(q.dot(up).mul(0.35)).add(0.5).clamp(0, 1);
    // Thick blood swallows the light and looks nearly black-red; its thin fringes let the
    // water's light through and look a little redder. It turns from crimson to a rusty
    // brown as it gets old, and no two puffs are quite the same red. Smoke is a sooty grey,
    // ichor a sickly yellow-green, goo nearly clear, silt the grey-brown of the bed.
    const tint = seed.mul(0.4).add(0.8);
    const blood = mix(vec3(0.13, 0.032, 0.018), vec3(0.25, 0.008, 0.006), fresh);
    const smoke = mix(vec3(0.07, 0.066, 0.06), vec3(0.03, 0.028, 0.026), fresh);
    const ichor = mix(vec3(0.16, 0.17, 0.035), vec3(0.3, 0.36, 0.03), fresh);
    const goo = vec3(0.34, 0.42, 0.44);
    const silt = vec3(0.24, 0.22, 0.17);
    const albedo = select(stuff.lessThan(0.5), blood, select(stuff.lessThan(1.5), smoke, select(stuff.lessThan(2.5), ichor, select(stuff.lessThan(3.5), goo, silt)))).mul(tint);
    const color = albedo.mul(mix(float(1.2), float(0.34), density)).mul(lit.mul(1.1).add(0.3));
    // Where the bed runs through the sprite, its lower part fades out instead of being cut
    // off hard by the gravel. The height of each pixel is worked out in the world (from the
    // camera's own right and up), so a camera that looks down on a cloud still fades it
    // along the bed and not along a line across the picture.
    const cr = cos(T.x),
      sr = sin(T.x);
    const o = q.mul(vec2(T.y, T.z)).mul(P.w.mul(0.5));
    const height = P.y.add(spriteBasis.rightY.mul(o.x.mul(cr).sub(o.y.mul(sr)))).add(spriteBasis.upY.mul(o.x.mul(sr).add(o.y.mul(cr))));
    const onBed = smoothstep(L.w, L.w.add(P.w.mul(0.15)), height);
    // Goo is thin, silt only a haze.
    const thickness = select(stuff.lessThan(2.5), float(1), select(stuff.lessThan(3.5), float(0.45), float(0.6)));
    const alpha = density.mul(density.mul(0.3).add(0.7)).mul(onBed).mul(thickness).mul(opacity);
    return vec4(color.mul(L.rgb), alpha);
  })();
  material.colorNode = shade.rgb;
  material.opacityNode = shade.a;
  material.alphaTest = 0.003;
  return material;
}

// The small hard bits, per sprite (the same four vec4s):
//   position  xyz, width
//   shade     opacity, seed, kind (FLECK, SCALE, STEAM, EMBER), what a fleck is made of
//   turn      rotation, stretch along and across, where a scale's glint crosses its face
//   tone      daylight (rgb), how bright a scale's glint is just now (an ember: how hot)
// They are cut out (a share of the pixels dropped, a different share each frame, which the
// temporal resolve averages into soft edges) and write depth, so they are drawn with the
// solid things and the blood clouds in front of or behind them blend over them right.
export function createSpeckMaterial(geometry) {
  const P = perPoint(geometry, "position");
  const S = perPoint(geometry, "shade");
  const T = perPoint(geometry, "turn");
  const L = perPoint(geometry, "tone");
  const material = new THREE.SpriteNodeMaterial({ transparent: false, depthWrite: true, sizeAttenuation: true });
  material.positionNode = P.xyz;
  material.scaleNode = vec2(P.w.mul(T.y), P.w.mul(T.z));
  material.rotationNode = T.x;
  const shade = Fn(() => {
    const q = uv().sub(0.5).mul(2);
    const r = length(q);
    const opacity = S.x,
      seed = S.y,
      kind = S.z,
      stuff = S.w;

    // A fleck: a small drop drawn out along the way it flies, darker toward its tail.
    const drop = fade(r, 0.6, 1);
    const fleckTint = select(stuff.lessThan(0.5), vec3(0.075, 0.005, 0.004), select(stuff.lessThan(1.5), vec3(0.025, 0.022, 0.02), select(stuff.lessThan(2.5), vec3(0.26, 0.3, 0.03), vec3(0.3, 0.36, 0.38))));
    const fleckColor = fleckTint.mul(q.x.mul(0.35).add(1)).mul(L.rgb);

    // A scale: a thin, rounded shield (wider at its free end, like the scales of a salmon),
    // grey-silver with a faint rainbow sheen and a darker rim. A narrow band of light sweeps
    // across it as it turns, instead of the whole disc flashing like a bead.
    const shield = length(vec2(q.x, q.y.mul(1.35).add(q.x.mul(q.x).mul(0.25))));
    const flake = fade(shield, 0.88, 1);
    const rim = smoothstep(0.55, 0.95, shield);
    const hue = seed.mul(6.283).add(q.x.mul(2.2)).add(q.y.mul(1.4));
    const rainbow = vec3(sin(hue), sin(hue.add(2.09)), sin(hue.add(4.19))).mul(0.03);
    const sheen = smoothstep(-0.9, 0.9, q.x.mul(0.6).add(q.y.mul(0.8)));
    const across = q.x.mul(0.8).add(q.y.mul(0.6)).sub(T.w);
    const band = exp(across.mul(across).mul(-16));
    const scaleColor = vec3(0.16, 0.175, 0.19)
      .mul(sheen.mul(0.55).add(0.6))
      .mul(rim.mul(-0.45).add(1))
      .add(rainbow)
      .mul(L.rgb)
      .add(vec3(1, 0.97, 0.9).mul(band.mul(L.w)));
    const scaleAlpha = flake;

    // A steam bead where a laser boiled the water: a thin bright ring with a glint.
    const ring = smoothstep(0.55, 0.85, r).mul(fade(r, 0.85, 1));
    const spot = q.sub(vec2(-0.35, 0.35));
    const glint = exp(spot.dot(spot).mul(-30));
    const beadColor = vec3(0.7, 0.8, 0.85).mul(ring.mul(0.7).add(0.35)).mul(L.rgb).add(vec3(1.2).mul(glint));
    const beadAlpha = ring.mul(0.9).add(glint).add(0.12).mul(fade(r, 0.88, 1)).clamp(0, 1);

    // An ember glowing in a burnt wound: a hot core, bright enough for the bloom.
    const core = exp(r.mul(r).mul(-7));
    const emberColor = vec3(6, 1.4, 0.3).mul(core.add(0.12)).mul(L.w.mul(0.8).add(0.2));
    const emberAlpha = fade(r, 0.3, 1);

    const rgb = select(kind.lessThan(1.5), fleckColor, select(kind.lessThan(2.5), scaleColor, select(kind.lessThan(3.5), beadColor, emberColor)));
    const a = select(kind.lessThan(1.5), drop, select(kind.lessThan(2.5), scaleAlpha, select(kind.lessThan(3.5), beadAlpha, emberAlpha)));
    return vec4(rgb, a.mul(opacity));
  })();
  material.colorNode = shade.rgb;
  material.opacityNode = shade.a;
  material.alphaTestNode = ditherThreshold();
  return material;
}

// A chunk of fish: a lumpy, torn lump. It is a sphere pushed in and out by a few broad lobes
// and a finer ripple, sliced flat where it was torn off (a few planes at random) and pressed
// nearly flat on top, where the skin was. Three such lumps are baked into one geometry, and
// each chunk shows one of them (the other two collapse to a point and draw nothing), so
// chunks differ in shape and not only in how they are stretched and turned. Normals are
// worked out from the shape itself (so the seams of the sphere do not show).
//
// Per vertex: aMeat (the raw flesh's colour) and aShape (skin 0..1, torn 0..1: how far
// into a torn face, the variant, and the skin's dark spots). The skin's own colour comes
// per chunk, from the coat of the fish it was torn out of.
export function createGibGeometry(random) {
  const positions = [],
    normals = [],
    meats = [],
    shapes = [],
    indices = [];
  for (let variant = 0; variant < 3; variant++) {
    const base = positions.length / 3;
    const g = lump(random, variant);
    positions.push(...g.positions);
    normals.push(...g.normals);
    meats.push(...g.meats);
    shapes.push(...g.shapes);
    for (const i of g.indices) indices.push(base + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("aMeat", new THREE.Float32BufferAttribute(meats, 3));
  geometry.setAttribute("aShape", new THREE.Float32BufferAttribute(shapes, 4));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
  return geometry;
}

function lump(random, variant) {
  const sphere = new THREE.SphereGeometry(1, 10, 7);
  const position = sphere.attributes.position;
  const count = position.count;
  const unit = () => {
    const u = random() * 2 - 1,
      a = random() * Math.PI * 2,
      w = Math.sqrt(1 - u * u);
    return [w * Math.cos(a), u, w * Math.sin(a)];
  };
  const lobes = [];
  for (let i = 0; i < 6; i++) lobes.push([...unit(), (random() - 0.4) * 0.8]);
  // A cheap smooth noise over directions: a few waves with random frequencies and phases.
  const waves = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = unit();
    const f = 2.5 + 5 * random();
    waves.push([x * f, y * f, z * f, random() * Math.PI * 2, 0.5 / (1 + i * 0.4)]);
  }
  const ripple = (x, y, z) => {
    let v = 0;
    for (const [a, b, c, p, w] of waves) v += w * Math.sin(a * x + b * y + c * z + p);
    return v;
  };
  // The torn faces: planes (normal, distance from the middle), kept off the skin side. The
  // variants are torn differently: one nearly a cube of fillet, one a wedge, one a ragged
  // lump.
  const cuts = [];
  const tears = [3, 2, 4][variant];
  for (let i = 0; i < tears; i++) {
    const [x, y, z] = unit();
    const l = Math.hypot(x, y * 0.5 - 0.5, z) || 1;
    cuts.push([x / l, (y * 0.5 - 0.5) / l, z / l, [0.32, 0.22, 0.38][variant] + 0.15 * random()]);
  }
  const stretch = [
    [1.15, 1, 0.95],
    [1.35, 0.85, 0.8],
    [1, 1.05, 1],
  ][variant];
  const torn = { value: 0 };
  const shape = (dx, dy, dz, out) => {
    let r = 0.82;
    for (const [x, y, z, k] of lobes) r += k * Math.pow(Math.max(0, dx * x + dy * y + dz * z), 2);
    r += 0.13 * ripple(dx, dy, dz);
    let x = dx * r * stretch[0],
      y = dy * r * stretch[1],
      z = dz * r * stretch[2];
    torn.value = 0;
    for (const [nx, ny, nz, d] of cuts) {
      const over = x * nx + y * ny + z * nz - d;
      if (over > 0) {
        // Nearly flat, with a little of the lump left in it.
        x -= nx * over * 0.85;
        y -= ny * over * 0.85;
        z -= nz * over * 0.85;
        torn.value = Math.max(torn.value, Math.min(1, over * 5));
      }
    }
    // The skin side: pressed flatter, still domed (a flat face would flash all over at once
    // in the sun like a mirror).
    if (y > 0.42) y = 0.42 + (y - 0.42) * 0.35;
    out.set(x, y, z);
    return out;
  };
  const d = new THREE.Vector3(),
    t1 = new THREE.Vector3(),
    t2 = new THREE.Vector3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    e = new THREE.Vector3(),
    p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    probe = new THREE.Vector3();
  const positions = new Array(count * 3),
    normals = new Array(count * 3),
    meats = new Array(count * 3),
    shapes = new Array(count * 4);
  const eps = 0.015;
  const at = (v, out) => {
    probe.copy(v).normalize();
    return shape(probe.x, probe.y, probe.z, out);
  };
  const smooth = THREE.MathUtils.smoothstep;
  for (let i = 0; i < count; i++) {
    d.fromBufferAttribute(position, i).normalize();
    t1.set(0, 1, 0).cross(d);
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
    t1.normalize();
    t2.crossVectors(d, t1).normalize();
    at(probe.copy(d).addScaledVector(t1, eps), a);
    at(probe.copy(d).addScaledVector(t1, -eps), b);
    at(probe.copy(d).addScaledVector(t2, eps), c);
    at(probe.copy(d).addScaledVector(t2, -eps), e);
    n.crossVectors(a.sub(b), c.sub(e)).normalize();
    shape(d.x, d.y, d.z, p);
    const cut = torn.value;
    if (n.dot(p) < 0) n.negate();
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    normals[i * 3] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
    const skin = smooth(p.y, 0.37, 0.42);
    // Raw fish meat: a pale, pinkish red, not candy. Torn faces show the grain: pale
    // pink flakes with thin white seams of connective tissue between them (the zigzag
    // lines of a fish fillet). Blood has soaked the rest a little darker, and only the
    // ragged rims of the tears are clotted dark red. A band of pale fat lies just under the
    // skin.
    const soak = smooth(ripple(d.z * 2.3, d.x * 2.3, d.y * 2.3), -0.3, 0.6);
    let r = 0.34 - 0.1 * soak,
      g = 0.075 - 0.03 * soak,
      bl = 0.06 - 0.025 * soak;
    r += (0.54 - r) * cut;
    g += (0.21 - g) * cut;
    bl += (0.18 - bl) * cut;
    const seam = Math.pow(Math.abs(Math.sin(p.x * 8 + Math.abs(p.z) * 5 + variant * 1.7)), 10) * cut;
    r += (0.8 - r) * seam * 0.75;
    g += (0.66 - g) * seam * 0.75;
    bl += (0.6 - bl) * seam * 0.75;
    const edge = cut > 0 ? 1 - Math.abs(cut * 2 - 1) : 0;
    const clot = edge * smooth(ripple(d.y * 3.1 + 1, d.z * 3.1, d.x * 3.1), -0.1, 0.5);
    r *= 1 - 0.6 * clot;
    g *= 1 - 0.75 * clot;
    bl *= 1 - 0.75 * clot;
    const fat = Math.exp(-Math.pow((p.y - 0.34) / 0.045, 2)) * 0.75 * (1 - skin);
    r += (0.72 - r) * fat;
    g += (0.58 - g) * fat;
    bl += (0.46 - bl) * fat;
    meats[i * 3] = r;
    meats[i * 3 + 1] = g;
    meats[i * 3 + 2] = bl;
    // Skin: the coat's colour with a few dark spots.
    const spots = ripple(d.x * 3, d.z * 3, d.y) > 0.45 ? 0.45 : 1;
    shapes[i * 4] = skin;
    shapes[i * 4 + 1] = cut;
    shapes[i * 4 + 2] = variant;
    shapes[i * 4 + 3] = spots;
  }
  const indices = Array.from(sphere.index.array);
  sphere.dispose();
  return { positions, normals, meats, shapes, indices };
}

// Wet flesh and skin, lit through the water like the river's own things. The flesh lets
// some of the light through (fish meat is translucent), which keeps it reading as raw pink
// meat instead of a brown pebble: that glow follows the daylight (dim at night) and, like
// the blood clouds, loses only half the red the water above would take out.
//
// Per chunk (instance attributes, both vec4): `coat` = the skin's colour (the flank and back
// of the fish it came from) and how pale or dark its flesh is; `gib` = how burnt its torn
// faces are (a laser cauterises them), which of the three shapes it is.
export function createGibMaterial(coat, gib) {
  const C = instancedBufferAttribute(coat);
  const G = instancedBufferAttribute(gib);
  const meat = attribute("aMeat", "vec3");
  const shape = attribute("aShape", "vec4");
  // (Little of the water's mirror: a wet chunk that mirrors the blue-green water round it
  // reads as a pebble, not as meat.)
  const material = waterLit(new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 }), { mirror: 0.08 });
  const skin = shape.x,
    torn = shape.y;
  // Only this chunk's own shape: the vertices of the other two all go to one point.
  material.positionNode = select(shape.z.sub(G.y).abs().lessThan(0.5), positionLocal, vec3(0));
  const rim = torn.mul(torn.oneMinus()).mul(4).clamp(0, 1);
  // The grain of a torn face, drawn per pixel so it shows on a chunk of any size: flakes of
  // muscle in bands, thin white seams of connective tissue between them, and smears of
  // blood over much of it.
  const g = positionGeometry;
  const band = abs(sin(g.x.mul(10).add(abs(g.z).mul(6)).add(abs(g.y).mul(3)).add(G.y.mul(1.3))));
  const seams = band.pow(40).mul(torn).mul(0.55);
  const flakes = band.mul(0.14).add(0.9);
  const smear = smoothstep(-0.2, 0.45, sin(g.x.mul(5.3).add(g.y.mul(4.1)).add(G.y)).mul(sin(g.z.mul(4.7).sub(g.x.mul(3.1)))).add(sin(g.y.mul(9).add(g.z.mul(2.3))).mul(0.35)));
  const raw = mix(meat.mul(C.w).mul(flakes), vec3(0.2, 0.02, 0.014), smear.mul(0.7));
  const grained = mix(raw, vec3(0.7, 0.55, 0.5), seams);
  const flesh = mix(grained, vec3(0.045, 0.03, 0.022), G.x.mul(torn.mul(0.5).add(rim.mul(0.5))).clamp(0, 1));
  const hide = C.rgb.mul(shape.w);
  material.colorNode = mix(flesh, hide, skin);
  material.roughnessNode = mix(float(0.6), float(0.5), skin);
  const depth = max(surfaceLevelAt(positionWorld).sub(positionWorld.y), 0);
  const through = exp(river.absorb.mul(depth).negate()).mul(0.55).add(0.45);
  const day = skyUniforms.sun.clamp(0, 1).mul(0.72).add(0.28);
  material.emissiveNode = flesh.mul(0.3).mul(through).mul(day).mul(skin.oneMinus());
  return material;
}
