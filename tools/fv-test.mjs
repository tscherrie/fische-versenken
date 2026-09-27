// Run Extreme's test scenes (src/fv/dev/scenes.js) in a Chrome of their own without a
// window, on the real graphics card, and wait until the last report is in:
//
//   node tools/fv-test.mjs <set> [--only piu,forelle] [--port 8150] [--headed]
//                                [--webgl] [--quality eco] [--timing]
//
// Pictures and reports land in shots/<set>/. The development server is started if it is not
// running yet. (Extreme uses the ports from 8150 up; Salmon Survival Next uses 8123-8143.)
// --webgl runs the game on its WebGL 2 fallback and --quality at another quality than
// detail; the scenes' own addresses carry neither, so each scene then gets a Chrome of its
// own, opened at its address. --timing adds what combat.step and combat.frame cost to each
// report (src/fv/dev/scenes-look.js). Scenes marked manual (the bench, which takes minutes;
// tools/fv-bench.mjs drives it) run only when named in --only. Stopped (Ctrl-C, a kill), it
// takes its Chromes and its server down with it.

import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const set = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.match(/^--(only|port|quality)$/));
if (!set) {
  console.error("usage: node tools/fv-test.mjs <set> [--only a,b] [--port 8150] [--headed] [--webgl] [--quality eco] [--timing]");
  process.exit(1);
}
const port = Number(option("port") || 8150);
const only = option("only");
const quality = option("quality");
// (An unknown quality would quietly run at the game's fallback while the report names it.)
if (quality && !["eco", "balanced", "detail", "ultra"].includes(quality)) {
  console.error(`unknown quality ${quality} (eco, balanced, detail or ultra)`);
  process.exit(1);
}
const webgl = args.includes("--webgl");
const timing = args.includes("--timing");
const { SCENES } = await import(join(root, "src/fv/dev/scenes.js"));
const list = only ? SCENES.filter((s) => only.split(",").includes(s.name)) : SCENES.filter((s) => !s.manual);
// (The page keeps its own list of scenes: it is told which, when that is not all of them.)
const names = only ?? (list.length < SCENES.length ? list.map((s) => s.name).join(",") : null);

async function reachable() {
  try {
    return (await fetch(`http://localhost:${port}/`)).ok;
  } catch {
    return false;
  }
}
// What this process started, taken down again however it ends: the server, and the Chrome
// running now with its profile folder. Chrome runs in a process group of its own (spawned
// detached), so its helpers go with it; any left over are found by the profile folder named
// in their command lines, which is this run's alone.
const started = { server: null, chrome: null, profile: null };
function killChrome(chrome, profile, signal) {
  if (chrome && chrome.exitCode === null && chrome.signalCode === null)
    try {
      process.kill(-chrome.pid, signal);
    } catch {}
  if (signal === "SIGKILL" && profile)
    try {
      execFileSync("pkill", ["-KILL", "-f", `--user-data-dir=${profile}`], { stdio: "ignore" });
    } catch {}
}
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.error(`${signal}: stopping Chrome and the server`);
    if (started.chrome) await close(started.chrome, started.profile);
    started.server?.kill();
    process.exit(130);
  });
process.on("exit", () => {
  killChrome(started.chrome, started.profile, "SIGKILL");
  started.server?.kill("SIGKILL");
});

if (!(await reachable())) {
  started.server = spawn(process.execPath, [join(root, "tools/capture-server.mjs"), String(port)], { stdio: "ignore" });
  for (let i = 0; i < 50 && !(await reachable()); i++) await new Promise((r) => setTimeout(r, 100));
}

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// (--xname=value: passed on as ?xname=value, for the scenes: --xback=<weapon> --xbelly=<weapon>.)
const extra = (query) => {
  for (const a of args) if (a.startsWith("--x")) query.set(a.slice(2).split("=")[0], a.split("=")[1] ?? "");
  if (timing) query.set("xtiming", "");
  return query;
};
// A Chrome of its own for each launch, with a profile folder of its own: one still shutting
// down would otherwise be handed the next scene's address by Chrome's single-instance lock.
async function launch(url) {
  const profile = await mkdtemp(join(tmpdir(), "extreme-test-"));
  const chrome = spawn(
    CHROME,
    [
      ...(args.includes("--headed") ? [] : ["--headless=new"]),
      `--user-data-dir=${profile}`,
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
      url,
    ],
    { stdio: "ignore", detached: true },
  );
  Object.assign(started, { chrome, profile });
  return chrome;
}
// Chrome asked to go, made to after 5 s, and its profile folder removed.
async function close(chrome, profile = started.profile) {
  const closed = chrome.exitCode !== null || chrome.signalCode !== null ? Promise.resolve() : new Promise((r) => chrome.once("exit", r));
  killChrome(chrome, profile, "SIGTERM");
  await Promise.race([closed, new Promise((r) => setTimeout(r, 5000))]);
  killChrome(chrome, profile, "SIGKILL");
  if (started.chrome === chrome) started.chrome = null;
  // (A helper still going down can write into the profile after it is removed, leaving an
  // empty folder behind: removed again until it stays gone.)
  for (let i = 0; i < 4; i++) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    if (!(await stat(profile).catch(() => null))) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}
// One scene's address, as sceneURL in scenes.js makes it, with the renderer and the quality
// asked for; `only` keeps the page from going on to the next scene.
function sceneURL(scene) {
  const q = new URLSearchParams({ capture: "1", seed: "7", day: "still", rain: "0", quality: quality || "detail", fvtest: set, scene: scene.name, only: scene.name, stage: scene.stage, at: String(scene.at), season: scene.season, hour: String(scene.hour) });
  q.set("new", "");
  if (webgl) q.set("webgl", "");
  return `http://localhost:${port}/?${extra(q)}`;
}

const begun = Date.now();
const report = (scene) => join(root, "shots", set, `${scene.name}.json`);
const done = async (scene) => {
  try {
    return (await stat(report(scene))).mtimeMs > begun;
  } catch {
    return false;
  }
};
// A scene that shows no progress for this long has hung (the bench reports only at its end).
const patience = list.some((s) => s.manual) ? 1800000 : 420000;
let finished = 0;
async function wait(scenes) {
  let count = 0,
    lastProgress = Date.now();
  while (count < scenes.length) {
    await new Promise((r) => setTimeout(r, 1000));
    let now = 0;
    for (const scene of scenes) if (await done(scene)) now++;
    if (now > count) {
      finished += now - count;
      count = now;
      lastProgress = Date.now();
      console.log(`${set}: ${finished}/${list.length}`);
    }
    if (Date.now() - lastProgress > patience) {
      console.error(`stuck after ${finished} of ${list.length}`);
      return false;
    }
  }
  return true;
}
if (webgl || quality) {
  for (const scene of list) {
    const chrome = await launch(sceneURL(scene));
    const ok = await wait([scene]);
    await close(chrome);
    if (!ok) break;
  }
} else {
  const query = extra(new URLSearchParams({ capture: "1", fvtest: set }));
  if (names) query.set("only", names);
  const chrome = await launch(`http://localhost:${port}/?${query}`);
  await wait(list);
  await close(chrome);
}
started.server?.kill();
started.server = null;
const ms = (s) => (s ? `${s.mean.toFixed(3)} ms (p90 ${s.p90.toFixed(3)}, max ${s.max.toFixed(3)})` : "–");
for (const scene of list) {
  try {
    const r = JSON.parse(await readFile(report(scene), "utf8"));
    const last = r.record?.at(-1);
    const errors = r.errors ?? [];
    const cost = r.timing ? `, combat.step ${ms(r.timing.step)}, combat.frame ${ms(r.timing.frame)} (${r.timing.renderer}, ${r.timing.quality})` : "";
    console.log(`${scene.name}: kills ${last?.kills}, energy ${last?.energy}${cost}, errors ${errors.length}${errors.length ? ` (${errors[0].slice(0, 160)})` : ""}`);
  } catch {}
}
process.exit(finished === list.length ? 0 : 1);
