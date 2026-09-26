// How many triangles each kind of plant puts into the blocks round some places: what the
// weed costs, species by species, before and after a change to how it is grown.
//
//   node tools/plant-species.mjs [name:s ...]     (default: the photo points with plants)
//
// Runs the game's own terrain code in Node (as layout-fingerprint.mjs does) with the blocks
// within 60 m of the river's middle at s, and counts each plant piece (terrain.js piece())
// by the generator that grew it. The special places' plants are not counted.
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const map = { three: "vendor/three.webgpu.js", "three/webgpu": "vendor/three.webgpu.js", "three/tsl": "vendor/three.tsl.js" };
const terrainUrl = pathToFileURL(join(root, "src/terrain.js")).href;
// Where terrain.js files each plant's run of indices, the tally is told of it too.
const FILED = "(batch.pieces ??= []).push(start, batch.indices.length);";
registerHooks({
  resolve(specifier, context, next) {
    if (map[specifier]) return { url: pathToFileURL(join(root, map[specifier])).href, shortCircuit: true };
    if (specifier.startsWith("three/addons/")) return { url: pathToFileURL(join(root, "vendor/jsm", specifier.slice(13))).href, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url !== terrainUrl) return next(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    if (!source.includes(FILED)) throw new Error("terrain.js piece() has changed: update plant-species.mjs");
    return { format: "module", shortCircuit: true, source: source.replace(FILED, `${FILED} globalThis.__tally?.(fn.name, batch.indices.length - start);`) };
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
const material = new THREE.MeshBasicMaterial();
const rocks = { brook: material, river: material, sea: material, wood: material };
const given = process.argv.slice(2).map((a) => a.split(":"));
const places = given.length
  ? given.map(([name, s]) => [name, Number(s ?? name)])
  : [
      ["quelle", 24],
      ["brutbecken", 240],
      ["bach", 2500],
      ["stillwasser", 4250],
      ["schlucht", 7200],
      ["unterlauf", 13950],
      ["tang", 16040],
    ];
for (const [name, s] of places) {
  const species = {};
  globalThis.__tally = (kind, indices) => {
    const entry = (species[kind] ??= { tris: 0, clumps: 0 });
    entry.tris += indices / 3;
    entry.clumps++;
  };
  const terrain = createTerrain(new THREE.Scene(), { bedMaterial: material, surfaceMaterial: material, rocks, detail: true });
  const c = course.section(Math.min(s, course.S.coast));
  const at = course.place(s, c.thalweg, {});
  terrain.prime({ x: at.x, z: at.z, s, u: c.thalweg }, { radius: 60, near: 0.5, land: 60 });
  const rows = Object.entries(species).sort((a, b) => b[1].tris - a[1].tris);
  const total = rows.reduce((a, [, v]) => a + v.tris, 0);
  console.log(`${name} (s=${s}): ${Math.round(total / 1000)}k plant triangles: ` + rows.map(([k, v]) => `${k} ${Math.round(v.tris / 1000)}k/${v.clumps}`).join(", "));
}
