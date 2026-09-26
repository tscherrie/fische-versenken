// Run Extreme's test scenes (src/fv/dev/scenes.js) in a Chrome of their own without a
// window, on the real graphics card, and wait until the last report is in:
//
//   node tools/fv-test.mjs <set> [--only piu,forelle] [--port 8150] [--headed]
//
// Pictures and reports land in shots/<set>/. The development server is started if it is not
// running yet. (Extreme uses the ports from 8150 up; Salmon Survival Next uses 8123-8143.)

import { spawn } from "node:child_process";
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
const set = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.match(/^--(only|port)$/));
if (!set) {
  console.error("usage: node tools/fv-test.mjs <set> [--only a,b] [--port 8150] [--headed]");
  process.exit(1);
}
const port = Number(option("port") || 8150);
const only = option("only");
const { SCENES } = await import(join(root, "src/fv/dev/scenes.js"));
const list = only ? SCENES.filter((s) => only.split(",").includes(s.name)) : SCENES;

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

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = await mkdtemp(join(tmpdir(), "extreme-test-"));
const query = new URLSearchParams({ capture: "1", fvtest: set });
if (only) query.set("only", only);
// (--xname=value: passed on as ?xname=value, for the scenes: --xback=<weapon> --xbelly=<weapon>.)
for (const a of args) if (a.startsWith("--x")) query.set(a.slice(2).split("=")[0], a.split("=")[1] ?? "");
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
    `http://localhost:${port}/?${query}`,
  ],
  { stdio: "ignore" },
);

const started = Date.now();
const report = (scene) => join(root, "shots", set, `${scene.name}.json`);
const done = async (scene) => {
  try {
    return (await stat(report(scene))).mtimeMs > started;
  } catch {
    return false;
  }
};
let finished = 0,
  lastProgress = Date.now();
while (finished < list.length) {
  await new Promise((r) => setTimeout(r, 1000));
  let count = 0;
  for (const scene of list) if (await done(scene)) count++;
  if (count > finished) {
    finished = count;
    lastProgress = Date.now();
    console.log(`${set}: ${finished}/${list.length}`);
  }
  if (Date.now() - lastProgress > 420000) {
    console.error(`stuck after ${finished} of ${list.length}`);
    break;
  }
}
const closed = new Promise((r) => chrome.once("exit", r));
chrome.kill();
await Promise.race([closed, new Promise((r) => setTimeout(r, 5000))]);
server?.kill();
await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
for (const scene of list) {
  try {
    const r = JSON.parse(await readFile(report(scene), "utf8"));
    const last = r.record.at(-1);
    console.log(`${scene.name}: kills ${last?.kills}, energy ${last?.energy}, errors ${r.errors.length}${r.errors.length ? ` (${r.errors[0].slice(0, 160)})` : ""}`);
  } catch {}
}
process.exit(finished === list.length ? 0 : 1);
