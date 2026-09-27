// The combat bench: what Extreme's combat costs a frame, against its budget (all of it at most
// 1.5 ms on the graphics card and 1 ms of script), on WebGPU, on the WebGL 2 fallback and at
// the Eco quality. It runs the scene "bench" of src/fv/dev/scenes-look.js once per renderer
// and quality in a Chrome of its own without a window, on the real graphics card:
//
//   node tools/fv-bench.mjs [--set bench] [--configs webgpu-detail,webgl2-detail,webgpu-eco]
//                           [--repeats 5] [--frames 120] [--blocks 32] [--soak 30] [--no-sweep]
//                           [--aim 0.12] [--hp 4] [--port 8170] [--headed] [--summary-only]
//
// Each configuration leaves shots/<set>/bench-<config>.json (every number), a summary
// bench-<config>.md and two pictures (-kampf with the fight, -ohne without); summary.md puts
// the verdicts, where the time goes and what the proposals save side by side (a "## Notes"
// section at its end is kept when it is written again). The development server is started on
// --port if nothing answers there; a server already there must serve this tree. Chrome picks
// its own debugging port, so the bench never talks to another session's Chrome: through it
// the bench loads each configuration, hears everything the page writes to its console, and
// runs Chrome's sampling heap profiler when the page asks for it. Stopped (Ctrl-C, a kill),
// it takes its Chrome and its server down with it. --summary-only writes the summaries again
// from the reports already there.

import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { loadavg, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const set = option("set", "bench");
const port = Number(option("port", 8170));
const configs = option("configs", "webgpu-detail,webgl2-detail,webgpu-eco").split(",");
const BUDGET = { gpu: 1.5, cpu: 1 };
const out = join(root, "shots", set);

for (const c of configs)
  if (!/^(webgpu|webgl2)-(eco|balanced|detail|ultra)$/.test(c)) {
    console.error(`unknown configuration ${c} (renderer-quality, e.g. webgl2-eco)`);
    process.exit(1);
  }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- What this process started, and taking it down again however the process ends.

const started = { server: null, chrome: null, profile: null };
// Chrome runs in a process group of its own (spawned detached), so its helpers -- the card's,
// the network's -- go with it; any left over are found by the profile folder named in their
// command lines, which is this run's alone.
function killChrome(signal) {
  const chrome = started.chrome;
  if (chrome && chrome.exitCode === null && chrome.signalCode === null)
    try {
      process.kill(-chrome.pid, signal);
    } catch {}
  if (signal === "SIGKILL" && started.profile)
    try {
      execFileSync("pkill", ["-KILL", "-f", `--user-data-dir=${started.profile}`], { stdio: "ignore" });
    } catch {}
}
async function stopAll() {
  const chrome = started.chrome;
  if (chrome) {
    const closed = chrome.exitCode !== null || chrome.signalCode !== null ? Promise.resolve() : new Promise((r) => chrome.once("exit", r));
    killChrome("SIGTERM");
    await Promise.race([closed, sleep(5000)]);
    killChrome("SIGKILL");
    started.chrome = null;
  }
  started.server?.kill();
  started.server = null;
  if (started.profile) await rm(started.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  started.profile = null;
}
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.error(`${signal}: stopping Chrome and the server`);
    await stopAll();
    process.exit(130);
  });
// (The last word, when the process ends some other way: nothing asynchronous runs here.)
process.on("exit", () => {
  killChrome("SIGKILL");
  started.server?.kill("SIGKILL");
});

// ---- Running the page.

async function fetchText(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

// The server on --port: this tree's (it serves the bench's own file as it is here), started
// here when nothing answers, and refused when it serves another tree.
async function ensureServer() {
  const probe = `http://localhost:${port}/src/fv/dev/scenes-look.js`;
  const mine = await readFile(join(root, "src/fv/dev/scenes-look.js"), "utf8");
  let served = await fetchText(probe);
  if (served === null) {
    started.server = spawn(process.execPath, [join(root, "tools/capture-server.mjs"), String(port)], { stdio: "ignore" });
    for (let i = 0; i < 50 && served === null; i++) {
      await sleep(100);
      served = await fetchText(probe);
    }
  }
  if (served !== mine) throw new Error(`the server on port ${port} serves another tree (or none): choose another --port`);
}

// Chrome writes the debugging port it picked, and the browser's address, into the profile.
async function debuggingPort(profile, chrome) {
  for (let i = 0; i < 150; i++) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited (${chrome.exitCode}) before it opened its debugging port`);
    try {
      const [line] = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n");
      if (Number(line) > 0) return Number(line);
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not open its debugging port");
}

// A connection to one page over Chrome's debugging protocol. A call that gets no answer in
// `patience` ms, or a connection that closes (Chrome gone), fails instead of waiting forever.
async function devtools(debugPort, patience = 120000) {
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch {}
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("Chrome's debugging port did not answer");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    socket.onopen = ok;
    socket.onerror = () => fail(new Error("no connection to the page"));
  });
  let id = 0;
  let closed = null;
  const waiting = new Map();
  const listeners = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id).ok(message);
      waiting.delete(message.id);
    } else if (message.method) for (const listen of listeners) listen(message);
  };
  socket.onclose = () => {
    closed = new Error("the connection to Chrome closed");
    for (const { fail } of waiting.values()) fail(closed);
    waiting.clear();
  };
  return {
    get closed() {
      return closed;
    },
    send(method, params = {}) {
      if (closed) return Promise.reject(closed);
      return new Promise((ok, fail) => {
        const n = ++id;
        const timer = setTimeout(() => {
          waiting.delete(n);
          fail(new Error(`${method}: no answer in ${patience / 1000} s`));
        }, patience);
        waiting.set(n, {
          ok: (message) => {
            clearTimeout(timer);
            message.error ? fail(new Error(`${method}: ${message.error.message}`)) : ok(message);
          },
          fail: (error) => {
            clearTimeout(timer);
            fail(error);
          },
        });
        socket.send(JSON.stringify({ id: n, method, params }));
      });
    },
    on: (listen) => listeners.push(listen),
    close: () => socket.close(),
  };
}

// What the page said: errors and warnings from its console, uncaught exceptions, and the
// browser's own messages about it (failed loads, WebGL and WebGPU complaints). The page's
// requests for the heap profiler come this way too (console.debug "bench:heap-start" and
// "bench:heap-stop <frames>"): the answer goes back through window.benchHeap.
function listen(page, sink) {
  page.on(({ method, params }) => {
    if (method === "Runtime.consoleAPICalled" && params.type === "debug") {
      const text = String(params.args?.[0]?.value ?? "");
      if (text.startsWith("bench:heap-")) heapProfiler(page, sink, text).catch((error) => sink.current?.errors.push(`heap profiler: ${error.message}`));
    } else if (method === "Runtime.consoleAPICalled" && (params.type === "error" || params.type === "warning" || params.type === "assert")) {
      const text = params.args.map((a) => a.value ?? a.description ?? a.type).join(" ");
      sink.current?.[params.type === "warning" ? "warnings" : "errors"].push(text.slice(0, 400));
    } else if (method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails;
      sink.current?.errors.push(String(d.exception?.description ?? d.text).slice(0, 400));
    } else if (method === "Log.entryAdded" && (params.entry.level === "error" || params.entry.level === "warning")) {
      const text = `${params.entry.source}: ${params.entry.text}${params.entry.url ? ` (${params.entry.url.split("?")[0]})` : ""}`.slice(0, 400);
      if (ENVIRONMENT.some((pattern) => pattern.test(text))) sink.current?.environment.push(text);
      else sink.current?.[params.entry.level === "warning" ? "warnings" : "errors"].push(text);
    }
  });
}
// What the development server causes, not the game: it has no Vercel analytics script.
const ENVIRONMENT = [/\/_vercel\/insights\//];

// Chrome's sampling heap profiler over the frames the page runs for it, with what the
// collector has already taken (so it counts everything allocated, not what is left).
async function heapProfiler(page, sink, text) {
  const heard = sink.current;
  if (text === "bench:heap-start") {
    await page.send("HeapProfiler.enable");
    await page.send("HeapProfiler.startSampling", { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await page.send("Runtime.evaluate", { expression: "window.benchHeap = 'on'" });
  } else if (text.startsWith("bench:heap-stop")) {
    const frames = Number(text.split(" ")[1]) || 1;
    const { result } = await page.send("HeapProfiler.stopSampling");
    if (heard) heard.heap = heapDigest(result.profile, frames);
    await page.send("Runtime.evaluate", { expression: "window.benchHeap = 'off'" });
  }
}

// KB allocated a frame: in all, within the parts of combat named here (their callees
// included), and at the sites that allocate most themselves.
const HEAP_PARTS = {
  "combat.js step": "combat.step",
  "combat.js frame": "combat.frame",
  "projectiles.js update": "projectiles.update",
  "enemies.js update": "enemies.update",
  "hostile.js update": "hostile.update",
  "hud.js bars": "hud.bars",
  "fx.js update": "fx.update",
};
function heapDigest(profile, frames) {
  const within = Object.fromEntries(Object.values(HEAP_PARTS).map((k) => [k, 0]));
  const sites = new Map();
  let total = 0;
  const walk = (node, open) => {
    const cf = node.callFrame;
    const file = (cf.url || "").split("?")[0].split("/").pop();
    const part = HEAP_PARTS[`${file} ${cf.functionName}`];
    const inside = part && !open.includes(part) ? [...open, part] : open;
    total += node.selfSize;
    for (const k of inside) within[k] += node.selfSize;
    if (node.selfSize) {
      const site = `${cf.functionName || "(anonymous)"} (${file || "native"}${file ? `:${cf.lineNumber + 1}` : ""})`;
      sites.set(site, (sites.get(site) ?? 0) + node.selfSize);
    }
    for (const child of node.children ?? []) walk(child, inside);
  };
  walk(profile.head, []);
  const kb = (bytes) => +(bytes / 1024 / frames).toFixed(1);
  return {
    frames,
    totalKB: kb(total),
    withinKB: Object.fromEntries(Object.entries(within).map(([k, v]) => [k, kb(v)])),
    sites: [...sites]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([site, bytes]) => ({ site, kb: kb(bytes) })),
  };
}

// Who else is using the machine, and so the card: other headless Chromes (other sessions'
// tests) and the load.
function environment(own) {
  const others = new Set();
  try {
    for (const line of execFileSync("ps", ["-axo", "command"], { encoding: "utf8" }).split("\n")) {
      const dir = line.includes("--headless") && !line.includes("--type=") && line.match(/--user-data-dir=(\S+)/)?.[1];
      if (dir && dir !== own) others.add(dir);
    }
  } catch {}
  return { otherChromes: others.size, load: loadavg() };
}

async function modified(file) {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return 0;
  }
}

// A report just written may still be on its way to the disk: read it until it parses.
async function readReport(file) {
  let last = null;
  for (let i = 0; i < 20; i++) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      last = error;
      await sleep(300);
    }
  }
  throw last;
}

function benchURL(config) {
  const [rendererName, quality] = config.split("-");
  // (As scenes.js's sceneURL, but with the renderer and the quality of this configuration.)
  const q = new URLSearchParams({ capture: "1", seed: "7", day: "still", rain: "0", quality, fvtest: set, scene: scene.name, only: scene.name, stage: scene.stage, at: String(scene.at), season: scene.season, hour: String(scene.hour), xname: `bench-${config}` });
  q.set("new", "");
  if (rendererName === "webgl2") q.set("webgl", "");
  for (const key of ["repeats", "frames", "blocks", "soak", "aim", "hp"]) if (option(key) !== null) q.set(`x${key}`, option(key));
  if (args.includes("--no-sweep")) q.set("xsweep", "0");
  return `http://localhost:${port}/?${q}`;
}

const { LOOK_SCENES } = await import(join(root, "src/fv/dev/scenes-look.js"));
const scene = LOOK_SCENES.find((s) => s.name === "bench");

// Configurations that failed in this run, and why: their old reports are not summed up.
const failures = new Map();
const finished = [];

async function run() {
  await ensureServer();
  const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const profile = (started.profile = await mkdtemp(join(tmpdir(), "extreme-bench-")));
  const chrome = (started.chrome = spawn(
    CHROME,
    [
      ...(args.includes("--headed") ? [] : ["--headless=new"]),
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,720",
      "--force-device-scale-factor=1",
      "--use-angle=metal",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-features=Vulkan,WebGPU",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--autoplay-policy=no-user-gesture-required",
      // (The heap's size to the byte, for the soak's record of it.)
      "--enable-precise-memory-info",
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  ));
  const console_ = { current: null };
  try {
    const page = await devtools(await debuggingPort(profile, chrome));
    listen(page, console_);
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    await page.send("Page.enable");
    // A page of exactly 1280×720, whatever the headless window keeps for itself.
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    for (const config of configs) {
      const name = `bench-${config}`;
      const file = join(out, `${name}.json`);
      const heard = (console_.current = { errors: [], warnings: [], environment: [], heap: null });
      const before = environment(profile);
      const begun = Date.now();
      console.log(`${name}: running`);
      await page.send("Page.navigate", { url: benchURL(config) });
      let done = false;
      while (!done && Date.now() - begun < 45 * 60 * 1000) {
        await sleep(1000);
        if (chrome.exitCode !== null || chrome.signalCode !== null) throw new Error(`Chrome exited (${chrome.exitCode ?? chrome.signalCode}) during ${name}`);
        if (page.closed) throw page.closed;
        done = (await modified(file)) > begun;
      }
      if (!done) {
        console.error(`${name}: no report after 45 minutes`);
        failures.set(config, "no report after 45 minutes");
        continue;
      }
      // (The pictures are taken last; the report follows them, so everything is in.)
      const report = await readReport(file);
      report.console = { errors: [...new Set(heard.errors)], warnings: [...new Set(heard.warnings)], environment: [...new Set(heard.environment)] };
      if (heard.heap) report.heapSampling = heard.heap;
      const after = environment(profile);
      report.environment = { otherChromes: Math.max(before.otherChromes, after.otherChromes), load: after.load, loadBefore: before.load, minutes: +((Date.now() - begun) / 60000).toFixed(1) };
      await writeFile(file, JSON.stringify(report, null, 1));
      console.log(`${name}: done in ${((Date.now() - begun) / 1000).toFixed(0)} s, ${report.errors.length + report.console.errors.length} errors`);
      finished.push(config);
    }
    await page.send("Page.navigate", { url: "about:blank" });
    page.close();
  } finally {
    await stopAll();
  }
}

// ---- The summaries.

const f = (v, digits = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(digits));
const signed = (v, digits = 2) => (v == null || !Number.isFinite(v) ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`);
const mid = (list) => {
  const sorted = list.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const spread = (list, digits = 2) => {
  const v = list.filter(Number.isFinite);
  return v.length ? `${f(Math.min(...v), digits)} … ${f(Math.max(...v), digits)}` : "–";
};
const table = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map((h, i) => (i ? "---:" : "---")).join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
// The median of all paired differences of the repeats together, with its 95 % interval (by
// the order of the values, which needs nothing of their distribution).
function pooled(list) {
  const v = list.filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return null;
  const half = 0.98 * Math.sqrt(n);
  return { median: n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2, low: v[Math.max(0, Math.floor(n / 2 - half))], high: v[Math.min(n - 1, Math.ceil(n / 2 + half))], n };
}
const interval = (p, digits = 3) => (p ? `${f(p.median, digits)} (95 % ${f(p.low, digits)} … ${f(p.high, digits)}, ${p.n} pairs)` : "–");

// Least squares for a + b·n + c·n² through the points (the enemies' cost against their number).
function quadratic(points) {
  const m = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (const [n, y] of points) {
    const row = [1, n, n * n];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i][j] += row[i] * row[j];
      m[i][3] += row[i] * y;
    }
  }
  for (let i = 0; i < 3; i++) {
    const p = m[i][i];
    if (Math.abs(p) < 1e-12) return null;
    for (let j = i; j < 4; j++) m[i][j] /= p;
    for (let k = 0; k < 3; k++) if (k !== i) for (let j = 3; j >= i; j--) m[k][j] -= m[k][i] * m[i][j];
  }
  return m.map((row) => row[3]);
}

// The parts of combat.step timed on their own (plain means; the rest is step minus them).
// The stones near a point are asked for twice in a step: for the crawlers' ground (with the
// gravel) and for the shots; the page tells the ground's apart.
const STEP_PARTS = ["enemies", "projectiles", "hostile", "aim", "director", "pickups", "shotStones", "ground"];
const PART_NAMES = {
  enemies: "enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds)",
  projectiles: "projectiles.update (with hits: enemies.hit, gore.hit, fx.burst)",
  hostile: "hostile.update (enemy rounds, with hits on the player)",
  aim: "aim.update",
  director: "director.update",
  pickups: "pickups.update",
  shotStones: "the stones for the shots (terrain.collidersNear)",
  ground: "the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u)",
};
const partsOf = (x) => ({ ...x, shotStones: (x.colliders ?? 0) - (x.groundStones ?? 0), ground: (x.groundStones ?? 0) + (x.gravel ?? 0) });

// The numbers of one configuration, per repeat: each fight against the same place without it.
function digest(r) {
  const runs = r.runs ?? [];
  const has = (key) => runs.every((x) => x[key]);
  const loads = [...(has("four") ? ["four"] : []), "stress"];
  const d = { loads };
  for (const key of loads) {
    const pick = (fn) => runs.map((x) => fn(x[key], x.ref, x));
    const c = {
      combat: pick((x, ref) => x.combat.trimmed - ref.combat.trimmed),
      step: pick((x) => x.combatStep.trimmed),
      frame: pick((x) => x.combatFrame.trimmed),
      p90: pick((x) => x.combat.p90),
      max: pick((x) => x.combat.max),
      forced: pick((x) => x.parts.forced ?? 0),
      threats: pick((x, ref) => x.parts.threats - ref.parts.threats),
      layout: pick((x, ref) => x.layout.trimmed - ref.layout.trimmed),
      // (Handing combat's meshes to the card, paired in the stress case: the same meshes and
      // draw calls in the fight of four players.)
      meshScript: pick((x, ref, all) => all.stress.meshes?.script ?? null),
      total: pick((x, ref) => x.total.trimmed - ref.total.trimmed),
      world: pick((x, ref) => x.world.trimmed - ref.world.trimmed),
      draw: pick((x, ref) => x.draw.trimmed - ref.draw.trimmed),
      parts: Object.fromEntries([...STEP_PARTS, "step", "frame"].map((p) => [p, mid(pick((x) => partsOf(x.parts)[p]))])),
    };
    c.allIn = c.combat.map((v, i) => v + c.forced[i] + c.threats[i] + c.layout[i] + (c.meshScript[i] ?? 0));
    c.rest = c.parts.step - STEP_PARTS.reduce((sum, p) => sum + (c.parts[p] ?? 0), 0);
    c.verdict = { cpu: mid(c.combat), cpuOk: mid(c.combat) <= BUDGET.cpu, allIn: mid(c.allIn), allInOk: mid(c.allIn) <= BUDGET.cpu };
    d[key] = c;
  }
  // The card goes by combat's meshes shown against hidden, in the same frames, in the stress
  // case: the whole fight against the whole calm, timed seconds apart, drifts with whatever
  // else the card is doing (other pages, other programs) far more than combat costs.
  d.card = pooled(runs.flatMap((x) => x.stress.meshes?.diffs ?? []));
  d.cardRepeats = runs.map((x) => x.stress.meshes?.cost);
  d.aa = pooled(runs.flatMap((x) => x.stress.aa?.diffs ?? []));
  d.cardOk = d.card ? d.card.median <= BUDGET.gpu : false;
  d.cardSure = d.card ? d.card.high <= BUDGET.gpu : false;
  d.meshCalls = mid(runs.map((x) => x.stress.meshes?.calls));
  d.meshTriangles = mid(runs.map((x) => x.stress.meshes?.triangles));
  d.gpuRef = runs.map((x) => x.ref.b2b?.gpu);
  d.gpuFight = runs.map((x) => x.stress.b2b?.gpu);
  d.submitFight = runs.map((x) => x.stress.b2b?.submit);
  d.fullRef = runs.map((x) => x.ref.full);
  d.fullFight = runs.map((x) => x.stress.full);
  // The card was the bottleneck when drawing back to back took clearly longer than the
  // script needed to hand the frames over.
  d.gpuBound = mid(d.gpuFight) > 1.15 * mid(d.submitFight);
  return d;
}

// What each proposal saves (from the swaps timed in turns): the key in the report, the fight
// it was timed in, and what it is.
const PROPOSALS = [
  ["lookupHalf", "stress", "Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them)"],
  ["stoneCells", "stress", "The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell"],
  ["enemyCells", "stress", "The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach"],
  ["enemyArrays", "stress", "The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near)"],
  ["together", "stress", "Every other lookup, stone cells and enemy arrays together"],
  ["togetherFour", "four", "The same three together"],
  ["groundKept", "four", "The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step"],
  ["groundCells", "four", "A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered"],
  ["groundBoth", "four", "Both for the ground: gathered when the fish has moved, sorted into cells then"],
  ["allFour", "four", "Everything together: the three for the shots, both for the ground"],
];
const HUD_PARTS = [
  ["noBars", "the health bars (#foes, moved by transform since main's 96c98ec)"],
  ["noCombatHud", "all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar)"],
  ["noArrows", "the game's threat arrows (#threats, base game: Next's to change)"],
];

function summary(r) {
  const c = r.config;
  const d = digest(r);
  const lines = [];
  const loads = d.loads;
  const loadName = { stress: "stress case", four: "four players" };
  lines.push(`# Combat bench: ${c.renderer}, ${c.quality}`);
  lines.push("");
  lines.push(`${c.gpu} · ${c.renderer === "webgpu" ? "WebGPU" : "WebGL 2 (the fallback, ?webgl)"} · quality ${c.quality}${c.light ? " (light pools)" : ""} · canvas ${c.canvas.join("×")}, scene drawn at ${c.post.join("×")} · one step of ${f(c.dt * 1000, 1)} ms per frame · ${c.repeats} repeats of ${c.frames} frames, ${c.blocks ?? 24} blocks for everything timed in turns · three r${c.three} · clock step ${c.timerResolution} ms`);
  lines.push("");
  const L = r.load;
  const four = L.four ?? null;
  lines.push(
    `Place: s ${r.place.s}, u ${r.place.u}, water ${r.place.depth} u deep, a parr of ${r.place.length} u ${r.place.height != null ? `${r.place.height} u above the bed ` : ""}(the fish held there${r.place.held === true ? ", and held at its size to the end" : r.place.held === false ? ", **but it grew**" : ""}), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- ${four ? `${four.enemies} enemies firing their own guns at their own pace and ${four.shots} laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = ${f(L.boltLife, 2)} s at this size, and comes every ${f(L.boltInterval, 2)} s)` : "–"} -- and the **stress case**, ${L.stress?.enemies ?? L.enemies} enemies, ${L.stress?.shots ?? L.shots} players' shots and ${L.stress?.hostile ?? L.hostile} enemy rounds in flight (the bench fires the rounds, far more than the enemies do). ${Math.round(L.aimShare * 100)} % of the players' shots are aimed at an enemy, and the enemies have ${L.hpScale}× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.`,
  );
  // What was held.
  lines.push("");
  const counts = (key) => r.runs[0]?.[key]?.counts;
  const range = (k, x) => (x?.[k] ? `${f(x[k].mean, 0)} (${x[k].min}–${x[k].max})` : "–");
  const ev = (key, field, digits = 0) => f(mid(r.runs.map((x) => x[key]?.events?.[field])), digits);
  lines.push(
    table(
      ["held (first repeat: mean, min–max a frame)", ...loads.map((k) => loadName[k])],
      [
        ["enemies alive", ...loads.map((k) => range("enemies", counts(k)))],
        ["dead ones (cleared 0.5 s after the kill)", ...loads.map((k) => range("corpses", counts(k)))],
        ["simulated but not drawn (past a kind's crowd)", ...loads.map((k) => range("undrawn", counts(k)))],
        [`players' shots${L.capped ? " (the pool of this quality is full)" : ""}`, ...loads.map((k) => range("shots", counts(k)))],
        ["enemy rounds flying", ...loads.map((k) => range("flying", counts(k)))],
        ["… spent and sinking", ...loads.map((k) => range("spent", counts(k)))],
        ["… lying on the bed", ...loads.map((k) => range("rested", counts(k)))],
        ["glow points / bubbles", ...loads.map((k) => `${range("glow", counts(k))} / ${range("bubbles", counts(k))}`)],
        ["hits / kills a second (median of the repeats)", ...loads.map((k) => `${ev(k, "hitsPerSecond")} / ${ev(k, "killsPerSecond", 1)}`)],
        ["players' shots fired by the bench a second", ...loads.map((k) => ev(k, "firedPerSecond"))],
        ["enemy rounds fired a second: by the bench / by the enemies", ...loads.map((k) => `${ev(k, "roundsForcedPerSecond")} / ${ev(k, "roundsNaturalPerSecond")}`)],
      ],
    ),
  );

  // The verdict.
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  const verdict = (ok) => (ok ? "**within**" : "**over**");
  lines.push(
    `- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): ${interval(d.card)} ms against ${BUDGET.gpu} ms: ${verdict(d.cardOk)}${d.cardOk && !d.cardSure ? " at the median, not at the top of its interval" : ""}. Per repeat ${spread(d.cardRepeats, 3)} ms. The same method with nothing shown or hidden (A/A): ${interval(d.aa)} ms.`,
  );
  for (const key of loads) {
    const x = d[key];
    lines.push(
      `- **Script, ${loadName[key]}:** combat.step + combat.frame ${f(x.verdict.cpu, 3)} ms (repeats ${spread(x.combat, 3)}) against ${BUDGET.cpu} ms: ${verdict(x.verdict.cpuOk)}; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) ${f(x.verdict.allIn, 3)} ms (${spread(x.allIn, 3)}): ${verdict(x.verdict.allInOk)}. The slowest tenth of the frames take over ${f(mid(x.p90), 3)} ms for step and frame, the slowest ${f(mid(x.max), 3)} ms.`,
    );
  }

  lines.push("");
  lines.push("## Fight minus no fight");
  lines.push("");
  const col = (key, field, digits = 3) => (d[key] ? `${signed(mid(d[key][field]), digits)} (${spread(d[key][field], digits)})` : "–");
  lines.push(
    table(
      ["script, ms a frame (median of the repeats, their range)", ...loads.map((k) => loadName[k])],
      [
        ["combat.step + combat.frame", ...loads.map((k) => col(k, "combat"))],
        ["the firing the bench does for the game (projectiles.fire, the enemies' guns)", ...loads.map((k) => col(k, "forced"))],
        ["the threat list (signals.js, asked for by the game's own step)", ...loads.map((k) => col(k, "threats"))],
        ["the page's style and layout (fight against no fight)", ...loads.map((k) => col(k, "layout"))],
        ["handing combat's meshes to the card (paired, stress case)", ...loads.map((k) => col(k, "meshScript"))],
        ["**all of it**", ...loads.map((k) => col(k, "allIn"))],
        ["(seconds apart, noisy:) the frame's whole script", ...loads.map((k) => col(k, "total", 2))],
        ["(seconds apart, noisy:) … of it the draw's script", ...loads.map((k) => col(k, "draw", 2))],
      ],
    ),
  );
  lines.push("");
  lines.push(
    `Script times are means of the middle 80 % of the frames (the clock steps by ${c.timerResolution} ms), the firing and the threat list plain means. Card: combat's meshes add ${signed(d.meshCalls, 0)} draw calls and ${signed(d.meshTriangles, 0)} triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back ${f(mid(d.gpuRef))} → ${f(mid(d.gpuFight))} ms, whole frames back to back ${f(mid(d.fullRef))} → ${f(mid(d.fullFight))} ms.`,
  );
  lines.push("");
  const gpuNote = d.gpuBound
    ? "The card, not the script, held up the frames drawn back to back."
    : `The script held up the frames drawn back to back (${f(mid(d.submitFight))} ms to hand one over against ${f(mid(d.gpuFight))} ms in all), so the card's numbers are upper bounds.`;
  const how = c.renderer === "webgpu" ? "WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone()." : "WebGL 2: frames drawn back to back, then gl.finish() and a pixel read back (EXT_disjoint_timer_query_webgl2 is recorded in the report but not used: per frame on ANGLE's Metal it reads high).";
  const env = r.environment;
  const busy = env ? ` While it ran (${f(env.minutes, 0)} minutes), ${env.otherChromes} other headless Chromes were open on this machine (load ${env.load.map((v) => v.toFixed(1)).join(" / ")}): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.` : "";
  lines.push(`How: ${how} ${gpuNote}${busy}`);

  // Where the script's time goes.
  lines.push("");
  lines.push("## Where combat's script time goes (ms a frame, plain means, median of the repeats)");
  lines.push("");
  const units = (key) => {
    const cnt = (k) => mid(r.runs.map((x) => x[key].counts[k]?.mean ?? 0));
    return { projectiles: [cnt("shots"), "a shot"], enemies: [cnt("enemies") + cnt("corpses"), "an enemy"], hostile: [cnt("flying") + cnt("spent") + cnt("rested"), "a round"] };
  };
  const unit = (key, p) => {
    const u = units(key)[p];
    return u && u[0] ? `${f((d[key].parts[p] / u[0]) * 1000, 2)} µs ${u[1]}` : "";
  };
  const share = (key, v) => `${f((100 * v) / (d[key].parts.step + d[key].parts.frame), 0)} %`;
  lines.push(
    table(
      ["part", ...loads.flatMap((k) => [loadName[k], "share", "per unit"])],
      [
        ...STEP_PARTS.map((p) => [PART_NAMES[p], ...loads.flatMap((k) => [f(d[k].parts[p], 3), share(k, d[k].parts[p]), unit(k, p)])]),
        ["rest of combat.step (firing, bosses, rules, fx.update, gore.update, corpses)", ...loads.flatMap((k) => [f(d[k].rest, 3), share(k, d[k].rest), ""])],
        ["combat.frame (hud and health bars, fx.begin/add/end, models, gore.frame)", ...loads.flatMap((k) => [f(d[k].parts.frame, 3), share(k, d[k].parts.frame), ""])],
        ["combat.step + combat.frame", ...loads.flatMap((k) => [f(d[k].parts.step + d[k].parts.frame, 3), "100 %", ""])],
      ],
    ),
  );
  const l = r.lookups;
  if (l) {
    lines.push("");
    lines.push(
      `The river lookups on their own (µs a call, on the stress case as it stood: ${l.shots} shots, ${l.enemies} enemies): a shot's locate + bed + level ${f(l.shotLookup)} (locate ${f(l.locate)}, bed ${f(l.bed)}, level ${f(l.level)}); an enemy's current + locate + bed + level ${f(l.enemyLookup)} (current ${f(l.current)}); terrain.collidersNear ${f(l.collidersNear, 3)} ms a call, ${l.stones} stones returned.`,
    );
  }
  const lab = r.rounds;
  if (lab) {
    const st = lab.states ?? {};
    const ok = (s, want) => (st[s] ? (st[s][want] === lab.n ? "" : ` (only ${st[s][want]} of ${lab.n} got there)`) : "");
    lines.push("");
    lines.push(
      `On lists of their own (${lab.n} at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish ${f(lab.flying, 3)}, spent and sinking ${f(lab.spent, 3)}${ok("spent", "spent")}, lying on the bed ${f(lab.rested, 3)}${ok("rested", "rested")}; a players' shot flying along the river ${f(lab.shot, 3)}, without the bed and surface lookup ${f(lab.shotNoLookup, 3)} (tested against ${lab.stones} stones and the enemies of the fight).`,
    );
  }

  // The proposals.
  const s = r.swaps;
  if (s) {
    lines.push("");
    lines.push("## What the proposals save (timed in turns)");
    lines.push("");
    lines.push(
      `Each variant against what it replaces, in ${c.blocks ?? 32} blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: ${signed(s.copy?.median, 3)} ms (${f(s.copy?.low, 3)} … ${f(s.copy?.high, 3)}). Every variant gives the same hits, stones, grounds and heights as the code it stands for.`,
    );
    lines.push("");
    lines.push(
      table(
        ["proposal", "fight", "change of combat.step (ms)", "middle half"],
        PROPOSALS.filter(([key]) => s[key]).map(([key, load, text]) => [text, loadName[load], signed(s[key].median, 3), `${f(s[key].low, 3)} … ${f(s[key].high, 3)}`]),
      ),
    );
  }
  const h = r.hud;
  if (h?.noBars) {
    lines.push("");
    lines.push("The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):");
    lines.push("");
    lines.push(table(["taken off", "style and layout", "middle half"], HUD_PARTS.filter(([key]) => h[key]).map(([key, text]) => [text, signed(h[key].median, 3), `${f(h[key].low, 3)} … ${f(h[key].high, 3)}`])));
  }
  const sh = r.shapes;
  if (sh?.asItIs?.length) {
    const avg = (list, key) => list.reduce((sum, x) => sum + (x[key] ?? 0), 0) / list.length;
    lines.push("");
    lines.push(
      `Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step ${f(avg(sh.oneShape, "combatStep"), 3)} against ${f(avg(sh.asItIs, "combatStep"), 3)} ms, enemies.update ${f(avg(sh.oneShape, "enemies"), 3)} against ${f(avg(sh.asItIs, "enemies"), 3)}, projectiles.update ${f(avg(sh.oneShape, "projectiles"), 3)} against ${f(avg(sh.asItIs, "projectiles"), 3)}.`,
    );
  }

  // Allocation.
  const hs = r.heapSampling;
  lines.push("");
  lines.push("## What the script allocates (stress case)");
  lines.push("");
  if (hs) {
    lines.push(
      `Chrome's sampling heap profiler over ${hs.frames} frames, counting what the collector had already taken too: ${f(hs.totalKB, 0)} KB a frame in all; within ${Object.entries(hs.withinKB)
        .map(([k, v]) => `${k} ${f(v, 1)}`)
        .join(", ")} KB (callees included). Where it is allocated (KB a frame, the site itself):`,
    );
    lines.push("");
    lines.push(table(["site", "KB a frame"], hs.sites.map((x) => [x.site, f(x.kb, 1)])));
  } else lines.push("Not sampled (the bench was not run by tools/fv-bench.mjs).");

  // The card's parts.
  if (r.groups) {
    lines.push("");
    lines.push("## Combat's meshes (stress case, each part shown against hidden)");
    lines.push("");
    lines.push(table(["part", "draw calls", "triangles"], Object.entries(r.groups).map(([k, v]) => [k, signed(v.calls, 0), signed(v.triangles, 0)])));
    lines.push("");
    lines.push("(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)");
  }

  // Scaling.
  if (r.scaled?.length) {
    lines.push("");
    lines.push("## The fight scaled (one measurement each: for the shape of the growth)");
    lines.push("");
    lines.push(
      table(
        ["enemies", "shots (held)", "enemy rounds asked / flying / spent / on the bed", "combat.step", "combat.frame", "enemies", "projectiles", "hostile", "draw calls", "hits/s", "kills/s"],
        r.scaled.map((x) => [
          x.load.empty ? "0 (combat running empty)" : `${x.load.enemies} (${f(x.counts.enemies.mean, 0)}${x.counts.undrawn?.mean ? `, ${f(x.counts.undrawn.mean, 0)} not drawn` : ""})`,
          `${x.load.shots} (${f(x.counts.shots.mean, 0)}${x.capped ? ", pool full" : ""})`,
          `${x.load.hostile} / ${f(x.counts.flying.mean, 0)} / ${f(x.counts.spent.mean, 0)} / ${f(x.counts.rested?.mean, 0)}`,
          f(x.combatStep, 3),
          f(x.combatFrame, 3),
          f(x.parts.enemies, 3),
          f(x.parts.projectiles, 3),
          f(x.parts.hostile, 3),
          x.calls == null ? "–" : signed(x.calls, 0),
          f(x.events.hitsPerSecond, 0),
          f(x.events.killsPerSecond, 1),
        ]),
      ),
    );
    const byEnemies = r.scaled.filter((x) => x.load.shots === 150 && x.load.hostile === 60 && !x.load.empty).map((x) => [x.counts.enemies.mean, x.parts.enemies]);
    const fit = byEnemies.length >= 3 ? quadratic(byEnemies) : null;
    if (fit) {
      lines.push("");
      lines.push(`enemies.update ≈ ${f(fit[0], 3)} + ${f(fit[1] * 1000, 2)} µs·n + ${f(fit[2] * 1000, 3)} µs·n² (n enemies alive): at 40 that is ${f(fit[1] * 40 * 1000, 0)} µs growing with the number and ${f(fit[2] * 1600 * 1000, 0)} µs growing with its square (the pairs of separate() and striking()).`);
    }
    const byShots = r.scaled.filter((x) => x.load.enemies === 40 && x.load.hostile === 60).sort((a, b) => a.counts.shots.mean - b.counts.shots.mean);
    if (byShots.length >= 2) {
      const [a, b] = [byShots[0], byShots.at(-1)];
      lines.push("");
      lines.push(`projectiles.update grows by ${f(((b.parts.projectiles - a.parts.projectiles) / (b.counts.shots.mean - a.counts.shots.mean)) * 1000, 2)} µs a shot at 40 enemies (${f(a.counts.shots.mean, 0)} → ${f(b.counts.shots.mean, 0)} shots).`);
    }
    lines.push("");
    lines.push("(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)");
  }

  // The spent rounds.
  if (r.soak?.length) {
    lines.push("");
    lines.push(`## Enemy rounds over ${r.soak.length} s of the fight of four players, the fish held low over the bed`);
    lines.push("");
    const every = r.soak.filter((x, i) => i === 0 || x.t % 5 === 0);
    lines.push(table(["s", "fired in that second", "flying", "spent, sinking", "on the bed", "oldest spent (s)", "longest on the bed (s)", "hostile.update (ms)", "combat.step (ms)", "enemies (dead)", "heap (MB)"], every.map((x) => [x.t, x.fired ?? "–", x.flying, x.spent, x.rested, f(x.oldest, 1), f(x.longestRest, 1), f(x.hostile, 3), f(x.combatStep, 3), `${x.enemies ?? "–"} (${x.corpses ?? "–"})`, x.heapMB ?? "–"])));
    const most = Math.max(...r.soak.map((x) => x.flying + x.spent + x.rested));
    const restedMost = Math.max(...r.soak.map((x) => x.rested));
    const restedSeconds = r.soak.filter((x) => x.rested > 0).length;
    const longest = Math.max(...r.soak.map((x) => x.longestRest ?? 0));
    const rate = r.soak.reduce((sum, x) => sum + (x.fired ?? 0), 0) / r.soak.length;
    const hostileMid = mid(r.soak.map((x) => x.hostile));
    lines.push("");
    lines.push(
      `The enemies fired ${f(rate, 1)} rounds a second on their own. The list held at most ${most} rounds (capacity ${c.light ? 90 : 160}); ${restedMost ? `up to ${restedMost} lay on the bed at once, in ${restedSeconds} of ${r.soak.length} seconds, the longest ${f(longest, 1)} s (they go after 8 s there, or at 12 s old)` : "none came down on the bed"}. hostile.update took ${f(hostileMid, 3)} ms a step (median of the seconds). Nothing piles up without bound.`,
    );
  }

  // What the page said.
  const errors = [...(r.errors ?? []), ...(r.console?.errors ?? [])];
  const warnings = r.console?.warnings ?? [];
  lines.push("");
  lines.push("## Console");
  lines.push("");
  lines.push(errors.length ? `${errors.length} errors:\n\n${errors.slice(0, 8).map((e) => `- ${e.replace(/\n/g, " ")}`).join("\n")}` : "No errors.");
  if (warnings.length) lines.push(`\n${warnings.length} different warnings:\n\n${warnings.slice(0, 8).map((w) => `- ${w.replace(/\n/g, " ")}`).join("\n")}`);
  if (warnings.some((w) => /index count of 0/.test(w))) lines.push("\n(The draws with an index count of 0 come from the base game's warm-up render at start-up -- two transparent objects with an empty index in each pass, the mirror's too, which never sees combat -- not from combat.)");
  const aside = r.console?.environment ?? [];
  if (aside.length) lines.push(`\nLeft aside, the development server's and not the game's:\n\n${aside.map((w) => `- ${w}`).join("\n")}`);
  lines.push("");
  lines.push(`Pictures: bench-${c.renderer}-${c.quality}-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).`);
  return { text: lines.join("\n") + "\n", digest: d, errors: errors.length };
}

async function summaries(list) {
  // (A run that failed before the page wrote anything leaves no folder to write into.)
  await mkdir(out, { recursive: true });
  const all = [];
  for (const config of list) {
    const name = `bench-${config}`;
    if (failures.has(config)) {
      all.push({ config, failed: `in this run: ${failures.get(config)}` });
      continue;
    }
    let report;
    try {
      report = JSON.parse(await readFile(join(out, `${name}.json`), "utf8"));
    } catch {
      continue;
    }
    if (!report.runs?.length) {
      all.push({ config, failed: report.errors?.[0] ?? "no measurements" });
      continue;
    }
    const s = summary(report);
    await writeFile(join(out, `${name}.md`), s.text);
    all.push({ config, report, ...s });
  }
  const done = all.filter((a) => !a.failed);
  const lines = ["# Combat bench", ""];
  lines.push(
    `Budget for all of combat: at most ${BUDGET.gpu} ms on the card and ${BUDGET.cpu} ms of script a frame, on WebGPU, WebGL 2 and Eco. Two fights in one place: **four players** as the game can have them today (40 enemies firing their own guns, as many laser bolts as four players firing without pause keep in the water) and a **stress case** (40 enemies, 150 players' shots, 60 enemy rounds held in flight). Fight minus the same place without it, median of the repeats (their range in brackets). Card: combat's meshes shown against hidden in turns in the stress case, all pairs of the repeats pooled, with the 95 % interval of the median and the same method on nothing (A/A). "All of it": combat.step + combat.frame and everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card).`,
  );
  lines.push("");
  lines.push(
    table(
      ["configuration", "card (ms)", "card A/A (ms)", "four players: step + frame", "four players: all of it", "stress: step + frame", "stress: all of it", "combat's draw calls / triangles", "errors"],
      all.map((a) => {
        if (a.failed) return [a.config, `failed: ${String(a.failed).split("\n")[0].slice(0, 80)}`, "–", "–", "–", "–", "–", "–", "–"];
        const d = a.digest;
        const cell = (key, field) => (d[key] ? `${f(mid(d[key][field]), 3)} (${spread(d[key][field], 3)})` : "–");
        return [
          a.config,
          d.card ? `${f(d.card.median, 3)} (${f(d.card.low, 3)} … ${f(d.card.high, 3)})${d.gpuBound ? "" : " ≤"}` : "–",
          d.aa ? `${signed(d.aa.median, 3)} (${f(d.aa.low, 3)} … ${f(d.aa.high, 3)})` : "–",
          cell("four", "combat"),
          cell("four", "allIn"),
          cell("stress", "combat"),
          cell("stress", "allIn"),
          `${signed(d.meshCalls, 0)} / ${signed(d.meshTriangles, 0)}`,
          a.errors,
        ];
      }),
    ),
  );
  lines.push("");
  lines.push("(≤: the script, not the card, held up the frames drawn back to back, so the card's number is an upper bound.) Details: bench-<configuration>.md.");
  lines.push("");
  lines.push("## Verdicts");
  lines.push("");
  const ok = (v) => (v ? "within" : "**over**");
  for (const a of done) {
    const d = a.digest;
    const parts = [`card ${ok(d.cardOk)}${d.cardOk && !d.cardSure ? " (at the median; the top of its interval is over)" : ""}`];
    for (const key of d.loads) parts.push(`${key === "four" ? "four players" : "stress case"}: step + frame ${ok(d[key].verdict.cpuOk)}, all of it ${ok(d[key].verdict.allInOk)}`);
    lines.push(`- **${a.config}:** ${parts.join("; ")}.`);
  }
  // Where the time goes, per configuration: the biggest parts of step + frame and outside it.
  lines.push("");
  lines.push("## Where the script's time goes (ms a frame: four players / stress case)");
  lines.push("");
  const pieces = [
    ["projectiles.update", (x) => x.parts.projectiles],
    ["enemies.update", (x) => x.parts.enemies],
    ["hostile.update", (x) => x.parts.hostile],
    ["the crawlers' ground gathered (collidersNear, pebbles.near)", (x) => x.parts.ground],
    ["the stones for the shots (collidersNear)", (x) => x.parts.shotStones],
    ["aim, director, pickups", (x) => x.parts.aim + x.parts.director + x.parts.pickups],
    ["rest of combat.step", (x) => x.rest],
    ["combat.frame", (x) => x.parts.frame],
    ["firing done for the game by the bench", (x) => mid(x.forced)],
    ["the threat list", (x) => mid(x.threats)],
    ["style and layout", (x) => mid(x.layout)],
    ["handing combat's meshes to the card", (x) => mid(x.meshScript)],
  ];
  lines.push(
    table(
      ["part", ...done.map((a) => a.config)],
      pieces.map(([label, fn]) => [label, ...done.map((a) => a.digest.loads.map((k) => f(fn(a.digest[k]), 3)).join(" / "))]),
    ),
  );
  // What the proposals save, per configuration.
  lines.push("");
  lines.push("## What the proposals save (ms a frame of combat.step, timed in turns)");
  lines.push("");
  const saving = (x) => (x ? `${signed(x.median, 3)} (${f(x.low, 3)} … ${f(x.high, 3)})` : "–");
  const fightName = { stress: "stress case", four: "four players" };
  lines.push(
    table(
      ["proposal", "fight", ...done.map((a) => a.config)],
      [
        ["(check: the copy of projectiles.update against the original)", fightName.stress, ...done.map((a) => saving(a.report.swaps?.copy))],
        ...PROPOSALS.map(([key, load, text]) => [text, fightName[load], ...done.map((a) => saving(a.report.swaps?.[key]))]),
        ...HUD_PARTS.map(([key, text]) => [`Style and layout without ${text}`, fightName.stress, ...done.map((a) => saving(a.report.hud?.[key]))]),
      ],
    ),
  );
  lines.push("");
  lines.push("(Median change with the middle half of the blocks; negative saves. The variants for the shots are timed against a plain copy of projectiles.update. Taking a part of the HUD off the page is the most that writing it by transform alone could save.)");
  // Notes written by hand are kept.
  let notes = "";
  try {
    const before = await readFile(join(out, "summary.md"), "utf8");
    const at = before.indexOf("\n## Notes");
    if (at >= 0) notes = before.slice(at);
  } catch {}
  await writeFile(join(out, "summary.md"), lines.join("\n") + "\n" + notes);
  return all;
}

let code = 0;
if (!args.includes("--summary-only"))
  try {
    await run();
  } catch (error) {
    console.error(String(error?.stack ?? error));
    for (const config of configs) if (!finished.includes(config) && !failures.has(config)) failures.set(config, String(error?.message ?? error));
    code = 1;
  }
const all = await summaries(configs);
for (const a of all)
  console.log(
    a.failed
      ? `${a.config}: failed (${String(a.failed).split("\n")[0]})`
      : `${a.config}: card ${f(a.digest.card?.median, 3)} ms; four players ${f(a.digest.four?.verdict.cpu, 3)} ms (all of it ${f(a.digest.four?.verdict.allIn, 3)}), stress ${f(a.digest.stress.verdict.cpu, 3)} ms (all of it ${f(a.digest.stress.verdict.allIn, 3)}); ${a.errors} errors`,
  );
console.log(`shots/${set}/summary.md`);
process.exit(code || (all.length === configs.length && all.every((a) => !a.failed && !a.errors) ? 0 : 1));
