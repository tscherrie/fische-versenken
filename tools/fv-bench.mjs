// The combat bench: what Extreme's combat costs a frame, against its budget (all of it at most
// 1.5 ms on the graphics card and 1 ms of script), on WebGPU, on the WebGL 2 fallback and at
// the Eco quality. It runs the scene "bench" of src/fv/dev/scenes-look.js once per renderer
// and quality in a Chrome of its own without a window, on the real graphics card:
//
//   node tools/fv-bench.mjs [--set bench] [--configs webgpu-detail,webgl2-detail,webgpu-eco]
//                           [--repeats 5] [--frames 120] [--soak 45] [--no-sweep]
//                           [--aim 0.12] [--hp 4] [--port 8170] [--headed] [--summary-only]
//
// Each configuration leaves shots/<set>/bench-<config>.json (every number), a summary
// bench-<config>.md and two pictures (-kampf with the fight, -ohne without); summary.md puts
// the verdicts side by side. The development server is started on --port if it is not
// running yet, and Chrome's debugging port is the one above it: through it the bench loads
// each configuration and hears everything the page writes to its console.
// --summary-only writes the summaries again from the reports already there.

import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
const debugPort = port + 1;
const configs = option("configs", "webgpu-detail,webgl2-detail,webgpu-eco").split(",");
const BUDGET = { gpu: 1.5, cpu: 1 };
const out = join(root, "shots", set);

for (const c of configs)
  if (!/^(webgpu|webgl2)-(eco|balanced|detail|ultra)$/.test(c)) {
    console.error(`unknown configuration ${c} (renderer-quality, e.g. webgl2-eco)`);
    process.exit(1);
  }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Running the page.

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

// A connection to one page over Chrome's debugging protocol.
async function devtools() {
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
  const waiting = new Map();
  const listeners = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    } else if (message.method) for (const listen of listeners) listen(message);
  };
  return {
    send(method, params = {}) {
      return new Promise((ok) => {
        waiting.set(++id, ok);
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    on: (listen) => listeners.push(listen),
    close: () => socket.close(),
  };
}

// What the page said: errors and warnings from its console, uncaught exceptions, and the
// browser's own messages about it (failed loads, WebGL and WebGPU complaints).
function listen(page, sink) {
  page.on(({ method, params }) => {
    if (method === "Runtime.consoleAPICalled" && (params.type === "error" || params.type === "warning" || params.type === "assert")) {
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

// Who else is using the machine, and so the card: other headless Chromes (other sessions'
// tests) and the load.
function environment(own) {
  const others = new Set();
  try {
    for (const line of execFileSync("ps", ["-axo", "command"], { encoding: "utf8" }).split("\n")) {
      const dir = line.includes("--headless") && line.match(/--user-data-dir=(\S+)/)?.[1];
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

function benchURL(config) {
  const [rendererName, quality] = config.split("-");
  // (As scenes.js's sceneURL, but with the renderer and the quality of this configuration.)
  const q = new URLSearchParams({ capture: "1", seed: "7", day: "still", rain: "0", quality, fvtest: set, scene: scene.name, only: scene.name, stage: scene.stage, at: String(scene.at), season: scene.season, hour: String(scene.hour), xname: `bench-${config}` });
  q.set("new", "");
  if (rendererName === "webgl2") q.set("webgl", "");
  for (const key of ["repeats", "frames", "soak", "aim", "hp"]) if (option(key) !== null) q.set(`x${key}`, option(key));
  if (args.includes("--no-sweep")) q.set("xsweep", "0");
  return `http://localhost:${port}/?${q}`;
}

const { LOOK_SCENES } = await import(join(root, "src/fv/dev/scenes-look.js"));
const scene = LOOK_SCENES.find((s) => s.name === "bench");

async function run() {
  let server = null;
  if (!(await reachable(`http://localhost:${port}/`))) {
    server = spawn(process.execPath, [join(root, "tools/capture-server.mjs"), String(port)], { stdio: "ignore" });
    for (let i = 0; i < 50 && !(await reachable(`http://localhost:${port}/`)); i++) await sleep(100);
  }
  const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const profile = await mkdtemp(join(tmpdir(), "extreme-bench-"));
  const chrome = spawn(
    CHROME,
    [
      ...(args.includes("--headed") ? [] : ["--headless=new"]),
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debugPort}`,
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
      // (The heap's size to the byte, for what a frame leaves for the collector.)
      "--enable-precise-memory-info",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const console_ = { current: null };
  const finished = [];
  try {
    const page = await devtools();
    listen(page, console_);
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    await page.send("Page.enable");
    // A page of exactly 1280×720, whatever the headless window keeps for itself.
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    for (const config of configs) {
      const name = `bench-${config}`;
      const file = join(out, `${name}.json`);
      const heard = (console_.current = { errors: [], warnings: [], environment: [] });
      const before = environment(profile);
      const started = Date.now();
      console.log(`${name}: running`);
      await page.send("Page.navigate", { url: benchURL(config) });
      let done = false;
      while (!done && Date.now() - started < 30 * 60 * 1000) {
        await sleep(1000);
        done = (await modified(file)) > started;
      }
      if (!done) {
        console.error(`${name}: no report after 30 minutes`);
        continue;
      }
      // (The pictures are taken last; the report follows them, so everything is in.)
      await sleep(500);
      const report = JSON.parse(await readFile(file, "utf8"));
      report.console = { errors: [...new Set(heard.errors)], warnings: [...new Set(heard.warnings)], environment: [...new Set(heard.environment)] };
      const after = environment(profile);
      report.environment = { otherChromes: Math.max(before.otherChromes, after.otherChromes), load: after.load };
      await writeFile(file, JSON.stringify(report, null, 1));
      console.log(`${name}: done in ${((Date.now() - started) / 1000).toFixed(0)} s, ${report.errors.length + report.console.errors.length} errors`);
      finished.push(config);
    }
    await page.send("Page.navigate", { url: "about:blank" });
    page.close();
  } finally {
    const closed = new Promise((r) => chrome.once("exit", r));
    chrome.kill();
    await Promise.race([closed, sleep(5000)]);
    server?.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
  return finished;
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

// The numbers of one configuration: per repeat, the fight minus the same place without it.
function digest(r) {
  const runs = r.runs ?? [];
  const pick = (fn) => runs.map(fn);
  const d = {
    gpuRef: pick((x) => x.ref.b2b.gpu),
    gpuFight: pick((x) => x.stress.b2b.gpu),
    submitFight: pick((x) => x.stress.b2b.submit),
    fullRef: pick((x) => x.ref.full),
    fullFight: pick((x) => x.stress.full),
    combatRef: pick((x) => x.ref.combat.trimmed),
    combatFight: pick((x) => x.stress.combat.trimmed),
    stepFight: pick((x) => x.stress.combatStep.trimmed),
    frameFight: pick((x) => x.stress.combatFrame.trimmed),
    p90Fight: pick((x) => x.stress.combat.p90),
    totalRef: pick((x) => x.ref.total.trimmed),
    totalFight: pick((x) => x.stress.total.trimmed),
    layoutRef: pick((x) => x.ref.layout?.trimmed),
    layoutFight: pick((x) => x.stress.layout?.trimmed),
    heapRef: pick((x) => x.ref.heapKB?.trimmed),
    heapFight: pick((x) => x.stress.heapKB?.trimmed),
    drawRef: pick((x) => x.ref.draw.trimmed),
    drawFight: pick((x) => x.stress.draw.trimmed),
    worldRef: pick((x) => x.ref.world.trimmed),
    worldFight: pick((x) => x.stress.world.trimmed),
    callsRef: pick((x) => x.ref.calls),
    callsFight: pick((x) => x.stress.calls),
    trisRef: pick((x) => x.ref.triangles),
    trisFight: pick((x) => x.stress.triangles),
    glRef: pick((x) => x.ref.glTimer?.median),
    glFight: pick((x) => x.stress.glTimer?.median),
    meshesShown: pick((x) => x.stress.meshes?.shown),
    meshesHidden: pick((x) => x.stress.meshes?.hidden),
    meshes: pick((x) => x.stress.meshes?.cost),
  };
  const delta = (a, b) => d[b].map((v, i) => v - d[a][i]);
  d.gpu = delta("gpuRef", "gpuFight");
  d.full = delta("fullRef", "fullFight");
  d.combat = delta("combatRef", "combatFight");
  d.total = delta("totalRef", "totalFight");
  d.draw = delta("drawRef", "drawFight");
  d.layout = delta("layoutRef", "layoutFight");
  d.heap = delta("heapRef", "heapFight");
  d.world = delta("worldRef", "worldFight");
  d.calls = delta("callsRef", "callsFight");
  d.tris = delta("trisRef", "trisFight");
  d.gl = delta("glRef", "glFight");
  // The card's verdict goes by combat's meshes shown against hidden, in the same frames: the
  // whole fight against the whole calm, timed seconds apart, drifts with whatever else the
  // card is doing (other pages, other programs) far more than combat costs.
  d.verdict = { gpu: mid(d.meshes), cpu: mid(d.combat), gpuOk: mid(d.meshes) <= BUDGET.gpu, cpuOk: mid(d.combat) <= BUDGET.cpu, total: mid(d.total), totalOk: mid(d.total) <= BUDGET.cpu };
  // The card was the bottleneck when drawing back to back took clearly longer than the
  // script needed to hand the frames over.
  d.gpuBound = mid(d.gpuFight) > 1.15 * mid(d.submitFight);
  return d;
}

function summary(r) {
  const c = r.config;
  const d = digest(r);
  const lines = [];
  const counts = r.runs[0]?.stress.counts;
  const events = r.runs.map((x) => x.stress.events);
  lines.push(`# Combat bench: ${c.renderer}, ${c.quality}`);
  lines.push("");
  lines.push(`${c.gpu} · ${c.renderer === "webgpu" ? "WebGPU" : "WebGL 2 (the fallback, ?webgl)"} · quality ${c.quality}${c.light ? " (light pools)" : ""} · canvas ${c.canvas.join("×")}, scene drawn at ${c.post.join("×")} · one step of ${f(c.dt * 1000, 1)} ms per frame · ${c.repeats} repeats of ${c.frames} frames · three r${c.three} · clock step ${c.timerResolution} ms`);
  lines.push("");
  lines.push(`Place: s ${r.place.s}, u ${r.place.u}, water ${r.place.depth} u deep, a parr of ${r.place.length} u; camera fixed behind and above it. The fight is kept at ${r.load.enemies} enemies, ${r.load.shots} players' shots and ${r.load.hostile} enemy shots in flight, topped up before every step; ${Math.round(r.load.aimShare * 100)} % of the players' shots are aimed at an enemy, and the enemies have ${r.load.hpScale}× their hit points, which keeps the kills to a rate a fight of four players might see. Without the fight, combat's step and frame are not run at all.`);
  if (counts) {
    const range = (k) => `${f(counts[k].mean, 0)} (${counts[k].min}–${counts[k].max})`;
    lines.push("");
    lines.push(`Held in the first repeat (mean, min–max per frame): enemies alive ${range("enemies")}, dead ones ${range("corpses")}, players' shots ${range("shots")}${r.load.capped ? " (the pool of this quality is full)" : ""}, enemy shots flying ${range("flying")}, spent and sinking ${range("spent")}, lying on the bed ${range("rested")}, glow points ${range("glow")}, bubbles ${range("bubbles")}; ${f(mid(events.map((e) => e.hitsPerSecond)), 0)} hits and ${f(mid(events.map((e) => e.killsPerSecond)), 1)} kills a second, and ${f(mid(events.map((e) => e.firedPerSecond)), 0)} players' shots fired a second to keep their number up (medians of the repeats).`);
  }
  lines.push("");
  lines.push("## Fight minus no fight");
  lines.push("");
  const row = (label, a, b, delta, digits = 2) => [label, f(mid(a), digits), f(mid(b), digits), signed(mid(delta), digits), spread(delta, digits)];
  const rows = [
    ["Card: combat's meshes, shown against hidden (ms)", "–", "–", signed(mid(d.meshes), 3), spread(d.meshes, 3)],
    row("Card: whole fight against no fight, back to back (ms)", d.gpuRef, d.gpuFight, d.gpu),
    row("Whole frames back to back, script and card (ms)", d.fullRef, d.fullFight, d.full),
    row("combat.step + combat.frame (ms)", d.combatRef, d.combatFight, d.combat, 3),
    row("Script of the frame: world step + combat.frame + draw (ms)", d.totalRef, d.totalFight, d.total),
    row("… of it the world step, with combat.step (ms)", d.worldRef, d.worldFight, d.world),
    row("… of it the page's style and layout (ms)", d.layoutRef, d.layoutFight, d.layout, 3),
    row("… of it the draw's script (ms)", d.drawRef, d.drawFight, d.draw),
    row("Left on the heap a frame (KB)", d.heapRef, d.heapFight, d.heap, 0),
    row("Draw calls", d.callsRef, d.callsFight, d.calls, 0),
    row("Triangles", d.trisRef, d.trisFight, d.tris, 0),
  ];
  if (c.glTimer) rows.splice(1, 0, row("Card, WebGL timer query per frame (ms)", d.glRef, d.glFight, d.gl));
  lines.push(table(["", "no fight", "fight", "difference", "difference over the repeats"], rows));
  lines.push("");
  lines.push(`Script times are means of the middle 80 % of the frames (the clock steps by ${c.timerResolution} ms), the parts below plain means. combat.step alone ${f(mid(d.stepFight), 3)} ms, combat.frame ${f(mid(d.frameFight), 3)} ms; the slowest tenth of the frames take over ${f(mid(d.p90Fight), 3)} ms for both.`);
  lines.push("");
  const gpuNote = d.gpuBound
    ? "The card, not the script, held up the frames drawn back to back."
    : `The script held up the frames drawn back to back (${f(mid(d.submitFight))} ms to hand one over against ${f(mid(d.gpuFight))} ms in all), so the card's numbers are upper bounds.`;
  const how = c.renderer === "webgpu" ? "WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone()." : c.glTimer ? "WebGL 2: EXT_disjoint_timer_query_webgl2 per frame, and frames drawn back to back, then gl.finish()." : "WebGL 2 without EXT_disjoint_timer_query_webgl2 here: frames drawn back to back, then gl.finish() and a pixel read back -- time measured by the processor's clock, not the card's.";
  const env = r.environment;
  const busy = env ? ` While it ran, ${env.otherChromes} other headless Chromes were open on this machine (load ${env.load.map((v) => v.toFixed(1)).join(" / ")}): they share the card, which is why the whole fight against the whole calm, seconds apart, scatters so, and why the card's verdict goes by combat's meshes shown and hidden in turn, in batches of a few frames, the median of the paired differences.` : "";
  lines.push(`How: ${how} ${gpuNote}${busy}`);
  lines.push("");
  const verdict = (ok) => (ok ? "**within**" : "**over**");
  lines.push(`**Verdict:** card ${f(d.verdict.gpu, 3)} ms against ${BUDGET.gpu} ms: ${verdict(d.verdict.gpuOk)}; script (combat.step + combat.frame) ${f(d.verdict.cpu, 3)} ms against ${BUDGET.cpu} ms: ${verdict(d.verdict.cpuOk)}. With what the fight adds to the world step, the page's layout and the draw's script, the frame's script grows by ${f(d.verdict.total)} ms (${verdict(d.verdict.totalOk)} the 1 ms, counted that way).`);

  // Where the script's time goes.
  lines.push("");
  lines.push("## Where combat's script time goes (ms per frame, median of the repeats)");
  lines.push("");
  const parts = ["enemies", "projectiles", "hostile", "aim", "director", "colliders"];
  const partNames = { enemies: "enemies.update (thinking, moving, drawing the crowds)", projectiles: "projectiles.update (with hits: enemies.hit, gore.hit, fx.burst)", hostile: "hostile.update (enemy shots, with hits on the player)", aim: "aim.update", director: "director.update", colliders: "terrain.collidersNear (stones for the shots)" };
  const part = (p) => mid(r.runs.map((x) => x.stress.parts[p]));
  const partValues = Object.fromEntries(parts.map((p) => [p, part(p)]));
  const stepMid = mid(d.stepFight);
  const rest = stepMid - parts.reduce((s, p) => s + partValues[p], 0);
  const share = (v) => `${f((100 * v) / mid(d.combatFight), 0)} %`;
  const meshScript = mid(r.runs.map((x) => x.stress.meshes?.script));
  lines.push(
    table(
      ["part", "ms", "share of combat.step + frame"],
      [
        ...parts.map((p) => [partNames[p], f(partValues[p], 3), share(partValues[p])]),
        ["rest of combat.step (firing, bosses, rules, fx.update, gore.update, corpses)", f(rest, 3), share(rest)],
        ["combat.frame (hud and health bars, fx.begin/add/end, models, gore.frame)", f(mid(d.frameFight), 3), share(mid(d.frameFight))],
        ["outside them: the threat list (signals.js, asked for by the game's own step)", f(part("threats"), 3), "–"],
        ["outside them: handing combat's meshes to the card (the draw's script, paired)", f(meshScript, 3), "–"],
      ],
    ),
  );
  const l = r.lookups;
  if (l) {
    lines.push("");
    lines.push(
      `The river lookups on their own (µs a call, on the fight as it stood: ${l.shots} shots, ${l.enemies} enemies): a shot's locate + bed + level ${f(l.shotLookup)} (locate ${f(l.locate)}, bed ${f(l.bed)}, level ${f(l.level)}); an enemy's current + locate + bed + level ${f(l.enemyLookup)} (current ${f(l.current)}); terrain.collidersNear ${f(l.collidersNear, 3)} ms a call, ${l.stones} stones returned.`,
    );
  }
  const lab = r.rounds;
  if (lab) {
    lines.push("");
    lines.push(
      `On lists of their own (${lab.n} at a time, µs a step each): an enemy round flying at the fish ${f(lab.flying, 3)}, spent and sinking ${f(lab.spent, 3)}, lying on the bed ${f(lab.rested, 3)}; a players' shot flying along the river ${f(lab.shot, 3)}, without the bed and surface lookup ${f(lab.shotNoLookup, 3)} (tested against ${lab.stones} stones and the enemies of the fight).`,
    );
  }
  const t = r.toggles;
  if (t?.copy && t?.noLookup) {
    const cost = t.copy.projectiles - t.noLookup.projectiles;
    lines.push("");
    lines.push("The players' shots with parts swapped out (ms a frame, one measurement each):");
    lines.push("");
    const both = (x) => x.projectiles + x.colliders;
    lines.push(
      table(
        ["projectiles.update", "projectiles.update", "collidersNear", "both", "combat.step", "shots"],
        [
          ["as it is", t.original],
          ["a copy of it, to check the copy", t.copy],
          ["the copy without the bed and surface lookup", t.noLookup],
          ["the copy with each shot looking every other step", t.lookupHalf],
          ["the copy with the stones sorted into 2 u cells each step", t.stoneCells],
          ["the copy with the stones sorted into cells once, while they stay the same", t.stoneCellsKept],
          ["as it is, with no stones at all", t.noStones],
        ]
          .filter(([, x]) => x)
          .map(([label, x]) => [label, f(x.projectiles, 3), f(x.colliders, 3), f(both(x), 3), f(x.combatStep, 3), f(x.shots, 0)]),
      ),
    );
    lines.push("");
    lines.push(`The bed and surface lookup: ${f(cost, 3)} ms a frame at ${f(t.copy.shots, 0)} shots, ${f((cost / t.copy.shots) * 1000, 2)} µs a shot.${t.noStones ? ` The stones (collidersNear and the test of every shot against every stone): ${f(both(t.original) - both(t.noStones), 3)} ms; sorted into cells each step, ${f(both(t.stoneCells) - both(t.noStones), 3)} ms, sorted once, ${f(both(t.stoneCellsKept) - both(t.noStones), 3)} ms.` : ""}`);
  }

  if (r.hud?.all) {
    const h = r.hud;
    lines.push("");
    lines.push("The page's style and layout with the fight on, parts of the HUD taken off the page (ms a frame, one measurement each):");
    lines.push("");
    lines.push(
      table(
        ["page", "style and layout", "combat.frame", "script of the frame"],
        [
          ["as it is", h.all],
          ["without the health bars (#foes)", h.noBars],
          ["without combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar)", h.noCombatHud],
          ["… and without the game's threat arrows (#threats)", h.noCombatHudNoArrows],
        ]
          .filter(([, x]) => x)
          .map(([label, x]) => [label, f(x.layout, 3), f(x.combatFrame, 3), f(x.total, 2)]),
      ),
    );
  }
  const a = r.allocation;
  if (a) {
    lines.push("");
    const names = { step: "combat.step", frame: "combat.frame", enemies: "enemies.update", projectiles: "projectiles.update", hostile: "hostile.update", aim: "aim.update", director: "director.update", colliders: "collidersNear", threats: "the threat list" };
    lines.push(
      `Left on the heap for the collector, KB a frame (calls in which it collected are missed, so these are lower bounds): the whole frame ${f(a.whole, 0)}; ${Object.entries(names)
        .filter(([k]) => a[k] != null)
        .map(([k, label]) => `${label} ${f(a[k], 1)}`)
        .join(", ")}.`,
    );
  }

  // Where the card's time goes.
  if (r.groups) {
    lines.push("");
    lines.push("## Where the card's time goes (each part of combat shown against hidden, ms)");
    lines.push("");
    lines.push(table(["part", "costs", "middle half of the batches"], Object.entries(r.groups).map(([k, v]) => [k, f(v.cost, 3), `${f(v.low, 3)} … ${f(v.high, 3)}`])));
    lines.push("");
    lines.push("The parts are timed one after another, so they need not add up to the whole exactly; a part near zero costs less than the noise.");
  }

  // Scaling.
  if (r.scaled?.length) {
    lines.push("");
    lines.push("## The fight scaled (one measurement each)");
    lines.push("");
    lines.push(
      table(
        ["enemies", "shots (held)", "enemy shots flying / spent / on the bed", "combat.step", "combat.frame", "enemies", "projectiles", "hostile", "card (meshes)", "calls", "hits/s", "kills/s"],
        r.scaled.map((s) => [
          s.load.empty ? "0 (combat running empty)" : `${s.load.enemies} (${f(s.counts.enemies.mean, 0)})`,
          `${s.load.shots} (${f(s.counts.shots.mean, 0)}${s.capped ? ", pool full" : ""})`,
          `${s.load.hostile} (${f(s.counts.flying.mean, 0)} / ${f(s.counts.spent.mean, 0)} / ${f(s.counts.rested?.mean, 0)})`,
          f(s.combatStep, 3),
          f(s.combatFrame, 3),
          f(s.parts.enemies, 3),
          f(s.parts.projectiles, 3),
          f(s.parts.hostile, 3),
          f(s.gpu, 3),
          f(s.calls, 0),
          f(s.events.hitsPerSecond, 0),
          f(s.events.killsPerSecond, 1),
        ]),
      ),
    );
    const byEnemies = r.scaled.filter((s) => s.load.shots === 150 && s.load.hostile === 60 && !s.load.empty).map((s) => [s.counts.enemies.mean, s.parts.enemies]);
    const fit = byEnemies.length >= 3 ? quadratic(byEnemies) : null;
    if (fit) {
      lines.push("");
      lines.push(`enemies.update ≈ ${f(fit[0], 3)} + ${f(fit[1] * 1000, 2)} µs·n + ${f(fit[2] * 1000, 3)} µs·n² (n enemies alive): at 40 that is ${f((fit[1] * 40) * 1000, 0)} µs growing with the number and ${f(fit[2] * 1600 * 1000, 0)} µs growing with its square (the pairs of separate() and striking()).`);
    }
    lines.push("");
    lines.push("(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the card's number there is too low.)");
  }

  // The spent bullets.
  if (r.soak?.length) {
    lines.push("");
    lines.push(`## Spent enemy bullets over ${r.soak.length} s of fight`);
    lines.push("");
    const every = r.soak.filter((s, i) => i === 0 || s.t % 5 === 0);
    lines.push(table(["s", "flying", "spent, sinking", "on the bed", "oldest spent (s)", "hostile.update (ms)", "combat.step (ms)", "enemies (dead)", "shots", "bubbles", "heap (MB)"], every.map((s) => [s.t, s.flying, s.spent, s.rested, f(s.oldest, 1), f(s.hostile, 3), f(s.combatStep, 3), `${s.enemies ?? "–"} (${s.corpses ?? "–"})`, s.shots ?? "–", s.bubbles ?? "–", s.heapMB ?? "–"])));
  }

  // What the page said.
  const errors = [...(r.errors ?? []), ...(r.console?.errors ?? [])];
  const warnings = r.console?.warnings ?? [];
  lines.push("");
  lines.push("## Console");
  lines.push("");
  lines.push(errors.length ? `${errors.length} errors:\n\n${errors.slice(0, 8).map((e) => `- ${e.replace(/\n/g, " ")}`).join("\n")}` : "No errors.");
  if (warnings.length) lines.push(`\n${warnings.length} different warnings:\n\n${warnings.slice(0, 8).map((w) => `- ${w.replace(/\n/g, " ")}`).join("\n")}`);
  const aside = r.console?.environment ?? [];
  if (aside.length) lines.push(`\nLeft aside, the development server's and not the game's:\n\n${aside.map((w) => `- ${w}`).join("\n")}`);
  lines.push("");
  lines.push(`Pictures: bench-${c.renderer}-${c.quality}-kampf.jpg (the fight) and -ohne.jpg (the same place without it).`);
  return { text: lines.join("\n") + "\n", digest: d, errors: errors.length };
}

async function summaries(list) {
  const all = [];
  for (const config of list) {
    const name = `bench-${config}`;
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
  const lines = ["# Combat bench", "", `Budget for all of combat: at most ${BUDGET.gpu} ms on the card and ${BUDGET.cpu} ms of script a frame. Fight minus the same place without it, median of the repeats (min … max in brackets). The card: combat's meshes shown against hidden, in turns.`, ""];
  lines.push(
    table(
      ["configuration", "card (ms)", "combat.step + frame (ms)", "script of the frame (ms)", "draw calls", "triangles", "verdict", "errors"],
      all.map((a) =>
        a.failed
          ? [a.config, "–", "–", "–", "–", "–", `failed: ${String(a.failed).split("\n")[0].slice(0, 80)}`, "–"]
          : [
              a.config,
              `${f(mid(a.digest.meshes), 3)} (${spread(a.digest.meshes, 3)})${a.digest.gpuBound ? "" : " ≤"}`,
              `${f(mid(a.digest.combat), 3)} (${spread(a.digest.combat, 3)})`,
              `${signed(mid(a.digest.total))} (${spread(a.digest.total)})`,
              signed(mid(a.digest.calls), 0),
              signed(mid(a.digest.tris), 0),
              `card ${a.digest.verdict.gpuOk ? "within" : "**over**"}, combat's script ${a.digest.verdict.cpuOk ? "within" : "**over**"}, frame's script ${a.digest.verdict.totalOk ? "within" : "**over**"}`,
              a.errors,
            ],
      ),
    ),
  );
  lines.push("");
  lines.push("(≤: the script, not the card, held up the frames drawn back to back, so the card's number is an upper bound. \"Script of the frame\": what the fight adds to the world step, combat.frame, the page's layout and the draw's script together.) Details: bench-<configuration>.md.");
  await writeFile(join(out, "summary.md"), lines.join("\n") + "\n");
  return all;
}

const ran = args.includes("--summary-only") ? configs : await run();
const all = await summaries(configs);
for (const a of all)
  console.log(
    a.failed
      ? `${a.config}: failed (${String(a.failed).split("\n")[0]})`
      : `${a.config}: card ${f(mid(a.digest.meshes), 3)} ms, combat script ${f(mid(a.digest.combat), 3)} ms -> card ${a.digest.verdict.gpuOk ? "within" : "OVER"}, script ${a.digest.verdict.cpuOk ? "within" : "OVER"}; ${a.errors} errors`,
  );
console.log(`shots/${set}/summary.md`);
process.exit(ran.length === configs.length && all.every((a) => !a.failed && !a.errors) ? 0 : 1);
