// The river's layout as one number: every collider of every block built round some places
// along the river, and how many plant vertices each block holds. A change to how things look
// (the stones' shapes, their material) must leave it exactly as it was; if it moves, some
// change drew one random number more or less, and everything after it in that stream moved.
//
//   node tools/layout-fingerprint.mjs [s ...]           (default: 240 2500 4250 11790)
//   node tools/layout-fingerprint.mjs --draws [s ...]   (default: 240 2500 4250 11790 16040)
//
// --draws leaves the plant vertex counts out, so a change that means to reshape the plants
// can still prove it left the seeded world alone: it hashes every collider and hiding place
// of each block, the size and first and last vertex of everything else a block holds, the
// colliders of the special places near by (features.js), and how many numbers each shared
// random stream gave out. A stream made in flora.js or wood.js is a plant's or a limb's own
// (grown from a seed drawn from the shared one) and is left out of the count. About 25 s.
//
// Runs the game's own terrain code in Node, with three.js from vendor/ and no pictures.
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const draws = args.includes("--draws");
const map = { three: "vendor/three.webgpu.js", "three/webgpu": "vendor/three.webgpu.js", "three/tsl": "vendor/three.tsl.js" };
const randomUrl = pathToFileURL(join(root, "shared/random.js")).href;
registerHooks({
  resolve(specifier, context, next) {
    if (map[specifier]) return { url: pathToFileURL(join(root, map[specifier])).href, shortCircuit: true };
    if (specifier.startsWith("three/addons/")) return { url: pathToFileURL(join(root, "vendor/jsm", specifier.slice(13))).href, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    // (--draws: the game's generator, counting what it gives out. Which file made it is read
    // off the stack: the frame after randomGenerator's own.)
    if (!draws || url !== randomUrl) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: `export function randomGenerator(seed = 7731) {
        const own = /\\/(flora|wood)\\.js/.test(new Error().stack.split("\\n").slice(2, 3).join(""));
        const entry = { seed, draws: 0, own };
        (globalThis.__streams ??= []).push(entry);
        return () => {
          entry.draws++;
          seed |= 0;
          seed = (seed + 0x6d2b79f5) | 0;
          let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
          return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
        };
      }`,
    };
  },
});
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.navigator ??= { userAgent: "node" };
globalThis.document = { createElement: () => ({ getContext: () => null, width: 1, height: 1, style: {} }) };

const THREE = await import("three");
THREE.ImageLoader.prototype.load = function () {
  return {};
};
const course = await import(pathToFileURL(join(root, "src/course.js")).href);
const { createTerrain } = await import(pathToFileURL(join(root, "src/terrain.js")).href);
const { createFeatures } = draws ? await import(pathToFileURL(join(root, "src/features.js")).href) : {};
const material = new THREE.MeshBasicMaterial();
const rocks = { brook: material, river: material, sea: material, wood: material };
let h = 2166136261;
const mix = (v) => {
  h = Math.imul(h ^ Math.round(v * 1e4), 16777619) >>> 0;
};
const places = args.filter((a) => !a.startsWith("--")).map(Number);
for (const s of places.length ? places : draws ? [240, 2500, 4250, 11790, 16040] : [240, 2500, 4250, 11790]) {
  // (The river's own stream, 34191, runs on from place to place; every other starts afresh.)
  if (draws) globalThis.__streams = globalThis.__streams?.filter((e) => e.seed === 34191) ?? [];
  const terrain = createTerrain(new THREE.Scene(), { bedMaterial: material, surfaceMaterial: material, rocks, detail: true });
  const c = course.section(Math.min(s, course.S.coast));
  const at = course.place(s, c.thalweg, {});
  terrain.prime({ x: at.x, z: at.z, s, u: c.thalweg }, { radius: 140, near: 0.5, land: 60 });
  let colliders = 0,
    plantVerts = 0,
    cover = 0,
    other = 0;
  for (const key of [...terrain.blocks.keys()].sort()) {
    const block = terrain.blocks.get(key);
    if (!block.content) continue;
    for (const k of block.content.colliders) {
      mix(k.x);
      mix(k.y);
      mix(k.z);
      mix(k.r);
      colliders++;
    }
    if (!draws) {
      const n = block.content.plants?.geometry.attributes.position.count ?? 0;
      mix(n);
      plantVerts += n;
      continue;
    }
    for (const k of block.content.cover) {
      mix(k.x);
      mix(k.z);
      mix(k.radius);
      mix(k.top);
      cover++;
    }
    block.content.group.traverse((o) => {
      if (!o.isMesh || o.name === "Plants") return;
      const p = o.geometry.attributes.position;
      mix(p.count);
      mix(p.getX(0));
      mix(p.getY(p.count - 1));
      other++;
    });
  }
  if (!draws) {
    console.log(`s=${s} colliders=${colliders} plantVerts=${plantVerts}`);
    continue;
  }
  // The special places near s too (their plants draw on each place's own stream).
  const features = createFeatures(new THREE.Scene(), { rocks, locate: course.locate, surfaceMaterial: material });
  features.prime(s, 300);
  let featureColliders = 0;
  for (const k of features.collidersNear(at.x, at.z, 1e6, [])) {
    mix(k.x);
    mix(k.y);
    mix(k.z);
    mix(k.r);
    featureColliders++;
  }
  const shared = globalThis.__streams.filter((e) => !e.own);
  for (const e of shared) {
    mix(e.seed);
    mix(e.draws);
  }
  const own = globalThis.__streams.length - shared.length;
  console.log(`s=${s} featureColliders=${featureColliders} colliders=${colliders} cover=${cover} meshes=${other} sharedStreams=${shared.length} draws=${shared.reduce((a, e) => a + e.draws, 0)} privateStreams=${own}`);
}
console.log(draws ? "draws fingerprint (layout and shared draws, no plant vertex counts)" : "fingerprint", h.toString(16));
