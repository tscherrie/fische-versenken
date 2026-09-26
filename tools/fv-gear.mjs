// Close looks at the weapon models and the harness from any side, over the Chrome DevTools
// protocol, on the real graphics card, with every console error and warning from the first
// line of the page on (the shader warm-up included), and the model checks:
//
//   node tools/fv-gear.mjs [--set gear] [--port 8151] [--webgl] [--parity] [--tris] spec [spec ...]
//
// spec = stage:weapons:prefix:views[:heat[:extra]]
//   weapons  back/belly pairs, comma separated (e.g. minigun/torpedo,kanone/saege; either may
//            be empty)
//   views    comma list of VIEWS names below (the camera relative to the fish, in fish lengths)
//   heat     0..1 put on both weapons before the picture
//   extra    hump (the spawner's full hump), fire<ms>x<n> (n shots, then <ms> of game time),
//            marker (magenta/cyan spheres at the muzzles), marker14 (every muzzle of a rack)
// --parity  the copied body shape (model-harness.js) against the game's own fish vertices
// --tris    triangles of every weapon and harness; each picture also reports its draws
// --focus f, --focus-y y  the point looked at: x = f fish lengths from the middle, y in model units
// --quality q  the game's quality (eco: the harness without its small detail)
// --eval js an expression evaluated in the page after each spec (printed as JSON)
//
// Pictures land in shots/<set>/<prefix>-<weapons>-<view>.jpg; the tool prints one line per
// spec (errors, draws per player) and exits 1 if there were errors.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const port = Number(option("port", 8151));
const set = option("set", "gear");
const webgl = args.includes("--webgl");
const specs = args.filter((a, i) => !a.startsWith("--") && !["--port", "--set", "--focus", "--focus-y", "--eval", "--quality"].includes(args[i - 1]));
const STAGES = {
  alevin: { at: 120, season: "spring", hour: 13 },
  fry: { at: 240, season: "summer", hour: 13 },
  fingerling: { at: 400, season: "summer", hour: 13 },
  yearling: { at: 1500, season: "summer", hour: 14 },
  parr: { at: 2500, season: "summer", hour: 15 },
  smolt: { at: 11790, season: "spring", hour: 12 },
  postsmolt: { at: 14000, season: "summer", hour: 12 },
  grilse: { at: 17500, season: "summer", hour: 12 },
  sea: { at: 17500, season: "summer", hour: 12 },
  spawner: { at: 5240, season: "autumn", hour: 12 },
};
// [aside (to the fish's left), above, ahead] in fish lengths from a point on the fish.
const VIEWS = {
  left: [0.9, 0.35, 0.25],
  right: [-0.9, 0.35, 0.25],
  top: [0.3, 0.9, -0.2],
  front: [0.35, 0.3, 1.0],
  frontR: [-0.35, 0.3, 1.0],
  chase: [0.0, 0.42, -1.3],
  chaseL: [0.35, 0.3, -0.9],
  low: [0.8, -0.35, 0.3],
  lowR: [-0.8, -0.35, 0.3],
  belly: [0.42, -0.26, 0.2],
  bellyR: [-0.42, -0.26, 0.2],
  bellyFront: [0.25, -0.22, 0.75],
  bellyClose: [0.24, -0.14, 0.02],
  frontClose: [0.2, 0.02, 0.62],
  frontCloseR: [-0.2, 0.02, 0.62],
  bellyCloseR: [-0.24, -0.14, 0.02],
  closeL: [0.36, 0.16, 0.12],
  closeR: [-0.36, 0.16, 0.12],
  closeTop: [0.1, 0.38, 0.02],
  far: [2.2, 0.8, 0.6],
};

async function reachable() {
  try {
    return (await fetch(`http://localhost:${port}/`)).ok;
  } catch {
    return false;
  }
}
let server = null;
if (!(await reachable())) {
  server = spawn(process.execPath, [join(root, "tools/capture-server.mjs"), String(port)], { stdio: "ignore" });
  for (let i = 0; i < 50 && !(await reachable()); i++) await new Promise((r) => setTimeout(r, 100));
}
// A server already on the port may be another work tree's: then the pictures would show its
// code and land in its shots/. Only go on when it serves this tree.
{
  const served = await (await fetch(`http://localhost:${port}/src/fv/models.js`)).text().catch(() => "");
  if (served !== (await readFile(join(root, "src/fv/models.js"), "utf8"))) {
    console.error(`the server on port ${port} does not serve ${root}: pick another --port`);
    server?.kill();
    process.exit(2);
  }
}
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = await mkdtemp(join(tmpdir(), "fv-gear-"));
const debugPort = 9340 + Math.floor(Math.random() * 50);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    "--no-first-run",
    "--window-size=1280,720",
    "--force-device-scale-factor=1",
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-features=Vulkan,WebGPU",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "about:blank",
  ],
  { stdio: "ignore" },
);
let target;
for (let i = 0; i < 100; i++) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === "page");
    if (target) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let nextId = 1;
const pending = new Map();
const errors = [];
const missing = new Set();
// (Known and not ours: the base game's otter and seal meshes warn about an empty index, and
// the development server has no /_vercel.)
const ignored = /index count of 0|_vercel|favicon/;
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  const push = (text) => (ignored.test(text) ? missing.add(text.slice(0, 120)) : errors.push(text));
  if (msg.method === "Runtime.exceptionThrown") push("exception " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
  else if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) push(msg.params.type + " " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Log.entryAdded" && (msg.params.entry.level === "error" || msg.params.entry.level === "warning")) push("log " + msg.params.entry.text + " " + (msg.params.entry.url ?? ""));
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

let failed = false;
for (const spec of specs) {
  const [stage, combosText, prefix, views, heat = "0", extra = ""] = spec.split(":");
  const combos = combosText.split(",").map((c) => c.split("/"));
  const s = STAGES[stage];
  const q = new URLSearchParams({ capture: "1", seed: "7", day: "still", rain: "0", quality: option("quality", "detail"), stage, at: String(s.at), season: s.season, hour: String(s.hour) });
  errors.length = 0;
  await send("Page.navigate", { url: `http://localhost:${port}/?${q}&new${webgl ? "&webgl" : ""}` });
  for (let i = 0; i < 600; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      if (await evaluate("!!(window.salmon && window.extreme && window.extreme.combat && window.fvModels)")) break;
    } catch {}
  }
  const viewList = views.split(",").map((v) => [v, VIEWS[v]]);
  const [fireMs, fireCount] = extra.startsWith("fire") ? extra.slice(4).split("x").map(Number) : [0, 0];
  const started = Date.now();
  const result = await evaluate(`(async () => {
    const salmon = window.salmon, extreme = window.extreme, models = window.fvModels;
    const { fish, THREE } = salmon;
    salmon.pause(true);
    await salmon.settle(40); await salmon.run(1); await salmon.settle(20);
    extreme.testing = true;
    const player = extreme.combat.players[0];
    const a = player.arsenal;
    await salmon.run(0.3);
    const hump = ${JSON.stringify(extra)} === "hump";
    const L = fish.length;
    const out = [];
    for (const [back, belly] of ${JSON.stringify(combos)}) {
      a.back = back || null; a.belly = belly || null;
      const tag = [back, belly].filter(Boolean).join("_") || "none";
      for (const [name, [aside, above, ahead]] of ${JSON.stringify(viewList)}) {
        if (hump) salmon.salmon.materials.uniforms.coat_hump.value = 1;
        if (a.back) a.heat[a.back] = ${Number(heat)};
        if (a.belly) a.heat[a.belly] = ${Number(heat)};
        // (Game time passes before the gear sees the new weapons: they are just there, not
        // sliding into their clamps as a weapon found does.)
        await salmon.run(0.15, null, 1 / 60);
        extreme.frame(1 / 60);
        // Fire, then let game time run on (the gear moves on the game's clock).
        for (let i = 0; i < ${fireCount}; i++) {
          if (a.back) models.api.recoil(player, "back");
          if (a.belly) models.api.recoil(player, "belly");
        }
        if (${fireMs} > 0) await salmon.run(${fireMs} / 1000, null, 1 / 60);
        await salmon.run(1 / 60, null, 1 / 60);
        if (hump) salmon.salmon.materials.uniforms.coat_hump.value = 1;
        if (a.back) a.heat[a.back] = ${Number(heat)};
        if (a.belly) a.heat[a.belly] = ${Number(heat)};
        const m = new THREE.Matrix4().fromArray(salmon.salmon.meshes[0].instanceMatrix.array, 0);
        const ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
        m.extractBasis(ax, ay, az);
        ax.normalize(); ay.normalize(); az.normalize();
        const focus = new THREE.Vector3(${Number(option("focus", 0.2))} * 0.79, ${Number(option("focus-y", 0))}, 0).applyMatrix4(m);
        const eye = focus.clone().addScaledVector(az, -aside * L).addScaledVector(ay, above * L).addScaledVector(ax, ahead * L);
        salmon.view(eye.toArray(), focus.toArray(), L * 0.02);
        // (The camera takes its place in the next step.)
        await salmon.run(1 / 60, null, 1 / 60);
        if (hump) salmon.salmon.materials.uniforms.coat_hump.value = 1;
        window.__markers ??= [];
        for (const mk of window.__markers) mk.removeFromParent();
        window.__markers.length = 0;
        if (${JSON.stringify(extra)}.startsWith("marker")) {
          for (const place of ["back", "belly"]) {
            if (!a[place]) continue;
            const shots = ${JSON.stringify(extra)} === "marker14" ? 14 : 1;
            for (let i = 0; i < shots; i++) {
              const v = new THREE.Vector3();
              if (!models.api.muzzle(player, place, v)) continue;
              const mk = new THREE.Mesh(new THREE.SphereGeometry(0.004 * L, 8, 6), new THREE.MeshBasicNodeMaterial({ color: place === "back" ? 0xff00ff : 0x00ffff }));
              mk.position.copy(v);
              extreme.game.scene.add(mk);
              window.__markers.push(mk);
              if (shots > 1) models.api.recoil(player, place);
            }
          }
        }
        extreme.frame(1 / 60);
        await salmon.capture("${set}/${prefix}-" + tag + "-" + name, 1280, 720);
        out.push(tag + "-" + name + " draws " + models.draws().join("/"));
      }
    }
    return { stage: fish.stage, L: +L.toFixed(2), views: out };
  })()`).catch((e) => ({ error: String(e) }));
  if (args.includes("--parity"))
    console.log(
      "parity",
      await evaluate(`(async () => {
        const A = await import("/src/anatomy.js");
        const H = await import("/src/fv/model-harness.js");
        const out = {};
        for (const kind of ["alevin", "parr", "salmon"]) {
          const fish = A.makeFish(kind);
          const g = fish.body.isBufferGeometry ? fish.body : fish.body.geometry;
          const P = g.attributes.position, part = g.attributes.aPart;
          const S = H.bodyShape(A.BODIES[kind]);
          let worst = 0, n = 0;
          for (let i = 0; i < P.count; i++) {
            if (part.getX(i) !== 0) continue;
            const x = P.getX(i), y = P.getY(i), z = Math.abs(P.getZ(i));
            if (x <= 0.04 || x >= 0.3) continue;
            const t = S.top(x), b = S.bottom(x), c = (t + b) / 2;
            const v = Math.max(-1, Math.min(1, y >= c ? (y - c) / (t - c) : (y - c) / (c - b)));
            worst = Math.max(worst, Math.abs(z - Math.abs(S.surface(x, v, 1)[2])));
            n++;
          }
          out[kind] = { vertices: n, worst: +worst.toExponential(2), ok: worst < 1e-5 };
        }
        return JSON.stringify(out);
      })()`),
    );
  if (option("eval")) console.log("eval", JSON.stringify(await evaluate(option("eval")).catch((e) => String(e))));
  if (args.includes("--tris")) console.log("triangles", JSON.stringify(await evaluate("JSON.stringify(window.fvModels.triangles())")));
  if (result?.error || errors.length) failed = true;
  console.log(spec, JSON.stringify(result), `${((Date.now() - started) / 1000).toFixed(1)} s`, errors.length ? `ERRORS: ${errors.slice(0, 8).join(" | ").slice(0, 1600)}` : "no errors");
}
if (missing.size) console.log("ignored:", [...missing].join(" | "));
ws.close();
chrome.kill();
server?.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});
process.exit(failed ? 1 : 0);
