// How far the game has come on its way to the title card's button, as one number that only
// goes up: "Der Fluss entsteht … 42 %" (intro.js shows it on the button, and on the loading
// line where there is no card). The way is made of steps, each with the time it is expected
// to take, and the number is the share of the whole time that has passed, as well as it can
// be told. Whenever a step is added, ends, or learns better how long it will take, what is
// left of the bar is shared out afresh among the steps not ended, by the time each is still
// expected to take: so the number never goes back, and a step that turns out longer than
// thought slows it down rather than stopping it. 100 % comes only when every step has ended
// and the game has said it is ready (`loadReady`), and that is when the button turns on.
//
// While the page's modules come in, before any of this, a small script in index.html shows
// the share of the time they took; it is taken over here as the start of the bar.
//
// An extension (src/mods.js) puts its own work on the same bar with steps of its own, added
// as its module loads, so that the bar knows the whole way from the start (a step added
// later only shares out what is left then):
//
//   import { breathe, loadStep } from "../progress.js";
//   const gear = loadStep("gear", 600);   // ms it is expected to take on the machine the
//                                         // game's own times were taken on (main.js, STEPS)
//   gear.progress(0.5);                   // half done: 0..1, only forwards
//   gear.expect(900);                     // known better: ms from now until it ends, here
//   gear.done();                          // ended
//
// The button waits for every step there is: one that never ends keeps it shut, so end a step
// whose work can fail in a `finally`. The number is painted only where the load pauses: in
// the game's own steps, and in an extension's asynchronous work where it awaits `breathe()`
// between its parts (a module may do its heavy making before the game starts, with a
// top-level await; what `init` does, all at once before the first frame, shows when it
// returns). The game's pauses for the number are short and let no other work in (see
// breathe): an extension's work that waits on timers or the network goes on where the load
// waits for good -- while the modules or the photographs come, and after the game's own
// steps -- or in a worker. What an extension adds to the scene before the first frame is
// warmed up with the game's own and counted there (render/warmup.js): only work of its own
// needs a step.

const steps = [];
const listeners = new Set();
// The start of the bar when what is left was last shared out, and the shares.
let base = 0;
let plan = [];
let shown = 0;
let ready = false;
let finished = false;
let settle = null;
const allDone = new Promise((resolve) => (settle = resolve));
// This machine against the one the expected times were taken on: its real milliseconds per
// expected one, from the steps that have ended (1 until one has).
let pace = 1;

// The part the page's own script had shown while the modules came in (index.html).
{
  const early = typeof window !== "undefined" ? window.salmonLoading : null;
  if (early) {
    base = shown = Math.min(0.9, Math.max(0, early.stop() || 0));
  }
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const left = (step) => (step.expected ?? step.ms * pace) * (1 - step.f);

function value() {
  let total = 0,
    gone = 0;
  for (const part of plan) {
    total += part.share;
    gone += part.share * (part.from >= 1 ? 1 : clamp01((part.step.f - part.from) / (1 - part.from)));
  }
  return total > 0 ? base + (1 - base) * (gone / total) : base;
}

function replan() {
  base = Math.max(shown, value());
  plan = steps.filter((step) => !step.ended).map((step) => ({ step, from: step.f, share: Math.max(1, left(step)) }));
  tell();
}

function tell() {
  shown = Math.max(shown, value());
  const whole = ready && steps.every((step) => step.ended);
  if (whole && !finished) {
    finished = true;
    settle();
  }
  const now = finished ? 1 : Math.min(shown, 0.99);
  for (const listener of listeners) listener(now, finished);
}

// A step of `ms` expected milliseconds (see above).
export function loadStep(name, ms) {
  const step = { name, ms: Math.max(1, ms), f: 0, ended: false, expected: null, began: null };
  steps.push(step);
  const handle = {
    name,
    progress(f) {
      if (step.ended) return;
      step.began ??= performance.now();
      const now = clamp01(f);
      if (now <= step.f) return;
      step.f = now;
      tell();
    },
    expect(msLeft) {
      if (step.ended) return;
      step.began ??= performance.now();
      // (As the whole step: what is left, over what is left of it.)
      step.expected = Math.max(1, msLeft) / Math.max(0.01, 1 - step.f);
      replan();
    },
    done() {
      if (step.ended) return;
      step.f = 1;
      step.ended = true;
      // A step timed from its start against what it was expected to take tells the pace of
      // this machine (steps with a measured time of their own tell nothing about it).
      if (step.began !== null && step.expected === null) {
        step.took = performance.now() - step.began;
        const timed = steps.filter((s) => s.took !== undefined);
        const took = timed.reduce((sum, s) => sum + s.took, 0);
        const meant = timed.reduce((sum, s) => sum + s.ms, 0);
        if (meant > 50) pace = Math.min(8, Math.max(0.2, took / meant));
      }
      replan();
    },
  };
  replan();
  return handle;
}

// The game has done all its own: 100 % when every step (an extension's too) has ended.
// Resolves then.
export function loadReady() {
  ready = true;
  tell();
  return allDone;
}

// Called with (0..1, finished) whenever the number may have moved, and once at once.
export function onLoadProgress(listener) {
  listeners.add(listener);
  listener(finished ? 1 : Math.min(shown, 0.99), finished);
  return () => listeners.delete(listener);
}

// A moment for the browser to paint the number, where the load can pause anyway: at most
// every SLICE ms, and only with a new number to show, so that the pauses cost the load next
// to nothing (30 to 40 of them, 1 to 2 ms each, in a load of 12 to 15 s here). Elsewhere it
// returns at once (awaiting it then costs a microtask). Where the browser has
// scheduler.yield() the load goes on before any other work that is waiting -- the sounds
// made ahead in slices (sound-make.js), pictures being unpacked -- as it did when it was one
// long task, and the frame due is drawn in between; elsewhere a message to itself does the
// same, but lets such work in. A click is taken in the pause either way. (Neither is held
// back in a tab in the background, as a timer or an animation frame would be.)
const SLICE = 200;
let breathed = 0;
let painted = -1;
let leaving = false;
let channel = null;
const waiting = [];
function pause() {
  if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") return scheduler.yield();
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => waiting.shift()?.();
  }
  return new Promise((resolve) => {
    waiting.push(resolve);
    channel.port2.postMessage(0);
  });
}
export function breathe() {
  if (leaving) return new Promise((resolve) => setTimeout(resolve, 5000));
  if (performance.now() - breathed < SLICE || finished) return null;
  // (Nothing new to show: no pause.)
  const percent = Math.floor(Math.min(shown, 0.99) * 100);
  if (percent === painted) return null;
  painted = percent;
  return pause().then(() => {
    breathed = performance.now();
  });
}

// The page is about to load afresh (another language or graphics picked while the river is
// built): the load stops at its next pause, so that the browser can go to the new page at
// once instead of after it. (Should the new page not come, it goes on after 5 s.)
export function leaveLoad() {
  leaving = true;
}
