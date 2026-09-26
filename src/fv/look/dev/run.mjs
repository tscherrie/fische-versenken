// Run the look scenes (src/fv/dev/scenes-look.js) one by one, each in a Chrome of its own
// without a window, on the real graphics card -- on WebGPU, or with --webgl on the WebGL 2
// fallback -- and keep everything the page says on its console:
//
//   node src/fv/look/dev/run.mjs <set> [--only larven-nah,kapsel-nah] [--webgl] [--quality eco]
//                                [--port 8172] [--cdp 8173]
//
// Pictures and reports land in shots/<set>/ (the report as fv-test.mjs writes it), and the
// console in shots/<set>/<scene>-console.json. The development server is started if it is
// not running yet. (fv-test.mjs rebuilds each scene's address and so cannot pass ?webgl on:
// this loads each scene's address itself, with the flags added.)
//
// A server already on the port is used only if it serves this very tree (it is asked for this
// file and must give it back unchanged): one serving another worktree would take the reports
// and every scene would wait in vain. Whatever this starts -- the server, each Chrome -- is
// stopped again however the run ends: at the end, on an error, or on Ctrl-C.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const set = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.match(/^--(only|port|cdp|quality)$/));
if (!set) {
  console.error("usage: node src/fv/look/dev/run.mjs <set> [--only a,b] [--webgl] [--quality eco] [--port 8172] [--cdp 8173]");
  process.exit(1);
}
const port = Number(option("port") || 8172);
const cdpPort = Number(option("cdp") || 8173);
const only = option("only")?.split(",");
const { LOOK_SCENES } = await import(join(root, "src/fv/dev/scenes-look.js"));
const list = only ? LOOK_SCENES.filter((s) => only.includes(s.name)) : LOOK_SCENES;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Is a server on the port, and is it this tree's? (null: nothing there; false: someone else's.)
const self = await readFile(fileURLToPath(import.meta.url), "utf8");
async function reachable() {
  try {
    const response = await fetch(`http://localhost:${port}/src/fv/look/dev/run.mjs`);
    return response.ok && (await response.text()) === self;
  } catch {
    return null;
  }
}
// What this run started, stopped on the way out whatever happens.
let server = null,
  chrome = null;
function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  const gone = new Promise((r) => child.once("exit", r));
  child.kill();
  // (A Chrome that lingers would keep the DevTools port, and the next scene would attach to it.)
  const hard = setTimeout(() => child.kill("SIGKILL"), 5000);
  return gone.finally(() => clearTimeout(hard));
}
async function shutdown(code) {
  await Promise.all([stop(chrome), stop(server)]);
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => shutdown(130));
const there = await reachable();
if (there === false) {
  console.error(`port ${port} serves another tree: pick a free one with --port`);
  process.exit(1);
}
if (there === null) {
  server = spawn(process.execPath, [join(root, "tools/capture-server.mjs"), String(port)], { stdio: "ignore" });
  server.on("error", (error) => {
    console.error(`the server did not start: ${error.message}`);
    shutdown(1);
  });
  let up = false;
  for (let i = 0; i < 50 && !(up = await reachable()); i++) await sleep(100);
  if (!up) {
    console.error(`the server on port ${port} did not answer`);
    await shutdown(1);
  }
}

function address(scene) {
  const q = new URLSearchParams({ capture: "1", seed: "7", day: "still", rain: "0", quality: option("quality") || "detail", fvtest: set, scene: scene.name, stage: scene.stage, at: String(scene.at), season: scene.season, hour: String(scene.hour), only: scene.name });
  let url = `http://localhost:${port}/?${q}&new`;
  if (args.includes("--webgl")) url += "&webgl";
  for (const a of args) if (a.startsWith("--x")) url += `&${a.slice(2)}`;
  return url;
}

// A small client for the DevTools protocol: send a command, and hear the page's console.
async function devtools(onEvent) {
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      target = pages.find((p) => p.type === "page");
    } catch {}
    if (!target) await sleep(100);
  }
  if (!target) throw new Error("no page to attach to");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  let id = 0;
  const waiting = new Map();
  socket.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    } else if (msg.method) onEvent(msg);
  };
  // (Each answer waited for at most half a minute: a Chrome that died would leave it open.)
  const send = (method, params = {}) =>
    new Promise((r, j) => {
      const n = ++id;
      const late = setTimeout(() => {
        waiting.delete(n);
        j(new Error(`${method}: no answer`));
      }, 30000);
      waiting.set(n, (msg) => {
        clearTimeout(late);
        r(msg);
      });
      socket.send(JSON.stringify({ id: n, method, params }));
    });
  return { send, close: () => socket.close() };
}

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(join(root, "shots", set), { recursive: true });
let failed = 0;
try {
  for (const scene of list) {
    const profile = await mkdtemp(join(tmpdir(), "extreme-look-"));
    chrome = spawn(
      CHROME,
      [
        "--headless=new",
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${cdpPort}`,
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
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    chrome.on("error", (error) => console.error(`Chrome did not start: ${error.message}`));
    const consoleLines = [];
    const started = Date.now();
    const report = join(root, "shots", set, `${scene.name}.json`);
    let client = null;
    try {
      client = await devtools((msg) => {
        if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(msg.params.type))
          consoleLines.push({ level: msg.params.type, text: msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 2000) });
        else if (msg.method === "Runtime.exceptionThrown") consoleLines.push({ level: "exception", text: (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 2000) });
        else if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level)) consoleLines.push({ level: `log-${msg.params.entry.level}`, text: `${msg.params.entry.text} ${msg.params.entry.url ?? ""}`.slice(0, 2000) });
      });
      await client.send("Runtime.enable");
      await client.send("Log.enable");
      await client.send("Page.navigate", { url: address(scene) });
      // Until the scene's report is in (or it has been quiet too long).
      let done = false;
      while (!done && Date.now() - started < 420000) {
        await sleep(1000);
        try {
          done = (await stat(report)).mtimeMs > started;
        } catch {}
      }
      if (!done) {
        failed++;
        console.error(`${scene.name}: no report after ${Math.round((Date.now() - started) / 1000)} s`);
      }
    } catch (error) {
      failed++;
      console.error(`${scene.name}: ${error.message}`);
    }
    client?.close();
    await stop(chrome);
    chrome = null;
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    await writeFile(join(root, "shots", set, `${scene.name}-console.json`), JSON.stringify(consoleLines, null, 1));
    try {
      const r = JSON.parse(await readFile(report, "utf8"));
      console.log(`${scene.name}: ${r.errors.length} errors, ${consoleLines.length} console warnings/errors${r.errors.length ? ` (${r.errors[0].slice(0, 200)})` : ""}${consoleLines.length ? ` [${consoleLines[0].text.slice(0, 200)}]` : ""}`);
    } catch {}
  }
} catch (error) {
  failed++;
  console.error(error?.stack ?? error);
}
await shutdown(failed ? 1 : 0);
